import type { SkillPermission } from '../../skills/core/types';
import type { ToolContext } from './context';
import type { ToolResult } from './errors';
import { toolFailure, toolSuccess } from './errors';

export function authorizeToolContext(
  context: ToolContext,
  requiredPermissions: SkillPermission[],
): ToolResult<true> {
  if (!context.authenticated || !context.userId || !context.profileId) {
    return toolFailure('NOT_AUTHORIZED', 'Sessão autenticada e perfil confiável são obrigatórios.');
  }
  const permissions = new Set(context.permissions || []);
  if (requiredPermissions.some((permission) => !permissions.has(permission))) {
    return toolFailure('NOT_AUTHORIZED', 'Permissão insuficiente para executar esta Tool.');
  }
  return toolSuccess(true);
}

export const toolContextHasPermission = (context: ToolContext, permission: SkillPermission) =>
  (context.permissions || []).includes(permission);
