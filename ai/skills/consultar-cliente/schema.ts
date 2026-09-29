import type { SkillContext } from '../core/types';
import type { SkillValidation } from '../core/validation';
import { cleanText, invalidInput, validInput } from '../core/validation';

export type ConsultarClienteInput = {
  nome?: string;
  codigo?: string;
  telefone?: string;
  documento?: string;
};

export function validateConsultarCliente(input: ConsultarClienteInput, _context: SkillContext): SkillValidation {
  const values = [input?.nome, input?.codigo, input?.telefone, input?.documento]
    .map((value) => cleanText(value))
    .filter(Boolean);
  if (values.length !== 1) return invalidInput('Informe exatamente um identificador do cliente.');
  if (values[0].length < 2) return invalidInput('Consulta do cliente muito curta.');
  return validInput();
}
