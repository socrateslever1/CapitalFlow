
import { Loan, Installment, LoanPolicy } from "../../../types";
import { getDaysDiff } from "../../../utils/dateHelpers";
import { CalculationResult } from "./types";

const round = (num: number) => Math.round((num + Number.EPSILON) * 100) / 100;

export const calculateGiro = (loan: Loan, inst: Installment, policy: LoanPolicy): CalculationResult => {
    const daysLate = Math.max(0, getDaysDiff(inst.dueDate));
    const principal = inst.principalRemaining;
    const interest = inst.interestRemaining;
    
    let currentLateFee = 0;
    if (daysLate > 0 && (principal + interest) > 0) {
        const fineFixed = (principal + interest) * (policy.finePercent / 100);
        const fineDaily = (principal + interest) * (policy.dailyInterestPercent / 100) * daysLate;
        currentLateFee = round(fineFixed + fineDaily);
    }

    return {
        total: round(principal + interest + currentLateFee),
        principal,
        interest,
        lateFee: currentLateFee,
        baseForFine: round(principal + interest),
        daysLate
    };
};
