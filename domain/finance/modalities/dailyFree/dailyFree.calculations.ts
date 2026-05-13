import { Loan, Installment, LoanPolicy } from "../../../../types";
import { getDaysDiff } from "../../../../utils/dateHelpers";
import { CalculationResult } from "../types";

const round = (num: number) => Math.round((num + Number.EPSILON) * 100) / 100;

export const calculateDailyFree = (loan: Loan, inst: Installment, policy: LoanPolicy): CalculationResult => {
    // ✅ FALLBACK: Se a parcela não tem principal individual, usa o principal do contrato (Floating Debt)
    const principal = Number(inst?.principalRemaining) || Number(loan?.principal) || 0;
    
    // Valor base da diária = (Taxa Mensal / 30) * Principal
    const dailyRatePercent = (Number(policy?.interestRate) || 0) / 30; 
    const dailyCost = round(principal * (dailyRatePercent / 100));
    
    const daysLate = getDaysDiff(inst.dueDate);
    
    // CORREÇÃO: Se o cliente paga exatamente no dia do vencimento (daysLate === 0), 
    // ele não deve juros "extras" relativos a atraso ainda. O juro só deve acumular a partir do 1º dia de atraso.
    const accruedInterest = daysLate > 0 ? round(daysLate * dailyCost) : 0;
    
    const totalInterest = round((inst.interestRemaining || 0) + accruedInterest);
    
    return {
        total: round(principal + totalInterest),
        principal: principal,
        interest: totalInterest,
        lateFee: 0, 
        baseForFine: 0,
        daysLate: Math.max(0, daysLate)
    };
};
