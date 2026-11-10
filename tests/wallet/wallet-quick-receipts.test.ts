import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import type { Client, Loan } from '../../types';
import { openContractInstallments, prepareManualIncome, resolveClientReceipt } from '../../features/wallet/domain/quickReceipt';

const id = '165f3b8a-aceb-4afd-9859-9040b15c267f';
const base = {
  accountId:'account-1',permittedAccountIds:['account-1'],
  amount:'1.234,56',description:'  Serviços recebidos  ',category:'Serviços',
  date:'2026-10-29',requestId:id,
};
test('ordinary receipt preserves BR cents, destination, audit id and does not debit or settle contracts',()=>{
  const op=prepareManualIncome(base,'2026-10-30');
  assert.deepEqual(op, {
    type:'INCOME',fromAccountId:null,toAccountId:'account-1',
    amount:1234.56,description:'Serviços recebidos',category:'Serviços',
    date:'2026-10-29',requestId:id,
  });
  assert.deepEqual(prepareManualIncome(base,'2026-10-30'),op);
});
test('reject unknown account, zero, negative, excessive decimals, future or invalid dates and bogus ids',()=>{
  const bad: Array<[Partial<typeof base>, RegExp]> = [
    [{accountId:'other'},/conta/],
    [{amount:'0'},/maior que zero/],
    [{amount:'-20'},/válido/],
    [{amount:'123,456'},/válido/],
    [{date:'2026-10-31'},/data/],
    [{date:'2026-02-30'},/data/],
    [{description:'  '},/descrição/],
    [{requestId:'none'},/Identificador/],
  ];
  for(const [values,match] of bad)assert.throws(()=>prepareManualIncome({...base,...values},'2026-10-30'),match);
});
const c=(id:string)=>({id,name:'Cliente de teste'} as Client);
const inst=(id:string,status:'PENDING'|'PAID'|'LATE'='PENDING')=>({
  id,status,dueDate:'2026-10-28',amount:500,principalRemaining:400,interestRemaining:100,
} as Loan['installments'][number]);
const loan=(id:string,clientId:string)=>({
  id,clientId,debtorName:'Cliente de teste',isArchived:false,installments:[inst('p1'),inst('p2','PAID')],
} as Loan);
test('client payment can only open matching, nonarchived pending loan and installment',()=>{
  const loans=[loan('loan1','client1'),loan('loan2','client2')],clients=[c('client1'),c('client2')];
  assert.equal(resolveClientReceipt(clients,loans,'client1','loan1','p1')?.inst.id,'p1');
  assert.equal(resolveClientReceipt(clients,loans,'client1','loan1','p2'),null);
  assert.equal(resolveClientReceipt(clients,loans,'client1','loan2','p1'),null);
  assert.equal(resolveClientReceipt(clients,loans,'unknown','loan1','p1'),null);
  assert.equal(resolveClientReceipt(clients,[{...loans[0],isArchived:true}], 'client1','loan1','p1'),null);
});
test('renegotiated active agreement cannot pass through ordinary installment payment',()=>{
  const l={...loan('loan1','client1'),activeAgreement:{status:'ACTIVE'}} as Loan;
  assert.equal(resolveClientReceipt([c('client1')],[l],'client1','loan1','p1'),null);
  assert.deepEqual(openContractInstallments(l).map(i=>i.id),['p1']);
});
test('FAB and receipt screen reuse the established payment manager and a single wallet INCOME RPC',()=>{
  const fab=readFileSync('features/wallet/components/WalletExpenseFab.tsx','utf8');
  const quick=readFileSync('features/wallet/components/QuickIncomeModal.tsx','utf8');
  const service=readFileSync('services/personalWallet.service.ts','utf8');
  const payment=readFileSync('components/modals/wrappers/FinanceModalsWrapper.tsx','utf8');
  const routes=readFileSync('features/wallet/WalletModule.tsx','utf8');
  assert(fab.includes('Receber valor'));
  assert(fab.includes('Adicionar despesa'));
  assert(fab.includes('Adicionar conta'));
  assert(fab.includes('Adicionar cartão'));
  assert(fab.includes('Compromisso'));
  assert(fab.includes("React.lazy(() => import('./QuickIncomeModal')"));
  assert(fab.includes('grid-cols-2'));
  const incomePage=readFileSync('features/wallet/pages/WalletIncomePage.tsx','utf8');
  const historyRules=readFileSync('features/wallet/domain/walletIncomeHistory.ts','utf8');
  assert(historyRules.includes("op.operation_type !== 'INCOME'"));
  assert(incomePage.includes('isExternalIncome(op, operations)'));
  assert(incomePage.includes('Histórico de entradas avulsas'));
  assert(incomePage.includes('manualReceipts.slice(0,8)'));
  assert(incomePage.includes('evitar contagem duplicada'));
  const recurring=readFileSync('components/wallet/RecurringIncomePanel.tsx','utf8');
  assert(recurring.includes("parseWalletMoney(form.amount,'valor mensal')"));
  assert(recurring.includes('inputMode="decimal" type="text"'));
  assert(routes.includes('<WalletExpenseFab />'));
  assert(quick.includes('prepareManualIncome('));
  assert(quick.includes('personalWalletService.recordAccountOperation(operation)'));
  assert(quick.includes("ui.setPaymentModal({ loan: selected.loan, inst: selected.inst, calculations })"));
  assert(quick.includes("openModal('PAYMENT')"));
  assert(quick.includes("ui.setPaymentType('FULL')"));
  assert(quick.includes('resolveClientReceipt('));
  assert(!quick.includes('paymentsService.processPayment('));
  assert(!quick.includes("recordAccountOperation({type:'RECEIPT'"));
  assert(payment.includes('onConfirm={paymentCtrl.handlePayment}'));
  assert(service.includes("supabase.rpc('personal_wallet_record_account_operation'"));
});

