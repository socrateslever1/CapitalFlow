
import { LoanBillingModality } from '../../../types';
import { addDaysUTC, parseDateOnlyUTC, formatBRDate } from '../../../utils/dateHelpers';

export const calculateAutoDueDate = (
  startDateStr: string,
  billingCycle: LoanBillingModality,
  fixedDuration: string,
  skipWeekends: boolean = false
): string => {
  if (!startDateStr) return '';
  const start = parseDateOnlyUTC(startDateStr);
  
  let daysToAdd = 30;
  
  // Lucro agressivo: Diária Livre NUNCA pula fins de semana
  const isDailyFree = billingCycle === 'DAILY_FREE';
  const effectiveSkip = isDailyFree ? false : skipWeekends;

  if (billingCycle === 'DAILY_FREE') {
      daysToAdd = 1; // Próximo vencimento após início é amanhã
  }
  
  const due = addDaysUTC(start, daysToAdd, effectiveSkip);
  return formatBRDate(due.toISOString());
};
