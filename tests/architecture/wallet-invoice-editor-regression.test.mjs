import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
const page=readFileSync('features/wallet/pages/WalletCardsPage.tsx','utf8');
const statement=readFileSync('components/wallet/CardInvoiceStatement.tsx','utf8');
const edit=readFileSync('components/wallet/ExpenseEditModal.tsx','utf8');
const pay=readFileSync('components/wallet/PayInvoiceModal.tsx','utf8');
const service=readFileSync('services/personalWallet.service.ts','utf8');
const sql=readFileSync('supabase/migrations/20261030200500_wallet_cancel_invoice_consolidation.sql','utf8');
test('vencimento exato tem precedência sem mover silenciosamente o ciclo financeiro',()=>{
 assert.match(page,/getInvoiceCycleDates\(statementMonth, selected\.closing_day, selected\.due_day, savedInvoiceFacts\?\.due_date\)/);
 assert.match(page,/dueMonth:statementMonth\.slice\(0,7\)\+'-01'/);
 assert.match(page,/exactDueDate: savedInvoiceFacts\?\.due_date/);
 assert.match(pay,/Vencimento:/);
});
test('edição de compras expõe mês do ciclo e valida valor',()=>{
 assert.match(edit,/type="month" required value=\{dueDate\.slice\(0, 7\)\}/);
 assert.match(edit,/parseWalletMoney\(amount, 'valor do lançamento'\)/);
 assert.match(edit,/>Observações/);
 assert.match(statement,/onSave=\{onEdit\}/);
});
test('cancelamento lógico preserva compras e proíbe fatura já paga',()=>{
 assert.match(sql,/personal_wallet_cancel_invoice_consolidation/);
 assert.match(sql,/is_platform_super_admin/);
 assert.match(sql,/user_modulos/);
 assert.match(sql,/pg_advisory_xact_lock/);
 assert.match(sql,/personal_wallet_invoice_payments/);
 assert.match(sql,/paid_amount/);
 assert.match(sql,/mutation_requests/);
 assert.match(sql,/status='CANCELED'/);
 assert.match(sql,/private\.wallet_recalculate_card_position/);
 assert.doesNotMatch(sql,/delete from public\.personal_wallet_expenses/i);
 assert.doesNotMatch(sql,/delete from public\.personal_wallet_invoice_payments/i);
 assert.match(statement,/onCancelConsolidation/);
 assert.match(service,/supabase\.rpc\('personal_wallet_cancel_invoice_consolidation'/);
});
test('dívida anterior excedida não impede correção neutra de compra pendente',()=>{
 assert.match(sql,/greatest\(v_card\.credit_limit,v_card\.used_limit\)/);
 assert.match(sql,/v_expense\.status<>'PENDING'/);
 assert.match(sql,/paid_amount>0/);
});
