import assert from 'node:assert/strict';
import test from 'node:test';
import { getCardCreditPosition, getEffectiveInvoiceCycles } from '../../components/wallet/invoiceStatementDomain';

const card = { id: 'card-1', credit_limit: 2000 };
const expenses = [
  { id: 'purchase-1', card_id: 'card-1', description: 'Notebook', amount: 900, category: 'Compras', expense_date: '2026-10-01', due_date: '2026-10-10', status: 'PENDING', installment_count: 3, entry_type: 'PURCHASE' as const },
  { id: 'override-1', card_id: 'card-1', description: 'Fatura consolidada 10/2026', amount: 250, category: 'Ajuste de fatura', expense_date: '2026-10-01', due_date: '2026-10-01', status: 'PENDING', installment_count: 1, entry_type: 'INVOICE_OVERRIDE' as const, invoice_due_month: '2026-10-01' },
];
const installments = [
  { id: 'p1', expense_id: 'purchase-1', installment_number: 1, due_month: '2026-10-01', amount: 300, paid_amount: 0, status: 'PENDING' as const },
  { id: 'p2', expense_id: 'purchase-1', installment_number: 2, due_month: '2026-11-01', amount: 300, paid_amount: 0, status: 'PENDING' as const },
  { id: 'p3', expense_id: 'purchase-1', installment_number: 3, due_month: '2026-12-01', amount: 300, paid_amount: 0, status: 'PENDING' as const },
  { id: 'o1', expense_id: 'override-1', installment_number: 1, due_month: '2026-10-01', amount: 250, paid_amount: 0, status: 'PENDING' as const },
];

test('override substitutes the itemized cycle while later installments remain future commitments', () => {
  const position = getCardCreditPosition(card, expenses, installments);
  assert.deepEqual(position, {
    dueMonth: '2026-10-01',
    currentInvoice: 250,
    futureCommitments: 600,
    committedLimit: 850,
    freeLimit: 1150,
    hasOverride: true,
  });
});

test('paid override permanently suppresses itemized rows from the overridden cycle', () => {
  const paid = installments.map(item => item.id === 'o1' ? { ...item, paid_amount: 250, status: 'PAID' as const } : item);
  const cycles = getEffectiveInvoiceCycles('card-1', expenses, paid);
  assert.deepEqual(cycles.map(cycle => [cycle.dueMonth, cycle.amount]), [
    ['2026-10-01', 0],
    ['2026-11-01', 300],
    ['2026-12-01', 300],
  ]);
  const position = getCardCreditPosition(card, expenses, paid);
  assert.equal(position.dueMonth, '2026-11-01');
  assert.equal(position.currentInvoice, 300);
  assert.equal(position.futureCommitments, 300);
});

test('free limit never becomes negative', () => {
  const position = getCardCreditPosition({ id: 'card-1', credit_limit: 500 }, expenses, installments);
  assert.equal(position.freeLimit, 0);
  assert.equal(position.committedLimit, 850);
});

