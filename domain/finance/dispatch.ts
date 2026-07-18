
import { Loan, Installment, LoanPolicy } from "../../types";
import { CalculationResult, RenewalResult, PaymentAllocation } from "./modalities/types";
import { modalityRegistry } from "./modalities/registry";

export const financeDispatcher = {
    calculate(loan: Loan, inst: Installment, policy: LoanPolicy, referenceDate?: string): CalculationResult {
        const strategy = modalityRegistry.get(loan.billingCycle);
        return strategy.calculate(loan, inst, policy, referenceDate);
    },

    renew(
        loan: Loan, 
        inst: Installment, 
        amountPaid: number, 
        allocation: PaymentAllocation, 
        today: Date, 
        forgivePenalty: boolean,
        manualDate?: Date | null
    ): RenewalResult {
        const strategy = modalityRegistry.get(loan.billingCycle);
        return strategy.renew(loan, inst, amountPaid, allocation, today, forgivePenalty, manualDate);
    }
};
