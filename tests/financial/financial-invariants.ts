import assert from 'node:assert/strict';
import {
  allocatePaymentFromBuckets,
  isInstallmentPaid,
  ZERO_BALANCE_THRESHOLD,
} from '../../domain/finance/calculations';

import { calculateMonthlyInstallments } from '../../features/loans/modalities/monthly/monthly.calculations';
import { addDaysUTC, toISODateOnlyUTC } from '../../utils/dateHelpers';
import { mapFormToLoan } from '../../features/loans/domain/loanForm.mapper';
import { planPaymentRenewal } from '../../services/payments/paymentRenewalPlan';
import { buildInstallmentReceiptModel } from '../../components/cards/components/InstallmentReceiptModel';

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const assertMoney = (actual: number, expected: number, message: string) => {
  assert.equal(money(actual), money(expected), `${message}: esperado ${money(expected)}, obtido ${money(actual)}`);
};

const run = (name: string, fn: () => void) => {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
};

run('pagamento parcial prioriza juros sem amortizar principal', () => {
  const result = allocatePaymentFromBuckets({
    paymentAmount: 800,
    principal: 3450,
    interest: 1035,
    lateFee: 0,
  });

  assertMoney(result.paidInterest, 800, 'juros pagos');
  assertMoney(result.paidLateFee, 0, 'multa paga');
  assertMoney(result.paidPrincipal, 0, 'principal pago');
  assertMoney(result.remainingAfterPayment, 3685, 'saldo restante');
  assertMoney(result.avGenerated, 0, 'excedente');
});

run('pagamento acima dos juros amortiza somente o excedente no principal', () => {
  const result = allocatePaymentFromBuckets({
    paymentAmount: 1285,
    principal: 3450,
    interest: 1035,
    lateFee: 0,
  });

  assertMoney(result.paidInterest, 1035, 'juros pagos');
  assertMoney(result.paidPrincipal, 250, 'principal pago');
  assertMoney(result.remainingAfterPayment, 3200, 'saldo restante');
});

run('pagamento total conserva centavos e não cria saldo', () => {
  const result = allocatePaymentFromBuckets({
    paymentAmount: 4485,
    principal: 3450,
    interest: 1035,
    lateFee: 0,
  });

  assertMoney(result.paidInterest + result.paidLateFee + result.paidPrincipal, 4485, 'total distribuído');
  assertMoney(result.remainingAfterPayment, 0, 'saldo restante');
  assertMoney(result.avGenerated, 0, 'excedente');
});

run('excedente nunca desaparece: vira avGenerated', () => {
  const result = allocatePaymentFromBuckets({
    paymentAmount: 5000,
    principal: 3450,
    interest: 1035,
    lateFee: 0,
  });

  assertMoney(result.paidInterest + result.paidLateFee + result.paidPrincipal + result.avGenerated, 5000, 'conservação do pagamento');
  assertMoney(result.avGenerated, 515, 'excedente');
});

run('conservação monetária em matriz de valores', () => {
  const principals = [0, 0.01, 10, 100, 999.99, 3450];
  const interests = [0, 0.01, 5, 250, 1035];
  const lateFees = [0, 0.01, 3.45, 100];
  const payments = [0.01, 1, 50, 800, 1285, 4485, 6000];

  for (const principal of principals) {
    for (const interest of interests) {
      for (const lateFee of lateFees) {
        for (const paymentAmount of payments) {
          const result = allocatePaymentFromBuckets({ paymentAmount, principal, interest, lateFee });
          const due = money(Math.max(0, principal) + Math.max(0, interest) + Math.max(0, lateFee));
          const distributed = money(result.paidPrincipal + result.paidInterest + result.paidLateFee + result.avGenerated);
          const expectedDistributed = money(Math.max(0, paymentAmount));
          const expectedRemaining = money(Math.max(0, due - Math.min(due, expectedDistributed)));

          assertMoney(distributed, expectedDistributed, 'pagamento deve ser conservado');
          assertMoney(result.remainingAfterPayment, expectedRemaining, 'saldo deve ser conservado');
          assert.ok(result.paidPrincipal >= -ZERO_BALANCE_THRESHOLD);
          assert.ok(result.paidInterest >= -ZERO_BALANCE_THRESHOLD);
          assert.ok(result.paidLateFee >= -ZERO_BALANCE_THRESHOLD);
        }
      }
    }
  }
});

run('parcela com saldo zerado é tratada como quitada', () => {
  assert.equal(isInstallmentPaid({
    status: 'PENDING',
    principalRemaining: 0,
    interestRemaining: 0,
    lateFeeAccrued: 0,
  }), true);
});

