import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { buildAccountStatementEntries } from '../../components/wallet/accountStatementDomain';
import { parseWalletMoney } from '../../features/wallet/utils/parseWalletMoney';

const account='00000000-0000-4000-8000-000000000010';
const other='00000000-0000-4000-8000-000000000020';
const operation=(id:string,opType:string,extra:Record<string,unknown>={})=>({
  id, request_id:id, operation_type:opType,
  from_account_id:opType==='EXPENSE'?account:null,
  to_account_id:opType==='EXPENSE'?null:account,
  amount:8,description:'Impressão',category:'Outros',
  operation_date:'2026-11-05',created_at:'2026-11-05T12:00:00Z',...extra
});
const base={
  accountId:account,
  accounts:[{id:account,nickname:'Banco'},{id:other,nickname:'Outra'}],
  expenses:[],invoicePayments:[],statementRows:[],
};
test('a calculadora recebe expressões monetárias no extrato sem perder centavos',()=>{
  assert.equal(parseWalletMoney('700+4,99%'),734.93);
  assert.equal(parseWalletMoney('700+200'),900);
  assert.equal(parseWalletMoney('(7,99+0,01)*2'),16);
  assert.throws(()=>parseWalletMoney('8/0'));
});
test('anulação oculta lançamento e compensação do extrato comum, mantendo o restante',()=>{
  const operations=[
    operation('o1','EXPENSE',{voided_at:'2026-11-05T15:00:00Z'}),
    operation('o2','INCOME',{voided_at:'2026-11-05T15:00:00Z',voids_operation_id:'o1'}),
    operation('o3','INCOME',{description:'Salário',amount:2951.54}),
  ];
  const entries=buildAccountStatementEntries({...base,operations});
  assert.deepEqual(entries.map(row=>row.label),['Salário']);
  assert.equal(entries[0].amount,2951.54);
});
test('outros registros permanecem visíveis, incluindo ajustes e importações',()=>{
  const entries=buildAccountStatementEntries({...base,
    operations:[operation('o1','EXPENSE'),operation('o2','EXPENSE',{description:'Reajuste de saldo bancário',category:'Ajuste de Saldo'})],
    statementRows:[{id:'r1',target_kind:'ACCOUNT',target_id:account,entry_date:'2026-11-05',description:'Importado',amount:-9,category:'Outros'}],
  });
  assert.equal(entries.length,3);
});
test('exclusão é estorno atômico apenas de lançamentos manuais, sem delete físico ou privilégios diretos',()=>{
  const sql=readFileSync('supabase/migrations/20261105190500_wallet_void_manual_operation.sql','utf8');
  const panel=readFileSync('components/wallet/AccountActivityPanel.tsx','utf8');
  const service=readFileSync('services/personalWallet.service.ts','utf8');
  assert.match(sql,/security definer/);
  assert.match(sql,/pg_advisory_xact_lock/);
  assert.match(sql,/owner_user_id=v_user/);
  assert.match(sql,/personal_wallet_record_account_operation/);
  assert.match(sql,/operation_type not in \('EXPENSE','INCOME','RECEIPT'\)/);
  assert.match(sql,/contract_id is not null/);
  assert.match(sql,/installment_id is not null/);
  assert.match(sql,/charge_id is not null/);
  assert.match(sql,/voids_operation_id=p_operation_id/);
  assert.doesNotMatch(sql,/delete from public\.personal_wallet_account_operations/i);
  assert.match(panel,/Excluir lançamento/);
  assert.match(panel,/window\.confirm/);
  assert.match(panel,/voidManualAccountOperation/);
  assert.match(panel,/<FinancialCalculatorInput required className=\{input\} value=\{amount\}/);
  assert.match(panel,/<FinancialCalculatorInput required className=\{input\} value=\{openingAmount\}/);
  assert.match(service,/personal_wallet_void_manual_operation/);
});
