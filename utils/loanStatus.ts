import { Installment, LoanStatus } from '../types';
import { ZERO_BALANCE_THRESHOLD } from '../domain/finance/calculations';

const PAID_STATUSES = new Set(['PAID', 'PAGO', 'QUITADO', 'QUITADA', 'FINALIZADO']);
const CLOSED_INSTALLMENT_STATUSES = new Set(['RENEGOCIADO', 'CANCELADO']);

export const normalizeStatus = (status: unknown): string =>
  String(status || '').toUpperCase().trim();

export const isPaidStatus = (status: unknown): boolean =>
  PAID_STATUSES.has(normalizeStatus(status));

export const isClosedInstallmentStatus = (status: unknown): boolean =>
  CLOSED_INSTALLMENT_STATUSES.has(normalizeStatus(status));

export const getInstallmentOpenAmount = (inst: Partial<Installment> | any): number => {
  if (!inst) return 0;

  // Status de encerramento gravado no banco e soberano para a agenda. Campos
  // financeiros legados podem conservar residuos e nao podem reabrir a parcela.
  if (isPaidStatus(inst.status) || isClosedInstallmentStatus(inst.status)) return 0;

  const principal = Number(inst.principalRemaining ?? inst.principal_remaining ?? 0);
  const interest = Number(inst.interestRemaining ?? inst.interest_remaining ?? 0);
  const lateFee = Number(inst.lateFeeAccrued ?? inst.late_fee_accrued ?? 0);
  const bucketTotal = principal + interest + lateFee;

  if (bucketTotal > ZERO_BALANCE_THRESHOLD) return bucketTotal;

  const amount = Number(inst.amount ?? inst.valor ?? inst.valor_parcela ?? 0);
  const paid = Number(inst.paidAmount ?? inst.paid_amount ?? inst.paidTotal ?? inst.paid_total ?? 0);
  return Math.max(0, amount - paid);
};

export const getInstallmentPaidAmount = (inst: Partial<Installment> | any): number => {
  if (!inst) return 0;

  const paidTotal = Number(inst.paidTotal ?? inst.paid_total ?? 0);
  const paidAmount = Number(inst.paidAmount ?? inst.paid_amount ?? inst.valor_pago ?? 0);
  const paidBuckets =
    Number(inst.paidPrincipal ?? inst.paid_principal ?? 0) +
    Number(inst.paidInterest ?? inst.paid_interest ?? 0) +
    Number(inst.paidLateFee ?? inst.paid_late_fee ?? 0);
  const persistedPaid = Math.max(0, paidTotal, paidAmount, paidBuckets);

  if (persistedPaid > ZERO_BALANCE_THRESHOLD) return persistedPaid;

  // Registros antigos nem sempre preencheram os acumuladores. Se a parcela foi
  // encerrada, o valor nominal e o fallback correto para a exibicao historica.
  return isPaidStatus(inst.status)
    ? Math.max(0, Number(inst.amount ?? inst.valor ?? inst.valor_parcela ?? 0))
    : 0;
};

export const getInstallmentsPaidAmount = (installments: Array<Partial<Installment> | any> | null | undefined): number =>
  Math.round((installments || []).reduce(
    (total, installment) => total + getInstallmentPaidAmount(installment),
    0
  ) * 100) / 100;

export const getInstallmentScheduleTotal = (installments: Array<Partial<Installment> | any> | null | undefined): number =>
  Math.round((installments || []).reduce(
    (total, installment) => total + Math.max(
      0,
      Number(installment?.amount ?? installment?.valor ?? installment?.valor_parcela ?? 0)
    ),
    0
  ) * 100) / 100;

export const isInstallmentOpen = (inst: Partial<Installment> | any): boolean => {
  if (!inst) return false;
  const openAmount = getInstallmentOpenAmount(inst);
  if (isClosedInstallmentStatus(inst.status)) return false;
  if (isPaidStatus(inst.status)) return openAmount > ZERO_BALANCE_THRESHOLD;
  return openAmount > ZERO_BALANCE_THRESHOLD;
};

export const isInstallmentPaidOrSettled = (inst: Partial<Installment> | any): boolean => {
  if (!inst) return false;
  const openAmount = getInstallmentOpenAmount(inst);
  return openAmount <= ZERO_BALANCE_THRESHOLD;
};

export const isLoanPaidStatus = (status: unknown): boolean =>
  isPaidStatus(status) || normalizeStatus(status) === LoanStatus.ARQUIVADO;
