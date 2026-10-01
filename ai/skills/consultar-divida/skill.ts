import type { SkillDebtPosition } from '../core/gateway';
import type { CapitalFlowSkill } from '../core/skill';
import { executeToolAsSkill } from '../core/helpers';
import type { ToolRegistry } from '../../tools/core/registry';
import type { ConsultarDividaInput } from './schema';
import { validateConsultarDivida } from './schema';

export function createConsultarDividaSkill(tools: ToolRegistry): CapitalFlowSkill<ConsultarDividaInput, SkillDebtPosition> {
  return {
    id: 'consultar_divida', name: 'Consultar dívida', description: 'Consulta a posição persistida pelo backend financeiro.',
    category: 'PAYMENT', risk: 'READ_ONLY', enabled: true, requiresAuthentication: true,
    requiresConfirmation: false, requiredPermissions: ['SKILLS_READ'], validate: validateConsultarDivida,
    async execute(input, context) {
      return executeToolAsSkill(tools, 'debt.get', input, context);
    },
  };
}
