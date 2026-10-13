import type { ProfitabilityScope } from '../core/gateway';
import type { SkillValidation } from '../core/validation';
import { invalidInput, isUuid, validInput } from '../core/validation';

export type ConsultarRentabilidadeInput = {
  scope: ProfitabilityScope;
  clientId?: string;
  contractId?: string;
  limit?: number;
};

export function validateConsultarRentabilidade(input: ConsultarRentabilidadeInput): SkillValidation {
  if (!['CLIENT', 'CONTRACT', 'RANKING'].includes(input?.scope)) return invalidInput('Escopo de rentabilidade inválido.');
  if (input.scope === 'CLIENT' && !isUuid(input.clientId)) return invalidInput('Informe um clientId válido.');
  if (input.scope === 'CONTRACT' && !isUuid(input.contractId)) return invalidInput('Informe um contractId válido.');
  if (input.scope === 'RANKING' && (input.clientId || input.contractId)) return invalidInput('Ranking não aceita identificador.');
  if (input.limit !== undefined && (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 50)) {
    return invalidInput('Limite inválido.');
  }
  return validInput();
}
