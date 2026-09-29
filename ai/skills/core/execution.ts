import type { SkillRegistry } from './registry';
import type { SkillExecutionMetadata, SkillContext } from './types';
import type { SkillResult } from './result';
import { skillFailure } from './result';

export type SkillObserver = (event: SkillExecutionMetadata) => void | Promise<void>;

export async function executeRegisteredSkill<TOutput>(
  registry: SkillRegistry,
  skillId: string,
  input: unknown,
  context: SkillContext,
  observer?: SkillObserver,
): Promise<SkillResult<TOutput>> {
  const startedAt = Date.now();
  const startTime = new Date(startedAt).toISOString();
  let result: SkillResult<TOutput>;
  const allowed = registry.canExecute(skillId, context);

  if ('error' in allowed) {
    result = skillFailure(allowed.error, allowed.message);
  } else {
    const skill = registry.get<any, TOutput>(skillId);
    if (!skill) return skillFailure('NOT_FOUND', 'Skill não encontrada.');
    const validation = await skill.validate(input, context);
    if ('error' in validation) {
      result = skillFailure(validation.error, validation.message);
    } else {
      result = await skill.execute(input, context);
    }
  }

  if (observer) {
    await observer({
      skillId,
      requestId: context.requestId,
      profileId: context.profileId,
      source: context.source,
      startTime,
      durationMs: Date.now() - startedAt,
      success: result.ok,
      ...('error' in result ? { errorType: result.error } : {}),
    });
  }
  return result;
}
