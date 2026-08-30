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

export interface MonthlyCycleLatePolicyResult {
  total: number;
  principal: number;
  interest: number;
  lateFee: number;
  finePart: number;
  moraPart: number;
  baseForFine: number;
  capitalizedBase: number;
  completedCycles: number;
  residualDays: number;
}

export const calculateMonthlyCycleLatePolicy = (params: {
  principal: number;
  currentInterest: number;
  monthlyInterestPercent: number;
  finePercent: number;
  dailyInterestPercent: number;
  daysLate: number;
}): MonthlyCycleLatePolicyResult => {
  const principal = round(Math.max(0, Number(params.principal || 0)));
  const currentInterest = round(Math.max(0, Number(params.currentInterest || 0)));
  const monthlyInterestPercent = Math.max(0, Number(params.monthlyInterestPercent || 0));
  const finePercent = Math.max(0, Number(params.finePercent || 0));
  const dailyInterestPercent = Math.max(0, Number(params.dailyInterestPercent || 0));
  const daysLate = Math.max(0, Math.floor(Number(params.daysLate || 0)));

  let capitalizedBase = round(principal + currentInterest);
  let cycleInterest = 0;
  let finePart = 0;
  const completedCycles = Math.floor(daysLate / 30);
  const residualDays = daysLate % 30;

  for (let cycle = 0; cycle < completedCycles; cycle += 1) {
    const cycleFine = round(capitalizedBase * (finePercent / 100));
    const nextCycleInterest = round(capitalizedBase * (monthlyInterestPercent / 100));
    finePart = round(finePart + cycleFine);
    cycleInterest = round(cycleInterest + nextCycleInterest);
    capitalizedBase = round(capitalizedBase + nextCycleInterest);
  }

  const moraPart = residualDays > 0
    ? round(capitalizedBase * (dailyInterestPercent / 100) * residualDays)
    : 0;
  const interest = round(currentInterest + cycleInterest);
  const lateFee = round(finePart + moraPart);

  return {
    total: round(principal + interest + lateFee),
    principal,
    interest,
    lateFee,
    finePart,
    moraPart,
    baseForFine: round(principal + currentInterest),
    capitalizedBase,
    completedCycles,
    residualDays,
  };
};
