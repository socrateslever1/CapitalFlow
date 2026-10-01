import assert from 'node:assert/strict';
import { createConsultarDividaSkill } from './skill';
import { createFakeToolRegistry, CONTRACT_A, skillContext } from '../../../tests/skills/fakeGateway';

export async function testConsultarDivida() {
  let backendCalled = false;
  const skill = createConsultarDividaSkill(createFakeToolRegistry({
    listContracts: async () => [{ id: CONTRACT_A }],
    getDebtPosition: async () => {
      backendCalled = true;
      return { contractId: CONTRACT_A, source: 'INSTALLMENTS', principal: 100, interest: 20, lateFee: 5, totalDue: 125, daysLate: 2 };
    },
  }));
  const result = await skill.execute({ contractId: CONTRACT_A, referenceDate: '2026-09-28' }, skillContext);
  assert.equal(result.ok, true);
  assert.equal(backendCalled, true);
  if (result.ok) assert.equal(result.data.totalDue, 125);

  const unavailable = createConsultarDividaSkill(createFakeToolRegistry({
    listContracts: async () => [{ id: CONTRACT_A }],
    getDebtPosition: async () => { throw new Error('offline'); },
  }));
  assert.equal((await unavailable.execute({ contractId: CONTRACT_A }, skillContext) as any).error, 'BACKEND_ERROR');
}
