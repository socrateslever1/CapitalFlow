import test from 'node:test';
import assert from 'node:assert/strict';
import { getInvoiceCycleDates, resolveInvoiceCycleState } from '../../components/wallet/invoiceStatementDomain';

test('resolveInvoiceCycleState follows OPEN, CLOSED, OVERDUE and PAID transitions', () => {
  const input = {
    dueMonth: '2026-10-01',
    closingDay: 21,
    dueDay: 3,
    outstanding: 100,
    hasCycle: true,
  };

  assert.equal(resolveInvoiceCycleState({ ...input, today: '2026-10-20' }), 'OPEN');
  assert.equal(resolveInvoiceCycleState({ ...input, today: '2026-10-27' }), 'CLOSED');
  assert.equal(resolveInvoiceCycleState({ ...input, today: '2026-11-04' }), 'OVERDUE');
  assert.equal(resolveInvoiceCycleState({ ...input, outstanding: 0, today: '2026-10-20' }), 'PAID');
});

test('getInvoiceCycleDates clamps calendar boundaries and crosses years safely', () => {
  assert.deepEqual(getInvoiceCycleDates('2028-02-01', 29, 5), {
    closingDate: '2028-02-29',
    dueDate: '2028-03-05',
  });
  assert.deepEqual(getInvoiceCycleDates('2027-02-01', 31, 5), {
    closingDate: '2027-02-28',
    dueDate: '2027-03-05',
  });
  assert.deepEqual(getInvoiceCycleDates('2026-12-01', 31, 5), {
    closingDate: '2026-12-31',
    dueDate: '2027-01-05',
  });
});

test('cycles without registered entries remain OPEN until a payment marks them PAID', () => {
  assert.equal(resolveInvoiceCycleState({
    dueMonth: '2026-10-01', closingDay: 21, dueDay: 3,
    outstanding: 0, hasCycle: false, today: '2026-11-20',
  }), 'OPEN');
  assert.equal(resolveInvoiceCycleState({
    dueMonth: '2026-10-01', closingDay: 21, dueDay: 3,
    outstanding: 0, hasCycle: false, paid: true, today: '2026-11-20',
  }), 'PAID');
});
