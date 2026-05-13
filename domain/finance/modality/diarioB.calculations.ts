
import { Loan, Installment, LoanPolicy } from "../../../types";
import { getDaysDiff } from "../../../utils/dateHelpers";
import { CalculationResult } from "./types";

const round = (num: number) => Math.round((num + Number.EPSILON) * 100) / 100;

export const calculateDiarioB = (loan: Loan, inst: Installment, policy: LoanPolicy): CalculationResult => {
    // Lógica compartilhada para Daily Fixed e Daily 30
    const start = new Date(loan.startDate).getTime();
    const now = new Date().getTime();
    const daysSinceStart = Math.floor((now - start) / (1000 * 3600 * 24));
    
    // Simplificação: Se for ciclo fechado (30 dias), calcula proporcional ou ciclos
    // Aqui assumimos a lógica de acumular juros baseados no tempo corrido se for 'DAILY_FIXED'
    const dailyRate = (policy.interestRate / 100) / 30;
    const activeDays = Math.max(0, daysSinceStart);
    
    const accruedInterest = round(inst.principalRemaining * dailyRate * activeDays);
    const totalInterest = round((inst.interestRemaining || 0) + accruedInterest);
    
    const daysLate = Math.max(0, getDaysDiff(inst.dueDate));
    let currentLateFee = 0;

    if (daysLate > 0) {
        // Multa apenas se estourar o prazo combinado
        const fineFixed = inst.principalRemaining * (policy.finePercent / 100);
        currentLateFee = round(fineFixed);
    }

    return {
        total: round(inst.principalRemaining + totalInterest + currentLateFee),
        principal: inst.principalRemaining,
        interest: totalInterest,
        lateFee: currentLateFee,
        baseForFine: inst.principalRemaining,
        daysLate
    };
};
