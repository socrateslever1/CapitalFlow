import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectPreviouslyImported } from '../../utils/walletStatementDuplicates';
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
