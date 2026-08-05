import { Agreement, Loan, LoanStatus } from '../../../types';

const MONEY_TOLERANCE_CENTS = 1;

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

const centsToMoney = (value: number): number =>
  Number((value / 100).toFixed(2));

const isPaid = (status: unknown): boolean =>
  PAID_STATUSES.has(String(status || '').toUpperCase().trim());

const scheduledPrincipalCents = (installment: any): number =>
  toCents(installment?.scheduledPrincipal ?? installment?.scheduled_principal);

const remainingPrincipalCents = (installment: any): number =>
  toCents(installment?.principalRemaining ?? installment?.principal_remaining);

const remainingInterestCents = (installment: any): number =>
  toCents(installment?.interestRemaining ?? installment?.interest_remaining);

const remainingLateFeeCents = (installment: any): number =>
  toCents(installment?.lateFeeAccrued ?? installment?.late_fee_accrued);

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

const sumCents = (values: number[]): number => values.reduce((sum, value) => sum + value, 0);

const daysBetween = (start?: string, end?: string): number => {
  const startDate = start ? new Date(start) : null;
  const endDate = end ? new Date(end) : null;
  if (!startDate || !endDate || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 30;
  return Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86400000));
};

const normalizeRate = (value: unknown): number => {
  const rate = Number(value);
  return Number.isFinite(rate) && rate > 0 ? rate : 0;
};

export interface LegalInstallmentBreakdown {
  id: string;
  number: number;
  dueDate: string;
  principalAmount: number;
  legalInterestAmount: number;
  amount: number;
  principalBalanceAfter: number;
  status: 'PENDING' | 'PAID' | 'LATE' | 'PARTIAL' | 'PAGO';
  paidAmount: number;
  agreementId: string;
}

export interface LegalReconciliation {
  originalPrincipalAmount: number;
  principalPaidAmount: number;
  legalPrincipalBalance: number;
  operationalPrincipalBalance: number;
  operationalTotalBalance: number;
  operationalInterestBalance: number;
  operationalLateFeeBalance: number;
  ledgerPrincipalPaidAmount: number;
  installmentPrincipalPaidAmount: number;
  differenceAmount: number;
  capitalDifferenceAmount: number;
  isReconciled: boolean;
  warnings: string[];
}

export interface CapitalOnlyLegalTerms {
  originalPrincipalAmount: number;
  principalPaidAmount: number;
  principalAmount: number;
  legalInterestRatePercent: number;
  legalInterestAmount: number;
  legalTotalAmount: number;
  installments: LegalInstallmentBreakdown[];
  reconciliation: LegalReconciliation;
}

export interface BuildCapitalOnlyLegalTermsOptions {
  legalInterestRatePercent?: number;
  legalInterestPeriodDays?: number;
}

