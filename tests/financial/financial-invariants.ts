import assert from 'node:assert/strict';
import {
  allocatePaymentFromBuckets,
  isInstallmentPaid,
  ZERO_BALANCE_THRESHOLD,
} from '../../domain/finance/calculations';

import { calculateMonthlyInstallments } from '../../features/loans/modalities/monthly/monthly.calculations';
import { addDaysUTC, toISODateOnlyUTC } from '../../utils/dateHelpers';
import { mapFormToLoan } from '../../features/loans/domain/loanForm.mapper';

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

console.log('Suite financeira concluída com sucesso.');
