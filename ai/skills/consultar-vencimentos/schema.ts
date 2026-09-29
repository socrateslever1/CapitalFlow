import type { SkillValidation } from '../core/validation';
import { invalidInput, isIsoDate, validInput } from '../core/validation';

export type DueQuery = 'TODAY' | 'TOMORROW' | 'NEXT' | 'OVERDUE' | 'RANGE';
export type ConsultarVencimentosInput = { query: DueQuery; referenceDate?: string; from?: string; to?: string };

export function validateConsultarVencimentos(input: ConsultarVencimentosInput): SkillValidation {
  if (!['TODAY', 'TOMORROW', 'NEXT', 'OVERDUE', 'RANGE'].includes(input?.query)) return invalidInput('Consulta de vencimento inválida.');
  if (input.referenceDate && !isIsoDate(input.referenceDate)) return invalidInput('Data de referência inválida.');
  if (input.query === 'RANGE' && (!isIsoDate(input.from) || !isIsoDate(input.to))) return invalidInput('Intervalo inválido.');
  return validInput();
}
