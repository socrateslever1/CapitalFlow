import { CollectionDaysMode, LoanBillingModality } from '../../../types';
import { addCollectionDaysUTC, addDaysUTC, addMonthsUTC, adjustToCollectionDayUTC, normalizeCollectionDaysMode, parseDateOnlyUTC, formatBRDate } from '../../../utils/dateHelpers';

export const calculateAutoDueDate = (
  startDateStr: string,
  billingCycle: LoanBillingModality,
  fixedDuration: string,
  skipWeekends: boolean = false,
  collectionDaysMode?: CollectionDaysMode
): string => {
  if (!startDateStr) return '';
  const start = parseDateOnlyUTC(startDateStr);
  const mode = normalizeCollectionDaysMode(collectionDaysMode, skipWeekends);

  // DAILY_FREE começa no próximo dia permitido para recebimento.
  const due = billingCycle === 'DAILY_FREE'
    ? addCollectionDaysUTC(start, 1, mode)
    : billingCycle === 'DAILY_FIXED_TERM'
      ? addCollectionDaysUTC(start, Math.max(1, Number(fixedDuration) || 1), mode)
      : billingCycle === 'WEEKLY'
        ? adjustToCollectionDayUTC(addDaysUTC(start, 7), mode)
        : billingCycle === 'BIWEEKLY'
          ? addDaysUTC(start, 15)
      : addMonthsUTC(start, 1);

  return formatBRDate(due.toISOString());
};
