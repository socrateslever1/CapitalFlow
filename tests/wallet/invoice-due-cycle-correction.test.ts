import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {getInvoiceCycleDates,getEffectiveInvoiceCycles} from '../../components/wallet/invoiceStatementDomain';
import type {PersonalWalletExpense,PersonalWalletExpenseInstallment} from '../../services/personalWallet.service';

const mk = (id:string,due:string,opening:boolean,status:'PENDING'|'CANCELED'='PENDING') => ({
  id,card_id:'card-1',entry_type:'INVOICE_OVERRIDE',is_opening_summary:opening,
  invoice_due_month:due,status,amount:2517.55,
}) as unknown as PersonalWalletExpense;
const installment=(expense_id:string,due_month:string,status:'PENDING'|'CANCELED'='PENDING')=>({
  expense_id,due_month,status,amount:2517.55,paid_amount:0,
}) as unknown as PersonalWalletExpenseInstallment;

test('October statement that is paid on November 3 is ONE November due-month cycle',()=>{
  assert.deepEqual(getInvoiceCycleDates('2026-11-01',21,3),{
    closingDate:'2026-10-21',dueDate:'2026-11-03',
  });
  const cycles=getEffectiveInvoiceCycles('card-1',
    [mk('opening-oct','2026-11-01',true),mk('duplicate-nov','2026-11-01',false,'CANCELED')],
    [installment('opening-oct','2026-11-01'),installment('duplicate-nov','2026-11-01','CANCELED')]);
  assert.deepEqual(cycles,[{dueMonth:'2026-11-01',amount:2517.55,hasOverride:true}]);
});

test('opening October and a manual November correction previously generated TWO liabilities',()=>{
  const duplicate=getEffectiveInvoiceCycles('card-1',
    [mk('opening-oct','2026-10-01',true),mk('manual-nov','2026-11-01',false)],
    [installment('opening-oct','2026-10-01'),installment('manual-nov','2026-11-01')]);
  assert.equal(duplicate.length,2);
  assert.equal(duplicate.reduce((sum,row)=>sum+row.amount,0),5035.10);
});

test('the editor changes the SAME invoice via one transactional RPC, never a second monthly override',()=>{
  const component=readFileSync('components/wallet/InvoiceOverrideModal.tsx','utf8');
  const page=readFileSync('features/wallet/pages/WalletCardsPage.tsx','utf8');
  const service=readFileSync('services/personalWallet.service.ts','utf8');
  const sql=readFileSync('supabase/migrations/20261030214000_wallet_correct_invoice_due_cycle.sql','utf8');
  assert.match(component,/Valor da fatura/);
  assert.match(component,/Vencimento/);
  assert.match(component,/dueMonth=dueDate\.slice\(0,7\)\+'-01'/);
  assert.match(component,/hasExistingConsolidation/);
  assert.match(page,/personalWalletService\.correctInvoiceOverride/);
  assert.match(page,/previousDueMonth:selectedCycle\?\.hasOverride/);
  assert.match(service,/supabase\.rpc\('personal_wallet_correct_invoice_override'/);
  assert.match(sql,/pg_advisory_xact_lock/);
  assert.match(sql,/v_target\.amount<>v_previous\.amount/);
  assert.match(sql,/personal_wallet_invoice_payments/);
  assert.match(sql,/status='CANCELED'/);
  assert.match(sql,/mutation_requests/);
  assert.match(sql,/set opening_invoice_month=p_new_due_month/);
  assert.match(sql,/personal_wallet_card_invoice_facts/);
  assert.doesNotMatch(sql,/delete\s+from\s+public\.personal_wallet_expenses/i);
  assert.doesNotMatch(sql,/delete\s+from\s+public\.personal_wallet_invoice_payments/i);
});

test('overview shows competence by closing date and respects the actual payment date',()=>{
  const overview=readFileSync('features/wallet/pages/WalletOverviewPage.tsx','utf8');
  const service=readFileSync('services/personalWallet.service.ts','utf8');
  const domain=readFileSync('features/wallet/domain/walletCommitments.ts','utf8');
  assert.match(overview,/deriveWalletCommitments\(snapshot,today\)/);
  assert.match(domain,/getInvoiceCycleDates\(/);
  assert.match(domain,/data\.cardInvoiceDates/);
  assert.match(service,/select\('card_id,due_month,due_date'\)/);
});
