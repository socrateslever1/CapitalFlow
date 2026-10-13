import assert from 'node:assert/strict';
import { classifySkillIntentWithContext } from '../skills/integration/intentClassifier';
import { observedStateForIntent } from '../skills/integration/conversationState';
import { routingEvalCases } from './routing.eval';

let correct = 0;
let unknown = 0;
let handoff = 0;
let wrongSkill = 0;

for (const item of routingEvalCases) {
  const result = classifySkillIntentWithContext(item.message, {
    previousIntent: item.previousIntent,
    identified: item.identified,
    hasActiveContract: item.hasActiveContract,
  });
  const matches = result.intent === item.expectedIntent;
  if (matches) correct += 1;
  if (result.intent === 'unknown') unknown += 1;
  if (result.route === 'HUMAN_HANDOFF') handoff += 1;
  if (!matches && result.route === 'READ_ONLY_SKILL') wrongSkill += 1;
  assert.equal(result.intent, item.expectedIntent, `${item.name}: intent incorreto`);
  if (item.expectHandoff) assert.equal(observedStateForIntent(Boolean(item.identified), result), 'HUMAN_HANDOFF');
}

const total = routingEvalCases.length;
const metrics = {
  total,
  accuracy: correct / total,
  unknownRate: unknown / total,
  handoffRate: handoff / total,
  wrongSkillRate: wrongSkill / total,
};
assert.equal(metrics.accuracy, 1);
assert.equal(metrics.wrongSkillRate, 0);
console.log(JSON.stringify(metrics));
