import assert from 'node:assert/strict';
import { createConsultarVencimentosSkill } from './skill';
import { createFakeToolRegistry, CONTRACT_A, skillContext } from '../../../tests/skills/fakeGateway';

export async function testConsultarVencimentos() {
  const skill = createConsultarVencimentosSkill(createFakeToolRegistry({
    listDue: async (input) => {
      assert.equal(input.from, '2026-09-29');
      return [{ contractId: CONTRACT_A, installmentId: 'inst-1', dueDate: '2026-09-29', total: 100, daysLate: 0 }];
    },
  }));
  const result = await skill.execute({ query: 'TOMORROW', referenceDate: '2026-09-28' }, skillContext);
  assert.equal(result.ok, true);
}
