import type { PersonalWalletExpense, WalletAccountOperation } from '../../../services/personalWallet.service';

/** Despesa paga direto da conta (débito, PIX, boleto), sem passar pelo cartão. */
export type SpendingAccountOperation = Pick<WalletAccountOperation,
  'id' | 'operation_type' | 'from_account_id' | 'amount' | 'category' | 'operation_date' | 'voided_at' | 'voids_operation_id'>;

export type SpendingCategory = { name: string; amount: number; percentage: number; count: number };
export type SpendingMethodSummary = {
  cardAmount: number;
  cardPercentage: number;
  accountAmount: number;
  accountPercentage: number;
  singleAmount: number;
  installmentAmount: number;
  installmentCount: number;
};
export type SpendingOverview = {
  total: number;
  count: number;
  previousTotal: number;
  categories: SpendingCategory[];
  byMethod?: SpendingMethodSummary;
};

/**
 * Read-only view of purchases/expenses by registration date.
 * Purchase totals are NOT payments, cash flow, or the monthly invoice:
 * a 10-installment purchase is represented by its original amount here.
 */
export function getWalletSpendingOverview(
  expenses: PersonalWalletExpense[],
  month: string,
  maxCategories = 4,
  accountOperations: readonly SpendingAccountOperation[] = [],
): SpendingOverview {
  const current = new Map<string, { amountCents: number; count: number }>();
  let totalCents = 0;
  let previousCents = 0;
  let cardCents = 0;
  let accountCents = 0;
  let singleCents = 0;
  let installmentCents = 0;
  let installmentCount = 0;
  let count = 0;
  const [year, monthIndex] = month.split('-').map(Number);
  if (!year || !monthIndex || monthIndex < 1 || monthIndex > 12) {
    return {
      total: 0,
      previousTotal: 0,
      count: 0,
      categories: [],
      byMethod: {
        cardAmount: 0,
        cardPercentage: 0,
        accountAmount: 0,
        accountPercentage: 0,
        singleAmount: 0,
        installmentAmount: 0,
        installmentCount: 0,
      },
    };
  }
  const previousDate = new Date(Date.UTC(year, monthIndex - 2, 1));
  const previousMonth = previousDate.toISOString().slice(0, 7);
  for (const expense of expenses) {
    if (expense.entry_type === 'INVOICE_OVERRIDE' || expense.is_opening_summary) continue;
    if (['CANCELED', 'CANCELLED', 'DELETED'].includes(String(expense.status || '').toUpperCase())) continue;
    const date = String(expense.expense_date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const amount = Number(expense.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const cents = Math.round(amount * 100);
    if (date.slice(0, 7) === previousMonth) {
      previousCents += cents;
    } else if (date.slice(0, 7) === month) {
      const name = expense.category?.trim() || 'Sem categoria';
      const key = name.toLocaleLowerCase('pt-BR');
      const stored = current.get(key);
      if (stored) {
        stored.amountCents += cents;
        stored.count += 1;
      } else current.set(key, { amountCents: cents, count: 1 });
      totalCents += cents;
      if (expense.card_id) cardCents += cents;
      else accountCents += cents;
      if (Number(expense.installment_count || 1) > 1) {
        installmentCents += cents;
        installmentCount += 1;
      } else {
        singleCents += cents;
      }
      count++;
    }
  }
  // Despesas pagas pela conta também são gastos do mês. Ficam fora transferências,
  // pagamentos de fatura (já contados como compras no cartão) e lançamentos anulados.
  const reversed = new Set(accountOperations.filter(op => op.voids_operation_id).map(op => op.voids_operation_id));
  for (const op of accountOperations) {
    if (op.operation_type !== 'EXPENSE' || !op.from_account_id || op.voided_at || op.voids_operation_id || reversed.has(op.id)) continue;
    const date = String(op.operation_date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const amount = Number(op.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const cents = Math.round(amount * 100);
    if (date.slice(0, 7) === previousMonth) {
      previousCents += cents;
    } else if (date.slice(0, 7) === month) {
      const name = op.category?.trim() || 'Sem categoria';
      const key = name.toLocaleLowerCase('pt-BR');
      const stored = current.get(key);
      if (stored) { stored.amountCents += cents; stored.count += 1; }
      else current.set(key, { amountCents: cents, count: 1 });
      totalCents += cents;
      accountCents += cents;
      singleCents += cents;
      count++;
    }
  }
  const all = [...current].map(([name, entry]) => ({
    name: name === 'sem categoria' ? 'Sem categoria' : name.charAt(0).toLocaleUpperCase('pt-BR') + name.slice(1),
    amountCents: entry.amountCents,
    count: entry.count,
  })).sort((a, b) => b.amountCents - a.amountCents || a.name.localeCompare(b.name, 'pt-BR'));
  const take = Math.max(1, Math.floor(maxCategories));
  const leading = all.slice(0, take);
  const hidden = all.slice(take);
  if (hidden.length) {
    leading.push({
      name: 'Demais categorias',
      amountCents: hidden.reduce((n, item) => n + item.amountCents, 0),
      count: hidden.reduce((n, item) => n + item.count, 0),
    });
  }
  return {
    total: totalCents / 100,
    count,
    previousTotal: previousCents / 100,
    categories: leading.map(item => ({
      name: item.name,
      amount: item.amountCents / 100,
      count: item.count,
      percentage: totalCents ? Math.round(item.amountCents / totalCents * 100) : 0,
    })),
    byMethod: {
      cardAmount: cardCents / 100,
      cardPercentage: totalCents ? Math.round((cardCents / totalCents) * 100) : 0,
      accountAmount: accountCents / 100,
      accountPercentage: totalCents ? Math.round((accountCents / totalCents) * 100) : 0,
      singleAmount: singleCents / 100,
      installmentAmount: installmentCents / 100,
      installmentCount,
    },
  };
}
