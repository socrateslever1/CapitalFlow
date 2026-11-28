import type {
  PersonalWalletExpense, PersonalWalletExpenseInstallment, WalletAccountOperation,
} from '../../../services/personalWallet.service';
import { normalizeCategoryKey } from './walletCategoryVisual';

/**
 * Participação de cada categoria no total gasto de uma fatura ou conta.
 * Somente leitura: não é orçamento, saldo nem previsão. Valores em centavos
 * para não acumular erro; percentuais somam 100 (maior resto).
 */
export type CategorySlice = {
  name: string;
  amount: number;
  /** 0–100, inteiro; a soma das fatias é 100. */
  percentage: number;
  count: number;
};

export type CategoryBreakdown = {
  total: number;
  slices: CategorySlice[];
};

type Item = { category: string | null | undefined; cents: number };

export function buildCategoryBreakdown(items: readonly Item[]): CategoryBreakdown {
  const groups = new Map<string, { name: string; cents: number; count: number }>();
  let totalCents = 0;
  for (const item of items) {
    if (!Number.isSafeInteger(item.cents) || item.cents <= 0) continue;
    const name = String(item.category || '').trim() || 'Sem categoria';
    const key = normalizeCategoryKey(name);
    const group = groups.get(key);
    if (group) { group.cents += item.cents; group.count += 1; }
    else groups.set(key, { name, cents: item.cents, count: 1 });
    totalCents += item.cents;
  }
  const sorted = [...groups.values()].sort((a, b) => b.cents - a.cents || a.name.localeCompare(b.name, 'pt-BR'));
  // Maior resto: os inteiros somam exatamente 100.
  const raw = sorted.map(group => totalCents > 0 ? group.cents * 100 / totalCents : 0);
  const floors = raw.map(Math.floor);
  let missing = totalCents > 0 ? 100 - floors.reduce((sum, value) => sum + value, 0) : 0;
  raw.map((value, index) => ({ index, rest: value - floors[index] }))
    .sort((a, b) => b.rest - a.rest)
    .forEach(({ index }) => { if (missing > 0) { floors[index] += 1; missing -= 1; } });
  return {
    total: totalCents / 100,
    slices: sorted.map((group, index) => ({
      name: group.name, amount: group.cents / 100, percentage: floors[index], count: group.count,
    })),
  };
}

const cents = (value: unknown): number => Math.round(Number(value) * 100);

/**
 * Fatura do cartão: soma das parcelas do ciclo por categoria da compra.
 * Ficam fora: créditos/estornos e o saldo consolidado de abertura, que não
 * têm categoria de consumo.
 */
export function getCardInvoiceCategoryBreakdown(
  cardId: string,
  dueMonth: string | null | undefined,
  expenses: readonly PersonalWalletExpense[],
  installments: readonly PersonalWalletExpenseInstallment[],
): CategoryBreakdown {
  if (!dueMonth) return { total: 0, slices: [] };
  const month = dueMonth.slice(0, 7);
  const byId = new Map(expenses
    .filter(expense => expense.card_id === cardId && expense.status !== 'CANCELED'
      && expense.entry_type !== 'INVOICE_OVERRIDE' && !expense.is_invoice_credit)
    .map(expense => [expense.id, expense]));
  const items: Item[] = [];
  for (const installment of installments) {
    const expense = byId.get(installment.expense_id);
    if (!expense || installment.status === 'CANCELED') continue;
    if (String(expense.invoice_due_month || installment.due_month).slice(0, 7) !== month) continue;
    items.push({ category: expense.category, cents: cents(installment.amount) });
  }
  return buildCategoryBreakdown(items);
}

/**
 * Conta: despesas do mês que saíram desta conta. Transferências, pagamentos de
 * fatura, receitas e lançamentos anulados não entram.
 */
export function getAccountCategoryBreakdown(
  accountId: string,
  month: string,
  operations: readonly WalletAccountOperation[],
): CategoryBreakdown {
  const voided = new Set(operations.filter(op => op.voids_operation_id).map(op => op.voids_operation_id));
  return buildCategoryBreakdown(operations
    .filter(op => op.operation_type === 'EXPENSE' && op.from_account_id === accountId
      && !op.voided_at && !op.voids_operation_id && !voided.has(op.id)
      && String(op.operation_date || '').slice(0, 7) === month.slice(0, 7))
    .map(op => ({ category: op.category, cents: cents(op.amount) })));
}

/** Dias corridos do período até hoje (mínimo 1), para o "R$ por dia". */
export function elapsedDaysInPeriod(start: string, end: string, today: string): number {
  const from = Date.parse(start.slice(0, 10) + 'T00:00:00Z');
  const until = Date.parse((today < end ? today : end).slice(0, 10) + 'T00:00:00Z');
  if (!Number.isFinite(from) || !Number.isFinite(until)) return 1;
  return Math.max(1, Math.floor((until - from) / 86_400_000) + 1);
}
