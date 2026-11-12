import assert from 'node:assert/strict';
import test from 'node:test';
import type { Loan } from '../../types';
import { currentManausDateISO, resolveBillingNotificationInstallments } from '../../domain/finance/billingNotificationSchedule';

const baseLoan = {
  id: 'loan-1',
  status: 'EM_ACORDO',
  isArchived: false,
  debtorName: 'Cliente com acordo',
  installments: [
    { id: 'old-2026-11-11', dueDate: '2026-11-11', status: 'PENDING', principalRemaining: 100, interestRemaining: 0, lateFeeAccrued: 0 },
    { id: 'old-2026-11-18', dueDate: '2026-11-18', status: 'PENDING', principalRemaining: 100, interestRemaining: 0, lateFeeAccrued: 0 },
  ],
  activeAgreement: {
    id: 'agreement-1',
    status: 'ACTIVE',
    installments: [
      { id: 'paid-2026-10-17', agreementId: 'agreement-1', dueDate: '2026-10-17', amount: 400, paidAmount: 400, status: 'PAGO' },
      { id: 'due-2026-11-17', agreementId: 'agreement-1', dueDate: '2026-11-17', amount: 400, paidAmount: 0, status: 'PENDING' },
      { id: 'due-2026-12-17', agreementId: 'agreement-1', dueDate: '2026-12-17', amount: 400, paidAmount: 0, status: 'PENDING' },
    ],
  },
} as unknown as Loan;

test('Gracileide case: active agreement replaces old 11/11 schedule with 17/11 and R$400', () => {
  const schedule = resolveBillingNotificationInstallments(baseLoan);
  assert.deepEqual(schedule.map((i) => [i.id, i.dueDate, i.openAmount, i.source]), [
    ['due-2026-11-17', '2026-11-17', 400, 'AGREEMENT'],
    ['due-2026-12-17', '2026-12-17', 400, 'AGREEMENT'],
  ]);
  assert.equal(schedule.some((i) => i.id === 'old-2026-11-11'), false);
});

test('never fall back to original installments while active agreement schedule is not loaded', () => {
  const loan = { ...baseLoan, activeAgreement: { id: 'agreement-1', status: 'ACTIVE' } } as Loan;
  assert.deepEqual(resolveBillingNotificationInstallments(loan), []);
});

test('broken/cancelled agreement restores original schedule', () => {
  const loan = { ...baseLoan, activeAgreement: { ...baseLoan.activeAgreement!, status: 'BROKEN' } } as Loan;
  assert.deepEqual(resolveBillingNotificationInstallments(loan).map((i) => i.id), ['old-2026-11-11', 'old-2026-11-18']);
});

test('normal loan without agreement keeps the original schedule', () => {
  const loan = { ...baseLoan, status: 'ATIVO', activeAgreement: undefined } as unknown as Loan;
  assert.deepEqual(resolveBillingNotificationInstallments(loan).map((i) => i.source), ['LOAN', 'LOAN']);
});

test('paid, zero balance, archived and malformed amounts never generate overdue alerts', () => {
  const loan = {
    ...baseLoan,
    activeAgreement: {
      ...baseLoan.activeAgreement!,
      installments: [
        { id: 'zero', agreementId: 'agreement-1', dueDate: '2026-11-11', amount: 100, paidAmount: 100, status: 'PENDING' },
        { id: 'bad', agreementId: 'agreement-1', dueDate: '2026-11-11', amount: Number.NaN, paidAmount: 0, status: 'PENDING' },
        { id: 'partial', agreementId: 'agreement-1', dueDate: '2026-11-17', amount: 400, paidAmount: 300, status: 'PARTIAL' },
      ],
    },
  } as Loan;
  assert.deepEqual(resolveBillingNotificationInstallments(loan).map((i) => i.openAmount), [100]);
  assert.deepEqual(resolveBillingNotificationInstallments({ ...loan, isArchived: true }), []);
});

test('Manaus business date does not roll to next day at 23h local', () => {
  assert.equal(currentManausDateISO(new Date('2026-11-12T03:30:00Z')), '2026-11-11');
  assert.equal(currentManausDateISO(new Date('2026-11-12T04:30:00Z')), '2026-11-12');
});

test('graceful empty contract avoids false notifications', () => {
  assert.deepEqual(resolveBillingNotificationInstallments(undefined), []);
  assert.deepEqual(resolveBillingNotificationInstallments({ ...baseLoan, activeAgreement: { ...baseLoan.activeAgreement!, installments: [] } }), []);
});
