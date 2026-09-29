import type { SkillContext } from './types';

export type ClientLookupKind = 'NAME' | 'CODE' | 'PHONE' | 'DOCUMENT';

export type SkillClient = {
  id: string;
  name: string;
  code?: string | null;
  phone?: string | null;
  document?: string | null;
};

export type SkillContract = {
  id: string;
  clientId?: string | null;
  clientName?: string | null;
  status?: string | null;
  billingCycle?: string | null;
  startDate?: string | null;
  nextDueDate?: string | null;
  sourceId?: string | null;
  isArchived?: boolean;
  createdAt?: string | null;
};

export type SkillDebtPosition = {
  contractId: string;
  clientId?: string | null;
  clientName?: string | null;
  contractStatus?: string | null;
  source: 'INSTALLMENTS' | 'AGREEMENT';
  agreementId?: string | null;
  principal: number;
  interest: number;
  lateFee: number;
  totalDue: number;
  nextDueDate?: string | null;
  daysLate: number;
};

export type SkillInstallment = {
  id: string;
  number?: number | null;
  dueDate?: string | null;
  status?: string | null;
  principal: number;
  interest: number;
  lateFee: number;
  total: number;
  paidTotal: number;
};

export type SkillDueItem = {
  contractId: string;
  clientId?: string | null;
  clientName?: string | null;
  installmentId: string;
  number?: number | null;
  dueDate: string;
  status?: string | null;
  total: number;
  daysLate: number;
};

export type SkillAgreement = {
  id: string;
  contractId: string;
  status: string;
  type?: string | null;
  negotiatedTotal: number;
  installmentsCount: number;
  createdAt?: string | null;
  installments: Array<{
    id: string;
    number: number;
    dueDate?: string | null;
    status: string;
    amount: number;
    paidAmount: number;
    remaining: number;
  }>;
};

export interface CapitalFlowSkillGateway {
  findClients(input: { kind: ClientLookupKind; query: string; includeDocument: boolean }, context: SkillContext): Promise<SkillClient[]>;
  listContracts(input: { contractId?: string; clientId?: string }, context: SkillContext): Promise<SkillContract[]>;
  getDebtPosition(contractId: string, referenceDate: string, context: SkillContext): Promise<SkillDebtPosition | null>;
  listInstallments(contractId: string, context: SkillContext): Promise<SkillInstallment[] | null>;
  listDue(input: { from: string; to: string; onlyOverdue: boolean; referenceDate: string }, context: SkillContext): Promise<SkillDueItem[]>;
  getActiveAgreement(contractId: string, context: SkillContext): Promise<SkillAgreement | null>;
}

export class SkillBackendError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = 'SkillBackendError';
  }
}
