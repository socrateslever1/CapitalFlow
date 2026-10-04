import test from 'node:test';
import assert from 'node:assert/strict';
import { distributeRecoveredPrincipal, validateFundingAllocations } from './fundingAllocations';

test('validates exact single and multi-source funding', () => {
  assert.equal(validateFundingAllocations(10000, [{ sourceId: 'a', amount: 10000 }]).ok, true);
  assert.equal(validateFundingAllocations(10000, [
    { sourceId: 'a', amount: 6000 },
    { sourceId: 'b', amount: 3000 },
    { sourceId: 'c', amount: 1000 },
  ]).ok, true);
  assert.equal(validateFundingAllocations(10000, [{ sourceId: 'a', amount: 9999.99 }]).ok, false);
});

test('merges duplicate sources and rejects invalid values', () => {
  const result = validateFundingAllocations(100, [
    { sourceId: 'a', amount: 40 },
    { sourceId: 'a', amount: 60 },
  ]);
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.allocations, [{ sourceId: 'a', amount: 100, percentage: 100 }]);
  assert.equal(validateFundingAllocations(100, [{ sourceId: 'a', amount: 0 }]).ok, false);
});

test('distributes recovered principal deterministically and closes cents', () => {
  const result = validateFundingAllocations(1000, [
    { sourceId: 'b', amount: 300 },
    { sourceId: 'a', amount: 600 },
    { sourceId: 'c', amount: 100 },
  ]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const recovered = distributeRecoveredPrincipal(101, result.allocations);
  assert.equal(recovered.reduce((sum, allocation) => sum + allocation.amount, 0), 101);
  assert.deepEqual(recovered.map((allocation) => [allocation.sourceId, allocation.amount]), [
    ['a', 60.6],
    ['b', 30.3],
    ['c', 10.1],
  ]);
});
