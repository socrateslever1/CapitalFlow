
import { Loan, Installment } from "@/types";
import { parseDateOnlyUTC, toISODateOnlyUTC, addDaysUTC, getDaysDiff, todayDateOnlyUTC } from "@/utils/dateHelpers";
import { RenewalResult, PaymentAllocation } from "../types";

export const renewDailyFixed = (
    loan: Loan, 
    inst: Installment, 
    amountPaid: number, 
    allocation: PaymentAllocation, 
    today: Date = todayDateOnlyUTC(), 
    forgivePenalty: boolean = false,
    manualDate?: Date | null
): RenewalResult => {
    const daysLate = getDaysDiff(inst.dueDate); 
    
    // Base para o novo ciclo
    let baseDate: Date;
    if (manualDate) {
        baseDate = manualDate;
    } else {
        if (daysLate > 0 && !forgivePenalty) baseDate = today;
        else baseDate = today;
    }

    const newStartDateISO = toISODateOnlyUTC(baseDate); 
    
    // Tenta manter a duração original do ciclo anterior
    let daysToAdd = 30;
    const prevStart = parseDateOnlyUTC(loan.startDate).getTime();
    const prevDue = parseDateOnlyUTC(inst.dueDate).getTime();
    const diff = Math.round((prevDue - prevStart)/(1000*60*60*24));
    if (diff > 0) daysToAdd = diff;
    else daysToAdd = 1; // Mínimo 1 dia para evitar loop infinito
    
    const newDueDateISO = toISODateOnlyUTC(addDaysUTC(baseDate, daysToAdd));

    const currentPrincipalRemaining = Number(inst.principalRemaining) || 0;
    const principalPaidNow = (Number(allocation?.paidPrincipal) || 0) + (Number(allocation?.avGenerated) || 0);

    const newPrincipalRemaining = Math.max(0, currentPrincipalRemaining - principalPaidNow);
    
    // Recalcula juro proporcional ao prazo
    const dailyRate = (loan.interestRate / 100) / 30;
    const nextInterest = newPrincipalRemaining * dailyRate * daysToAdd;

    return {
        newStartDateISO,
        newDueDateISO,
        newPrincipalRemaining,
        newInterestRemaining: nextInterest,
        newScheduledPrincipal: newPrincipalRemaining,
        newScheduledInterest: nextInterest,
        newAmount: newPrincipalRemaining + nextInterest
    };
};
