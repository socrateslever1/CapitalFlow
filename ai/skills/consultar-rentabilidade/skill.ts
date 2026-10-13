import type { SkillProfitability } from '../core/gateway';
import type { CapitalFlowSkill } from '../core/skill';
import { executeToolAsSkill } from '../core/helpers';
import type { ToolRegistry } from '../../tools/core/registry';
import type { ConsultarRentabilidadeInput } from './schema';
import { validateConsultarRentabilidade } from './schema';

export function createConsultarRentabilidadeSkill(
  tools: ToolRegistry,
): CapitalFlowSkill<ConsultarRentabilidadeInput, SkillProfitability[]> {
  return {
    id: 'consultar_rentabilidade',
    name: 'Consultar rentabilidade',
    description: 'Consulta rentabilidade realizada calculada pelo ledger autoritativo.',
    category: 'PROFITABILITY',
    risk: 'READ_ONLY',
    enabled: true,
    requiresAuthentication: true,
    requiresConfirmation: false,
    requiredPermissions: ['SKILLS_READ'],
    validate: validateConsultarRentabilidade,
    execute: (input, context) => executeToolAsSkill(tools, 'profitability.get', input, context),
  };
}
