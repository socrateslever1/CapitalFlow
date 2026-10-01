import assert from 'node:assert/strict';
import { createConsultarAcordoSkill } from './skill';
import { createFakeToolRegistry, CONTRACT_A, skillContext } from '../../../tests/skills/fakeGateway';

export async function testConsultarAcordo() {
  const skill = createConsultarAcordoSkill(createFakeToolRegistry({
    listContracts: async () => [{ id: CONTRACT_A }],
    getActiveAgreement: async () => ({ id: 'agreement-1', contractId: CONTRACT_A, status: 'ACTIVE', negotiatedTotal: 500, installmentsCount: 2, installments: [] }),
  }));
  const result = await skill.execute({ contractId: CONTRACT_A }, skillContext);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.data.status, 'ACTIVE');
}
