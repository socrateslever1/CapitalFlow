import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildAccountStatementEntries } from '../../components/wallet/accountStatementDomain';

const migration=readFileSync(
  'supabase/migrations/20261120232000_reconcile_card_funded_wallet_debits.sql','utf8',
);
const accountId='00000000-0000-4000-8000-000000000020';
const contractIds=['loan-700','loan-200-a','loan-200-b'];
const operations=[
  ...contractIds.map((contractId,index)=>({
    id:contractId,request_id:contractId,operation_type:'LOAN_DISBURSEMENT',
    from_account_id:accountId,to_account_id:null,contract_id:contractId,
    amount:index===0?700:200,category:'Empréstimo concedido',
    description:'Empréstimo · Exemplo',operation_date:'2026-11-17',
    created_at:'2026-11-17T12:00:00.000Z',
  })),
  ...contractIds.map((contractId,index)=>({
    id:'restore-'+contractId,request_id:'restore-'+contractId,operation_type:'INCOME',
    from_account_id:null,to_account_id:accountId,contract_id:contractId,
    amount:index===0?700:200,category:'Auditoria',
    description:'Estorno: empréstimo financiado no cartão não debita conta',
    operation_date:'2026-11-20',created_at:'2026-11-20T12:00:00.000Z',
  })),
  {
    id:'salary',request_id:'salary',operation_type:'INCOME',
    from_account_id:null,to_account_id:accountId,contract_id:null,amount:1259.23,
    category:'Salário',description:'13º SEDUC',
    operation_date:'2026-11-16',created_at:'2026-11-16T12:00:00.000Z',
  },
  {
    id:'transfer',request_id:'transfer',operation_type:'TRANSFER',
    from_account_id:null,to_account_id:accountId,contract_id:null,amount:456.98,
    category:'Transferência interna',description:'Ajuda',
    operation_date:'2026-11-16',created_at:'2026-11-16T12:00:00.000Z',
  },
];
const input={
 accountId,accounts:[{id:accountId,nickname:'Nubank'}],
 operations,expenses:[],invoicePayments:[],statementRows:[],cardFundedLoanIds:contractIds,
};

test('extrato operacional preserva o saldo concilado sem mostrar lançamentos técnicos',()=>{
  const rows=buildAccountStatementEntries(input);
  assert.equal(rows.length,2);
  assert.equal(rows.reduce((sum,item)=>sum+item.amount,0),1716.21);
  assert.deepEqual(rows.map(item=>item.id).sort(),['salary','transfer']);
  assert.equal(operations.length,8);
});

test('gatilho não debita a conta por empréstimo financiado no cartão',()=>{
  const skip=migration.indexOf("if new.type = 'LOAN_INITIAL' and (");
  const debit=migration.indexOf('update public.personal_wallet_accounts',skip);
  assert.ok(skip>0 && debit>skip);
  assert.match(migration,/funding_payment_method='CREDIT_CARD'/);
  assert.match(migration,/f\.type in \('CARD','MISTO'\)/);
  assert.match(migration,/source_balance_effect',''\) = 'NONE'/);
  assert.match(migration,/funding_origin',''\) = 'CREDIT_CARD'/);
  assert.match(migration,/v_count<>2 OR v_total<>400 OR v_distinct<>2/);
  assert.match(migration,/IF v_count=0 THEN\s+RETURN;/);
});

test('correção só inclui dois débitos comprovados e usa estorno contábil rastreável',()=>{
  assert.match(migration,/op\.request_id=md5\('wallet_sync_tx:'\|\|original\.id::text\)::uuid/);
  assert.match(migration,/JOIN public\.loan_card_wallet_charges l/);
  assert.match(migration,/c\.funding_payment_method='CREDIT_CARD'/);
  assert.match(migration,/e\.account_id IS NULL/);
  assert.match(migration,/NOT EXISTS \(\s+SELECT 1 FROM public\.transacoes t/);
  assert.match(migration,/personal_wallet_card_funding_reconciliations/);
  assert.match(migration,/personal_wallet_account_operations\(/);
  assert.match(migration,/category,operation_date,contract_id,occurred_at/);
  assert.match(migration,/md5\('card-source-wallet-restore:'\|\|v\.contract_id::text\)::uuid/);
  assert.match(migration,/FOR UPDATE OF a,f/);
  assert.doesNotMatch(migration,/\bDELETE FROM public\.personal_wallet_account_operations/i);
  assert.doesNotMatch(migration,/\bUPDATE public\.contratos\b/i);
  assert.doesNotMatch(migration,/\bUPDATE public\.personal_wallet_expenses\b/i);
});
