import type { SkillInstallment } from '../core/gateway';
import type { CapitalFlowSkill } from '../core/skill';
import { executeToolAsSkill } from '../core/helpers';
import type { ToolRegistry } from '../../tools/core/registry';
import type { ConsultarParcelasInput } from './schema';
import { validateConsultarParcelas } from './schema';

export function createConsultarParcelasSkill(tools: ToolRegistry): CapitalFlowSkill<ConsultarParcelasInput, SkillInstallment[]> {
  return {
    id: 'consultar_parcelas', name: 'Consultar parcelas', description: 'Lista os estados oficiais das parcelas.',
    category: 'CONTRACT', risk: 'READ_ONLY', enabled: true, requiresAuthentication: true,
    requiresConfirmation: false, requiredPermissions: ['SKILLS_READ'], validate: validateConsultarParcelas,
    async execute(input, context) {
      return executeToolAsSkill(tools, 'installments.list', input, context);
    },
  };
}
