import type { Installment, Loan } from '../../types';
import { calculateTotalDue } from '../../domain/finance/calculations';
import { roundMoney } from './paymentUtils';

export function resolveRenewalBuckets(loan: Loan, installment: Installment) {
  const principal = Number(installment.principalRemaining ?? loan.principal ?? 0) || 0;
  const currentCalc = calculateTotalDue(loan, installment);
  const explicitInterest = Number(currentCalc.interest || 0);
  const explicitLateFee = Number(currentCalc.lateFee || 0);
  const expectedCycleInterest = roundMoney(principal * ((Number((loan as any).interestRate) || 0) / 100));
  const interest = Math.max(explicitInterest, expectedCycleInterest);

  return {
    interest,
    lateFee: explicitLateFee,
    total: roundMoney(interest + explicitLateFee),
  };
}
