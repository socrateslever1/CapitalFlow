import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {getInvoiceCycleDates,getEffectiveInvoiceCycles} from '../../components/wallet/invoiceStatementDomain';
import {resolveManualInvoiceMonth} from '../../features/wallet/utils/minhasFinancasWalletTools';
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
  assert.match(component,/Mês de pagamento/);
  assert.match(component,/Data exata de vencimento/);
  assert.match(component,/Fecha \{shortDate\(dates\.closingDate\)\}/);
  assert.match(component,/Vence \{shortDate\(dates\.dueDate\)\}/);
  assert.match(component,/hasExistingConsolidation/);
  assert.match(page,/personalWalletService\.correctInvoiceOverride/);
  assert.match(page,/previousDueMonth:\s*selectedCycle\?\.hasOverride/);
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
  assert.match(overview,/title: 'Fatura ' \+ card\.nickname \+ ' · competência ' \+ competence/);
  assert.match(overview,/getInvoiceCycleDates\(/);
  assert.match(overview,/snapshot\.cardInvoiceDates/);
  assert.match(service,/select\('card_id,due_month,due_date,available_limit,observed_at,updated_at'\)/);
});

test('primeira fatura permite mês manual sem fatura preexistente nem limite disponível inventado', () => {
  const page = readFileSync('features/wallet/pages/WalletCardsPage.tsx', 'utf8');
  const preview = readFileSync('components/wallet/CardInvoiceSummaryPreview.tsx', 'utf8');
  const modal = readFileSync('components/wallet/InvoiceOverrideModal.tsx', 'utf8');
  assert.equal(resolveManualInvoiceMonth(null, '2026-12-01'), '2026-12-01');
  assert.equal(resolveManualInvoiceMonth('2026-12', null), '2026-12-01');
  assert.equal(resolveManualInvoiceMonth('2026-13', null), null);
  assert.equal(resolveManualInvoiceMonth('2026-12-05', null), null);
  assert.match(page, /initialDueMonth=\{creatingInvoice \? suggestedNewInvoiceMonth/);
  assert.match(page, /dueMonth:\s*confirmedDueMonth/);
  assert.match(page, /availableLimit: editedInvoiceFacts\?\.available_limit \?\? null/);
  assert.match(modal, /type="month" required/);
  assert.match(modal, /setMonth\(next\)/);
  assert.match(modal, /form id="invoice-override-adjustment-form"/);
  assert.match(modal, /formId="wallet-invoice-override-facts-form"/);
  assert.match(preview, /inlineSave \&\&/);
  assert.match(preview, /onSavingChange\?\.\(true\)/);
  assert.doesNotMatch(page, /if \(!selected \|\| !statementMonth\) throw new Error\('Selecione o cartão e o mês/);
});

test('conferência da fatura explica quando apenas registra dados e quando inicia a posição do cartão', () => {
  const page=readFileSync('features/wallet/pages/WalletCardsPage.tsx','utf8');
  const preview=readFileSync('components/wallet/CardInvoiceSummaryPreview.tsx','utf8');
  const modal=readFileSync('components/wallet/InvoiceOverrideModal.tsx','utf8');
  assert.match(page,/<InvoiceOverrideModal/);
  assert.match(modal,/Mês de pagamento/);
  assert.match(modal,/saveLabel="Salvar valores do banco"/);
  assert.match(modal,/onSave=\{summary=>onSaveInvoiceFacts\(month\+'-01',summary\)\}/);
  assert.match(preview,/Salve aqui os valores que aparecem no app ou na fatura do banco/);
  assert.match(preview,/tamb.m podem registrar a posi..o inicial/);
  assert.match(preview,/não um pagamento/);
  assert.match(preview,/mês de pagamento selecionado/);
  assert.doesNotMatch(preview,/não modifica compras, limite bancário ou saldo contábil/);
});
