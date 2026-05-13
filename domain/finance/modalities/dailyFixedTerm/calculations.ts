
import { Loan, Installment, LoanPolicy } from "../../../../types";
import { getDaysDiff } from "../../../../utils/dateHelpers";
import { CalculationResult } from "../types";

const round = (num: number) => Math.round((num + Number.EPSILON) * 100) / 100;

export const calculateDailyFixedTerm = (loan: Loan, inst: Installment, policy: LoanPolicy): CalculationResult => {
    // Parcela Única
    const principalRem = Number(inst.principalRemaining) || 0;
    const interestRem = Number(inst.interestRemaining) || 0;
    
    // Atraso só conta após o fim do prazo total (due_date)
    const daysLate = Math.max(0, getDaysDiff(inst.dueDate));
    
    let currentLateFee = 0;
    const baseForFine = round(principalRem + interestRem);

    if (daysLate > 0 && baseForFine > 0) {
        // Multa Fixa apenas sobre o saldo devedor
        const fineFixed = baseForFine * (policy.finePercent / 100);
        
        // Juros de Mora Diária (após o fim do prazo)
        const fineDaily = baseForFine * (policy.dailyInterestPercent / 100) * daysLate;
        
        currentLateFee = round(fineFixed + fineDaily);
    }

    return {
        total: round(principalRem + interestRem + currentLateFee),
        principal: principalRem,
        interest: interestRem,
        lateFee: currentLateFee,
        baseForFine,
        daysLate
    };
};
