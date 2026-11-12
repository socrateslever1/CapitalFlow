import type { Loan } from '../../types';
import {
  hasActiveAgreement,
  isAgreementInstallmentPaid,
  isInstallmentPaid,
  ZERO_BALANCE_THRESHOLD,
} from './calculations';
import { isValidDate } from '../../utils/dateHelpers';

export interface BillingNotificationInstallment {
  id: string;
  dueDate: string;
  openAmount: number;
  source: 'LOAN' | 'AGREEMENT';
  agreementId?: string;
}

const asFiniteNonnegative = (value: unknown): number | null => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};

/**
 * A renegotiated contract MUST use the active agreement schedule.
 * The old contract installments remain in the DB as history; never mix them
 * with the current agreement when producing billing notifications.
 *
 * Fail closed: if an active agreement's installments have not been loaded,
 * return no due alerts instead of falling back to the superseded schedule.
 */
export function resolveBillingNotificationInstallments(
  loan: Loan | null | undefined,
): BillingNotificationInstallment[] {
  if (!loan || loan.isArchived) return [];

  if (hasActiveAgreement(loan)) {
    const agreement = loan.activeAgreement;
    if (!agreement || !Array.isArray(agreement.installments)) return [];

    return agreement.installments.flatMap((inst): BillingNotificationInstallment[] => {
      if (!inst?.id || !inst.dueDate || !isValidDate(inst.dueDate)) return [];
      if (isAgreementInstallmentPaid(inst, loan.status)) return [];
      const amount = asFiniteNonnegative(inst.amount);
      const paid = asFiniteNonnegative(inst.paidAmount);
      if (amount === null || paid === null) return [];

      const openAmount = Math.round(Math.max(0, amount - paid) * 100) / 100;
      if (openAmount <= ZERO_BALANCE_THRESHOLD) return [];
      return [{
        id: inst.id,
        dueDate: inst.dueDate,
        openAmount,
        source: 'AGREEMENT',
        agreementId: agreement.id,
      }];
    });
  }

  return (loan.installments || []).flatMap((inst): BillingNotificationInstallment[] => {
    if (!inst?.id || !inst.dueDate || !isValidDate(inst.dueDate)) return [];
    if (isInstallmentPaid(inst, loan.status)) return [];
    const principal = asFiniteNonnegative(inst.principalRemaining);
    const interest = asFiniteNonnegative(inst.interestRemaining);
    const lateFee = asFiniteNonnegative(inst.lateFeeAccrued);
    if (principal === null || interest === null || lateFee === null) return [];
    const openAmount = Math.round((principal + interest + lateFee) * 100) / 100;
    if (openAmount <= ZERO_BALANCE_THRESHOLD) return [];

    return [{ id: inst.id, dueDate: inst.dueDate, openAmount, source: 'LOAN' }];
  });
}

export function currentManausDateISO(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Manaus',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  if (!year || !month || !day) throw new Error('Não foi possível determinar a data de Manaus.');
  return `${year}-${month}-${day}`;
}
