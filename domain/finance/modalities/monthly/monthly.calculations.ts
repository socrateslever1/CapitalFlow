import { Loan, Installment, LoanPolicy } from "../../../../types";
import { getDaysDiff } from "../../../../utils/dateHelpers";
import { CalculationResult } from "../types";
import { calculateRecurringMonthlyFine } from "../../lateFeePolicy";

const round = (num: number) => Math.round((num + Number.EPSILON) * 100) / 100;

export const calculateMonthly = (loan: Loan, inst: Installment, policy: LoanPolicy): CalculationResult => {
    const daysLate = Math.max(0, getDaysDiff(inst.dueDate));
    
    // ✅ Lógica de Juros "Instantâneos": Em contratos mensais, o juro do mês 
    // é cobrado assim que o ciclo inicia (ou logo após a renovação).
    // Se o banco retornar 0, mas houver principal, nós assumimos o juro do ciclo atual.
    const principal = inst?.principalRemaining ?? loan?.principal ?? 0;
    let interest = inst?.interestRemaining ?? 0;
    const paidInterest = Number((inst as any)?.paidInterest ?? (inst as any)?.paid_interest ?? 0);
    const contractedInterest = principal > 0 && loan.interestRate > 0
        ? round(principal * (loan.interestRate / 100))
        : 0;

    if (paidInterest > 0.05 && contractedInterest > 0) {
        interest = contractedInterest;
    } else if (interest <= 0.05 && contractedInterest > 0) {
        interest = contractedInterest;
    }
    
    let fineFixed = 0;
    let fineDaily = 0;
    let currentLateFee = 0;

    // Calcula encargos apenas se houver saldo devedor e atraso
    if (daysLate > 0 && (principal + interest) > 0) {
        // Multa fixa recorrente: 2% ao atrasar e mais 2% a cada 30 dias.
        fineFixed = calculateRecurringMonthlyFine(principal + interest, policy.finePercent, daysLate);
        
        // Juros Mora Diária (%)
        fineDaily = round((principal + interest) * (policy.dailyInterestPercent / 100) * daysLate);
        
        currentLateFee = round(fineFixed + fineDaily);
    }

    return {
        total: round(principal + interest + currentLateFee),
        principal,
        interest, // Retorna o saldo restante de juros, não o total do mês
        lateFee: currentLateFee,
        finePart: fineFixed,
        moraPart: fineDaily,
        baseForFine: round(principal + interest),
        daysLate
    };
};
