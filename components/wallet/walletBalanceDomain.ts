import type { PersonalWalletAccount, PersonalWalletPayable, WalletRecurringIncome } from '../../services/personalWallet.service';

export type WalletBalanceSummary = {
  accountBalance: number;
  pendingRecurringIncome: number;
  totalResources: number;
  openCardInvoices: number;
  monthPayables: number;
  totalLiabilities: number;
  projectedBalance: number;
};

export const calculateWalletBalance = (input: {
  accounts: PersonalWalletAccount[];
  recurringIncomes: WalletRecurringIncome[];
  receivedIncomeIds: Set<string>;
  openCardInvoices: number;
  payables: PersonalWalletPayable[];
  month: string;
}): WalletBalanceSummary => {
  const accountBalance = input.accounts.reduce((sum, account) => sum + Number(account.balance || 0), 0);
  const pendingRecurringIncome = input.recurringIncomes
    .filter(income => income.active && !input.receivedIncomeIds.has(income.id))
    .reduce((sum, income) => sum + Number(income.amount || 0), 0);
  const monthPayables = input.payables
    .filter(payable => !['PAID', 'CANCELED'].includes(payable.status) && String(payable.due_date || '').slice(0, 7) === input.month)
    .reduce((sum, payable) => sum + Number(payable.outstanding_balance || 0), 0);
  const openCardInvoices = Math.max(0, Number(input.openCardInvoices || 0));
  const totalResources = accountBalance + pendingRecurringIncome;
  const totalLiabilities = openCardInvoices + monthPayables;
  return {
    accountBalance,
    pendingRecurringIncome,
    totalResources,
    openCardInvoices,
    monthPayables,
    totalLiabilities,
    projectedBalance: totalResources - totalLiabilities,
  };
};
