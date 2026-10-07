import type { Loan, Installment } from '../../types';
import { ZERO_BALANCE_THRESHOLD } from '../../domain/finance/calculations';
import { parseDateOnlyUTC, addDaysUTC } from '../../utils/dateHelpers';
import { roundMoney } from './paymentUtils';

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
    const cycleDays = billingCycle === 'WEEKLY' ? 7 : billingCycle === 'BIWEEKLY' ? 15 : 30;
    const hasPrincipalRemaining = Number(balanceAfterRpc.principalRemaining || 0) > ZERO_BALANCE_THRESHOLD;
    const nextCycleInterest = roundMoney(Number(balanceAfterRpc.principalRemaining || 0) * ((Number((loan as any).interestRate) || 0) / 100));
    const chargesStillPending = roundMoney(Number(balanceAfterRpc.interestRemaining || 0) + Number(balanceAfterRpc.lateFeeRemaining || 0)) > ZERO_BALANCE_THRESHOLD;
    const partialRenewalRequested = !!renewWithPending && isMonthlyOrGiro && hasPrincipalRemaining && chargesStillPending;
    const currentDueDate = parseDateOnlyUTC(instDb?.due_date || instDb?.data_vencimento || inst.dueDate);
    // Regra MENSAL/GIRO:
    // - pagamento parcial de juros/encargos: avança 30 dias a partir do vencimento anterior;
    // - regularização integral de juros + multa/mora: reinicia 30 dias a partir do pagamento;
    // - nunca soma um novo juro cheio ao saldo parcial já existente.
    const paymentDateOnly = paymentDate.toISOString().slice(0, 10);
    const renewalDate = partialRenewalRequested
      ? (manualDate || addDaysUTC(currentDueDate, cycleDays))
      : (manualDate || (isInterestRenewal ? addDaysUTC(paymentDateOnly, cycleDays) : null));


    return { isMonthlyOrGiro, hasPrincipalRemaining, nextCycleInterest, partialRenewalRequested, currentDueDate, renewalDate };
}
