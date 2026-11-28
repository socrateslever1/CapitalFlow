import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { getWalletCategoryVisual, normalizeCategoryKey } from '../../features/wallet/domain/walletCategoryVisual';
import {
  buildCategoryBreakdown, elapsedDaysInPeriod, getAccountCategoryBreakdown, getCardInvoiceCategoryBreakdown,
} from '../../features/wallet/domain/walletCategoryBreakdown';
import { DEFAULT_EXPENSE_CATEGORIES } from '../../features/wallet/utils/walletCustomCategories';
import type { PersonalWalletExpense, PersonalWalletExpenseInstallment, WalletAccountOperation } from '../../services/personalWallet.service';

test('toda categoria padrão tem ícone próprio, e a busca ignora acentos e maiúsculas', () => {
  const generic = getWalletCategoryVisual('categoria inventada pelo usuário').icon;
  for (const name of DEFAULT_EXPENSE_CATEGORIES) {
    assert.notEqual(getWalletCategoryVisual(name).icon, generic, name);
  }
  assert.equal(normalizeCategoryKey('  ALIMENTAÇÃO  '), 'alimentacao');
  assert.equal(getWalletCategoryVisual('alimentacao'), getWalletCategoryVisual('Alimentação'));
  assert.equal(getWalletCategoryVisual('Saúde e bem-estar').icon, getWalletCategoryVisual('Saúde').icon);
});

