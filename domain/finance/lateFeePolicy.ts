const round = (num: number): number => Math.round((num + Number.EPSILON) * 100) / 100;

export const getRecurringFinePeriods = (daysLate: number): number => {
  const safeDaysLate = Math.max(0, Math.floor(Number(daysLate) || 0));
  if (safeDaysLate <= 0) return 0;
  return Math.ceil(safeDaysLate / 30);
};

export const calculateRecurringMonthlyFine = (
  baseAmount: number,
  finePercent: number,
  daysLate: number
): number => {
  const periods = getRecurringFinePeriods(daysLate);
  if (periods <= 0 || !finePercent || baseAmount <= 0) return 0;
  return round(baseAmount * (finePercent / 100) * periods);
};
