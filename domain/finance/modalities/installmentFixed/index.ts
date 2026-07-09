import { LoanStatus, Installment } from "../../../../types";
import { addMonthsUTC, parseDateOnlyUTC, toISODateOnlyUTC } from "../../../../utils/dateHelpers";
import { generateUUID } from "../../../../utils/generators";
import { calculateMonthly } from "../monthly/monthly.calculations";
import { renewMonthly } from "../monthly/monthly.renewal";
import { ModalityStrategy } from "../types";

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

function pmt(principal: number, monthlyRatePercent: number, installmentsCount: number): number {
    const n = Math.max(1, Math.floor(installmentsCount));
    const i = monthlyRatePercent / 100;
    if (i <= 0) return principal / n;
    return principal * (i / (1 - Math.pow(1 + i, -n)));
}

export const installmentFixedStrategy: ModalityStrategy = {
    key: 'INSTALLMENT_FIXED',

    calculate: calculateMonthly,
    renew: renewMonthly,

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
