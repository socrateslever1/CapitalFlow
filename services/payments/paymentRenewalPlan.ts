import type { Loan, Installment } from '../../types';
import { ZERO_BALANCE_THRESHOLD } from '../../domain/finance/calculations';
import { parseDateOnlyUTC, addCollectionDaysUTC, addDaysUTC, adjustToCollectionDayUTC, normalizeCollectionDaysMode } from '../../utils/dateHelpers';
import { roundMoney } from './paymentUtils';

/** Sugere o próximo vencimento usando uma única regra para todas as telas de recebimento. */
export function suggestRenewalDueDate(params: {
    loan: Loan;
    inst: Installment;
    paymentDate: Date | string;
    preserveOriginalCycle?: boolean;
    manualDate?: Date | null;
}) {
    const { loan, inst, paymentDate, preserveOriginalCycle = false, manualDate } = params;
    if (manualDate) return manualDate;

    const billingCycle = String((loan as any).billingCycle || '').toUpperCase();
    const currentDueDate = parseDateOnlyUTC(inst.dueDate);
    const paidOn = parseDateOnlyUTC(paymentDate);
    const baseDate = preserveOriginalCycle ? currentDueDate : paidOn;
    const collectionDaysMode = normalizeCollectionDaysMode(loan.collectionDaysMode, !!loan.skipWeekends);

    if (billingCycle === 'DAILY' || billingCycle === 'DAILY_FREE' || billingCycle === 'DAILY_FIXED_TERM') {
        return addCollectionDaysUTC(baseDate, 1, collectionDaysMode);
    }

    const cycleDays = billingCycle === 'WEEKLY'
        ? 7
        : billingCycle === 'BIWEEKLY'
            ? 15
            : ['MONTHLY', 'GIRO', 'REVOLVING'].includes(billingCycle)
                ? 30
                : 0;
    if (!cycleDays) return null;

    const raw = addDaysUTC(baseDate, cycleDays);
    return billingCycle === 'WEEKLY'
        ? adjustToCollectionDayUTC(raw, collectionDaysMode)
        : raw;
}

/** Planeja a renovação sem executar mutações no banco de dados. */
export function planPaymentRenewal(params: {
    loan: Loan;
    inst: Installment;
    instDb: any;
    balanceAfterRpc: { principalRemaining: number; interestRemaining: number; lateFeeRemaining: number; totalRemaining: number };
    renewWithPending: boolean;
    isInterestRenewal: boolean;
    manualDate?: Date | null;
    paymentDate: Date;
}) {
    const { loan, inst, instDb, balanceAfterRpc, renewWithPending, isInterestRenewal, manualDate, paymentDate } = params;
    const billingCycle = String((loan as any).billingCycle || '').toUpperCase();
    const isMonthlyOrGiro = ['MONTHLY', 'BIWEEKLY', 'WEEKLY', 'GIRO', 'REVOLVING'].includes(billingCycle);
    const hasPrincipalRemaining = Number(balanceAfterRpc.principalRemaining || 0) > ZERO_BALANCE_THRESHOLD;
    const nextCycleInterest = roundMoney(Number(balanceAfterRpc.principalRemaining || 0) * ((Number((loan as any).interestRate) || 0) / 100));
    const chargesStillPending = roundMoney(Number(balanceAfterRpc.interestRemaining || 0) + Number(balanceAfterRpc.lateFeeRemaining || 0)) > ZERO_BALANCE_THRESHOLD;
    const partialRenewalRequested = !!renewWithPending && isMonthlyOrGiro && hasPrincipalRemaining && chargesStillPending;
    const currentDueDate = parseDateOnlyUTC(instDb?.due_date || instDb?.data_vencimento || inst.dueDate);

    // Regra única:
    // - saldo parcial/dispensa conserva o ciclo original;
    // - encargos integralmente regularizados reiniciam a partir do pagamento.
    const effectiveInst = { ...inst, dueDate: currentDueDate.toISOString().slice(0, 10) } as Installment;
    const renewalDate = partialRenewalRequested
      ? suggestRenewalDueDate({ loan, inst: effectiveInst, paymentDate, preserveOriginalCycle: true, manualDate })
      : isInterestRenewal
        ? suggestRenewalDueDate({ loan, inst: effectiveInst, paymentDate, preserveOriginalCycle: false, manualDate })
        : null;

    return { isMonthlyOrGiro, hasPrincipalRemaining, nextCycleInterest, partialRenewalRequested, currentDueDate, renewalDate };
}
