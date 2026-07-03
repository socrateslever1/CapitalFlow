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
  const effectiveSkip = billingCycle === 'DAILY_FREE' ? false : skipWeekends;

  const due = billingCycle === 'DAILY_FREE'
    ? addDaysUTC(start, 1, effectiveSkip)
    : billingCycle === 'DAILY_FIXED_TERM'
      ? addDaysUTC(start, Math.max(1, Number(fixedDuration) || 1), effectiveSkip)
      : addMonthsUTC(start, 1);

  return formatBRDate(due.toISOString());
};