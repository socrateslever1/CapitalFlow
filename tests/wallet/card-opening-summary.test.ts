import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateCardOpening } from '../../components/wallet/cardOpeningSummary';
import { getCardCreditPosition } from '../../components/wallet/invoiceStatementDomain';

test('opening includes current invoice exactly once and preserves cents', () => {
  assert.deepEqual(calculateCardOpening(10000, 8145.23, 2517.55), { available: 1854.77, overLimit: 0, other: 5627.68, unallocated: 5627.68 });
  assert.equal(calculateCardOpening(10000, 8145.23, 2517.55, 1000).unallocated, 4627.68);
});
test('opening rejects inconsistent and invalid inputs', () => {
  for (const values of [[100, 50, 51], [100, -1, 0], [100, NaN, 0], [100, 1.111, 0]]) {
    assert.throws(() => calculateCardOpening(values[0], values[1], values[2]));
  }
});
test('over-limit position is accepted without granting spendable credit', () => {
  assert.equal(calculateCardOpening(100, 101, 0).overLimit, 1);
  assert.equal(calculateCardOpening(100, 101, 0).available, 0);
});
test('new purchases add to an opening invoice while covered purchases do not duplicate it', () => {
  const base = { card_id: 'c', amount: 100, description: 'Compra', category: 'Compras', expense_date: '2026-10-01', due_date: '2026-10-01', status: 'PENDING', installment_count: 1 };
  const expenses = [{ ...base, id: 'o', amount: 2517.55, entry_type: 'INVOICE_OVERRIDE' as const, invoice_due_month: '2026-10-01', is_opening_summary: true }, { ...base, id: 'covered' }, { ...base, id: 'new' }];
  const installments = expenses.map(e => ({ id: e.id, expense_id: e.id, installment_number: 1, due_month: '2026-10-01', amount: e.amount, paid_amount: 0, status: 'PENDING' as const, opening_invoice_id: e.id === 'covered' ? 'o' : null }));
  const result = getCardCreditPosition({ id: 'c', credit_limit: 10000, initial_future_installments_balance: 5627.68 }, expenses, installments);
  assert.equal(result.currentInvoice, 2617.55);
  assert.equal(result.committedLimit, 8245.23);
  assert.equal(result.freeLimit, 1754.77);
});
