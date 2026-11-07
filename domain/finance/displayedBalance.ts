import type { Installment, Loan } from '../../types';
import { calculateTotalDue, computeLoanRemainingBalance, hasActiveAgreement, isInstallmentPaid, type RemainingBalance } from './calculations';
import type { CalculationResult } from './modalities/types';

const cents = (value: number): number => Math.round(Number(value) * 100);
const fromCents = (value: number): number => Math.round(value) / 100;

const validBalance = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1e12;

/**
 * This is a DISPLAY snapshot, not an offer for the next receipt.
 * The V4 server determines the amount chargeable at the next confirmation.
 * Once a partial payment has been recorded, re-running the entire overdue
 * period from the original due date ignores the fees already paid.
 */
export function isRecordedPartialMonthlyInstallment(loan: Loan, installment: Installment): boolean {
  if (loan.billingCycle !== 'MONTHLY' || hasActiveAgreement(loan)) return false;
  if (isInstallmentPaid(installment, loan.status)) return false;
  if (!validBalance(installment.paidTotal) || installment.paidTotal <= 0.005) return false;
  if (![installment.paidPrincipal, installment.paidInterest, installment.paidLateFee]
      .some(value => validBalance(value) && value > 0.005)) return false;
  return [installment.principalRemaining, installment.interestRemaining, installment.lateFeeAccrued]
    .every(validBalance);
}

export function getDisplayedInstallmentDebt(
  loan: Loan, installment: Installment,
): { debt: CalculationResult; recorded: boolean } {
  const estimated = calculateTotalDue(loan, installment);
  if (!isRecordedPartialMonthlyInstallment(loan, installment)) {
    return { debt: estimated, recorded: false };
  }
  const principal = cents(installment.principalRemaining);
  const interest = cents(installment.interestRemaining);
  const lateFee = cents(installment.lateFeeAccrued);
  return {
    recorded: true,
    debt: {
      ...estimated,
      principal: fromCents(principal),
      interest: fromCents(interest),
      lateFee: fromCents(lateFee),
      // The historical fee amount cannot be reliably split into fine and
      // daily arrears from a balance snapshot. Do not invent a breakdown.
      finePart: 0,
      moraPart: 0,
      total: fromCents(principal + interest + lateFee),
    },
  };
}

/** Use the same displayed balance on the contract header and installment cards. */
export function getDisplayedLoanBalance(loan: Loan): RemainingBalance {
  const calculated = computeLoanRemainingBalance(loan);
  if (loan.billingCycle !== 'MONTHLY' || hasActiveAgreement(loan)) return calculated;

  let principalCents = cents(calculated.principalRemaining);
  let interestCents = cents(calculated.interestRemaining);
  let lateFeeCents = cents(calculated.lateFeeRemaining);
  let changed = false;

  for (const installment of loan.installments || []) {
    if (!isRecordedPartialMonthlyInstallment(loan, installment)) continue;
    const estimated = calculateTotalDue(loan, installment);
    const recorded = getDisplayedInstallmentDebt(loan, installment).debt;
    principalCents += cents(recorded.principal) - cents(estimated.principal);
    interestCents += cents(recorded.interest) - cents(estimated.interest);
    lateFeeCents += cents(recorded.lateFee) - cents(estimated.lateFee);
    changed = true;
  }
  if (!changed) return calculated;
  // The computed loan balance may include other historical reconciliations.
  principalCents = Math.max(0, principalCents);
  interestCents = Math.max(0, interestCents);
  lateFeeCents = Math.max(0, lateFeeCents);
  return {
    principalRemaining: fromCents(principalCents),
    interestRemaining: fromCents(interestCents),
    lateFeeRemaining: fromCents(lateFeeCents),
    totalRemaining: fromCents(principalCents + interestCents + lateFeeCents),
  };
}
