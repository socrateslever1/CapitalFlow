import type { CapitalFlowSkillGateway, SkillDebtPosition } from '../core/gateway';
import type { CapitalFlowSkill } from '../core/skill';
import { backendFailure, resolveUniqueContractId } from '../core/helpers';
import { skillFailure, skillSuccess } from '../core/result';
import type { ConsultarDividaInput } from './schema';
import { validateConsultarDivida } from './schema';

export function createConsultarDividaSkill(gateway: CapitalFlowSkillGateway): CapitalFlowSkill<ConsultarDividaInput, SkillDebtPosition> {
  return {
    id: 'consultar_divida', name: 'Consultar dívida', description: 'Consulta a posição persistida pelo backend financeiro.',
    category: 'PAYMENT', risk: 'READ_ONLY', enabled: true, requiresAuthentication: true,
    requiresConfirmation: false, requiredPermissions: ['SKILLS_READ'], validate: validateConsultarDivida,
    async execute(input, context) {
      const contract = await resolveUniqueContractId(gateway, input, context);
      if ('error' in contract) return skillFailure(contract.error, contract.message);
      try {
        const referenceDate = input.referenceDate || new Date().toISOString().slice(0, 10);
        const position = await gateway.getDebtPosition(contract.data, referenceDate, context);
        return position ? skillSuccess(position, { authoritativeBackend: 'skill_get_debt_position_v1' }) : skillFailure('NOT_FOUND', 'Dívida não encontrada.');
      } catch (error) {
        return backendFailure(error);
      }
    },
  };
}
