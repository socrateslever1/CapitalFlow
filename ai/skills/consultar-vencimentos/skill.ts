import type { SkillDueItem } from '../core/gateway';
import type { CapitalFlowSkill } from '../core/skill';
import { executeToolAsSkill } from '../core/helpers';
import type { ToolRegistry } from '../../tools/core/registry';
import type { ConsultarVencimentosInput } from './schema';
import { validateConsultarVencimentos } from './schema';

export function createConsultarVencimentosSkill(tools: ToolRegistry): CapitalFlowSkill<ConsultarVencimentosInput, SkillDueItem[]> {
  return {
    id: 'consultar_vencimentos', name: 'Consultar vencimentos', description: 'Lista vencimentos oficiais do perfil.',
    category: 'COLLECTION', risk: 'READ_ONLY', enabled: true, requiresAuthentication: true,
    requiresConfirmation: false, requiredPermissions: ['SKILLS_READ'], validate: validateConsultarVencimentos,
    async execute(input, context) {
      return executeToolAsSkill(tools, 'due_dates.list', input, context);
    },
  };
}
