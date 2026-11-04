import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCardExpenseNotes,
  formatInstallmentBadgeLabel,
  resolveCardInstallmentPlan,
} from '../../features/wallet/utils/cardInstallmentPlan';

test('compra em andamento (ex: iniciar na parcela 3 de 4 pelo valor da parcela) calcula apenas as parcelas restantes', () => {
  const plan = resolveCardInstallmentPlan({
    inputAmount: 150,
    amountMode: 'INSTALLMENT',
    startInstallment: 3,
    totalInstallments: 4,
  });

  assert.equal(plan.startInstallment, 3);
  assert.equal(plan.totalInstallments, 4);
  assert.equal(plan.remainingInstallments, 2);
  assert.equal(plan.perInstallmentAmount, 150);
  assert.equal(plan.remainingTotalAmount, 300);
  assert.equal(plan.originalTotalAmount, 600);
  assert.equal(plan.isMidStream, true);
  assert.equal(plan.notesTag, '[PARC_INICIAL:3/4]');

  const notes = buildCardExpenseNotes('Compra X', plan);
  assert.equal(notes, 'Compra X [PARC_INICIAL:3/4]');

  // A 1ª parcela gerada no banco (installment_number = 1) exibe 3/4
  assert.equal(
    formatInstallmentBadgeLabel(
      { installment_count: 2, notes },
      { installment_number: 1 },
    ),
    '3/4',
  );
  // A 2ª parcela gerada no banco (installment_number = 2) exibe 4/4
  assert.equal(
    formatInstallmentBadgeLabel(
      { installment_count: 2, notes },
      { installment_number: 2 },
    ),
    '4/4',
  );
});

test('compra em andamento (iniciar na parcela 3 de 4 pelo valor total original) calcula parcela e saldo restante', () => {
  const plan = resolveCardInstallmentPlan({
    inputAmount: 600,
    amountMode: 'TOTAL',
    startInstallment: 3,
    totalInstallments: 4,
  });

  assert.equal(plan.remainingInstallments, 2);
  assert.equal(plan.perInstallmentAmount, 150);
  assert.equal(plan.remainingTotalAmount, 300);
  assert.equal(plan.originalTotalAmount, 600);
});

test('compra nova parcelada (iniciar em 1 de 5) gera todas as 5 parcelas sem tag de deslocamento', () => {
  const plan = resolveCardInstallmentPlan({
    inputAmount: 100,
    amountMode: 'INSTALLMENT',
    startInstallment: 1,
    totalInstallments: 5,
  });

  assert.equal(plan.remainingInstallments, 5);
  assert.equal(plan.perInstallmentAmount, 100);
  assert.equal(plan.remainingTotalAmount, 500);
  assert.equal(plan.isMidStream, false);
  assert.equal(plan.notesTag, null);

  assert.equal(
    formatInstallmentBadgeLabel(
      { installment_count: 5, notes: null },
      { installment_number: 3 },
    ),
    '3/5',
  );
});

