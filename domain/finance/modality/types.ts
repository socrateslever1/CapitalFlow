
import { Loan, Installment, LoanPolicy } from "../../../types";

export interface CalculationResult {
    total: number;
    principal: number;
    interest: number;
    lateFee: number;
    baseForFine: number;
    daysLate: number;
}

export type FinancialCalculator = (loan: Loan, inst: Installment, policy: LoanPolicy) => CalculationResult;
