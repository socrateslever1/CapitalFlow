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
  resolveManualInvoiceMonth,
  stepInvoiceMonth,
} from '../../features/wallet/utils/minhasFinancasWalletTools';
import { resolveFirstInstallmentMonthLabel } from '../../components/wallet/QuickExpenseModal';

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
  assert.match(warningClosed.message, /fatura selecionada .{0,12}fechou/i);
  assert.match(warningClosed.message, /compra nova, selecione a pr.xima fatura/i);
  assert.doesNotMatch(warningClosed.message, /2026|24\/01|mar de/);

  const warningOverdue = checkClosedOrPaidInvoiceWarning({
    dueMonth: '2026-11-01', closingDay: 2, dueDay: 10, todayIso: '2026-11-12',
  });
  assert.equal(warningOverdue.state, 'OVERDUE');
  assert.match(warningOverdue.message, /fatura selecionada .{0,12}venceu/i);

  const warningPaid = checkClosedOrPaidInvoiceWarning({
    dueMonth: '2026-11-01', closingDay: 2, dueDay: 10, paid: true, todayIso: '2026-11-12',
  });
  assert.equal(warningPaid.state, 'PAID');
  assert.match(warningPaid.message, /fatura selecionada .{0,12}paga/i);

  const historicalPurchase = checkClosedOrPaidInvoiceWarning({
    dueMonth: '2026-05-01', closingDay: 24, dueDay: 3,
    expenseDate: '2026-03-29', todayIso: '2026-11-19',
  });
  assert.equal(historicalPurchase.state, 'OVERDUE');
  assert.equal(historicalPurchase.shouldWarn, true);
  assert.equal(historicalPurchase.nextOpenDueMonth, '2026-12-01');
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


test('conferência manual aceita mês de primeira fatura sem criar ciclos fictícios', () => {
  assert.equal(resolveInvoiceMonthSelection(null, [], null, '2026-11-11'), null);
  assert.equal(resolveManualInvoiceMonth(null, '2026-12-01'), '2026-12-01');
  assert.equal(resolveManualInvoiceMonth('2026-12', null), '2026-12-01');
  assert.equal(resolveManualInvoiceMonth('2026-11', '2026-12-01'), '2026-11-01');
  assert.equal(resolveManualInvoiceMonth('2026-13', null), null);
  assert.equal(resolveManualInvoiceMonth('2026-12-05', null), null);
  assert.equal(resolveManualInvoiceMonth('', null), null);
  assert.equal(resolveManualInvoiceMonth('0000-12', null), null);
});

test('fatura atual tem prioridade sobre a primeira fatura vencida ao iniciar a carteira e em lançamentos antigos', () => {
  const cycles = [
    { dueMonth: '2026-01-01', amount: 247.72 },
    { dueMonth: '2026-08-01', amount: 247.72 },
    { dueMonth: '2026-12-01', amount: 246.04 },
    { dueMonth: '2027-01-01', amount: 193.55 },
  ];
  assert.equal(resolveInvoiceMonthSelection(null, cycles, '2026-12-01', '2026-11-19'), '2026-12-01');

  const withoutCurrentYet = [
    { dueMonth: '2026-01-01', amount: 247.72 },
    { dueMonth: '2026-08-01', amount: 247.72 },
    { dueMonth: '2027-01-01', amount: 193.55 },
  ];
  assert.equal(resolveInvoiceMonthSelection(null, withoutCurrentYet, '2026-12-01', '2026-11-19'), '2027-01-01');

  // Compra antiga parcelada lançada em novembro (fatura aberta que fecha 24/11 e vence 03/12) inicia em 2026-12-01, nunca no passado
  assert.equal(
    resolveFirstInstallmentMonthLabel('2026-03-29', 24, 3, null, '2026-11-19').dueDateIso,
    '2026-12-01',
  );
  // Variação de ciclo: cartão que fecha dia 25/11 e vence dia 28/11 (mesmo mês)
  assert.equal(
    resolveFirstInstallmentMonthLabel('2026-03-29', 25, 28, null, '2026-11-19').dueDateIso,
    '2026-11-01',
  );
  // Variação de ciclo: cartão que já fechou em 10/11 (vence 20/11), próxima fatura aberta vence em 20/12
  assert.equal(
    resolveFirstInstallmentMonthLabel('2026-03-29', 10, 20, null, '2026-11-19').dueDateIso,
    '2026-12-01',
  );
});
