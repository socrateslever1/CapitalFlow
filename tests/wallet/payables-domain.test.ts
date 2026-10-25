import test from 'node:test';
import assert from 'node:assert/strict';
import { derivePayableStatus, summarizePayables } from '../../components/wallet/payablesDomain';

test('deriva status liquidado, parcial, atrasado e pendente', () => {
  const today = '2026-10-25';
  assert.equal(derivePayableStatus({ total_amount: 100, outstanding_balance: 0, due_date: '2026-10-20' }, today), 'PAID');
  assert.equal(derivePayableStatus({ total_amount: 100, outstanding_balance: 40, due_date: '2026-10-20' }, today), 'PARTIAL');
  assert.equal(derivePayableStatus({ total_amount: 100, outstanding_balance: 100, due_date: '2026-10-20' }, today), 'OVERDUE');
  assert.equal(derivePayableStatus({ total_amount: 100, outstanding_balance: 100, due_date: '2026-11-20' }, today), 'PENDING');
});

test('resume passivo total, vencido e projeção de trinta dias', () => {
  const summary = summarizePayables([
    { status: 'PENDING', outstanding_balance: 100, due_date: '2026-10-20' },
    { status: 'PARTIAL', outstanding_balance: 50, due_date: '2026-11-10' },
    { status: 'PAID', outstanding_balance: 0, due_date: '2026-10-20' },
    { status: 'PENDING', outstanding_balance: 200, due_date: '2026-12-20' },
  ], '2026-10-25');
  assert.deepEqual(summary, { total: 350, overdue: 100, next30Days: 150, openCount: 3 });
});
