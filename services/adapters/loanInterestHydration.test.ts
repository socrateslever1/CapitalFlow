import test from 'node:test';
import assert from 'node:assert/strict';
import { mapLoanFromDB as mapLoanFromLegacyDB } from './dbAdapters';
import { mapLoanFromDB as mapPortalLoanFromDB } from './loanAdapter';

test('hydrates loan interest from legacy fields when canonical interest_rate is zero', () => {
  const rawLoan = {
    id: 'loan-1',
    owner_id: 'owner-1',
    client_id: 'client-1',
    debtor_name: 'Cliente Teste',
    principal: 1000,
    interest_rate: 0,
    juros_mensal_percent: 30,
    fine_percent: 0,
    multa_percent: 2,
    daily_interest_percent: 0,
    mora_diaria_percent: 1,
    policies_snapshot: {
      interestRate: 30,
      finePercent: 2,
      dailyInterestPercent: 1,
    },
    billing_cycle: 'MONTHLY',
    status: 'ATIVO',
    parcelas: [],
    transacoes: [],
  };

  const loan = mapLoanFromLegacyDB(rawLoan);

  assert.equal(loan.interestRate, 30);
  assert.equal(loan.finePercent, 2);
  assert.equal(loan.dailyInterestPercent, 1);
});

test('hydrates portal loan interest from snapshot when database fields are zero', () => {
  const loan = mapPortalLoanFromDB({
    id: 'loan-portal-1',
    client_id: 'client-1',
    debtor_name: 'Cliente Portal',
    principal: 1000,
    interest_rate: 0,
    fine_percent: 0,
    daily_interest_percent: 0,
    policies_snapshot: {
      interestRate: 30,
      finePercent: 2,
      dailyInterestPercent: 1,
    },
    billing_cycle: 'MONTHLY',
    status: 'ATIVO',
  }, []);

  assert.equal(loan.interestRate, 30);
  assert.equal(loan.finePercent, 2);
  assert.equal(loan.dailyInterestPercent, 1);
});
