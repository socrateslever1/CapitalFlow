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

  assert.equal(preview.finalAmount, 365);
  assert.equal(installment.principalRemaining, 1000);
});

test('interest-renewal offer can waive only the fine', () => {
  const fullCharges = calculatePaymentOfferPreview(loan, installment, {
    offerType: 'INTEREST_RENEWAL', discountMode: 'NONE', discount: 0,
    waiveFine: false, waiveDailyInterest: false,
  });
  const preview = calculatePaymentOfferPreview(loan, installment, {
    offerType: 'INTEREST_RENEWAL',
    discountMode: 'NONE',
    discount: 0,
    waiveFine: true,
    waiveDailyInterest: false,
  });

  assert.equal(preview.finalAmount, fullCharges.finalAmount - fullCharges.fine);
  assert.equal(preview.chargesForgiven, fullCharges.fine);
});

test('interest-renewal offer can waive only daily interest', () => {
  const fullCharges = calculatePaymentOfferPreview(loan, installment, {
    offerType: 'INTEREST_RENEWAL', discountMode: 'NONE', discount: 0,
    waiveFine: false, waiveDailyInterest: false,
  });
  const preview = calculatePaymentOfferPreview(loan, installment, {
    offerType: 'INTEREST_RENEWAL',
    discountMode: 'NONE',
    discount: 0,
    waiveFine: false,
    waiveDailyInterest: true,
  });

  assert.equal(preview.finalAmount, fullCharges.finalAmount - fullCharges.dailyInterest);
  assert.equal(preview.chargesForgiven, fullCharges.dailyInterest);
});

test('interest-renewal offer can waive both late charges', () => {
  const preview = calculatePaymentOfferPreview(loan, installment, {
    offerType: 'INTEREST_RENEWAL',
    discountMode: 'NONE',
    discount: 0,
    waiveFine: true,
    waiveDailyInterest: true,
  });

  assert.equal(preview.finalAmount, 300);
  assert.equal(preview.chargesForgiven, 65);
});

test('settlement offer continues to include the principal', () => {
  const preview = calculatePaymentOfferPreview(loan, installment, {
    offerType: 'SETTLEMENT',
    discountMode: 'NONE',
    discount: 0,
    waiveFine: false,
    waiveDailyInterest: false,
  });

  assert.equal(preview.finalAmount, 1365);
});

test('interest-renewal offer still includes overdue charges when current interest is zero', () => {
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

  assert.equal(preview.finalAmount, 65);
});

test('99% on settlement reduces the whole payable balance including unwaived late charges', () => {
  const preview = calculatePaymentOfferPreview(loan, installment, {
    offerType: 'SETTLEMENT', discountMode: 'PERCENT', discount: 99,
    waiveFine: false, waiveDailyInterest: false,
  });
  assert.equal(preview.originalAmount, 1365);
  assert.equal(preview.discountApplied, 1351.35);
  assert.equal(preview.finalAmount, 13.65);
});

test('99% after waiving late charges applies to the reduced payable amount, without duplicating waivers', () => {
  const preview = calculatePaymentOfferPreview(loan, installment, {
    offerType: 'SETTLEMENT', discountMode: 'PERCENT', discount: 99,
    waiveFine: true, waiveDailyInterest: true,
  });
  assert.equal(preview.chargesForgiven, 65);
  assert.equal(preview.discountApplied, 1287);
  assert.equal(preview.finalAmount, 13);
});

test('fixed settlement discount can reduce late charges without creating a negative offer', () => {
  const preview = calculatePaymentOfferPreview(loan, installment, {
    offerType: 'SETTLEMENT', discountMode: 'VALUE', discount: 1340,
    waiveFine: false, waiveDailyInterest: false,
  });
  assert.equal(preview.discountApplied, 1340);
  assert.equal(preview.finalAmount, 25);
});

test('renewal terms ignore additional settlement discounts', () => {
  const preview = calculatePaymentOfferPreview(loan, installment, {
    offerType: 'INTEREST_RENEWAL', discountMode: 'PERCENT', discount: 99,
    waiveFine: false, waiveDailyInterest: false,
  });
  assert.equal(preview.finalAmount, 365);
});
