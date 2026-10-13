export type FundingCalculationMode = 'TOTAL' | 'INSTALLMENT' | 'RATE';

export interface FundingValues {
  total: number;
  installment: number;
  monthlyRate: number;
}

const round = (value: number, decimals: number) => {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

export const calculateFundingInstallment = (principal: number, monthlyRatePercent: number, count: number) => {
  const installments = Math.max(1, Math.floor(count));
  const rate = Math.max(0, monthlyRatePercent) / 100;
  if (rate === 0) return principal / installments;
  return principal * (rate / (1 - Math.pow(1 + rate, -installments)));
};

export const inferFundingMonthlyRate = (principal: number, installment: number, count: number) => {
  const installments = Math.max(1, Math.floor(count));
  if (principal <= 0 || installment <= principal / installments) return 0;

  let low = 0;
  let high = 10;
  while (calculateFundingInstallment(principal, high, installments) < installment && high < 100000) {
    high *= 2;
  }

  for (let attempt = 0; attempt < 80; attempt++) {
    const middle = (low + high) / 2;
    if (calculateFundingInstallment(principal, middle, installments) < installment) low = middle;
    else high = middle;
  }

  return round((low + high) / 2, 6);
};

export const deriveFundingValues = (
  principalInput: number,
  countInput: number,
  mode: FundingCalculationMode,
  sourceValueInput: number
): FundingValues => {
  const principal = Math.max(0, principalInput || 0);
  const count = Math.max(1, Math.floor(countInput || 1));
  const sourceValue = Math.max(0, sourceValueInput || 0);

  if (mode === 'RATE') {
    const installment = calculateFundingInstallment(principal, sourceValue, count);
    return {
      total: round(installment * count, 2),
      installment: round(installment, 2),
      monthlyRate: round(sourceValue, 6),
    };
  }

  const installment = mode === 'INSTALLMENT' ? sourceValue : sourceValue / count;
  const total = mode === 'INSTALLMENT' ? installment * count : sourceValue;
  return {
    total: round(total, 2),
    installment: round(installment, 2),
    monthlyRate: inferFundingMonthlyRate(principal, installment, count),
  };
};
