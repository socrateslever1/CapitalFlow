import assert from 'node:assert/strict';
import { testConsultarCliente } from '../../ai/skills/consultar-cliente/tests';
import { testConsultarDivida } from '../../ai/skills/consultar-divida/tests';
import { testConsultarParcelas } from '../../ai/skills/consultar-parcelas/tests';
import { testConsultarContrato } from '../../ai/skills/consultar-contrato/tests';
import { testConsultarVencimentos } from '../../ai/skills/consultar-vencimentos/tests';
import { testConsultarAcordo } from '../../ai/skills/consultar-acordo/tests';
import { createCapitalFlowSkillRegistry } from '../../ai/skills/registry';
import { executeSkillIntent } from '../../ai/skills/integration/intentRouter';
import { skillEvalCases } from '../../ai/evals/skills.eval';
import { createFakeGateway, CONTRACT_A, skillContext } from './fakeGateway';

await testConsultarCliente();
await testConsultarDivida();
await testConsultarParcelas();
await testConsultarContrato();
await testConsultarVencimentos();
await testConsultarAcordo();

const registry = createCapitalFlowSkillRegistry(createFakeGateway());
assert.equal(registry.byRisk('READ_ONLY').length, 6);
assert.equal(registry.byRisk('FINANCIAL_WRITE').length, 9);
assert.equal(registry.byRisk('FINANCIAL_WRITE').every((skill) => !skill.enabled && skill.requiresConfirmation), true);

const blocked = await executeSkillIntent(registry, 'registrar_pagamento', { contractId: CONTRACT_A, amount: 500 }, {
  ...skillContext,
  permissions: ['SKILLS_READ', 'FINANCIAL_WRITE'],
});
assert.deepEqual(blocked, {
  ok: false,
  error: 'SKILL_DISABLED',
  message: 'Bloqueada até as migrations V4 e as RPCs de Skills serem validadas em staging com reconciliação financeira.',
});

assert.equal(skillEvalCases.filter((item) => item.expectedOutcome === 'BLOCKED').every((item) => {
  const skill = registry.get(item.expectedSkillId);
  return skill?.enabled === false;
}), true);

const invalidIdSkill = registry.get<any, any>('consultar_contrato')!;
const invalidValidation = await invalidIdSkill.validate({ contractId: 'inventado' }, skillContext);
assert.equal(invalidValidation.valid, false);

console.log('Suite de Skills concluída com sucesso.');
