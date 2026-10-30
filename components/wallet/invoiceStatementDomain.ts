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

/** dueMonth is the actual payment month (the first day is only its database key). */
export const getInvoiceCycleDates = (
  dueMonth: string,
  closingDay: number | null,
  dueDay: number | null,
  exactDueDate?: string | null,
): InvoiceCycleDates => {
  const [year, month] = dueMonth.slice(0, 7).split('-').map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12)
    throw new Error('Mês de vencimento inválido.');
  const due = Math.min(Math.max(Number(dueDay || 1), 1), daysInMonth(year, month - 1));
  const inferredDue = `${year}-${String(month).padStart(2, '0')}-${String(due).padStart(2, '0')}`;
  // A due date informed by the issuer overrides the card's recurring due day,
  // but never moves purchases or payments to a different database cycle.
  const dueDate = exactDueDate && /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(exactDueDate)
    && exactDueDate.slice(0, 7) === dueMonth.slice(0, 7)
    && !Number.isNaN(Date.parse(exactDueDate + 'T00:00:00Z'))
    && new Date(exactDueDate + 'T00:00:00Z').toISOString().slice(0, 10) === exactDueDate
      ? exactDueDate : inferredDue;
  const effectiveDueDay = Number(dueDate.slice(8));
  const closing = Math.min(Math.max(Number(closingDay || 1), 1), 31);
  // E.g. 05 October payment with closing day 28 closes on 28 September.
  const prior = closing >= effectiveDueDay;
  const closeMonthDate = new Date(Date.UTC(year, month - 1 - (prior ? 1 : 0), 1));
  const closeYear = closeMonthDate.getUTCFullYear();
  const closeMonthIndex = closeMonthDate.getUTCMonth();
  const closingDate = `${closeYear}-${String(closeMonthIndex + 1).padStart(2, '0')}-${String(Math.min(closing, daysInMonth(closeYear, closeMonthIndex))).padStart(2, '0')}`;
  return { closingDate, dueDate };
};

export const resolveInvoiceCycleState = (input: {
  dueMonth: string;
  closingDay: number | null;
  dueDay: number | null;
  outstanding: number;
  hasCycle?: boolean;
  paid?: boolean;
  today?: string;
  exactDueDate?: string | null;
}): InvoiceCycleState => {
  if (input.paid) return 'PAID';
  if (input.hasCycle === false) return 'OPEN';
  const dates = getInvoiceCycleDates(input.dueMonth, input.closingDay, input.dueDay, input.exactDueDate);
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
