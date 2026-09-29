import type { CapitalFlowSkillGateway, SkillAgreement } from '../core/gateway';
import type { CapitalFlowSkill } from '../core/skill';
import { backendFailure, resolveUniqueContractId } from '../core/helpers';
import { skillFailure, skillSuccess } from '../core/result';
import type { ConsultarAcordoInput } from './schema';
import { validateConsultarAcordo } from './schema';

export function createConsultarAcordoSkill(gateway: CapitalFlowSkillGateway): CapitalFlowSkill<ConsultarAcordoInput, SkillAgreement> {
  return {
    id: 'consultar_acordo', name: 'Consultar acordo', description: 'Consulta somente o acordo ativo persistido.',
    category: 'AGREEMENT', risk: 'READ_ONLY', enabled: true, requiresAuthentication: true,
    requiresConfirmation: false, requiredPermissions: ['SKILLS_READ'], validate: validateConsultarAcordo,
    async execute(input, context) {
      const contract = await resolveUniqueContractId(gateway, input, context);
      if ('error' in contract) return skillFailure(contract.error, contract.message);
      try {
        const agreement = await gateway.getActiveAgreement(contract.data, context);
        return agreement ? skillSuccess(agreement, { authoritativeBackend: 'skill_get_agreement_v1' }) : skillFailure('NOT_FOUND', 'Acordo ativo não encontrado.');
      } catch (error) {
        return backendFailure(error);
      }
    },
  };
}
