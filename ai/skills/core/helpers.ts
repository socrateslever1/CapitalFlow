import type { CapitalFlowSkillGateway } from './gateway';
import { SkillBackendError } from './gateway';
import type { SkillContext } from './types';
import type { SkillResult } from './result';
import { skillFailure, skillSuccess } from './result';

export function backendFailure(error: unknown): SkillResult<never> {
  if (error instanceof SkillBackendError && error.code === 'NOT_AUTHORIZED') {
    return skillFailure('NOT_AUTHORIZED', 'Acesso negado pelo backend.');
  }
  return skillFailure('BACKEND_ERROR', 'O backend autorizado não respondeu com segurança.');
}

export async function resolveUniqueContractId(
  gateway: CapitalFlowSkillGateway,
  input: { contractId?: string; clientId?: string },
  context: SkillContext,
): Promise<SkillResult<string>> {
  try {
    const contracts = await gateway.listContracts(input, context);
    if (contracts.length === 0) return skillFailure('NOT_FOUND', 'Contrato não encontrado.');
    if (contracts.length > 1) return skillFailure('AMBIGUOUS', 'Há mais de um contrato possível. Informe o contrato desejado.');
    return skillSuccess(contracts[0].id);
  } catch (error) {
    return backendFailure(error);
  }
}
