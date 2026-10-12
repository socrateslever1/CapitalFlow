import type { SkillContext } from '../core/types';
import type { SkillObserver } from '../core/execution';
import { executeRegisteredSkill } from '../core/execution';
import type { SkillRegistry } from '../core/registry';
import type { SkillResult } from '../core/result';
import { skillFailure } from '../core/result';
import {
  classifySkillIntent,
  isSkillIntent,
  SKILL_INTENT_IDS,
  type IntentClassification,
} from './intentClassifier';

const ALLOWED_INTENTS = new Set<string>(SKILL_INTENT_IDS);

export async function executeSkillIntent<TOutput>(
  registry: SkillRegistry,
  intent: string,
  input: unknown,
  context: SkillContext,
  observer?: SkillObserver,
): Promise<SkillResult<TOutput>> {
  const normalizedIntent = String(intent || '').trim().toLowerCase();
  if (!ALLOWED_INTENTS.has(normalizedIntent)) {
    return skillFailure('NOT_FOUND', 'Intent não corresponde a uma Skill permitida.');
  }
  return executeRegisteredSkill<TOutput>(registry, normalizedIntent, input, context, observer);
}

export async function classifyAndExecuteSkillIntent<TOutput>(
  registry: SkillRegistry,
  prompt: unknown,
  input: unknown,
  context: SkillContext,
  observer?: SkillObserver,
): Promise<{ classification: IntentClassification; result: SkillResult<TOutput> }> {
  const classification = classifySkillIntent(prompt);
  if (!isSkillIntent(classification.intent)) {
    return {
      classification,
      result: skillFailure('NOT_FOUND', 'A mensagem não corresponde a uma Skill executável.'),
    };
  }

  return {
    classification,
    result: await executeSkillIntent<TOutput>(
      registry,
      classification.intent,
      input,
      context,
      observer,
    ),
  };
}
