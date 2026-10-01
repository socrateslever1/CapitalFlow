import type { SkillContract } from '../core/gateway';
import type { CapitalFlowSkill } from '../core/skill';
import { executeToolAsSkill } from '../core/helpers';
import type { ToolRegistry } from '../../tools/core/registry';
import type { ConsultarContratoInput } from './schema';
import { validateConsultarContrato } from './schema';

export function createConsultarContratoSkill(tools: ToolRegistry): CapitalFlowSkill<ConsultarContratoInput, SkillContract> {
  return {
    id: 'consultar_contrato', name: 'Consultar contrato', description: 'Retorna dados seguros de um contrato.',
    category: 'CONTRACT', risk: 'READ_ONLY', enabled: true, requiresAuthentication: true,
    requiresConfirmation: false, requiredPermissions: ['SKILLS_READ'], validate: validateConsultarContrato,
    async execute(input, context) {
      return executeToolAsSkill(tools, 'contract.get', input, context);
    },
  };
}
