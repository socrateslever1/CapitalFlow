import { Agreement, Loan, LoanStatus } from '../../../types';

const PAID_STATUSES = new Set<string>([
  LoanStatus.PAID,
  LoanStatus.PAGO,
  'PAID',
  'PAGO',
  'QUITADO',
  'QUITADA',
  'FINALIZADO',
]);

const toCents = (value: unknown): number =>
  Math.max(0, Math.round((Number(value) || 0) * 100));

const isPaid = (status: unknown): boolean =>
  PAID_STATUSES.has(String(status || '').toUpperCase().trim());

const scheduledPrincipalCents = (installment: any): number =>
  toCents(installment?.scheduledPrincipal ?? installment?.scheduled_principal);

const paidPrincipalCents = (installment: any): number => {
  const scheduled = scheduledPrincipalCents(installment);
  const recorded = toCents(installment?.paidPrincipal ?? installment?.paid_principal);
  return isPaid(installment?.status) && scheduled > 0 ? Math.max(recorded, scheduled) : recorded;
};

const allocateCents = (total: number, weights: number[]): number[] => {
  if (weights.length === 0) return [];
  const positive = weights.map((weight) => Math.max(0, weight));
  const normalized = positive.some((weight) => weight > 0) ? positive : weights.map(() => 1);
  const weightTotal = normalized.reduce((sum, weight) => sum + weight, 0);
  let allocated = 0;

  return normalized.map((weight, index) => {
    if (index === normalized.length - 1) return total - allocated;
    const share = Math.floor((total * weight) / weightTotal);
    allocated += share;
    return share;
  });
};

export interface CapitalOnlyLegalTerms {
  originalPrincipalAmount: number;
  principalPaidAmount: number;
  principalAmount: number;
  installments: any[];
}

/** Produces document-only amounts without changing the operational schedule. */
export const buildCapitalOnlyLegalTerms = (loan: Loan, agreement?: Agreement): CapitalOnlyLegalTerms => {
  const originalPrincipal = toCents(loan.principal);
  const principalPaid = (loan.installments || []).reduce(
    (sum, installment) => sum + paidPrincipalCents(installment),
    0,
  );
  const outstandingPrincipal = Math.max(0, originalPrincipal - Math.min(originalPrincipal, principalPaid));
  const agreementInstallments = agreement?.installments || [];
  const originalInstallments = loan.installments || [];
  const allSource = agreementInstallments.length > 0 ? agreementInstallments : originalInstallments;
  const openSource = allSource.filter((installment: any) => !isPaid(installment?.status));
  const source = openSource.length > 0 ? openSource : allSource.slice(0, 1);
  const weights = source.map((installment: any) => agreementInstallments.length > 0
    ? 1
    : Math.max(0, scheduledPrincipalCents(installment) - paidPrincipalCents(installment)));
  const amounts = allocateCents(outstandingPrincipal, weights);

  return {
    originalPrincipalAmount: originalPrincipal / 100,
    principalPaidAmount: Math.min(originalPrincipal, principalPaid) / 100,
    principalAmount: outstandingPrincipal / 100,
    installments: source.map((installment: any, index) => ({
      ...installment,
      number: installment.number ?? installment.numero ?? index + 1,
      dueDate: installment.dueDate ?? installment.due_date ?? installment.data_vencimento,
      amount: (amounts[index] || 0) / 100,
      agreementId: agreement?.id || installment.agreementId || installment.acordo_id || '',
      paidAmount: 0,
      status: 'PENDING',
    })),
  };
};
