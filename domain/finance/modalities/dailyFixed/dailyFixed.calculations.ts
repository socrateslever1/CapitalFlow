import { Loan, Installment, LoanPolicy } from "../../../../types";
import { getDaysDiff } from "../../../../utils/dateHelpers";
import { CalculationResult } from "../types";
import { calculateRecurringMonthlyFine } from "../../lateFeePolicy";

const round = (num: number) => Math.round((num + Number.EPSILON) * 100) / 100;

export const calculateDailyFixed = (loan: Loan, inst: Installment, policy: LoanPolicy, referenceDate?: string): CalculationResult => {
  const principal = Number(inst.principalRemaining);
  const interestRemaining = Number(inst.interestRemaining || 0);

  const daysLate = getDaysDiff(inst.dueDate, referenceDate);

  // NÃO soma juros corridos normais (já estão no interestRemaining)
  let lateInterest = 0;
  let lateFee = 0;

  if (daysLate > 0) {
    lateInterest =
      round(principal * (policy.dailyInterestPercent / 100) * daysLate);

    lateFee = calculateRecurringMonthlyFine(principal, policy.finePercent, daysLate);
  }

  const totalInterest = round(interestRemaining + lateInterest);

  const total = round(principal + totalInterest + lateFee);

  return {
    total,
    principal,
    interest: totalInterest,
    lateFee,
    baseForFine: principal,
    daysLate
  };
};
