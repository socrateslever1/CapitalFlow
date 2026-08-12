import test from 'node:test';
import assert from 'node:assert/strict';
import { Loan, LoanStatus } from '../types';
import { loanEngine } from '../domain/loanEngine';
import { resolveLoanVisualClassification } from './loanFilterResolver';
import {
  getInstallmentOpenAmount,
  getInstallmentPaidAmount,
  isInstallmentOpen,
} from './loanStatus';
import { toISODateOnlyUTC } from './dateHelpers';

const dateFromToday = (days: number) => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return toISODateOnlyUTC(date);
};

test('paid installment is closed even when legacy balance fields retain values', () => {
  const installment = {
    status: LoanStatus.PAID,
    amount: 492.79,
    principalRemaining: 400,
    interestRemaining: 92.79,
    lateFeeAccrued: 0,
    paidTotal: 492.79,
  };

  assert.equal(getInstallmentOpenAmount(installment), 0);
  assert.equal(isInstallmentOpen(installment), false);
  assert.equal(getInstallmentPaidAmount(installment), 492.79);
});

test('paid legacy installment displays its nominal amount when paid accumulators are absent', () => {
  assert.equal(getInstallmentPaidAmount({
    status: LoanStatus.PAID,
    amount: 492.79,
    paidTotal: 0,
    paidAmount: 0,
  }), 492.79);
});

test('old paid installment cannot make a contract overdue when the open installment is future', () => {
  const loan = {
    id: 'loan-test',
    principal: 200,
    totalToReceive: 200,
    interestRate: 0,
    finePercent: 0,
    dailyInterestPercent: 0,
    billingCycle: 'INSTALLMENT_FIXED',
    status: LoanStatus.ATIVO,
    installments: [
      {
        id: 'paid-old',
        number: 1,
        dueDate: dateFromToday(-38),
        amount: 100,
        scheduledPrincipal: 100,
        scheduledInterest: 0,
        principalRemaining: 100,
        interestRemaining: 0,
        lateFeeAccrued: 0,
        paidPrincipal: 100,
        paidInterest: 0,
        paidLateFee: 0,
        paidTotal: 100,
        status: LoanStatus.PAID,
      },
      {
        id: 'pending-future',
        number: 2,
        dueDate: dateFromToday(20),
        amount: 100,
        scheduledPrincipal: 100,
        scheduledInterest: 0,
        principalRemaining: 100,
        interestRemaining: 0,
        lateFeeAccrued: 0,
        paidPrincipal: 0,
        paidInterest: 0,
        paidLateFee: 0,
        paidTotal: 0,
        status: LoanStatus.PENDING,
      },
    ],
    ledger: [{
      id: 'payment-1',
      date: dateFromToday(-38),
      type: 'PAYMENT_FULL',
      amount: 100,
      principalDelta: 100,
      interestDelta: 0,
      lateFeeDelta: 0,
      installmentId: 'paid-old',
    }],
  } as Loan;

  assert.equal(loanEngine.computeLoanStatus(loan), 'ACTIVE');
  assert.equal(loanEngine.computeRemainingBalance(loan).totalRemaining, 100);
  assert.equal(resolveLoanVisualClassification(loan), 'EM_DIA');
});
