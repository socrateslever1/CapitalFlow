import test from 'node:test';
import assert from 'node:assert/strict';
import { LoanStatus } from '../../../types';
import { resolveDebtSummary, resolveInstallmentDebt, resolvePaymentOptions } from './portalDebtRules';

const dateKeyFromToday = (days: number) => {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const installment: any = {
  id: 'installment-a41df9',
  dueDate: dateKeyFromToday(-5),
  amount: 3250,
  scheduledPrincipal: 2500,
  scheduledInterest: 750,
  principalRemaining: 2500,
  interestRemaining: 750,
  lateFeeAccrued: 227.5,
  paidTotal: 0,
  paidPrincipal: 0,
  paidInterest: 0,
  paidLateFee: 0,
  status: LoanStatus.LATE,
  paymentOfferStatus: 'ACTIVE',
  paymentOfferType: 'INTEREST_RENEWAL',
  paymentOfferValidUntil: dateKeyFromToday(1),
  paymentOfferOriginalAmount: 3477.5,
  paymentOfferAmount: 815,
  paymentOfferDiscountApplied: 0,
  paymentOfferFineAmount: 65,
  paymentOfferDailyInterestAmount: 162.5,
  paymentOfferFineForgiven: 0,
  paymentOfferDailyInterestForgiven: 162.5,
  paymentOfferLateFeeForgiven: 162.5,
};

const loan: any = {
  id: 'a41df9',
  billingCycle: 'MONTHLY',
  principal: 2500,
  totalToReceive: 3250,
  interestRate: 30,
  finePercent: 2,
  dailyInterestPercent: 1,
  policiesSnapshot: { interestRate: 30, finePercent: 2, dailyInterestPercent: 1 },
  installments: [installment],
  status: LoanStatus.ATIVO,
};

test('portal keeps total debt separate from an active renewal payment', () => {
  const summary = resolveDebtSummary(loan, [installment]);
  const detail = resolveInstallmentDebt(loan, installment);
  const payment = resolvePaymentOptions(loan, installment);

  assert.equal(summary.totalDue, 3477.5);
  assert.equal(summary.hasLateInstallments, true);
  assert.equal(detail.total, 3477.5);
  assert.equal(payment.originalTotal, 3477.5);
  assert.equal(payment.totalToPay, 815);
  assert.equal(payment.remainingCapital, 2500);
});

test('portal exposes each discount applied to the renewal payment', () => {
  const payment = resolvePaymentOptions(loan, installment);

  assert.deepEqual(payment.discountBreakdown, {
    additional: 0,
    fine: 0,
    dailyInterest: 162.5,
    total: 162.5,
  });
});
