import type { CapitalFlowSkillGateway, SkillInstallment } from '../core/gateway';
import type { CapitalFlowSkill } from '../core/skill';
import { backendFailure, resolveUniqueContractId } from '../core/helpers';
import { skillFailure, skillSuccess } from '../core/result';
import type { ConsultarParcelasInput } from './schema';
import { validateConsultarParcelas } from './schema';

export function createConsultarParcelasSkill(gateway: CapitalFlowSkillGateway): CapitalFlowSkill<ConsultarParcelasInput, SkillInstallment[]> {
  return {
    id: 'consultar_parcelas', name: 'Consultar parcelas', description: 'Lista os estados oficiais das parcelas.',
    category: 'CONTRACT', risk: 'READ_ONLY', enabled: true, requiresAuthentication: true,
    requiresConfirmation: false, requiredPermissions: ['SKILLS_READ'], validate: validateConsultarParcelas,
    async execute(input, context) {
      const contract = await resolveUniqueContractId(gateway, input, context);
      if ('error' in contract) return skillFailure(contract.error, contract.message);
      try {
        const installments = await gateway.listInstallments(contract.data, context);
        return installments ? skillSuccess(installments, { authoritativeBackend: 'skill_list_installments_v1' }) : skillFailure('NOT_FOUND', 'Parcelas não encontradas.');
      } catch (error) {
        return backendFailure(error);
      }
    },
  };
}
