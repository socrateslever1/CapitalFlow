import type { PersonalWalletCard, PersonalWalletExpense, PersonalWalletExpenseInstallment } from '../../services/personalWallet.service';

export type CardInvoiceEntry = {
  expense: PersonalWalletExpense;
  installment: PersonalWalletExpenseInstallment;
};

export type EffectiveInvoiceCycle = {
  dueMonth: string;
  amount: number;
  hasOverride: boolean;
};

export type CardCreditPosition = {
  dueMonth: string | null;
  currentInvoice: number;
  futureCommitments: number;
  committedLimit: number;
  freeLimit: number;
  hasOverride: boolean;
};

export type InvoiceCycleState = 'OPEN' | 'CLOSED' | 'OVERDUE' | 'PAID';
export type InvoiceCycleDates = { closingDate: string; dueDate: string };

const manausToday = () => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Manaus', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};
const daysInMonth = (year: number, monthIndex: number) => new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

export const getInvoiceCycleDates = (dueMonth: string, closingDay: number | null, dueDay: number | null): InvoiceCycleDates => {
  const [year, month] = dueMonth.slice(0, 7).split('-').map(Number);
  const closing = Math.min(Math.max(Number(closingDay || 1), 1), daysInMonth(year, month - 1));
  const due = Math.max(Number(dueDay || 1), 1);
  const dueMonthOffset = due <= closing ? 1 : 0;
  const dueYear = month - 1 + dueMonthOffset >= 12 ? year + 1 : year;
  const dueMonthIndex = (month - 1 + dueMonthOffset) % 12;
  const boundedDue = Math.min(due, daysInMonth(dueYear, dueMonthIndex));
  return {
    closingDate: `${year}-${String(month).padStart(2, '0')}-${String(closing).padStart(2, '0')}`,
    dueDate: `${dueYear}-${String(dueMonthIndex + 1).padStart(2, '0')}-${String(boundedDue).padStart(2, '0')}`,
  };
};

export const resolveInvoiceCycleState = (input: {
  dueMonth: string;
  closingDay: number | null;
  dueDay: number | null;
  outstanding: number;
  hasCycle?: boolean;
  paid?: boolean;
  today?: string;
}): InvoiceCycleState => {
  if (input.paid) return 'PAID';
  if (input.hasCycle === false) return 'OPEN';
  const dates = getInvoiceCycleDates(input.dueMonth, input.closingDay, input.dueDay);
  const today = input.today || manausToday();
  if (input.outstanding <= 0) return 'PAID';
  if (today <= dates.closingDate) return 'OPEN';
  if (today <= dates.dueDate) return 'CLOSED';
  return 'OVERDUE';
};

const money = (value: number) => Math.round(value * 100) / 100;
const outstanding = (installment: PersonalWalletExpenseInstallment) =>
  Math.max(0, money(Number(installment.amount || 0) - Number(installment.paid_amount || 0)));

export const getEffectiveInvoiceCycles = (
  cardId: string,
  expenses: PersonalWalletExpense[],
  installments: PersonalWalletExpenseInstallment[],
): EffectiveInvoiceCycle[] => {
  const cardExpenses = new Map(expenses
    .filter(expense => expense.card_id === cardId && expense.status !== 'CANCELED')
    .map(expense => [expense.id, expense]));
  const overrides = new Map<string, number>();
  const openingOverrides = new Map<string, string>();
  const ordinary = new Map<string, number>();

  cardExpenses.forEach(expense => {
    if (expense.entry_type === 'INVOICE_OVERRIDE' && expense.is_opening_summary && expense.invoice_due_month) {
      openingOverrides.set(expense.invoice_due_month.slice(0, 7) + '-01', expense.id);
    }
  });

  installments.forEach(installment => {
    const expense = cardExpenses.get(installment.expense_id);
    if (!expense || installment.status === 'CANCELED') return;
    const dueMonth = String(expense.invoice_due_month || installment.due_month).slice(0, 7) + '-01';
    if (expense.entry_type === 'INVOICE_OVERRIDE') {
      overrides.set(dueMonth, outstanding(installment));
    } else if (installment.status === 'PENDING' && (!openingOverrides.has(dueMonth) || installment.opening_invoice_id !== openingOverrides.get(dueMonth))) {
      ordinary.set(dueMonth, money((ordinary.get(dueMonth) || 0) + outstanding(installment)));
    }
  });

  return [...new Set([...ordinary.keys(), ...overrides.keys()])]
    .sort()
    .map(dueMonth => ({
      dueMonth,
      amount: money(overrides.has(dueMonth)
        ? overrides.get(dueMonth)! + (openingOverrides.has(dueMonth) ? ordinary.get(dueMonth) || 0 : 0)
        : ordinary.get(dueMonth) || 0),
      hasOverride: overrides.has(dueMonth),
    }));
};

export const getSelectedInvoiceCycle = (
  cardId: string,
  dueMonth: string | null | undefined,
  expenses: PersonalWalletExpense[],
  installments: PersonalWalletExpenseInstallment[],
): EffectiveInvoiceCycle => {
  const normalizedMonth = dueMonth ? `${dueMonth.slice(0, 7)}-01` : '';
  const selected = normalizedMonth
    ? getEffectiveInvoiceCycles(cardId, expenses, installments).find(cycle => cycle.dueMonth === normalizedMonth)
    : undefined;
  return selected || { dueMonth: normalizedMonth, amount: 0, hasOverride: false };
};

export const getCardCreditPosition = (
  card: Pick<PersonalWalletCard, 'id' | 'credit_limit' | 'initial_future_installments_balance'>,
  expenses: PersonalWalletExpense[],
  installments: PersonalWalletExpenseInstallment[],
): CardCreditPosition => {
  const cycles = getEffectiveInvoiceCycles(card.id, expenses, installments);
  const activeIndex = cycles.findIndex(cycle => cycle.amount > 0);
  const active = activeIndex >= 0 ? cycles[activeIndex] : null;
  const currentInvoice = active?.amount || 0;
  const knownFutureCommitments = money(activeIndex >= 0
    ? cycles.slice(activeIndex + 1).reduce((sum, cycle) => sum + cycle.amount, 0)
    : 0);
  const initialFuture = Number(card.initial_future_installments_balance || 0);
  const futureCommitments = money(knownFutureCommitments + initialFuture);
  const committedLimit = money(currentInvoice + futureCommitments);
  return {
    dueMonth: active?.dueMonth || null,
    currentInvoice,
    futureCommitments,
    committedLimit,
    freeLimit: Math.max(0, money(Number(card.credit_limit || 0) - committedLimit)),
    hasOverride: Boolean(active?.hasOverride),
  };
};

export const getCardInvoiceEntries = (
  cardId: string,
  dueMonth: string | null | undefined,
  expenses: PersonalWalletExpense[],
  installments: PersonalWalletExpenseInstallment[],
): CardInvoiceEntry[] => {
  if (!dueMonth) return [];
  const expensesById = new Map(
    expenses
      .filter(expense => expense.card_id === cardId && expense.status !== 'CANCELED')
      .map(expense => [expense.id, expense]),
  );
  return installments
    .filter(installment => {
      const expense = expensesById.get(installment.expense_id);
      return Boolean(expense)
        && String(installment.due_month).slice(0, 10) === dueMonth
        && (installment.status === 'PENDING' || expense?.entry_type === 'INVOICE_OVERRIDE');
    })
    .map(installment => ({ expense: expensesById.get(installment.expense_id)!, installment }))
    .sort((left, right) => right.expense.expense_date.localeCompare(left.expense.expense_date));
};
