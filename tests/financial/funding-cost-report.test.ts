import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFundingCostReport } from '../../domain/finance/fundingCostReport';

const loan = (overrides: Record<string, unknown> = {}) => ({
  id: 'loan-1', debtorName: 'Cliente', principal: 1000, fundingTotalPayable: 1049.9,
  startDate: '2026-11-13', ...overrides,
} as any);

test('reports internal card funding cost without changing customer principal', () => {
  const result = buildFundingCostReport([loan()]);
  assert.deepEqual(result, {
    totalCost: 49.9,
    rows: [{
      loanId: 'loan-1', debtorName: 'Cliente', principal: 1000,
      fundingCost: 49.9, fundingTotalPayable: 1049.9, date: '2026-11-13',
      needsCardReconciliation: false,
    }],
  });
});

test('does not report zero-cost contracts or contracts outside the selected period', () => {
  const result = buildFundingCostReport([
    loan({ id: 'zero', fundingTotalPayable: 1000 }),
    loan({ id: 'old', startDate: '2026-10-31', fundingTotalPayable: 1049.9 }),
  ], { startKey: '2026-11-01', endKey: '2026-11-30' });
  assert.equal(result.totalCost, 0);
  assert.deepEqual(result.rows, []);
});

test('marks card-backed funding costs as pending internal reconciliation', async () => {
  const { buildFundingCostReport } = await import('../../domain/finance/fundingCostReport');
  const result = buildFundingCostReport([loan({ sourceId: 'card-source' })], undefined, [
    { id: 'card-source', type: 'CARD' },
  ] as any);
  assert.equal(result.rows[0].needsCardReconciliation, true);
});
