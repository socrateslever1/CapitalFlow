import { Loan, Installment } from "@/types";
import { parseDateOnlyUTC, toISODateOnlyUTC, addMonthsUTC, todayDateOnlyUTC } from "@/utils/dateHelpers";
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
    const newInterestRemaining = Math.max(0, round(currentInterest - interestPaid));

    // 3. Movimento mensal sempre por mês de calendário, igual à criação do contrato.
    const monthlyInterestRateValue = round(currentPrincipal * (loan.interestRate / 100));

    let newDueDate = currentDueDate;
    const newStartDateISO = loan.startDate;

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
            // Ex.: 31/01 + 1 mês => último dia válido de fevereiro.
            newDueDate = addMonthsUTC(currentDueDate, monthsPaid);
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
        newInterestRemaining,
        newScheduledPrincipal: newPrincipalRemaining,
        newScheduledInterest: nextMonthScheduledInterest,
        newAmount: round(newPrincipalRemaining + newInterestRemaining)
    };
};
