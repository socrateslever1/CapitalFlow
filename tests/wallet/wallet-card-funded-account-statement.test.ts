import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildAccountStatementEntries } from '../../components/wallet/accountStatementDomain';

const accountId='account-1';
const op = (id:string,amount:number,type:string,contractId:string|null,description:string,category='Empréstimo concedido') => ({
  id,request_id:id,operation_type:type,
  from_account_id:type==='INCOME'?null:accountId,
  to_account_id:type==='INCOME'?accountId:null,
  amount,description,category,operation_date:'2026-11-17',
  created_at:'2026-11-17T12:00:00.000Z',
  contract_id:contractId,
});
const operations=[
  op('funded-700',700,'LOAN_DISBURSEMENT','credit-700','Empréstimo · Cliente'),
  op('funded-200-a',200,'LOAN_DISBURSEMENT','credit-200-a','Empréstimo · Cliente'),
  op('funded-200-b',200,'LOAN_DISBURSEMENT','credit-200-b','Empréstimo · Cliente'),
  op('audit-700',700,'INCOME','credit-700','Estorno: empréstimo financiado no cartão não debita conta','Auditoria'),
  op('cash-100',100,'LOAN_DISBURSEMENT','cash-100','Empréstimo · Outro cliente'),
  op('salary',1259.23,'INCOME',null,'13º salário','Salário'),
];
const input={accountId,accounts:[{id:accountId,nickname:'Banco'}],operations,expenses:[],invoicePayments:[],statementRows:[]};
test('financiamentos por cartão saem do extrato bancário junto ao estorno contábil associado',()=>{
 const rows=buildAccountStatementEntries({...input,cardFundedLoanIds:['credit-700','credit-200-a','credit-200-b']});
 assert.deepEqual(rows.map(r=>r.id).sort(),['cash-100','salary']);
 assert.equal(rows.find(r=>r.id==='cash-100')?.amount,-100);
 assert.equal(rows.find(r=>r.id==='cash-100')?.category,'Valor emprestado');
});
test('empréstimos realmente pagos da conta continuam visíveis e sem exclusão por engano',()=>{
 const rows=buildAccountStatementEntries(input);
 assert.equal(rows.length,6);
 assert.equal(rows.find(r=>r.id==='cash-100')?.tag,'Empréstimo concedido');
});
test('filtragem não altera dados originais nem saldos; conjunto de referência vazio preserva registros',()=>{
 const before=JSON.stringify(operations);
 buildAccountStatementEntries({...input,cardFundedLoanIds:['credit-700','credit-200-a','credit-200-b']});
 assert.equal(JSON.stringify(operations),before);
 assert.equal(buildAccountStatementEntries({...input,cardFundedLoanIds:[]}).length,6);
});
test('o filtro é alimentado apenas por vínculo com cartão e RLS, sem DELETE/UPDATE',()=>{
 const service=readFileSync('services/personalWallet.service.ts','utf8');
 const statements=readFileSync('components/wallet/accountStatementDomain.ts','utf8');
 const accountPage=readFileSync('features/wallet/pages/WalletAccountsPage.tsx','utf8');
 const detail=readFileSync('components/wallet/AccountDetailsPage.tsx','utf8');
 const panel=readFileSync('components/wallet/AccountActivityPanel.tsx','utf8');
 assert.match(service,/from\('loan_card_wallet_charges'\)/);
 assert.match(service,/select\('loan_id'\)/);
 assert.match(service,/cardFundedLoanIds:/);
 assert.match(statements,/isCardFundedAccountingEntry/);
 assert.match(accountPage,/cardFundedLoanIds: data\.cardFundedLoanIds/);
 assert.match(detail,/cardFundedLoanIds=\{cardFundedLoanIds\}/);
 assert.match(panel,/cardFundedLoanIds,/);
 assert.doesNotMatch(statements,/delete from/i);
});
