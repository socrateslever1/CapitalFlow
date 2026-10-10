import { CollectionDaysMode, Installment, Loan, LoanBillingModality, LoanStatus } from '../../../../types';
import { addDaysUTC, adjustToCollectionDayUTC, normalizeCollectionDaysMode, parseDateOnlyUTC, toISODateOnlyUTC, todayDateOnlyUTC } from '../../../../utils/dateHelpers';
import { generateUUID } from '../../../../utils/generators';
import { calculateMonthly } from '../monthly/monthly.calculations';
import { ModalityStrategy, PaymentAllocation, RenewalResult } from '../types';

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const generatePeriodicInstallment = (
  principal: number,
  rate: number,
  startDate: string,
  intervalDays: number,
  existingId?: string,
  collectionDaysMode: CollectionDaysMode = 'ALL_DAYS'
) => {
  const scheduledInterest = roundMoney(principal * (rate / 100));
  const totalToReceive = roundMoney(principal + scheduledInterest);
  const dueDate = toISODateOnlyUTC(adjustToCollectionDayUTC(
    addDaysUTC(parseDateOnlyUTC(startDate), intervalDays),
    collectionDaysMode
  ));
  const installment: Installment = {
    id: existingId || generateUUID(),
    dueDate,
    amount: totalToReceive,
    scheduledPrincipal: roundMoney(principal),
    scheduledInterest,
    principalRemaining: roundMoney(principal),
    interestRemaining: scheduledInterest,
    lateFeeAccrued: 0,
    avApplied: 0,
    paidPrincipal: 0,
    paidInterest: 0,
    paidLateFee: 0,
    paidTotal: 0,
    status: LoanStatus.PENDING,
    logs: [],
  };
  return { installments: [installment], totalToReceive };
};

const renewPeriodic = (
  intervalDays: number,
  loan: Loan,
  inst: Installment,
  _amountPaid: number,
  allocation: PaymentAllocation,
  _today: Date = todayDateOnlyUTC(),
  _forgivePenalty = false,
  manualDate?: Date | null
): RenewalResult => {
  const currentPrincipal = Number(inst.principalRemaining) || 0;
  const currentInterest = Number(inst.interestRemaining) || 0;
  const principalPaid = Number(allocation?.paidPrincipal) || 0;
  const avPaid = Number(allocation?.avGenerated) || 0;
  const interestPaid = Number(allocation?.paidInterest) || 0;
  const newPrincipalRemaining = Math.max(0, roundMoney(currentPrincipal - principalPaid - avPaid));
  const newInterestRemaining = Math.max(0, roundMoney(currentInterest - interestPaid));
  const cycleInterest = roundMoney(currentPrincipal * (loan.interestRate / 100));
  let cyclesPaid = cycleInterest > 0
    ? Math.floor((interestPaid + 0.01) / cycleInterest)
    : 1;
  if (interestPaid <= 0 && cycleInterest > 0) cyclesPaid = 0;
  const currentDueDate = parseDateOnlyUTC(inst.dueDate);
  const collectionDaysMode = intervalDays === 7
    ? normalizeCollectionDaysMode(loan.collectionDaysMode, !!loan.skipWeekends)
    : 'ALL_DAYS';
  const newDueDate = manualDate || (cyclesPaid > 0
    ? adjustToCollectionDayUTC(addDaysUTC(currentDueDate, intervalDays * cyclesPaid), collectionDaysMode)
    : currentDueDate);
  const nextScheduledInterest = roundMoney(newPrincipalRemaining * (loan.interestRate / 100));

  return {
    newStartDateISO: loan.startDate,
    newDueDateISO: toISODateOnlyUTC(newDueDate),
    newPrincipalRemaining,
    newInterestRemaining,
    newScheduledPrincipal: newPrincipalRemaining,
    newScheduledInterest: nextScheduledInterest,
    newAmount: roundMoney(newPrincipalRemaining + newInterestRemaining),
  };
};

const createPeriodicStrategy = (
  key: Extract<LoanBillingModality, 'WEEKLY' | 'BIWEEKLY'>,
  intervalDays: number
): ModalityStrategy => ({
  key,
  calculate: calculateMonthly,
  renew: (...args) => renewPeriodic(intervalDays, ...args),
  generateInstallments: (params) => generatePeriodicInstallment(
    params.principal,
    params.rate,
    params.startDate,
    intervalDays,
    params.initialData?.installments?.[0]?.id,
    key === 'WEEKLY'
      ? normalizeCollectionDaysMode((params.initialData as any)?.collectionDaysMode, !!(params.initialData as any)?.skipWeekends)
      : 'ALL_DAYS'
  ),
  card: {
    dueDateLabel: () => 'Vencimento',
    statusLabel: (_inst, daysDiff) => {
      if (daysDiff > 0) return { text: `ATRASADO HÁ ${daysDiff} DIAS`, color: 'text-rose-500 font-black' };
      if (daysDiff < 0) return { text: `FALTAM ${Math.abs(daysDiff)} DIAS`, color: 'text-blue-400' };
      return { text: 'VENCE HOJE', color: 'text-amber-400 animate-pulse' };
    },
    showProgress: false,
  },
});

export const weeklyStrategy = createPeriodicStrategy('WEEKLY', 7);
export const biweeklyStrategy = createPeriodicStrategy('BIWEEKLY', 15);
