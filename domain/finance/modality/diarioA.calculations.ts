
import { Loan, Installment, LoanPolicy } from "../../../types";
import { getDaysDiff } from "../../../utils/dateHelpers";
import { CalculationResult } from "./types";

const round = (num: number) => Math.round((num + Number.EPSILON) * 100) / 100;

export const calculateDiarioA = (loan: Loan, inst: Installment, policy: LoanPolicy): CalculationResult => {
    const dailyRatePercent = policy.interestRate / 30; 
    const dailyCost = round(inst.principalRemaining * (dailyRatePercent / 100));
    const daysLate = getDaysDiff(inst.dueDate);
    const accruedInterest = daysLate > 0 ? round(daysLate * dailyCost) : 0;
    const totalInterest = round((inst.interestRemaining || 0) + accruedInterest);
    
    return {
        total: round(inst.principalRemaining + totalInterest),
        principal: inst.principalRemaining,
        interest: totalInterest,
        lateFee: 0, 
        baseForFine: 0,
        daysLate: Math.max(0, daysLate)
    };
};
