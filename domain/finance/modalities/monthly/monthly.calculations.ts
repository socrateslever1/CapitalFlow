import { Loan, Installment, LoanPolicy } from "../../../../types";
import { getDaysDiff } from "../../../../utils/dateHelpers";
import { CalculationResult } from "../types";
import { calculateMonthlyCycleLatePolicy } from "../../lateFeePolicy";

const round = (num: number) => Math.round((num + Number.EPSILON) * 100) / 100;

export const calculateMonthly = (loan: Loan, inst: Installment, policy: LoanPolicy, referenceDate?: string): CalculationResult => {
    const daysLate = Math.max(0, getDaysDiff(inst.dueDate, referenceDate));

    const principal = Number(inst?.principalRemaining ?? loan?.principal ?? 0) || 0;
    let interest = Number(inst?.interestRemaining ?? 0) || 0;
    const paidInterest = Number((inst as any)?.paidInterest ?? (inst as any)?.paid_interest ?? 0);
    const contractedInterest = principal > 0 && loan.interestRate > 0
        ? round(principal * (loan.interestRate / 100))
        : 0;

    if (interest <= 0.05 && paidInterest <= 0.05 && contractedInterest > 0) {
        interest = contractedInterest;
    }

    const cyclePolicy = calculateMonthlyCycleLatePolicy({
        principal,
        currentInterest: interest,
        monthlyInterestPercent: loan.interestRate,
        finePercent: policy.finePercent,
        dailyInterestPercent: policy.dailyInterestPercent,
        daysLate,
    });

    return {
        total: cyclePolicy.total,
        principal: cyclePolicy.principal,
        interest: cyclePolicy.interest,
        lateFee: cyclePolicy.lateFee,
        finePart: cyclePolicy.finePart,
        moraPart: cyclePolicy.moraPart,
        baseForFine: cyclePolicy.capitalizedBase,
        daysLate,
        completedCycles: cyclePolicy.completedCycles,
        residualDays: cyclePolicy.residualDays,
    } as CalculationResult;
};
