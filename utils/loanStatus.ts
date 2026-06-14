import { Installment, LoanStatus } from '../types';
import { ZERO_BALANCE_THRESHOLD } from '../domain/finance/calculations';

const PAID_STATUSES = new Set(['PAID', 'PAGO', 'QUITADO', 'QUITADA', 'FINALIZADO']);
const CLOSED_INSTALLMENT_STATUSES = new Set([...PAID_STATUSES, 'RENEGOCIADO', 'CANCELADO']);

export const normalizeStatus = (status: unknown): string =>
  String(status || '').toUpperCase().trim();

export const isPaidStatus = (status: unknown): boolean =>
  PAID_STATUSES.has(normalizeStatus(status));

export const isClosedInstallmentStatus = (status: unknown): boolean =>
  CLOSED_INSTALLMENT_STATUSES.has(normalizeStatus(status));

export const getInstallmentOpenAmount = (inst: Partial<Installment> | any): number => {
  if (!inst) return 0;

  const principal = Number(inst.principalRemaining ?? inst.principal_remaining ?? 0);
  const interest = Number(inst.interestRemaining ?? inst.interest_remaining ?? 0);
  const lateFee = Number(inst.lateFeeAccrued ?? inst.late_fee_accrued ?? 0);
  const bucketTotal = principal + interest + lateFee;

  if (bucketTotal > ZERO_BALANCE_THRESHOLD) return bucketTotal;

  const amount = Number(inst.amount ?? inst.valor ?? inst.valor_parcela ?? 0);
  const paid = Number(inst.paidAmount ?? inst.paid_amount ?? inst.paidTotal ?? inst.paid_total ?? 0);
  return Math.max(0, amount - paid);
};

export const isInstallmentOpen = (inst: Partial<Installment> | any): boolean => {
  if (!inst || isClosedInstallmentStatus(inst.status)) return false;
  return getInstallmentOpenAmount(inst) > ZERO_BALANCE_THRESHOLD;
};

export const isInstallmentPaidOrSettled = (inst: Partial<Installment> | any): boolean => {
  if (!inst) return false;
  if (isPaidStatus(inst.status)) return true;
  return getInstallmentOpenAmount(inst) <= ZERO_BALANCE_THRESHOLD;
};

export const isLoanPaidStatus = (status: unknown): boolean =>
  isPaidStatus(status) || normalizeStatus(status) === LoanStatus.ARQUIVADO;
