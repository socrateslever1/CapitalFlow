import type { SkillValidation } from '../core/validation';
import { invalidInput, isIsoDate, isUuid, validInput } from '../core/validation';

export type ConsultarDividaInput = { contractId?: string; clientId?: string; referenceDate?: string };

export function validateConsultarDivida(input: ConsultarDividaInput): SkillValidation {
  const ids = [input?.contractId, input?.clientId].filter(Boolean);
  if (ids.length !== 1 || !ids.every(isUuid)) return invalidInput('Informe um contractId ou clientId válido.');
  if (input.referenceDate && !isIsoDate(input.referenceDate)) return invalidInput('Data de referência inválida.');
  return validInput();
}
