
import { Loan, Installment } from "../../../../types";
import { parseDateOnlyUTC, toISODateOnlyUTC, addDaysUTC, todayDateOnlyUTC } from "../../../../utils/dateHelpers";
import { RenewalResult, PaymentAllocation } from "../types";

const round = (num: number) => Math.round((num + Number.EPSILON) * 100) / 100;

/**
 * Lógica de Renovação para Modalidades Diárias (DAILY_30_INTEREST, DAILY_30_CAPITAL)
 * Diferente da mensal, esta modalidade avança a data DIA A DIA proporcionalmente ao valor pago.
 */
export const renewDaily30 = (
    loan: Loan, 
    inst: Installment, 
    amountPaid: number, 
    allocation: PaymentAllocation, 
    today: Date = todayDateOnlyUTC(), 
    forgivePenalty: boolean = false,
    manualDate?: Date | null
): RenewalResult => {
    
    // Data de vencimento atual
    const currentDueDate = parseDateOnlyUTC(inst.dueDate);
    
    // Valores Base
    const currentPrincipal = Number(inst.principalRemaining) || 0;
    const currentInterest = Number(inst.interestRemaining) || 0;
    
    // Valores Pagos (Alocados)
    const principalPaid = Number(allocation?.paidPrincipal) || 0;
    const avPaid = Number(allocation?.avGenerated) || 0;
    const interestPaid = Number(allocation?.paidInterest) || 0;
    
    // 1. Novo Saldo de Principal (Amortização direta)
    const newPrincipalRemaining = Math.max(0, round(currentPrincipal - principalPaid - avPaid));

    // 2. Cálculo do Custo Diário (Taxa Mensal / 30)
    // Usamos o principal ATUAL (antes do pagamento) para calcular os dias comprados, 
    // ou o novo principal se for uma amortização? 
    // Padrão de mercado: juro do período corrido é calculado sobre o saldo que estava devedor.
    const dailyInterestRatePercent = (Number(loan.interestRate) / 100) / 30;
    const dailyCost = round(currentPrincipal * dailyInterestRatePercent);

    let newDueDate = currentDueDate;
    let newInterestRemaining = Math.max(0, round(currentInterest - interestPaid));

    if (manualDate) {
        newDueDate = manualDate;
    } else {
        // Quantos dias o juro pago cobre?
        if (dailyCost > 0 && interestPaid > 0) {
            // Se for CAPITAL, precisa ter pago o principal proporcional também?
            // Ou apenas avançamos se houver pagamento de juros.
            // Para diferenciar: em Capital, podemos ser mais rígidos ou mudar a base de cálculo.
            
            const daysPaid = Math.floor(interestPaid / dailyCost);
            if (daysPaid > 0) {
                newDueDate = addDaysUTC(currentDueDate, daysPaid);
            }
        }
        
        // No DAILY_30_CAPITAL, se o cara pagou principal, ele está amortizando ativamente.
        // A lógica de amortização já reduz o newPrincipalRemaining acima.
    }

    const newDueDateISO = toISODateOnlyUTC(newDueDate);

    // Previsto para o próximo período (próximos 30 dias se for recalcular ciclo completo)
    // No DAILY_30, costuma-se cobrar 30 dias de juros antecipados ou postecipados.
    const nextCycleInterest = round(newPrincipalRemaining * (loan.interestRate / 100));

    return {
        newStartDateISO: loan.startDate,
        newDueDateISO,
        newPrincipalRemaining,
        newInterestRemaining,
        newScheduledPrincipal: newPrincipalRemaining,
        newScheduledInterest: nextCycleInterest,
        newAmount: round(newPrincipalRemaining + newInterestRemaining)
    };
};
