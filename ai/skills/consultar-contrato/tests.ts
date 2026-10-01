import assert from 'node:assert/strict';
import { createConsultarContratoSkill } from './skill';
import { createFakeToolRegistry, CONTRACT_A, skillContext } from '../../../tests/skills/fakeGateway';

export async function testConsultarContrato() {
  const skill = createConsultarContratoSkill(createFakeToolRegistry({
    listContracts: async () => [{ id: CONTRACT_A, status: 'ACTIVE', billingCycle: 'MONTHLY' }],
  }));
  const result = await skill.execute({ contractId: CONTRACT_A }, skillContext);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.id, CONTRACT_A);
    assert.equal('portalToken' in result.data, false);
  }
}
