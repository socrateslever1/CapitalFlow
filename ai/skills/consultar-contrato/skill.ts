import type { CapitalFlowSkillGateway, SkillContract } from '../core/gateway';
import type { CapitalFlowSkill } from '../core/skill';
import { backendFailure } from '../core/helpers';
import { skillFailure, skillSuccess } from '../core/result';
import type { ConsultarContratoInput } from './schema';
import { validateConsultarContrato } from './schema';

export function createConsultarContratoSkill(gateway: CapitalFlowSkillGateway): CapitalFlowSkill<ConsultarContratoInput, SkillContract> {
  return {
    id: 'consultar_contrato', name: 'Consultar contrato', description: 'Retorna dados seguros de um contrato.',
    category: 'CONTRACT', risk: 'READ_ONLY', enabled: true, requiresAuthentication: true,
    requiresConfirmation: false, requiredPermissions: ['SKILLS_READ'], validate: validateConsultarContrato,
    async execute(input, context) {
      try {
        const contracts = await gateway.listContracts(input, context);
        if (contracts.length === 0) return skillFailure('NOT_FOUND', 'Contrato não encontrado.');
        if (contracts.length > 1) return skillFailure('AMBIGUOUS', 'Há mais de um contrato para o cliente informado.');
        return skillSuccess(contracts[0]);
      } catch (error) {
        return backendFailure(error);
      }
    },
  };
}