/** Produces document-only amounts without changing the operational schedule. */
export const buildCapitalOnlyLegalTerms = (
  loan: Loan,
  agreement?: Agreement,
  options: BuildCapitalOnlyLegalTermsOptions = {},
): CapitalOnlyLegalTerms => {
  const originalPrincipal = toCents(loan.principal);
  const installmentPrincipalPaid = (loan.installments || []).reduce(
    (sum, installment) => sum + paidPrincipalCents(installment),
    0,
  );
  const ledgerPrincipalPaid = (loan.ledger || []).reduce(
    (sum, entry: any) => sum + toCents(entry?.principalDelta ?? entry?.principal_delta),
    0,
  );
  const principalPaid = Math.max(installmentPrincipalPaid, ledgerPrincipalPaid);
  const outstandingPrincipal = Math.max(0, originalPrincipal - Math.min(originalPrincipal, principalPaid));
  const agreementInstallments = agreement?.installments || [];
  const originalInstallments = loan.installments || [];
  const allSource = agreementInstallments.length > 0 ? agreementInstallments : originalInstallments;
  const openSource = allSource.filter((installment: any) => !isPaid(installment?.status));
  const source = openSource.length > 0 ? openSource : allSource.slice(0, 1);
  const weights = source.map((installment: any) => agreementInstallments.length > 0
    ? 1
    : Math.max(0, scheduledPrincipalCents(installment) - paidPrincipalCents(installment)));
  const principalAmounts = allocateCents(outstandingPrincipal, weights);
  const lastSourceInstallment: any = source[source.length - 1];
  const lastDueDate = lastSourceInstallment?.dueDate
    ?? lastSourceInstallment?.due_date
    ?? lastSourceInstallment?.data_vencimento;
  const legalInterestRatePercent = normalizeRate(options.legalInterestRatePercent);
  const legalInterestPeriodDays = options.legalInterestPeriodDays ?? daysBetween(loan.startDate, lastDueDate);
  const legalInterestTotal = legalInterestRatePercent > 0
    ? Math.round(outstandingPrincipal * (legalInterestRatePercent / 100) * (legalInterestPeriodDays / 30))
    : 0;
  const interestAmounts = allocateCents(legalInterestTotal, principalAmounts);

  let runningPrincipalBalance = outstandingPrincipal;
  const installments: LegalInstallmentBreakdown[] = source.map((installment: any, index) => {
    const principalAmount = principalAmounts[index] || 0;
    const legalInterestAmount = interestAmounts[index] || 0;
    runningPrincipalBalance = Math.max(0, runningPrincipalBalance - principalAmount);

    return {
      id: String(installment.id || `legal-${loan.id}-${index + 1}`),
      number: installment.number ?? installment.numero ?? installment.numero_parcela ?? index + 1,
      dueDate: installment.dueDate ?? installment.due_date ?? installment.data_vencimento,
      principalAmount: centsToMoney(principalAmount),
      legalInterestAmount: centsToMoney(legalInterestAmount),
      amount: centsToMoney(principalAmount + legalInterestAmount),
      principalBalanceAfter: centsToMoney(runningPrincipalBalance),
      agreementId: agreement?.id || installment.agreementId || installment.acordo_id || '',
      paidAmount: 0,
      status: 'PENDING',
    };
  });

  const operationalPrincipalBalance = sumCents((loan.installments || []).map(remainingPrincipalCents));
  const operationalInterestBalance = sumCents((loan.installments || []).map(remainingInterestCents));
  const operationalLateFeeBalance = sumCents((loan.installments || []).map(remainingLateFeeCents));
  const operationalTotalBalance = operationalPrincipalBalance + operationalInterestBalance + operationalLateFeeBalance;
  const capitalDifference = operationalPrincipalBalance - outstandingPrincipal;
  const totalDifference = operationalTotalBalance - outstandingPrincipal;
  const warnings: string[] = [];

  if (Math.abs(installmentPrincipalPaid - ledgerPrincipalPaid) > MONEY_TOLERANCE_CENTS && ledgerPrincipalPaid > 0) {
    warnings.push('Pagamentos de capital registrados no ledger divergem das parcelas.');
  }

  if (Math.abs(capitalDifference) > MONEY_TOLERANCE_CENTS) {
    warnings.push('Saldo de capital operacional diverge do saldo juridico calculado.');
  }

  if (toCents(loan.fundingCost) > 0 || toCents(loan.fundingTotalPayable) > originalPrincipal) {
    warnings.push('Ha custo de captacao/cartao no contrato; esse custo nao foi incorporado ao capital juridico.');
  }

  return {
    originalPrincipalAmount: centsToMoney(originalPrincipal),
    principalPaidAmount: centsToMoney(Math.min(originalPrincipal, principalPaid)),
    principalAmount: centsToMoney(outstandingPrincipal),
    legalInterestRatePercent,
    legalInterestAmount: centsToMoney(legalInterestTotal),
    legalTotalAmount: centsToMoney(outstandingPrincipal + legalInterestTotal),
    installments,
    reconciliation: {
      originalPrincipalAmount: centsToMoney(originalPrincipal),
      principalPaidAmount: centsToMoney(Math.min(originalPrincipal, principalPaid)),
      legalPrincipalBalance: centsToMoney(outstandingPrincipal),
      operationalPrincipalBalance: centsToMoney(operationalPrincipalBalance),
      operationalTotalBalance: centsToMoney(operationalTotalBalance),
      operationalInterestBalance: centsToMoney(operationalInterestBalance),
      operationalLateFeeBalance: centsToMoney(operationalLateFeeBalance),
      ledgerPrincipalPaidAmount: centsToMoney(ledgerPrincipalPaid),
      installmentPrincipalPaidAmount: centsToMoney(installmentPrincipalPaid),
      differenceAmount: centsToMoney(totalDifference),
      capitalDifferenceAmount: centsToMoney(capitalDifference),
      isReconciled: warnings.every((warning) => !warning.includes('diverge')),
      warnings,
    },
  };
};
