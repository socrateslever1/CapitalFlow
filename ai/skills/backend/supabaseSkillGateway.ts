import { supabase } from '../../../lib/supabase';
import type {
  CapitalFlowSkillGateway,
  ClientLookupKind,
  SkillAgreement,
  SkillClient,
  SkillContract,
  SkillDebtPosition,
  SkillDueItem,
  SkillInstallment,
} from '../core/gateway';
import { SkillBackendError } from '../core/gateway';
import type { SkillContext } from '../core/types';

function trustedProfileId(context: SkillContext): string {
  if (!context.authenticated || !context.userId || !context.profileId) {
    throw new SkillBackendError('Contexto autenticado inválido.', 'NOT_AUTHORIZED');
  }
  return context.profileId;
}

async function callRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name as any, args as any);
  if (error) {
    const code = error.code === '42501' ? 'NOT_AUTHORIZED' : error.code;
    throw new SkillBackendError(error.message || 'Falha no backend autorizado.', code);
  }
  return data as T;
}

export const supabaseSkillGateway: CapitalFlowSkillGateway = {
  findClients(input: { kind: ClientLookupKind; query: string; includeDocument: boolean }, context: SkillContext) {
    return callRpc<SkillClient[]>('skill_find_clients_v1', {
      p_profile_id: trustedProfileId(context),
      p_query: input.query,
      p_match_kind: input.kind,
      p_include_document: input.includeDocument,
    });
  },

  listContracts(input: { contractId?: string; clientId?: string }, context: SkillContext) {
    return callRpc<SkillContract[]>('skill_list_contracts_v1', {
      p_profile_id: trustedProfileId(context),
      p_contract_id: input.contractId || null,
      p_client_id: input.clientId || null,
    });
  },

  getDebtPosition(contractId: string, referenceDate: string, context: SkillContext) {
    return callRpc<SkillDebtPosition | null>('skill_get_debt_position_v1', {
      p_profile_id: trustedProfileId(context),
      p_contract_id: contractId,
      p_reference_date: referenceDate,
    });
  },

  listInstallments(contractId: string, context: SkillContext) {
    return callRpc<SkillInstallment[] | null>('skill_list_installments_v1', {
      p_profile_id: trustedProfileId(context),
      p_contract_id: contractId,
    });
  },

  listDue(input: { from: string; to: string; onlyOverdue: boolean; referenceDate: string }, context: SkillContext) {
    return callRpc<SkillDueItem[]>('skill_list_due_v1', {
      p_profile_id: trustedProfileId(context),
      p_from: input.from,
      p_to: input.to,
      p_only_overdue: input.onlyOverdue,
      p_reference_date: input.referenceDate,
    });
  },

  getActiveAgreement(contractId: string, context: SkillContext) {
    return callRpc<SkillAgreement | null>('skill_get_agreement_v1', {
      p_profile_id: trustedProfileId(context),
      p_contract_id: contractId,
    });
  },
};
