import { Loan, Installment } from "@/types";
import { parseDateOnlyUTC, toISODateOnlyUTC, addDaysUTC, todayDateOnlyUTC } from "@/utils/dateHelpers";
import { RenewalResult, PaymentAllocation } from "../types";

const round = (num: number) => Math.round((num + Number.EPSILON) * 100) / 100;

export const renewMonthly = (
    loan: Loan, 
    inst: Installment, 
    amountPaid: number, 
    allocation: PaymentAllocation, 
    today: Date = todayDateOnlyUTC(), 
    forgivePenalty: boolean = false,
    manualDate?: Date | null
): RenewalResult => {
    
    // Data de vencimento atual registrada no contrato
    const currentDueDate = parseDateOnlyUTC(inst.dueDate);
    
    // Valores Base
    const currentPrincipal = Number(inst.principalRemaining) || 0;
    const currentInterest = Number(inst.interestRemaining) || 0;
    
    // Valores Pagos (Alocados)
    const principalPaid = Number(allocation?.paidPrincipal) || 0;
    const avPaid = Number(allocation?.avGenerated) || 0;
    const interestPaid = Number(allocation?.paidInterest) || 0;
    
    // 1. Novo Saldo de Principal
    const newPrincipalRemaining = Math.max(0, round(currentPrincipal - principalPaid - avPaid));

    // 2. Novo Saldo de Juros (Lógica do Balde)
    // Subtrai o que foi pago. Se sobrar algo, fica como pendência para o mesmo mês.
    let newInterestRemaining = Math.max(0, round(currentInterest - interestPaid));

    // 3. Cálculo de Movimento de Data (Ciclos de 30 dias)
    // Calcula quanto vale 1 mês de juros deste contrato
    const monthlyInterestRateValue = round(currentPrincipal * (loan.interestRate / 100));
    
    let newDueDate = currentDueDate;
    let newStartDateISO = loan.startDate;

    if (manualDate) {
        newDueDate = manualDate;
    } else {
        // Lógica Automática: "O dinheiro pago cobre quantos meses?"
        let monthsPaid = 0;
        
        if (monthlyInterestRateValue > 0) {
            // Tolerância de R$ 1,00 para arredondamentos
            if (interestPaid >= (monthlyInterestRateValue - 1)) {
                monthsPaid = Math.floor((interestPaid + 1) / monthlyInterestRateValue);
            }
        } else {
            monthsPaid = 1; 
        }

        if (monthsPaid > 0) {
            // Avança a data em blocos de 30 dias
            newDueDate = addDaysUTC(currentDueDate, monthsPaid * 30);
            
            // Se avançou o mês, o saldo de juros deve ser o residual do próximo mês?
            // NÃO. O sistema de pagamento (payments.service) já lidou com a alocação.
            // Aqui devolvemos apenas o que SOBROU da conta matemática.
            
            // EXCEÇÃO: Se mudou a data, mas sobrou juros (ex: pagou 1.5 meses),
            // o newInterestRemaining calculado acima (current - paid) já está correto (ficou negativo e virou 0, ou sobrou resto).
            
            // Mas espere: se interestPaid foi muito alto (pagou 2 meses), newInterestRemaining acima seria 0.
            // O sistema RPC vai recalcular o ScheduledInterest para o novo período.
        }
        // Se monthsPaid == 0 (Parcial), a data NÃO muda. O cliente continua devendo o resto do mês atual.
    }

    const newDueDateISO = toISODateOnlyUTC(newDueDate);

    // O "Scheduled" (previsto) para o próximo mês é baseado no novo principal
    const nextMonthScheduledInterest = round(newPrincipalRemaining * (loan.interestRate / 100));

    return {
        newStartDateISO,
        newDueDateISO,
        newPrincipalRemaining,
        newInterestRemaining, // Saldo residual estrito
        newScheduledPrincipal: newPrincipalRemaining,
        newScheduledInterest: nextMonthScheduledInterest,
        newAmount: round(newPrincipalRemaining + newInterestRemaining)
    };
};