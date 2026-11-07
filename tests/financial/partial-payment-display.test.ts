import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import type { Installment, Loan } from '../../types';
import { getDisplayedInstallmentDebt, getDisplayedLoanBalance, isRecordedPartialMonthlyInstallment } from '../../domain/finance/displayedBalance';
import { translateTransactionType } from '../../utils/translationHelpers';

const inst = (changes: Partial<Installment> = {}): Installment => ({
  id: 'inst-1', dueDate: '2026-03-15', amount: 169,
  principalRemaining: 130, interestRemaining: 0, lateFeeAccrued: 206.43,
  paidTotal: 250, paidPrincipal: 0, paidInterest: 39, paidLateFee: 211,
  scheduledPrincipal: 130, scheduledInterest: 39, status: 'PARTIAL' as Installment['status'],
  ...changes,
});
const loan = (installments: Installment[], changes: Partial<Loan> = {}): Loan => ({
  id: 'loan-1', billingCycle: 'MONTHLY', principal: 130,
  interestRate: 30, finePercent: 2, dailyInterestPercent: 1,
  policiesSnapshot: {finePercent:2,interestRate:30,dailyInterestPercent:1},
  installments, ledger: [],
  status: 'ATIVO',
  ...changes,
} as unknown as Loan);

test('receipt of 250 is recognized; after payment the snapshot is R$ 336,43, not recomputed from due date',()=>{
  const i=inst();
  const l=loan([i]);
  assert.equal(isRecordedPartialMonthlyInstallment(l,i),true);
  const {debt,recorded}=getDisplayedInstallmentDebt(l,i);
  assert.equal(recorded,true);
  assert.deepEqual([debt.principal,debt.interest,debt.lateFee,debt.total],[130,0,206.43,336.43]);
  assert.deepEqual(getDisplayedLoanBalance(l),{
    principalRemaining:130, interestRemaining:0,lateFeeRemaining:206.43,totalRemaining:336.43
  });
});

test('unpaid monthly installments retain existing estimate and are not mistaken for paid receipts',()=>{
  const i=inst({paidTotal:0,paidInterest:0,paidLateFee:0,interestRemaining:39,lateFeeAccrued:0});
  const l=loan([i]);
  const {recorded,debt}=getDisplayedInstallmentDebt(l,i);
  assert.equal(recorded,false);
  assert.equal(debt.total,getDisplayedLoanBalance(l).totalRemaining);
});

test('does not alter agreement or other contract modalities',()=>{
  const i=inst();
  assert.equal(isRecordedPartialMonthlyInstallment(loan([i],{billingCycle:'WEEKLY'}),i),false);
  assert.equal(isRecordedPartialMonthlyInstallment(loan([i],{activeAgreement:{
    id:'agreement-1',status:'ACTIVE',installments:[],loanId:'loan-1'
  } as Loan['activeAgreement']}),i),false);
});

test('guard: no invalid or undocumented balance can be presented as post-payment snapshot',()=>{
  const i=inst({principalRemaining:NaN,lateFeeAccrued:-1});
  const l=loan([i]);
  assert.equal(isRecordedPartialMonthlyInstallment(l,i),false);
});

test('ledger translates financial event codes with pt-BR fallback',()=>{
  assert.equal(translateTransactionType('PAYMENT_RECEIVED'),'Recebimento registrado');
  assert.equal(translateTransactionType('PARTIAL_RENEWAL'),'Renovação parcial');
  assert.equal(translateTransactionType('PROFIT_WITHDRAWAL'),'Retirada de lucro');
  assert.equal(translateTransactionType('UNKNOWN_INTERNAL_EVENT'),'Movimentação registrada');
});

test('contract and installments use the same reconciled display function, not an unadjusted cycle estimate',()=>{
  const header=readFileSync('components/cards/LoanCardComposition/Header.tsx','utf8');
  const hook=readFileSync('components/cards/hooks/useLoanCardComputed.ts','utf8');
  const grid=readFileSync('components/cards/components/InstallmentGrid.logic.ts','utf8');
  const card=readFileSync('components/cards/components/InstallmentCard.tsx','utf8');
  assert.match(header,/getDisplayedLoanBalance/);
  assert.match(hook,/getDisplayedLoanBalance/);
  assert.match(grid,/getDisplayedInstallmentDebt/);
  assert.match(card,/Saldo registrado após o último recebimento/);
});
