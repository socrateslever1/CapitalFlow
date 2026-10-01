import type { SkillContext } from './types';
import type { SkillResult } from './result';
import { skillFailure, skillSuccess } from './result';
import type { ToolRegistry } from '../../tools/core/registry';
import { createToolContext } from '../../tools/core/context';

export async function executeToolAsSkill<TOutput>(
  registry: ToolRegistry,
  toolId: string,
  input: unknown,
  context: SkillContext,
): Promise<SkillResult<TOutput>> {
  const result = await registry.execute<TOutput>(toolId, input, createToolContext(context));
  if (!('error' in result)) return skillSuccess(result.data, result.metadata);
  return skillFailure(result.error === 'TOOL_DISABLED' ? 'SKILL_DISABLED' : result.error, result.message);
}
