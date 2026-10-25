import type { PersonalWalletExpense, PersonalWalletExpenseInstallment } from '../../services/personalWallet.service';

export type CardInvoiceEntry = {
  expense: PersonalWalletExpense;
  installment: PersonalWalletExpenseInstallment;
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
    .filter(installment => installment.status === 'PENDING'
      && String(installment.due_month).slice(0, 10) === dueMonth
      && expensesById.has(installment.expense_id))
    .map(installment => ({ expense: expensesById.get(installment.expense_id)!, installment }))
    .sort((left, right) => right.expense.expense_date.localeCompare(left.expense.expense_date));
};