test('contract receipts provide an optional destination without changing the default flow',()=>{
  const modal=readFileSync('components/modals/PaymentManagerModal.tsx','utf8');
  const controller=readFileSync('hooks/controllers/usePaymentController.ts','utf8');
  const payments=readFileSync('services/payments.service.ts','utf8');
  const engine=readFileSync('services/payments/paymentEngineV4.ts','utf8');
  const migration=readFileSync('supabase/migrations/20261105230000_wallet_receipt_destination_sync.sql','utf8');
  const statement=readFileSync('components/wallet/accountStatementDomain.ts','utf8');
  assert.match(modal,/Conta que recebeu o pagamento/);
  assert.match(modal,/Padrão · devolver às fontes originais/);
  assert.match(modal,/Conta que recebeu o pagamento \(opcional\)/);
  assert.match(modal,/Fonte de destino para recebimento \(opcional\)/);
  assert.match(modal,/Padrão · retorno às fontes originais/);
  assert.doesNotMatch(modal,/select required value=\{receiptDestinationAccountId\}/);
  assert.doesNotMatch(modal,/select required value=\{receiptDestinationSourceId\}/);
  assert.match(modal,/walletAccounts\.map\(account/);
  assert.match(modal,/platformAdminService\.isSuperAdmin\(\)/);
  assert.match(modal,/isWalletReceiptAdmin/);
  assert.match(modal,/animateClose/);
  assert.match(modal,/Total após ajustes/);
  assert.match(modal,/formatMoney\(payableTotal\)/);
  assert.match(modal,/const \{ activeUser: modalActiveUser, sources: modalSources \} = useModal\(\)/);
  assert.match(controller,/receiptDestinationAccountId/);
  assert.match(controller,/receiptDestinationSourceId/);
  assert.match(payments,/personal_wallet_set_receipt_destination/);
  assert.match(engine,/p_idempotency_key: idempotencyKey/);
  assert.match(engine,/p_destination_source_id:/);
  assert.match(migration,/wallet_apply_receipt_destination/);
  const routed=readFileSync('supabase/migrations/20261110210000_optional_wallet_receipt_withdrawal_routing.sql','utf8');
  assert.match(routed,/wallet_route_receipt_internal/);
  assert.match(routed,/withdraw_profit_to_wallet_atomic/);
  assert.match(routed,/wallet_apply_offer_receipt_destination/);
  assert.match(routed,/reverse_wallet_financial_operation_v4/);
  assert.match(migration,/Recebimento.*v_client_name/);
  assert.match(statement,/operation\.operation_type === 'RECEIPT' && operation\.contract_id/);
});
