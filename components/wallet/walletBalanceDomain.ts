import type { PersonalWalletAccount, PersonalWalletPayable, WalletRecurringIncome } from '../../services/personalWallet.service';

export type WalletBalanceSummary = {
  accountBalance: number;
  pendingRecurringIncome: number;
  totalResources: number;
  openCardInvoices: number;
  monthPayables: number;
  totalLiabilities: number;
  projectedBalance: number;
  facts: WalletBalanceFacts;
};

export type WalletBalanceFactState =
  | 'EFFECTIVE'
  | 'OPENING'
  | 'PROJECTED'
  | 'RECONCILED'
  | 'IMPORTED'
  | 'PENDING'
  | 'UNKNOWN';

export type WalletBalanceFactOrigin =
  | 'CANONICAL'
  | 'MANUAL'
  | 'PROJECTION'
  | 'BANK_IMPORT'
  | 'PENDING_OPERATION'
  | 'UNKNOWN';

export type WalletBalanceFact = {
  amount: number | null;
  state: WalletBalanceFactState;
  origin: WalletBalanceFactOrigin;
};

export type WalletBalanceFacts = {
  effective: WalletBalanceFact;
  opening: WalletBalanceFact;
  projected: WalletBalanceFact;
  reconciled: WalletBalanceFact;
  imported: WalletBalanceFact;
  pending: WalletBalanceFact;
};

const finiteAmount = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const fact = (
  value: number | null | undefined,
  state: WalletBalanceFactState,
  origin: WalletBalanceFactOrigin,
): WalletBalanceFact => {
  const amount = finiteAmount(value);
  return { amount, state: amount == null ? 'UNKNOWN' : state, origin: amount == null ? 'UNKNOWN' : origin };
};

/**
 * Preserves the difference between a real zero and an unavailable value.
 * Presentation code can safely format `amount === 0`, while `null` remains
 * an explicit unknown instead of silently becoming a financial fact.
 */
export function buildWalletBalanceFacts(input: {
  effectiveBalance: number | null | undefined;
  openingBalance?: number | null;
  projectedBalance?: number | null;
  reconciledBalance?: number | null;
  importedBalance?: number | null;
  pendingBalance?: number | null;
}): WalletBalanceFacts {
  const pending = finiteAmount(input.pendingBalance);
  return {
    effective: fact(input.effectiveBalance, 'EFFECTIVE', 'CANONICAL'),
    opening: fact(input.openingBalance, 'OPENING', 'MANUAL'),
    projected: fact(input.projectedBalance, 'PROJECTED', 'PROJECTION'),
    reconciled: fact(input.reconciledBalance, 'RECONCILED', 'CANONICAL'),
    imported: fact(input.importedBalance, 'IMPORTED', 'BANK_IMPORT'),
    pending: fact(pending == null ? null : Math.max(0, pending), 'PENDING', 'PENDING_OPERATION'),
  };
}

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
  const projectedBalance = totalResources - totalLiabilities;
  return {
    accountBalance,
    pendingRecurringIncome,
    totalResources,
    openCardInvoices,
    monthPayables,
    totalLiabilities,
    projectedBalance,
    facts: buildWalletBalanceFacts({
      effectiveBalance: accountBalance,
      projectedBalance,
      pendingBalance: pendingRecurringIncome,
    }),
  };
};
