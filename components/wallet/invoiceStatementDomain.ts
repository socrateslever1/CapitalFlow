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
  const ordinary = new Map<string, number>();

  installments.forEach(installment => {
    const expense = cardExpenses.get(installment.expense_id);
    if (!expense || installment.status === 'CANCELED') return;
    const dueMonth = String(expense.invoice_due_month || installment.due_month).slice(0, 7) + '-01';
    if (expense.entry_type === 'INVOICE_OVERRIDE') {
      overrides.set(dueMonth, outstanding(installment));
    } else if (installment.status === 'PENDING') {
      ordinary.set(dueMonth, money((ordinary.get(dueMonth) || 0) + outstanding(installment)));
    }
  });

  return [...new Set([...ordinary.keys(), ...overrides.keys()])]
    .sort()
    .map(dueMonth => ({
      dueMonth,
      amount: money(overrides.has(dueMonth) ? overrides.get(dueMonth)! : ordinary.get(dueMonth) || 0),
      hasOverride: overrides.has(dueMonth),
    }));
};

export const getCardCreditPosition = (
  card: Pick<PersonalWalletCard, 'id' | 'credit_limit' | 'opening_unallocated_amount' | 'initial_future_installments_balance'>,
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
  const initialFuture = Math.max(
    Number(card.initial_future_installments_balance || 0),
    Number(card.opening_unallocated_amount || 0),
  );
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
