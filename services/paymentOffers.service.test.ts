import test from 'node:test';
import assert from 'node:assert/strict';
import { LoanStatus, type Installment, type Loan } from '../types';
import { calculatePaymentOfferPreview } from './paymentOffers.service';

const installment = {
  id: 'installment',
  dueDate: '2026-08-10',
  amount: 1300,
  scheduledPrincipal: 1000,
  scheduledInterest: 300,
  principalRemaining: 1000,
  interestRemaining: 300,
  lateFeeAccrued: 20,
  paidTotal: 0,
  paidPrincipal: 0,
  paidInterest: 0,
  paidLateFee: 0,
  status: LoanStatus.PENDING,
} as Installment;

const loan = {
  id: 'loan',
  billingCycle: 'MONTHLY',
  principal: 1000,
  totalToReceive: 1300,
  interestRate: 30,
  finePercent: 2,
  dailyInterestPercent: 1,
  installments: [installment],
  status: LoanStatus.ATIVO,
} as Loan;

test('interest-renewal offer charges interest and fees without principal', () => {
  const preview = calculatePaymentOfferPreview(loan, installment, {
    offerType: 'INTEREST_RENEWAL',
    discountMode: 'NONE',
    discount: 0,
    waiveFine: false,
    waiveDailyInterest: false,
  });

  assert.equal(preview.finalAmount, 320);
  assert.equal(installment.principalRemaining, 1000);
});

test('settlement offer continues to include the principal', () => {
  const preview = calculatePaymentOfferPreview(loan, installment, {
    offerType: 'SETTLEMENT',
    discountMode: 'NONE',
    discount: 0,
    waiveFine: false,
    waiveDailyInterest: false,
  });

  assert.equal(preview.finalAmount, 1320);
});

test('interest-renewal offer does not create a zero-value condition', () => {
  const preview = calculatePaymentOfferPreview(loan, {
    ...installment,
    interestRemaining: 0,
    lateFeeAccrued: 0,
  }, {
    offerType: 'INTEREST_RENEWAL',
    discountMode: 'NONE',
    discount: 0,
    waiveFine: false,
    waiveDailyInterest: false,
  });

  assert.equal(preview.finalAmount, 0);
});
