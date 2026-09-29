import type { SkillValidation } from '../core/validation';
import { invalidInput, isUuid, validInput } from '../core/validation';

export type ConsultarContratoInput = { contractId?: string; clientId?: string };

export function validateConsultarContrato(input: ConsultarContratoInput): SkillValidation {
  const ids = [input?.contractId, input?.clientId].filter(Boolean);
  if (ids.length !== 1) return invalidInput('Informe contractId ou clientId.');
  if (!ids.every(isUuid)) return invalidInput('Identificador inválido.');
  return validInput();
}
