import { Loan, Installment, LoanPolicy } from "../../../../types";
import { getDaysDiff } from "../../../../utils/dateHelpers";
import { CalculationResult } from "../types";
import { calculateRecurringMonthlyFine } from "../../lateFeePolicy";

const round = (num: number) => Math.round((num + Number.EPSILON) * 100) / 100;

export const calculateDaily30 = (loan: Loan, inst: Installment, policy: LoanPolicy, referenceDate?: string): CalculationResult => {
  const principal = Number(inst.principalRemaining || 0);
  const interestRemaining = Number(inst.interestRemaining || 0);
  const overdueBase = round(principal + interestRemaining);

  const daysLate = Math.max(0, getDaysDiff(inst.dueDate, referenceDate));

  let lateInterest = 0;
  let lateFee = 0;

  // NÃO recalcula juros de ciclo
  // juros do ciclo já estão em interestRemaining

  if (daysLate > 0) {
    lateInterest =
      round(overdueBase * (policy.dailyInterestPercent / 100) * daysLate);

    lateFee = calculateRecurringMonthlyFine(overdueBase, policy.finePercent, daysLate);
  }

  const baseForFine = overdueBase;

  const total = round(principal + interestRemaining + lateInterest + lateFee);

  return {
    total,
    principal,
    interest: interestRemaining,
    lateFee: round(lateFee + lateInterest),
    baseForFine,
    daysLate
  };
};

export const calculateDaily30Capital = (loan: Loan, inst: Installment, policy: LoanPolicy, referenceDate?: string): CalculationResult => {
  const principal = Number(inst.principalRemaining || 0);
  const interestRemaining = Number(inst.interestRemaining || 0);

  const daysLate = Math.max(0, getDaysDiff(inst.dueDate, referenceDate));

  let lateInterest = 0;
  let lateFee = 0;

  if (daysLate > 0) {
    lateInterest = round(principal * (policy.dailyInterestPercent / 100) * daysLate);
    lateFee = calculateRecurringMonthlyFine(principal, policy.finePercent, daysLate);
  }

  const total = round(principal + interestRemaining + lateInterest + lateFee);

  return {
    total,
    principal,
    interest: interestRemaining,
    lateFee: round(lateFee + lateInterest),
    baseForFine: principal,
    daysLate
  };
};
