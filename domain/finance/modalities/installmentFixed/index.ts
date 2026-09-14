import { LoanStatus, Installment } from "../../../../types";
import { addMonthsUTC, getDaysDiff, parseDateOnlyUTC, toISODateOnlyUTC } from "../../../../utils/dateHelpers";
import { generateUUID } from "../../../../utils/generators";
import { calculateRecurringMonthlyFine } from "../../lateFeePolicy";
import { ModalityStrategy } from "../types";

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

function pmt(principal: number, monthlyRatePercent: number, installmentsCount: number): number {
    const n = Math.max(1, Math.floor(installmentsCount));
    const i = monthlyRatePercent / 100;
    if (i <= 0) return principal / n;
    return principal * (i / (1 - Math.pow(1 + i, -n)));
}

const calculateInstallmentFixed: ModalityStrategy['calculate'] = (_loan, inst, policy, referenceDate) => {
    const principal = round(Math.max(0, Number(inst.principalRemaining) || 0));
    const interest = round(Math.max(0, Number(inst.interestRemaining) || 0));
    const daysLate = Math.max(0, getDaysDiff(inst.dueDate, referenceDate));
    const baseForFine = round(principal + interest);

    const finePart = daysLate > 0
        ? calculateRecurringMonthlyFine(baseForFine, policy.finePercent, daysLate)
        : 0;
    const moraPart = daysLate > 0
        ? round(baseForFine * (Number(policy.dailyInterestPercent || 0) / 100) * daysLate)
        : 0;
    const lateFee = round(finePart + moraPart);

    return {
        total: round(principal + interest + lateFee),
        principal,
        interest,
        lateFee,
        finePart,
        moraPart,
        baseForFine,
        daysLate,
    };
};

const renewInstallmentFixed: ModalityStrategy['renew'] = (loan, inst, _amountPaid, allocation) => {
    const currentPrincipal = Math.max(0, Number(inst.principalRemaining) || 0);
    const currentInterest = Math.max(0, Number(inst.interestRemaining) || 0);
    const principalPaid = Math.max(0, Number(allocation?.paidPrincipal) || 0);
    const interestPaid = Math.max(0, Number(allocation?.paidInterest) || 0);

    const newPrincipalRemaining = Math.max(0, round(currentPrincipal - principalPaid));
    const newInterestRemaining = Math.max(0, round(currentInterest - interestPaid));

    return {
        newStartDateISO: loan.startDate,
        newDueDateISO: inst.dueDate,
        newPrincipalRemaining,
        newInterestRemaining,
        newScheduledPrincipal: Number(inst.scheduledPrincipal) || 0,
        newScheduledInterest: Number(inst.scheduledInterest) || 0,
        newAmount: round(newPrincipalRemaining + newInterestRemaining),
    };
};

export const installmentFixedStrategy: ModalityStrategy = {
    key: 'INSTALLMENT_FIXED',

    // Parcelado Fixo tem saldo e juros próprios por parcela. Nunca usa o motor Mensal,
    // porque isso recalcularia a margem do cliente pela taxa geral do contrato.
    calculate: calculateInstallmentFixed,
    renew: renewInstallmentFixed,

    generateInstallments: (params) => {
        const principal = Math.max(0, Number(params.principal) || 0);
        const count = Math.max(1, Math.floor(Number(params.fundingInstallmentsCount) || Number(params.fixedDuration) || 1));
        const bankTotalInput = Number(params.fundingTotalPayable) || 0;
        const bankMonthlyRate = Number(params.fundingMonthlyRate) || 0;
        const marginPercent = params.customerMarginPercent == null
            ? (Number(params.rate) || 0)
            : (Number(params.customerMarginPercent) || 0);
        const mode = params.fundingCalculationMode || (bankTotalInput > principal ? 'TOTAL' : 'RATE');

        let bankInstallmentValue = 0;
        if (mode === 'TOTAL' && bankTotalInput > 0) {
            bankInstallmentValue = bankTotalInput / count;
        } else {
            bankInstallmentValue = pmt(principal, bankMonthlyRate, count);
        }

        const baseForClient = params.operatorAbsorbsInterest ? (principal / count) : bankInstallmentValue;
        const customerInstallmentValue = round(baseForClient * (1 + (marginPercent / 100)));
        const totalToReceive = round(customerInstallmentValue * count);
        const principalPart = round(principal / count);

        const baseDate = parseDateOnlyUTC(params.startDate);
        const installments: Installment[] = [];
        let principalAllocated = 0;

        for (let index = 1; index <= count; index++) {
            const isLast = index === count;
            const scheduledPrincipal = isLast ? round(principal - principalAllocated) : principalPart;
            principalAllocated = round(principalAllocated + scheduledPrincipal);
            const scheduledInterest = round(customerInstallmentValue - scheduledPrincipal);
            const dueDate = addMonthsUTC(baseDate, index);

            installments.push({
                id: generateUUID(),
                number: index,
                dueDate: toISODateOnlyUTC(dueDate),
                amount: customerInstallmentValue,
                scheduledPrincipal,
                scheduledInterest,
                principalRemaining: scheduledPrincipal,
                interestRemaining: scheduledInterest,
                lateFeeAccrued: 0,
                avApplied: 0,
                paidPrincipal: 0,
                paidInterest: 0,
                paidLateFee: 0,
                paidTotal: 0,
                status: LoanStatus.PENDING,
                logs: []
            });
        }

        return { installments, totalToReceive };
    },

    card: {
        dueDateLabel: () => "Parcela",
        statusLabel: (_inst, daysDiff) => {
            if (daysDiff > 0) return { text: `ATRASADO HA ${daysDiff} DIAS`, color: 'text-rose-500 font-black' };
            if (daysDiff < 0) return { text: `FALTAM ${Math.abs(daysDiff)} DIAS`, color: 'text-blue-400' };
            return { text: 'VENCE HOJE', color: 'text-amber-400 animate-pulse' };
        },
        showProgress: false
    }
};
