import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getPurchaseInvoiceMonth, getVisibleInvoiceCycles } from '../../components/wallet/invoiceStatementDomain';
import type { PersonalWalletExpense, PersonalWalletExpenseInstallment } from '../../services/personalWallet.service';

const purchase = (id: string): PersonalWalletExpense =>
  ({ id, card_id: 'card-1', status: 'PENDING', entry_type: 'PURCHASE', expense_date: '2026-11-05' } as PersonalWalletExpense);
const installment = (id: string, month: string): PersonalWalletExpenseInstallment =>
  ({ id: 'i-' + id, expense_id: id, due_month: month, amount: 100, paid_amount: 0, status: 'PENDING', installment_number: 1 } as PersonalWalletExpenseInstallment);

test('November closes in November and is paid in December', () => {
  assert.equal(getPurchaseInvoiceMonth('2026-11-05', 30, 5), '2026-12-01');
  assert.equal(getPurchaseInvoiceMonth('2026-11-30', 30, 5), '2026-12-01');
  assert.equal(getPurchaseInvoiceMonth('2026-12-01', 30, 5), '2027-01-01');
  assert.equal(getPurchaseInvoiceMonth('2026-11-19', 20, 25), '2026-11-01');
  assert.equal(getPurchaseInvoiceMonth('2026-11-21', 20, 25), '2026-12-01');
});

test('invoice list never fabricates empty cycles', () => {
  assert.deepEqual(getVisibleInvoiceCycles('card-1', [], [], []), []);
  assert.deepEqual(getVisibleInvoiceCycles('card-1', [], [], [{ card_id: 'card-1', due_month: '2026-12-01' }]), [
    { dueMonth: '2026-12-01', amount: 0, hasOverride: false },
  ]);
});

test('cancelled invoice metadata remains for audit but disappears from active list', () => {
  const facts = [{ card_id: 'card-1', due_month: '2026-11-01' }];
  const audit = {
    request: { operation: 'CANCEL_UNPAID_INVOICE', card_id: 'card-1', due_month: '2026-11-01' },
  };
  assert.deepEqual(getVisibleInvoiceCycles('card-1', [], [], facts, audit), []);
  assert.deepEqual(
    getVisibleInvoiceCycles('card-1', [purchase('p1')], [installment('p1', '2026-11-01')], facts, audit),
    [{ dueMonth: '2026-11-01', amount: 100, hasOverride: false }],
  );
});
