import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCardExpenseNotes,
  formatInstallmentBadgeLabel,
  parseInstallmentTag,
  resolveCardInstallmentPlan,
} from '../../features/wallet/utils/cardInstallmentPlan';
import {
  calculateBalanceAdjustment,
  calculateInstallmentAdvancement,
  checkClosedOrPaidInvoiceWarning,
  describeCardCycleDates,
  getQuickDateTag,
  resolveQuickDateShortcuts,
  resolveInvoiceMonthSelection,
  stepInvoiceMonth,
} from '../../features/wallet/utils/minhasFinancasWalletTools';

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

test('parseInstallmentTag extrai parcela inicial e total das notas quando presente', () => {
  assert.deepEqual(
    parseInstallmentTag({ installment_count: 2, notes: 'Notebook [PARC_INICIAL:3/4]' }),
    { startInstallment: 3, totalInstallments: 4 },
  );
  assert.deepEqual(
    parseInstallmentTag({ installment_count: 6, notes: null }),
    { startInstallment: 1, totalInstallments: 6 },
  );
});

test('atalhos de data rápida (Hoje e Ontem) e navegação de ciclo de fatura (< Mês/Ano >)', () => {
  const shortcuts = resolveQuickDateShortcuts('2026-11-04');
  assert.equal(shortcuts.today, '2026-11-04');
  assert.equal(shortcuts.yesterday, '2026-11-03');
  assert.equal(getQuickDateTag('2026-11-04', '2026-11-04'), 'TODAY');
  assert.equal(getQuickDateTag('2026-11-03', '2026-11-04'), 'YESTERDAY');
  assert.equal(getQuickDateTag('2026-11-01', '2026-11-04'), 'OTHER');

  assert.equal(stepInvoiceMonth('2026-11-01', 1).dueMonthIso, '2026-12-01');
  assert.equal(stepInvoiceMonth('2026-12-01', 1).dueMonthIso, '2027-01-01');
  assert.equal(stepInvoiceMonth('2026-01-01', -1).dueMonthIso, '2025-12-01');
});

test('describeCardCycleDates e checkClosedOrPaidInvoiceWarning alertam faturas fechadas e melhor dia de compra', () => {
  const insight = describeCardCycleDates({
    dueMonth: '2026-11-01',
    closingDay: 5,
    dueDay: 12,
    todayIso: '2026-11-04',
  });
  assert.equal(insight.bestPurchaseDay, 5);
  assert.equal(insight.daysUntilClosing, 1);
  assert.equal(insight.daysUntilDue, 8);
  assert.match(insight.statusSummary, /Fecha amanhã/);

  const warningClosed = checkClosedOrPaidInvoiceWarning({
    dueMonth: '2026-11-01',
    closingDay: 2,
    dueDay: 10,
    todayIso: '2026-11-04',
  });
  assert.equal(warningClosed.shouldWarn, true);
  assert.equal(warningClosed.nextOpenDueMonth, '2026-12-01');
});

test('calculateBalanceAdjustment calcula diferença exata (receita ou despesa de ajuste)', () => {
  const inc = calculateBalanceAdjustment(1000, 1250.5);
  assert.equal(inc.kind, 'INCREASE');
  assert.equal(inc.absDelta, 250.5);
  assert.equal(inc.accountOperationType, 'INCOME');

  const dec = calculateBalanceAdjustment(1000, 820.25);
  assert.equal(dec.kind, 'DECREASE');
  assert.equal(dec.absDelta, 179.75);
  assert.equal(dec.accountOperationType, 'EXPENSE');

  const none = calculateBalanceAdjustment(500, 500);
  assert.equal(none.kind, 'NONE');
  assert.equal(none.absDelta, 0);
});

test('calculateInstallmentAdvancement calcula parcelas futuras antecipadas com desconto opcional', () => {
  const result = calculateInstallmentAdvancement({
    expense: { id: 'exp-1', description: 'TV OLED', installment_count: 4 } as any,
    allInstallments: [
      { id: 'i1', expense_id: 'exp-1', installment_number: 1, due_month: '2026-11-01', amount: 500, status: 'PENDING' },
      { id: 'i2', expense_id: 'exp-1', installment_number: 2, due_month: '2026-12-01', amount: 500, status: 'PENDING' },
      { id: 'i3', expense_id: 'exp-1', installment_number: 3, due_month: '2027-01-01', amount: 500, status: 'PENDING' },
      { id: 'i4', expense_id: 'exp-1', installment_number: 4, due_month: '2027-02-01', amount: 500, status: 'PENDING' },
    ] as any,
    currentDueMonth: '2026-11-01',
    countToAdvance: 2,
    discountAmount: 25,
  });

  assert.equal(result.selectedInstallments.length, 2);
  assert.equal(result.remainingTailInstallments.length, 1);
  assert.equal(result.advancedSum, 1000);
  assert.equal(result.discountAmount, 25);
  assert.equal(result.netAdvancedAmount, 975);
});



test('seletor de faturas nunca apresenta um mês diferente do vencimento exibido no cabeçalho', () => {
  const cycles = [
    { dueMonth: '2026-11-01', amount: 1200 },
    { dueMonth: '2026-12-01', amount: 0 },
  ];
  assert.equal(resolveInvoiceMonthSelection('2026-07-01', cycles, null, '2026-11-04'), '2026-11-01');
  assert.equal(resolveInvoiceMonthSelection(null, cycles, '2026-07-01', '2026-11-04'), '2026-11-01');
  assert.equal(resolveInvoiceMonthSelection('2026-12-01', cycles, '2026-11-01', '2026-11-04'), '2026-12-01');
  assert.equal(resolveInvoiceMonthSelection(null, cycles, '2026-11-01', '2026-11-04'), '2026-11-01');
  assert.equal(resolveInvoiceMonthSelection('2026-11-01', [], null, '2026-11-04'), null);
});

test('seletor de faturas escolhe um vencimento válido sem fabricar novos ciclos', () => {
  const cycles = [
    { dueMonth: '2026-10-01', amount: 0 },
    { dueMonth: '2026-12-01', amount: 200 },
    { dueMonth: '2027-01-01', amount: 0 },
  ];
  assert.equal(resolveInvoiceMonthSelection('2025-01-01', cycles, null, '2026-11-04'), '2026-12-01');
  assert.equal(resolveInvoiceMonthSelection(null, [
    { dueMonth: '2026-10-01', amount: 0 }, { dueMonth: '2026-11-01', amount: 0 },
  ], null, '2026-11-04'), '2026-11-01');
});
