import type { CapitalFlowSkillGateway, SkillDueItem } from '../core/gateway';
import type { CapitalFlowSkill } from '../core/skill';
import { backendFailure } from '../core/helpers';
import { skillSuccess } from '../core/result';
import type { ConsultarVencimentosInput } from './schema';
import { validateConsultarVencimentos } from './schema';

const addUtcDays = (date: string, days: number) => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

export function createConsultarVencimentosSkill(gateway: CapitalFlowSkillGateway): CapitalFlowSkill<ConsultarVencimentosInput, SkillDueItem[]> {
  return {
    id: 'consultar_vencimentos', name: 'Consultar vencimentos', description: 'Lista vencimentos oficiais do perfil.',
    category: 'COLLECTION', risk: 'READ_ONLY', enabled: true, requiresAuthentication: true,
    requiresConfirmation: false, requiredPermissions: ['SKILLS_READ'], validate: validateConsultarVencimentos,
    async execute(input, context) {
      const reference = input.referenceDate || new Date().toISOString().slice(0, 10);
      let from = reference;
      let to = reference;
      let onlyOverdue = false;
      if (input.query === 'TOMORROW') from = to = addUtcDays(reference, 1);
      if (input.query === 'NEXT') to = addUtcDays(reference, 366);
      if (input.query === 'OVERDUE') { from = '1900-01-01'; to = addUtcDays(reference, -1); onlyOverdue = true; }
      if (input.query === 'RANGE') { from = input.from!; to = input.to!; }
      try {
        let rows = await gateway.listDue({ from, to, onlyOverdue, referenceDate: reference }, context);
        if (input.query === 'NEXT' && rows.length) {
          const nextDate = rows[0].dueDate;
          rows = rows.filter((row) => row.dueDate === nextDate);
        }
        return skillSuccess(rows, { authoritativeBackend: 'skill_list_due_v1' });
      } catch (error) {
        return backendFailure(error);
      }
    },
  };
}
