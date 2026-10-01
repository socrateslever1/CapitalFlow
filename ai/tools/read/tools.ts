import type {
  CapitalFlowSkillGateway,
  SkillAgreement,
  SkillClient,
  SkillContract,
  SkillDebtPosition,
  SkillDueItem,
  SkillInstallment,
} from '../../skills/core/gateway';
import { SkillBackendError } from '../../skills/core/gateway';
import type { ToolContext } from '../core/context';
import { toolFailure, toolSuccess, type ToolResult } from '../core/errors';
import type { CapitalFlowTool } from '../core/types';
import { toolContextHasPermission } from '../core/permissions';
import {
  clientLookupSchema,
  contractSelectorSchema,
  debtSchema,
  dueDatesSchema,
  type ClientLookupInput,
  type ContractSelectorInput,
  type DebtInput,
  type DueDatesInput,
} from './schemas';

function backendFailure(error: unknown): ToolResult<never> {
  if (error instanceof SkillBackendError && error.code === 'NOT_AUTHORIZED') {
    return toolFailure('NOT_AUTHORIZED', 'Acesso negado pelo backend.');
  }
  return toolFailure('BACKEND_ERROR', 'O backend autorizado não respondeu com segurança.');
}

async function resolveContract(
  gateway: CapitalFlowSkillGateway,
  input: ContractSelectorInput,
  context: ToolContext,
): Promise<ToolResult<SkillContract>> {
  try {
    const contracts = await gateway.listContracts(input, context);
    if (contracts.length === 0) return toolFailure('NOT_FOUND', 'Contrato não encontrado.');
    if (contracts.length > 1) return toolFailure('AMBIGUOUS', 'Há mais de um contrato possível. Informe o contrato desejado.');
    return toolSuccess(contracts[0]);
  } catch (error) {
    return backendFailure(error);
  }
}

const addUtcDays = (date: string, days: number) => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

export function createReadOnlyTools(gateway: CapitalFlowSkillGateway): CapitalFlowTool<any, any>[] {
  const clientSearch: CapitalFlowTool<ClientLookupInput, SkillClient[]> = {
    id: 'client.search',
    description: 'Busca clientes somente no perfil autenticado.',
    risk: 'READ_ONLY', enabled: true, inputSchema: clientLookupSchema,
    permissions: ['SKILLS_READ'], requiresAuthentication: true, requiresConfirmation: false,
    async execute(input, context) {
      if (input.kind === 'DOCUMENT' && !toolContextHasPermission(context, 'CLIENT_DOCUMENT_READ')) {
        return toolFailure('NOT_AUTHORIZED', 'Consulta por documento exige permissão específica.');
      }
      try {
        const clients = await gateway.findClients({
          ...input,
          includeDocument: input.kind === 'DOCUMENT' && toolContextHasPermission(context, 'CLIENT_DOCUMENT_READ'),
        }, context);
        return toolSuccess(clients, { authoritativeBackend: 'skill_find_clients_v1' });
      } catch (error) {
        return backendFailure(error);
      }
    },
  };

  const clientGet: CapitalFlowTool<ClientLookupInput, SkillClient> = {
    ...clientSearch,
    id: 'client.get',
    description: 'Obtém um único cliente, recusando resultados ambíguos.',
    async execute(input, context) {
      const result = await clientSearch.execute(input, context);
      if ('error' in result) return result;
      if (result.data.length === 0) return toolFailure('NOT_FOUND', 'Cliente não encontrado.');
      if (result.data.length > 1) return toolFailure('AMBIGUOUS', 'Mais de um cliente corresponde à consulta.');
      return toolSuccess(result.data[0], result.metadata);
    },
  };

  const contractGet: CapitalFlowTool<ContractSelectorInput, SkillContract> = {
    id: 'contract.get', description: 'Obtém um contrato autorizado e não ambíguo.',
    risk: 'READ_ONLY', enabled: true, inputSchema: contractSelectorSchema,
    permissions: ['SKILLS_READ'], requiresAuthentication: true, requiresConfirmation: false,
    execute: (input, context) => resolveContract(gateway, input, context),
  };

  const debtGet: CapitalFlowTool<DebtInput, SkillDebtPosition> = {
    id: 'debt.get', description: 'Consulta a posição persistida pelo backend financeiro.',
    risk: 'READ_ONLY', enabled: true, inputSchema: debtSchema,
    permissions: ['SKILLS_READ'], requiresAuthentication: true, requiresConfirmation: false,
    async execute(input, context) {
      const contract = await resolveContract(gateway, input, context);
      if ('error' in contract) return contract;
      try {
        const referenceDate = input.referenceDate || new Date().toISOString().slice(0, 10);
        const position = await gateway.getDebtPosition(contract.data.id, referenceDate, context);
        return position
          ? toolSuccess(position, { authoritativeBackend: 'skill_get_debt_position_v1' })
          : toolFailure('NOT_FOUND', 'Dívida não encontrada.');
      } catch (error) {
        return backendFailure(error);
      }
    },
  };

  const installmentsList: CapitalFlowTool<ContractSelectorInput, SkillInstallment[]> = {
    id: 'installments.list', description: 'Lista parcelas oficiais do contrato autorizado.',
    risk: 'READ_ONLY', enabled: true, inputSchema: contractSelectorSchema,
    permissions: ['SKILLS_READ'], requiresAuthentication: true, requiresConfirmation: false,
    async execute(input, context) {
      const contract = await resolveContract(gateway, input, context);
      if ('error' in contract) return contract;
      try {
        const installments = await gateway.listInstallments(contract.data.id, context);
        return installments
          ? toolSuccess(installments, { authoritativeBackend: 'skill_list_installments_v1' })
          : toolFailure('NOT_FOUND', 'Parcelas não encontradas.');
      } catch (error) {
        return backendFailure(error);
      }
    },
  };

  const dueDatesList: CapitalFlowTool<DueDatesInput, SkillDueItem[]> = {
    id: 'due_dates.list', description: 'Lista vencimentos oficiais dentro do perfil autenticado.',
    risk: 'READ_ONLY', enabled: true, inputSchema: dueDatesSchema,
    permissions: ['SKILLS_READ'], requiresAuthentication: true, requiresConfirmation: false,
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
        return toolSuccess(rows, { authoritativeBackend: 'skill_list_due_v1' });
      } catch (error) {
        return backendFailure(error);
      }
    },
  };

  const agreementGet: CapitalFlowTool<ContractSelectorInput, SkillAgreement> = {
    id: 'agreement.get', description: 'Obtém o acordo ativo persistido para um contrato autorizado.',
    risk: 'READ_ONLY', enabled: true, inputSchema: contractSelectorSchema,
    permissions: ['SKILLS_READ'], requiresAuthentication: true, requiresConfirmation: false,
    async execute(input, context) {
      const contract = await resolveContract(gateway, input, context);
      if ('error' in contract) return contract;
      try {
        const agreement = await gateway.getActiveAgreement(contract.data.id, context);
        return agreement
          ? toolSuccess(agreement, { authoritativeBackend: 'skill_get_agreement_v1' })
          : toolFailure('NOT_FOUND', 'Acordo ativo não encontrado.');
      } catch (error) {
        return backendFailure(error);
      }
    },
  };

  return [clientSearch, clientGet, debtGet, installmentsList, contractGet, dueDatesList, agreementGet];
}
