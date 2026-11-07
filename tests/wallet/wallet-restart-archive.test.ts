import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { countWalletArchive, filterCurrentWalletRows } from '../../features/wallet/domain/walletResetScope';

const oldId='00000000-0000-4000-8000-000000000001';
const newId='00000000-0000-4000-8000-000000000002';
const empty=Object.fromEntries([
  'accounts','cards','expenses','installments','invoicePayments','accountOperations',
  'statementRows','payables','payablePayments','recurringIncomes','recurringReceipts',
  'recurringObligations','recurringObligationIssues','cardInvoiceFacts',
].map(k=>[k,[]]));
const archive={
  archived_at:'2026-11-05T23:00:00Z',
  restored_at:null,
  hidden_ids:{...empty,accounts:[oldId],cards:[oldId],expenses:[oldId]},
};

test('reinício isola histórico anterior sem alterar seus registros',()=>{
  const original=[{id:oldId,balance:800},{id:newId,balance:50}];
  const filtered=filterCurrentWalletRows(original,archive,'accounts');
  assert.deepEqual(filtered,[{id:newId,balance:50}]);
  assert.equal(original[0].balance,800);
  assert.equal(original.length,2);
  assert.equal(countWalletArchive(archive).accounts,1);
});

test('restauração faz histórico anterior reaparecer sem recriação de contas',()=>{
  const rows=[{id:oldId},{id:newId}];
  assert.deepEqual(filterCurrentWalletRows(rows,{...archive,restored_at:'2026-11-06'},'cards'),rows);
  assert.deepEqual(filterCurrentWalletRows(rows,null,'cards'),rows);
});
test('arquivo incompleto falha fechado; nunca exibe dados antigos sem marcador válido',()=>{
  assert.throws(()=>filterCurrentWalletRows([{id:oldId}],archive,'missing'));
});
test('a camada de leitura limita ambos os snapshots; nenhuma operação no núcleo CapitalFlow',()=>{
  const service=readFileSync('services/personalWallet.service.ts','utf8');
  const sql=readFileSync('supabase/migrations/20261105203000_personal_wallet_restart_archive.sql','utf8');
  assert.match(service,/getActiveWalletReset/);
  for(const table of ['accounts','cards','expenses','installments','accountOperations','statementRows',
    'invoicePayments','payables','payablePayments','recurringIncomes','recurringReceipts','recurringObligations']) {
    assert.match(service,new RegExp("walletReset, '"+table+"'"),table);
    assert.match(sql,new RegExp("'"+table+"',"),table);
  }
  assert.match(sql,/owner_user_id=v_user/);
  assert.match(sql,/capital_source_wallet_origin_access/);
  assert.match(sql,/personal_wallet_reset_archives/);
  assert.doesNotMatch(sql,/\bdelete\s+from\b/i);
  assert.doesNotMatch(sql,/\bupdate\s+public\.(?:fontes|contratos|parcelas|personal_wallet_accounts|personal_wallet_cards)\b/i);
  assert.doesNotMatch(sql,/\btruncate\b/i);
  assert.match(service,/capitalSources: \(capitalSources\.data \|\| \[\]\)/);
});
