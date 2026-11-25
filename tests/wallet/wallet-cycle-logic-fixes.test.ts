import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import {
  getCardCreditPosition, getPurchaseInvoiceMonth, getSettledInvoiceMonths,
  resolveInvoiceCycleState, resolvePurchaseInvoiceMonth,
} from '../../components/wallet/invoiceStatementDomain';
import { calculateWalletBalance } from '../../components/wallet/walletBalanceDomain';
import { getCardAvailablePresentation, formatCardAvailableOrigin } from '../../features/wallet/domain/cardAvailablePresentation';
import { resolveFirstInstallmentMonthLabel } from '../../components/wallet/QuickExpenseModal';
import type { PersonalWalletExpense, PersonalWalletExpenseInstallment } from '../../services/personalWallet.service';

// Cartão que fecha dia 21 e vence dia 3 do mês seguinte.
const card21 = { closingDay: 21, dueDay: 3 };

test('compra no dia do fechamento vai para a fatura seguinte', () => {
  assert.equal(getPurchaseInvoiceMonth('2026-11-20', 21, 3), '2026-12-01');
  assert.equal(getPurchaseInvoiceMonth('2026-11-21', 21, 3), '2027-01-01');
  assert.equal(resolveInvoiceCycleState({
    dueMonth: '2026-12-01', ...card21, outstanding: 10, today: '2026-11-21',
  }), 'CLOSED');
  assert.equal(resolveInvoiceCycleState({
    dueMonth: '2026-12-01', ...card21, outstanding: 10, today: '2026-11-20',
  }), 'OPEN');
});

test('compra feita antes do fechamento e lançada depois fica na fatura da data da compra', () => {
  assert.equal(resolvePurchaseInvoiceMonth({ purchaseDate: '2026-11-20', today: '2026-11-25', ...card21 }), '2026-12-01');
  assert.equal(resolveFirstInstallmentMonthLabel('2026-11-20', 21, 3, null, '2026-11-25').dueDateIso, '2026-12-01');
});

test('fatura da compra já paga ou vencida não é reaberta', () => {
  const settled = new Set(['2026-12-01']);
  assert.equal(resolvePurchaseInvoiceMonth({ purchaseDate: '2026-11-20', today: '2026-11-25', ...card21, settledMonths: settled }), '2027-01-01');
  // Vencida em 03/12: lançada em 05/12 vai para a fatura aberta.
  assert.equal(resolvePurchaseInvoiceMonth({ purchaseDate: '2026-11-20', today: '2026-12-05', ...card21 }), '2027-01-01');
  // Parcelado antigo continua entrando na fatura aberta.
  assert.equal(resolvePurchaseInvoiceMonth({ purchaseDate: '2026-03-29', today: '2026-11-19', closingDay: 24, dueDay: 3 }), '2026-12-01');
  // Compra com data futura usa a própria data.
  assert.equal(resolvePurchaseInvoiceMonth({ purchaseDate: '2026-12-10', today: '2026-11-25', ...card21 }), '2027-01-01');
  // Sem dias de fechamento/vencimento: mês corrente.
  assert.equal(resolvePurchaseInvoiceMonth({ purchaseDate: '2026-10-10', today: '2026-11-25', closingDay: null, dueDay: null }), '2026-11-01');
});

const expense = (id: string, extra: Partial<PersonalWalletExpense> = {}): PersonalWalletExpense =>
  ({ id, card_id: 'card-1', status: 'PENDING', entry_type: 'PURCHASE', expense_date: '2026-10-01',
    description: id, amount: 0, category: 'Outros', due_date: null, installment_count: 1, ...extra } as PersonalWalletExpense);
const part = (expenseId: string, month: string, amount: number, extra: Partial<PersonalWalletExpenseInstallment> = {}) =>
  ({ id: 'i-' + expenseId + month, expense_id: expenseId, due_month: month, amount, paid_amount: 0,
    status: 'PENDING', installment_number: 1, ...extra } as PersonalWalletExpenseInstallment);

test('meses com pagamento ou parcela quitada são reconhecidos como pagos', () => {
  const months = getSettledInvoiceMonths('card-1', [expense('a'), expense('b')],
    [part('a', '2026-11-01', 10, { status: 'PAID', paid_amount: 10 }), part('b', '2026-12-01', 5)],
    [{ card_id: 'card-1', due_month: '2027-01-01' }, { card_id: 'other', due_month: '2027-02-01' }]);
  assert.deepEqual([...months].sort(), ['2026-11-01', '2027-01-01']);
});

test('sobra de centavos em fatura vencida não vira a fatura atual', () => {
  const card = { id: 'card-1', credit_limit: 1000, initial_future_installments_balance: 0, closing_day: 21, due_day: 3 };
  const expenses = [expense('old'), expense('cur'), expense('next')];
  const installments = [part('old', '2026-09-01', 0.03), part('cur', '2026-12-01', 300), part('next', '2027-01-01', 100)];
  const position = getCardCreditPosition(card, expenses, installments, '2026-11-25');
  assert.equal(position.dueMonth, '2026-12-01');
  assert.equal(position.currentInvoice, 300);
  assert.equal(position.overdueInvoices, 0.03);
  assert.equal(position.futureCommitments, 100);
  assert.equal(position.committedLimit, 400.03);
  assert.equal(position.freeLimit, 599.97);
});

