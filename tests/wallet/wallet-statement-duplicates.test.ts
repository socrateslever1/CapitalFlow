import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectPreviouslyImported, detectRecoverableStatementRows } from '../../utils/walletStatementDuplicates';
import type { WalletStatementRow } from '../../services/personalWallet.service';
import type { ParsedStatementRow } from '../../utils/walletStatementPdf';

const row = (key:string,date:string,description:string,amount:number):ParsedStatementRow=>({
  rowKey:key,date,description,amount,category:'Compras',confidence:'REVIEW',selected:false,
  installmentNumber:null,installmentTotal:null,
});
const previous:WalletStatementRow[]=[{
  id:'1',target_id:'card-A',target_kind:'CARD',document_hash:'old-pdf',row_key:'p1-l5',
  entry_date:'2026-10-10',description:'MERCADO CENTRAL',amount:149.9,category:'Compras',
}];
test('same purchase in PDF and OFX is flagged on the same card',()=>{
  const keys=detectPreviouslyImported([row('ofx-2','2026-10-10','Mercado Central',149.90)],previous,'CARD','card-A');
  assert(keys.has('ofx-2'));
});
test('different card, date or merchant is not silently deduplicated',()=>{
  assert.equal(detectPreviouslyImported([row('x','2026-10-10','Mercado Central',149.9)],previous,'CARD','card-B').size,0);
  assert.equal(detectPreviouslyImported([row('x','2026-10-11','Mercado Central',149.9)],previous,'CARD','card-A').size,0);
  assert.equal(detectPreviouslyImported([row('x','2026-10-10','Mercado Sul',149.9)],previous,'CARD','card-A').size,0);
});

test('somente linha incompleta do mesmo documento pode ser retomada sem duplicar', () => {
  const previousRow = { ...previous[0], document_hash: 'a'.repeat(64), row_key: 'p1-l5', expense_id: null };
  const incoming = row('p1-l5', '2026-10-10', 'Mercado Central', 149.90);
  assert.equal(detectRecoverableStatementRows([incoming], [previousRow], 'CARD', 'card-A', 'a'.repeat(64)).has('p1-l5'), true);
  assert.equal(detectRecoverableStatementRows([incoming], [previousRow], 'CARD', 'card-A', 'b'.repeat(64)).size, 0);
  assert.equal(detectRecoverableStatementRows([incoming], [{ ...previousRow, expense_id: 'completed' }], 'CARD', 'card-A', 'a'.repeat(64)).size, 0);
  assert.equal(detectRecoverableStatementRows([incoming], [previousRow], 'CARD', 'card-B', 'a'.repeat(64)).size, 0);
  assert.equal(detectRecoverableStatementRows([incoming], [previousRow], 'CARD', 'card-A', 'a'.repeat(64)).size, 1);
  assert.equal(detectRecoverableStatementRows([row('p1-l5', '2026-10-10', 'Mercado Central', 149.91)], [previousRow], 'CARD', 'card-A', 'a'.repeat(64)).size, 0);
});

test('backend mantém idempotência e impede segunda compra sem confirmação', () => {
  const sql = require('node:fs').readFileSync('supabase/migrations/20261111093500_wallet_atomic_statement_and_legacy_origins.sql','utf8');
  assert.match(sql, /SECURITY INVOKER/);
  assert.match(sql, /p_allow_duplicates boolean DEFAULT false/);
  assert.match(sql, /IF NOT coalesce\(p_allow_duplicates,false\) AND EXISTS/);
  assert.match(sql, /personal_wallet_record_statement_row/);
  assert.match(sql, /personal_wallet_import_card_statement_purchase/);
  assert.match(sql, /v_existing.amount <> p_amount/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.personal_wallet_record_card_purchase_atomic/);
  const modal = require('node:fs').readFileSync('components/wallet/WalletStatementImport.tsx','utf8');
  const flat = require('node:fs').readFileSync('components/wallet/FlatSmartStatementReader.tsx','utf8');
  for (const code of [modal,flat]) {
    assert.match(code, /recordAndImportCardStatementPurchase/);
    assert.match(code, /const blockedDuplicates = new Set/);
    assert.match(code, /allowDuplicates,/);
  }
});
