import type { SkillContext, SkillPermission } from './types';
import type { SkillResult } from './result';
import { skillFailure } from './result';

export function authorizeSkillContext(
  context: SkillContext,
  requiredPermissions: SkillPermission[] = [],
): SkillResult<true> {
  if (!context.authenticated || !context.userId || !context.profileId) {
    return skillFailure('NOT_AUTHORIZED', 'Sessão autenticada e perfil confiável são obrigatórios.');
  }
  const granted = new Set(context.permissions || []);
  if (requiredPermissions.some((permission) => !granted.has(permission))) {
    return skillFailure('NOT_AUTHORIZED', 'Permissão insuficiente para executar esta Skill.');
  }
  return { ok: true, data: true };
}

export const hasPermission = (context: SkillContext, permission: SkillPermission): boolean =>
  (context.permissions || []).includes(permission);