test('previsão do mês inclui contas vencidas ainda não pagas', () => {
  const balance = calculateWalletBalance({
    accounts: [{ balance: 1000 } as never], recurringIncomes: [], receivedIncomeIds: new Set(),
    openCardInvoices: 0, month: '2026-11',
    payables: [
      { status: 'PENDING', due_date: '2026-10-10', outstanding_balance: 200 },
      { status: 'PENDING', due_date: '2026-11-10', outstanding_balance: 100 },
      { status: 'PENDING', due_date: '2026-12-10', outstanding_balance: 50 },
      { status: 'PAID', due_date: '2026-10-10', outstanding_balance: 0 },
      { status: 'PENDING', due_date: null, outstanding_balance: 70 },
    ] as never,
  });
  assert.equal(balance.monthPayables, 300);
  assert.equal(balance.projectedBalance, 700);
});

test('referência bancária antiga é atualizada pelas compras e pagamentos posteriores', () => {
  const card = { id: 'card-1', credit_limit: 10000, used_limit: 6000 };
  const facts = [{ card_id: 'card-1', due_month: '2026-12-01', available_limit: 2500, updated_at: '2026-11-20T02:48:29Z' }];
  const movements = {
    expenses: [
      // Lançada depois da referência, com data posterior: consome limite.
      { card_id: 'card-1', amount: 40, status: 'PENDING', entry_type: 'PURCHASE' as const, expense_date: '2026-11-20', created_at: '2026-11-22T05:23:45Z' },
      // Mesmo dia da referência: pode já estar no número do banco; não desconta.
      { card_id: 'card-1', amount: 7, status: 'PENDING', entry_type: 'PURCHASE' as const, expense_date: '2026-11-19', created_at: '2026-11-21T00:00:00Z' },
      // Importada depois, mas a compra é antiga: já estava no número do banco.
      { card_id: 'card-1', amount: 1500, status: 'PENDING', entry_type: 'PURCHASE' as const, expense_date: '2025-12-31', created_at: '2026-11-20T03:42:06Z' },
      // Cancelada, crédito posterior e outro cartão.
      { card_id: 'card-1', amount: 50, status: 'CANCELED', entry_type: 'PURCHASE' as const, expense_date: '2026-11-21', created_at: '2026-11-22T00:00:00Z' },
      { card_id: 'card-1', amount: 10, status: 'PENDING', entry_type: 'PURCHASE' as const, is_invoice_credit: true, expense_date: '2026-11-21', created_at: '2026-11-22T00:00:00Z' },
      { card_id: 'other', amount: 999, status: 'PENDING', entry_type: 'PURCHASE' as const, expense_date: '2026-11-21', created_at: '2026-11-22T00:00:00Z' },
    ],
  };
  const result = getCardAvailablePresentation(card, facts, movements);
  assert.equal(result.origin, 'BANK');
  assert.equal(result.usageSinceReference, 30);
  assert.equal(result.amount, 2470);
  assert.equal(formatCardAvailableOrigin(result.bankReference, result.usageSinceReference), 'Disponível · banco 19/11 + lançamentos');
  // Sem movimentos, o número do banco aparece como foi informado.
  assert.equal(getCardAvailablePresentation(card, facts).amount, 2500);
  assert.equal(formatCardAvailableOrigin(result.bankReference), 'Disponível · banco 19/11');
});

test('migration de roteamento: data da compra, fechamento exclusivo, sem escrita de dados', () => {
  const sql = fs.readFileSync('supabase/migrations/20261124120000_wallet_purchase_date_invoice_routing.sql', 'utf8');
  assert.doesNotMatch(sql, /greatest\(p_expense_date, v_today\)/);
  assert.match(sql, /IF p_date < v_close_date AND p_date <= v_due THEN/);
  assert.match(sql, /v_purchase_due < v_today/);
  assert.match(sql, /personal_wallet_invoice_payments/);
  assert.match(sql, /REVOKE ALL ON FUNCTION private\.wallet_card_first_due_date/);
  assert.doesNotMatch(sql, /\b(DELETE FROM|TRUNCATE|DROP TABLE|UPDATE public\.|INSERT INTO)\b/i);
});

test('tela de cartões abre na fatura a pagar e mostra o valor lançado como principal', () => {
  const page = fs.readFileSync('features/wallet/pages/WalletCardsPage.tsx', 'utf8');
  assert.match(page, /creditPosition\?\.dueMonth \|\| suggestedNewInvoiceMonth/);
  assert.match(page, /Fatura \{dueLabel\}/);
  assert.match(page, /banco informou \$\{formatMoney\(bankInvoiceTotal\)\}/);
  assert.doesNotMatch(page, /formatMoney\(bankInvoiceTotal \?\? cycle\.amount\)/);
});

test('aviso da fatura ignora diferença explicada por compras lançadas depois da referência', async () => {
  const { getInvoiceAdditionsSinceReferenceCents } = await import('../../features/wallet/domain/cardAvailablePresentation');
  const expenses = [
    { id: 'new', card_id: 'card-1', status: 'PENDING', entry_type: 'PURCHASE' as const, expense_date: '2026-11-22', created_at: '2026-11-23T10:00:00Z' },
    { id: 'jan', card_id: 'card-1', status: 'PENDING', entry_type: 'PURCHASE' as const, expense_date: '2026-11-24', created_at: '2026-11-25T00:00:00Z' },
    { id: 'old', card_id: 'card-1', status: 'PENDING', entry_type: 'PURCHASE' as const, expense_date: '2026-11-18', created_at: '2026-11-23T10:00:00Z' },
  ];
  const installments = [
    { expense_id: 'new', due_month: '2026-12-01', amount: 67, status: 'PENDING' },
    { expense_id: 'jan', due_month: '2027-01-01', amount: 16, status: 'PENDING' },
    { expense_id: 'old', due_month: '2026-12-01', amount: 4.98, status: 'PENDING' },
  ];
  assert.equal(getInvoiceAdditionsSinceReferenceCents({
    cardId: 'card-1', dueMonth: '2026-12-01', referenceUpdatedAt: '2026-11-20T02:48:29Z', expenses, installments,
  }), 6700);
});