run('parcela aberta com saldo positivo não é quitada', () => {
  assert.equal(isInstallmentPaid({
    status: 'PENDING',
    principalRemaining: 492.79,
    interestRemaining: 0,
    lateFeeAccrued: 0,
  }), false);
});

run('vencimento mensal padrão usa 30 dias corridos, inclusive na virada do mês', () => {
  assert.equal(toISODateOnlyUTC(addDaysUTC('2026-09-18', 30)), '2026-10-18');
  assert.equal(toISODateOnlyUTC(addDaysUTC('2026-01-31', 30)), '2026-03-02');
  const result = calculateMonthlyInstallments(1000, 30, '2026-09-18');
  assert.equal(result.installments[0].dueDate, '2026-10-18');
});

run('vencimento manual prevalece em contrato novo e não altera capital ou juros', () => {
  const loan = mapFormToLoan({
    clientId: '', debtorName: 'Teste', debtorPhone: '', debtorDocument: '',
    debtorAddress: '', sourceId: '', principal: '1000', interestRate: '30',
    finePercent: '2', dailyInterestPercent: '1', billingCycle: 'MONTHLY',
    notes: '', guaranteeDescription: '', startDate: '2026-09-18',
    preferredPaymentMethod: 'PIX',
  } as any, '30', null, [], [], [], '00000000-0000-4000-8000-000000000001', '2026-10-14');
  assert.equal(loan.installments[0].dueDate, '2026-10-14');
  assertMoney(loan.installments[0].principalRemaining, 1000, 'principal preservado');
  assertMoney(loan.installments[0].interestRemaining, 300, 'juros preservados');
});

run('renovação parcial avança pela data contratual sem somar juros novos', () => {
  const loan = { billingCycle: 'MONTHLY', interestRate: 30, principal: 1000 } as any;
  const inst = { dueDate: '2026-08-20' } as any;
  const balance = { principalRemaining: 1000, interestRemaining: 300, lateFeeRemaining: 40, totalRemaining: 1340 };
  const result = planPaymentRenewal({
    loan, inst, instDb: { data_vencimento: '2026-08-20' },
    balanceAfterRpc: balance, renewWithPending: true, isInterestRenewal: false,
    paymentDate: new Date('2026-09-19T00:00:00Z')
  });
  assert.equal(result.partialRenewalRequested, true);
  assert.equal(result.renewalDate?.toISOString().slice(0, 10), '2026-09-19');
  assertMoney(result.nextCycleInterest, 300, 'juros planejados sem duplicação');
  assertMoney(balance.interestRemaining, 300, 'juros em aberto preservados');
});

run('regularização integral reinicia pela data do pagamento; data manual prevalece', () => {
  const base = {
    loan: { billingCycle: 'MONTHLY', interestRate: 30 } as any,
    inst: { dueDate: '2026-08-20' } as any,
    instDb: { due_date: '2026-08-20' },
    balanceAfterRpc: { principalRemaining: 1000, interestRemaining: 0, lateFeeRemaining: 0, totalRemaining: 1000 },
    renewWithPending: false, isInterestRenewal: true,
    paymentDate: new Date('2026-09-19T00:00:00Z')
  };
  assert.equal(planPaymentRenewal(base).renewalDate?.toISOString().slice(0, 10), '2026-10-19');
  assert.equal(planPaymentRenewal({ ...base, manualDate: new Date('2026-10-05T00:00:00Z') })
    .renewalDate?.toISOString().slice(0, 10), '2026-10-05');
});

run('prévia da janela desconta atraso dispensado sem alterar capital ou juro', () => {
  const preview = buildInstallmentReceiptModel({
    loan: { billingCycle: 'MONTHLY' } as any,
    selectedInst: { dueDate: '2026-09-18', principalRemaining: 1000, interestRemaining: 300, lateFeeAccrued: 40 } as any,
    selectedDebt: { principal: 1000, interest: 300, lateFee: 40, total: 1340 },
    lateFeeForgiven: 20, quickMode: 'CHARGES_ONLY', receiptAmount: ''
  });
  assertMoney(preview.principal, 1000, 'principal intocado');
  assertMoney(preview.interest, 300, 'juros intocados');
  assertMoney(preview.effectiveLateFee, 20, 'encargo remanescente');
  assertMoney(preview.displayedAmount, 320, 'valor de juros e atraso');
});

console.log('Suite financeira concluída com sucesso.');
