
import { Loan, Installment } from "@/types";
import { RenewalResult, PaymentAllocation } from "../types";

const round = (num: number) => Math.round((num + Number.EPSILON) * 100) / 100;

export const renewDailyFixedTerm = (
    loan: Loan, 
    inst: Installment, 
    amountPaid: number, 
    allocation: PaymentAllocation, 
    today: Date, 
    forgivePenalty: boolean,
    manualDate?: Date | null
): RenewalResult => {
    // MODALIDADE FECHADA: 
    // Datas são imutáveis. O pagamento apenas abate o saldo.
    // Lógica Proporcional: O pagamento abate Juros e Principal na mesma proporção do saldo devedor atual.
    
    const currentPrincipal = Number(inst.principalRemaining) || 0;
    const currentInterest = Number(inst.interestRemaining) || 0;
    const totalDebt = currentPrincipal + currentInterest;

    let newPrincipalRemaining = currentPrincipal;
    let newInterestRemaining = currentInterest;

    if (totalDebt > 0 && amountPaid > 0) {
        // Calcula proporções
        const principalRatio = currentPrincipal / totalDebt;
        const interestRatio = currentInterest / totalDebt;

        // Distribui o pagamento
        const principalReduction = round(amountPaid * principalRatio);
        const interestReduction = round(amountPaid * interestRatio);

        // Aplica redução (com proteção contra negativos)
        newPrincipalRemaining = Math.max(0, round(currentPrincipal - principalReduction));
        newInterestRemaining = Math.max(0, round(currentInterest - interestReduction));
        
        // Ajuste de arredondamento: se sobrou centavos no total mas era pra zerar
        if (amountPaid >= totalDebt) {
            newPrincipalRemaining = 0;
            newInterestRemaining = 0;
        }
    }

    return {
        newStartDateISO: loan.startDate, // DATA ORIGINAL
        newDueDateISO: inst.dueDate,     // DATA ORIGINAL
        newPrincipalRemaining,
        newInterestRemaining,
        newScheduledPrincipal: Number(inst.scheduledPrincipal),
        newScheduledInterest: Number(inst.scheduledInterest),
        newAmount: round(newPrincipalRemaining + newInterestRemaining)
    };
};
