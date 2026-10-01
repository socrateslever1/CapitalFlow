import assert from 'node:assert/strict';
import { createConsultarParcelasSkill } from './skill';
import { createFakeToolRegistry, CONTRACT_A, skillContext } from '../../../tests/skills/fakeGateway';

export async function testConsultarParcelas() {
  const skill = createConsultarParcelasSkill(createFakeToolRegistry({
    listContracts: async () => [{ id: CONTRACT_A }],
    listInstallments: async () => [{ id: 'inst-1', number: 1, status: 'PENDING', principal: 100, interest: 20, lateFee: 0, total: 120, paidTotal: 0 }],
  }));
  const result = await skill.execute({ contractId: CONTRACT_A }, skillContext);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.data[0].status, 'PENDING');
}
