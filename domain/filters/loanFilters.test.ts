import test from 'node:test';
import assert from 'node:assert/strict';
import { Loan, LoanStatus } from '../../types';
import { filterLoans } from './loanFilters';

const dateFromToday = (days: number) => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const agreementLoan = (status: string, agreementStatus = 'ATIVO') => ({
  id: 'loan-agreement',
  debtorName: 'Cliente em acordo',
  principal: 500,
  totalToReceive: 650,
  interestRate: 30,
  finePercent: 0,
  dailyInterestPercent: 0,
  billingCycle: 'MONTHLY',
  status,
  installments: [{
    id: 'original-installment',
    dueDate: dateFromToday(-60),
    amount: 500,
    principalRemaining: 0,
    interestRemaining: 0,
    lateFeeAccrued: 0,
    paidTotal: 500,
    status: LoanStatus.PAID,
  }],
  activeAgreement: {
    id: 'agreement-1',
    status: agreementStatus,
    installments: [{
      id: 'agreement-installment',
      dueDate: dateFromToday(-40),
      amount: 130,
      principalRemaining: 130,
      interestRemaining: 0,
      lateFeeAccrued: 0,
      paidTotal: 0,
      status: LoanStatus.PENDING,
    }],
  },
  ledger: [],
} as unknown as Loan);

test('shows an overdue active agreement in both renegotiated and overdue tabs', () => {
  const loan = agreementLoan('EM_ACORDO');

  assert.equal(filterLoans([loan], '', 'RENEGOCIADO').length, 1);
  assert.equal(filterLoans([loan], '', 'ATRASO_CRITICO').length, 1);
  assert.equal(filterLoans([loan], '', 'TODOS').length, 1);
});

test('does not classify a finalized agreement as renegotiated', () => {
  const loan = agreementLoan('PAGO', 'FINALIZADO');

  assert.equal(filterLoans([loan], '', 'RENEGOCIADO').length, 0);
  assert.equal(filterLoans([loan], '', 'PAGOS').length, 1);
});

test('does not treat a legacy renegotiated status without agreement as active renegotiation', () => {
  const loan = {
    ...agreementLoan('RENEGOCIADO'),
    id: 'legacy-renegotiated',
    activeAgreement: undefined,
    installments: [{
      id: 'legacy-installment',
      dueDate: dateFromToday(-40),
      amount: 390,
      principalRemaining: 300,
      interestRemaining: 90,
      lateFeeAccrued: 0,
      paidTotal: 0,
      status: LoanStatus.LATE,
    }],
  } as Loan;

  assert.equal(filterLoans([loan], '', 'RENEGOCIADO').length, 0);
  assert.equal(filterLoans([loan], '', 'ATRASO_CRITICO').length, 1);
});
