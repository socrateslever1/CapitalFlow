
import { Loan, Installment, LoanPolicy } from "../../../types";
import { CalculationResult } from "./types";
import { calculateGiro } from "./giro.calculations";
import { calculateDiarioA } from "./diarioA.calculations";

export const financialDispatcher = {
    calculate(loan: Loan, inst: Installment, policy: LoanPolicy): CalculationResult {
        switch (loan.billingCycle) {
            case 'MONTHLY':
                return calculateGiro(loan, inst, policy);
            case 'DAILY_FREE':
                return calculateDiarioA(loan, inst, policy);
            // Casos legados caem no padrão (Giro) ou específico se compatível
            default:
                if (loan.billingCycle === 'DAILY_FIXED_TERM') return calculateGiro(loan, inst, policy); // Fallback para cálculo simples
                return calculateGiro(loan, inst, policy);
        }
    }
};
