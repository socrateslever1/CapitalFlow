import { LoanBillingModality } from '../../../types';
import { addDaysUTC, addMonthsUTC, parseDateOnlyUTC, formatBRDate } from '../../../utils/dateHelpers';

export const calculateAutoDueDate = (
  startDateStr: string,
  billingCycle: LoanBillingModality,
  fixedDuration: string,
  skipWeekends: boolean = false
): string => {
  if (!startDateStr) return '';
  const start = parseDateOnlyUTC(startDateStr);

  // DAILY_FREE não tem prazo fixo: o marco inicial é o próprio dia da contratação.
  // A compra de dias ocorre somente quando os juros são pagos/renovados.
  const due = billingCycle === 'DAILY_FREE'
    ? start
    : billingCycle === 'DAILY_FIXED_TERM'
      ? addDaysUTC(start, Math.max(1, Number(fixedDuration) || 1), skipWeekends)
      : addMonthsUTC(start, 1);

  return formatBRDate(due.toISOString());
};
