import type { SkillContext } from '../../skills/core/types';

export type ToolContext = Readonly<SkillContext>;

export function createToolContext(context: SkillContext): ToolContext {
  if (!context.authenticated || !context.userId || !context.profileId) {
    throw new Error('Contexto autenticado e perfil confiável são obrigatórios.');
  }
  return Object.freeze({
    ...context,
    permissions: [...(context.permissions || [])],
  });
}
