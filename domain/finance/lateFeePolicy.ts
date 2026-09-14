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
  const finePercent = Math.max(0, Number(params.finePercent || 0));
  const dailyInterestPercent = Math.max(0, Number(params.dailyInterestPercent || 0));
  const daysLate = Math.max(0, Math.floor(Number(params.daysLate || 0)));

  // Regra oficial do Mensal/Giro:
  // - juros contratuais permanecem separados e não são capitalizados novamente;
  // - multa entra ao iniciar o atraso e se repete a cada 30 dias;
  // - mora diária incide sobre principal + juros contratuais enquanto houver atraso.
  const baseForFine = round(principal + currentInterest);
  const finePart = daysLate > 0
    ? calculateRecurringMonthlyFine(baseForFine, finePercent, daysLate)
    : 0;
  const moraPart = daysLate > 0
    ? round(baseForFine * (dailyInterestPercent / 100) * daysLate)
    : 0;
  const lateFee = round(finePart + moraPart);

  return {
    total: round(principal + currentInterest + lateFee),
    principal,
    interest: currentInterest,
    lateFee,
    finePart,
    moraPart,
    baseForFine,
    capitalizedBase: baseForFine,
    completedCycles: Math.floor(daysLate / 30),
    residualDays: daysLate % 30,
  };
};
