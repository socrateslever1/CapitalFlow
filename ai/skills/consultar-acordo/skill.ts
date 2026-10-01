import type { SkillAgreement } from '../core/gateway';
import type { CapitalFlowSkill } from '../core/skill';
import { executeToolAsSkill } from '../core/helpers';
import type { ToolRegistry } from '../../tools/core/registry';
import type { ConsultarAcordoInput } from './schema';
import { validateConsultarAcordo } from './schema';

export function createConsultarAcordoSkill(tools: ToolRegistry): CapitalFlowSkill<ConsultarAcordoInput, SkillAgreement> {
  return {
    id: 'consultar_acordo', name: 'Consultar acordo', description: 'Consulta somente o acordo ativo persistido.',
    category: 'AGREEMENT', risk: 'READ_ONLY', enabled: true, requiresAuthentication: true,
    requiresConfirmation: false, requiredPermissions: ['SKILLS_READ'], validate: validateConsultarAcordo,
    async execute(input, context) {
      return executeToolAsSkill(tools, 'agreement.get', input, context);
    },
  };
}