test('categoria criada pelo usuário recebe ícone genérico com cor estável', () => {
  const first = getWalletCategoryVisual('Pescaria');
  assert.equal(first.color, getWalletCategoryVisual('pescaria').color);
  assert.match(first.color, /^#[0-9A-F]{6}$/i);
  assert.equal(first.background, first.color + '26');
});

test('fatias somam 100 e agrupam a mesma categoria escrita de formas diferentes', () => {
  const result = buildCategoryBreakdown([
    { category: 'Alimentação', cents: 1000 }, { category: 'alimentacao', cents: 1000 },
    { category: 'Transporte', cents: 1000 }, { category: '', cents: 500 }, { category: 'X', cents: 0 },
  ]);
  assert.equal(result.total, 35);
  assert.deepEqual(result.slices.map(s => [s.name, s.amount, s.count]), [
    ['Alimentação', 20, 2], ['Transporte', 10, 1], ['Sem categoria', 5, 1],
  ]);
  assert.equal(result.slices.reduce((sum, s) => sum + s.percentage, 0), 100);
  assert.deepEqual(buildCategoryBreakdown([]), { total: 0, slices: [] });
});

const expense = (id: string, extra: Partial<PersonalWalletExpense>): PersonalWalletExpense =>
  ({ id, card_id: 'card-1', status: 'PENDING', entry_type: 'PURCHASE', expense_date: '2026-11-10',
    description: id, amount: 0, category: 'Outros', due_date: null, installment_count: 1, ...extra } as PersonalWalletExpense);
const part = (expenseId: string, month: string, amount: number): PersonalWalletExpenseInstallment =>
  ({ id: expenseId + month, expense_id: expenseId, due_month: month, amount, paid_amount: 0, status: 'PENDING', installment_number: 1 } as PersonalWalletExpenseInstallment);

test('fatura do cartão usa as parcelas do ciclo e ignora créditos, abertura e outros cartões', () => {
  const expenses = [
    expense('food', { category: 'Alimentação' }), expense('ride', { category: 'Transporte' }),
    expense('credit', { category: 'Outros', is_invoice_credit: true }),
    expense('opening', { category: 'Ajuste de fatura', entry_type: 'INVOICE_OVERRIDE' }),
    expense('other', { category: 'Lazer', card_id: 'card-2' }),
    expense('canceled', { category: 'Lazer', status: 'CANCELED' }),
  ];
  const installments = [
    part('food', '2026-12-01', 60), part('food', '2027-01-01', 60), part('ride', '2026-12-01', 40),
    part('credit', '2026-12-01', 30), part('opening', '2026-12-01', 500), part('other', '2026-12-01', 99),
    part('canceled', '2026-12-01', 10),
  ];
  const result = getCardInvoiceCategoryBreakdown('card-1', '2026-12-01', expenses, installments);
  assert.equal(result.total, 100);
  assert.deepEqual(result.slices.map(s => [s.name, s.percentage]), [['Alimentação', 60], ['Transporte', 40]]);
});

test('conta considera só despesas do mês que saíram dela, sem anuladas', () => {
  const op = (id: string, extra: Partial<WalletAccountOperation>): WalletAccountOperation =>
    ({ id, request_id: id, operation_type: 'EXPENSE', from_account_id: 'acc', to_account_id: null, amount: 10,
      description: id, category: 'Alimentação', operation_date: '2026-11-05', created_at: '2026-11-05T00:00:00Z', ...extra } as WalletAccountOperation);
  const result = getAccountCategoryBreakdown('acc', '2026-11', [
    op('a', { amount: 30 }), op('b', { category: 'Transporte', amount: 10 }),
    op('voided', { voided_at: '2026-11-06T00:00:00Z' }), op('reversal', { voids_operation_id: 'c' }), op('c', { amount: 500 }),
    op('transfer', { operation_type: 'TRANSFER' }), op('income', { operation_type: 'INCOME', from_account_id: null, to_account_id: 'acc' }),
    op('other-account', { from_account_id: 'acc2' }), op('october', { operation_date: '2026-10-30' }),
  ]);
  assert.equal(result.total, 40);
  assert.deepEqual(result.slices.map(s => [s.name, s.percentage]), [['Alimentação', 75], ['Transporte', 25]]);
});

test('gasto por dia usa os dias corridos até hoje', () => {
  assert.equal(elapsedDaysInPeriod('2026-11-01', '2026-11-31', '2026-11-24'), 24);
  assert.equal(elapsedDaysInPeriod('2026-11-01', '2026-11-30', '2026-12-10'), 30);
  assert.equal(elapsedDaysInPeriod('2026-11-01', '2026-11-30', '2026-11-01'), 1);
});

test('ícones vêm de lucide-react; nenhum arquivo de outro aplicativo é usado', () => {
  const domain = fs.readFileSync('features/wallet/domain/walletCategoryVisual.ts', 'utf8');
  assert.match(domain, /from 'lucide-react'/);
  assert.doesNotMatch(domain, /spendee/i);
  const page = fs.readFileSync('features/wallet/pages/WalletCardsPage.tsx', 'utf8');
  assert.match(page, /getCardInvoiceCategoryBreakdown\(selected\.id, statementMonth/);
  const account = fs.readFileSync('components/wallet/AccountDetailsPage.tsx', 'utf8');
  assert.match(account, /getAccountCategoryBreakdown\(account\.id, month, accountOperations\)/);
  const modal = fs.readFileSync('components/wallet/QuickExpenseModal.tsx', 'utf8');
  assert.match(modal, /<CategoryIconPicker/);
});

test('classificador reconhece encargos do cartão, assinaturas digitais, impostos e comércios abreviados', async () => {
  const { classifyStatementDescription: c } = await import('../../utils/walletStatementPdf');
  assert.equal(c('IOF DIARIO ROTATIV /ATRASO'), 'Juros e encargos');
  assert.equal(c('ENCARGOS SOBRE PARCELADO'), 'Juros e encargos');
  assert.equal(c('PARC.FACIL'), 'Parcelamento de fatura');
  assert.equal(c('ZPBBDETRANAM'), 'Impostos e taxas');
  assert.equal(c('DL*GOOGLE YouTub'), 'Assinaturas');
  assert.equal(c('IFD*BR'), 'Alimentação');
  assert.equal(c('HIPER DB PARAIBA'), 'Alimentação');
  assert.equal(c('PG *SHOPFACIL SA'), 'Compras');
  // Pagamentos a pessoas e intermediadores continuam sem categoria inventada.
  assert.equal(c('RecargaPay *FULANOS'), 'Outros');
  assert.equal(c('KI ANJO'), 'Outros');
  for (const name of ['Juros e encargos', 'Parcelamento de fatura', 'Impostos e taxas']) {
    assert.notEqual(getWalletCategoryVisual(name).icon, getWalletCategoryVisual('categoria inventada').icon, name);
  }
});

test('resumo de gastos do mês inclui despesas pagas pela conta, sem transferências nem anuladas', async () => {
  const { getWalletSpendingOverview } = await import('../../features/wallet/domain/walletSpendingInsights');
  const card = { id: 'c1', card_id: 'card', status: 'PENDING', entry_type: 'PURCHASE', category: 'Alimentação',
    expense_date: '2026-11-03', amount: 60, installment_count: 1 } as PersonalWalletExpense;
  const op = (id: string, extra: Record<string, unknown>) => ({ id, operation_type: 'EXPENSE', from_account_id: 'acc', amount: 10,
    category: 'Transporte', operation_date: '2026-11-05', voided_at: null, voids_operation_id: null, ...extra }) as never;
  const result = getWalletSpendingOverview([card], '2026-11', 4, [
    op('a', { amount: 40 }), op('t', { operation_type: 'TRANSFER' }), op('v', { voided_at: '2026-11-06T00:00:00Z' }),
    op('r', { voids_operation_id: 'x' }), op('x', { amount: 999 }), op('prev', { operation_date: '2026-10-10', amount: 25 }),
  ]);
  assert.equal(result.total, 100);
  assert.equal(result.previousTotal, 25);
  assert.equal(result.byMethod?.cardPercentage, 60);
  assert.equal(result.byMethod?.accountPercentage, 40);
  assert.deepEqual(result.categories.map(c => [c.name, c.amount]), [['Alimentação', 60], ['Transporte', 40]]);
});

test('seletor de categoria mostra "Outros" por último', () => {
  const picker = fs.readFileSync('components/wallet/CategoryIconPicker.tsx', 'utf8');
  assert.match(picker, /\['outros', 'sem categoria'\]\.includes\(normalizeCategoryKey\(category\)\)/);
  assert.match(picker, /\.\.\.categories\.filter\(category => !isFallbackCategory\(category\)\), \.\.\.categories\.filter\(isFallbackCategory\)/);
});
