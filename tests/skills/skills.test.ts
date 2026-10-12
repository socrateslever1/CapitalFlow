import assert from 'node:assert/strict';
import { testConsultarCliente } from '../../ai/skills/consultar-cliente/tests';
import { testConsultarDivida } from '../../ai/skills/consultar-divida/tests';
import { testConsultarParcelas } from '../../ai/skills/consultar-parcelas/tests';
import { testConsultarContrato } from '../../ai/skills/consultar-contrato/tests';
import { testConsultarVencimentos } from '../../ai/skills/consultar-vencimentos/tests';
import { testConsultarAcordo } from '../../ai/skills/consultar-acordo/tests';
import { createCapitalFlowSkillRegistry } from '../../ai/skills/registry';
import { classifyAndExecuteSkillIntent, executeSkillIntent } from '../../ai/skills/integration/intentRouter';
import { classifySkillIntent } from '../../ai/skills/integration/intentClassifier';
import { transitionConversationState, observedStateForIntent } from '../../ai/skills/integration/conversationState';
import { buildTrustedContextEnvelope } from '../../ai/skills/integration/contextBuilder';
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

for (const item of skillEvalCases) {
  const classification = classifySkillIntent(item.prompt);
  assert.equal(classification.intent, item.expectedSkillId, `intent incorreto para: ${item.prompt}`);
  assert.equal(classification.route, item.expectedRoute, `rota incorreta para: ${item.prompt}`);
  assert.equal(classification.confidence >= (item.minConfidence ?? 0.9), true, `confiança baixa para: ${item.prompt}`);

  const skill = registry.get(item.expectedSkillId);
  assert.equal(Boolean(skill), true);
  if (item.expectedOutcome === 'BLOCKED') assert.equal(skill?.enabled, false);
}

const classifiedBlocked = await classifyAndExecuteSkillIntent(
  registry,
  'Execute pagamento de R$ 500.',
  { contractId: CONTRACT_A, amount: 500 },
  { ...skillContext, permissions: ['SKILLS_READ', 'FINANCIAL_WRITE'] },
);
assert.equal(classifiedBlocked.classification.intent, 'registrar_pagamento');
assert.equal(classifiedBlocked.result.ok, false);
if (!classifiedBlocked.result.ok) assert.equal(classifiedBlocked.result.error, 'SKILL_DISABLED');

const readRouting = classifySkillIntent('Quanto devo hoje?');
assert.equal(observedStateForIntent(true, readRouting), 'RESOLVING_READ');
assert.deepEqual(transitionConversationState('IDENTIFIED', 'READ_INTENT'), { ok: true, state: 'RESOLVING_READ' });
assert.deepEqual(transitionConversationState('AWAITING_CONFIRMATION', 'CONFIRM'), { ok: true, state: 'EXECUTING' });
assert.deepEqual(transitionConversationState('IDENTIFIED', 'CONFIRM'), {
  ok: false,
  state: 'IDENTIFIED',
  error: 'INVALID_TRANSITION',
});

const contextEnvelope = buildTrustedContextEnvelope(
  { ...skillContext, requestId: 'req-1', conversationId: 'conv-1' },
  'RESOLVING_READ',
  readRouting,
);
assert.equal(contextEnvelope.identity.profileId, skillContext.profileId);
assert.equal(contextEnvelope.guardrails.financialWritesEnabled, false);
assert.equal(contextEnvelope.guardrails.explicitConfirmationRequired, true);
assert.equal(contextEnvelope.guardrails.rawPromptPersisted, false);

const invalidIdSkill = registry.get<any, any>('consultar_contrato')!;
const invalidValidation = await invalidIdSkill.validate({ contractId: 'inventado' }, skillContext);
assert.equal(invalidValidation.valid, false);

console.log('Suite de Skills concluída com sucesso.');
