import type { SkillValidation } from '../core/validation';
import { invalidInput, isUuid, validInput } from '../core/validation';

export type ConsultarParcelasInput = { contractId?: string; clientId?: string };

export function validateConsultarParcelas(input: ConsultarParcelasInput): SkillValidation {
  const ids = [input?.contractId, input?.clientId].filter(Boolean);
  return ids.length === 1 && ids.every(isUuid) ? validInput() : invalidInput('Informe um contractId ou clientId válido.');
}
