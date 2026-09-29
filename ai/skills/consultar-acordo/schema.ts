import type { SkillValidation } from '../core/validation';
import { invalidInput, isUuid, validInput } from '../core/validation';

export type ConsultarAcordoInput = { contractId?: string; clientId?: string };

export function validateConsultarAcordo(input: ConsultarAcordoInput): SkillValidation {
  const ids = [input?.contractId, input?.clientId].filter(Boolean);
  return ids.length === 1 && ids.every(isUuid) ? validInput() : invalidInput('Informe um contractId ou clientId válido.');
}
