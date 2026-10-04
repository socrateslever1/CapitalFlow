import test from 'node:test';
import assert from 'node:assert/strict';
import { mapLoanFromDB as mapLoanFromLegacyDB } from './dbAdapters';
import { mapLoanFromDB as mapPortalLoanFromDB } from './loanAdapter';
import { resolveLoanVisualClassification } from '../../utils/loanFilterResolver';

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

test('keeps an active agreement visible when the original installment is paid', () => {
  const loan = mapLoanFromLegacyDB({
    id: '0ac87167-5543-4cf1-babd-a3eee1b751f0',
    owner_id: 'owner-1',
    client_id: 'client-1',
    debtor_name: 'Cliente em acordo',
    principal: 500,
    total_to_receive: 650,
    billing_cycle: 'MONTHLY',
    status: 'EM_ACORDO',
    parcelas: [{
      id: 'original-1',
      status: 'PAGO',
      principal_remaining: 0,
      interest_remaining: 0,
      late_fee_accrued: 0,
    }],
    transacoes: [],
    acordos_inadimplencia: [{
      id: 'agreement-1',
      loan_id: '0ac87167-5543-4cf1-babd-a3eee1b751f0',
      status: 'ATIVO',
      total_negociado: 1170,
      num_parcelas: 9,
      acordo_parcelas: [
        { id: 'agreement-1-1', numero: 1, valor: 130, valor_pago: 130, status: 'PAGO', data_vencimento: '2026-04-05' },
        { id: 'agreement-1-6', numero: 6, valor: 130, valor_pago: 0, status: 'PENDENTE', data_vencimento: '2026-09-02' },
        { id: 'agreement-1-7', numero: 7, valor: 130, valor_pago: 0, status: 'PENDENTE', data_vencimento: '2026-10-02' },
      ],
    }],
  });

  assert.equal(loan.activeAgreement?.status, 'ACTIVE');
  assert.equal(resolveLoanVisualClassification(loan), 'CRITICO');
});

test('does not hide a legacy renegotiated contract without an agreement', () => {
  const loan = mapLoanFromLegacyDB({
    id: 'legacy-renegotiated',
    owner_id: 'owner-1',
    client_id: 'client-1',
    debtor_name: 'Contrato legado',
    principal: 300,
    total_to_receive: 390,
    billing_cycle: 'MONTHLY',
    status: 'RENEGOCIADO',
    parcelas: [{
      id: 'legacy-1',
      data_vencimento: '2026-09-01',
      status: 'LATE',
      valor_parcela: 390,
      principal_remaining: 300,
      interest_remaining: 90,
      late_fee_accrued: 0,
    }],
    transacoes: [],
  });

  assert.equal(resolveLoanVisualClassification(loan), 'CRITICO');
});
