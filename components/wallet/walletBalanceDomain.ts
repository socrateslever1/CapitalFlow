import type { PersonalWalletAccount, PersonalWalletPayable, WalletPendingOperation, WalletRecurringIncome } from '../../services/personalWallet.service';

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

export const walletBalanceStateLabel: Record<WalletBalanceFactState, string> = {
  EFFECTIVE: 'Efetivo',
  OPENING: 'Inicial',
  PROJECTED: 'Projetado',
  RECONCILED: 'Conciliado',
  IMPORTED: 'Importado',
  PENDING: 'Pendente',
  UNKNOWN: 'Não informado',
};

export const walletBalanceOriginLabel: Record<WalletBalanceFactOrigin, string> = {
  CANONICAL: 'Registro financeiro',
  MANUAL: 'Informado pelo usuário',
  PROJECTION: 'Projeção',
  BANK_IMPORT: 'Importação bancária',
  PENDING_OPERATION: 'Operação pendente',
  UNKNOWN: 'Origem não informada',
};

export const describeWalletBalanceFact = (item: WalletBalanceFact): string =>
  walletBalanceStateLabel[item.state] + ' · ' + walletBalanceOriginLabel[item.origin];

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
  /** Lançamentos pendentes previstos até o fim do mês (entradas somam, saídas subtraem). */
  pendingOperations?: WalletPendingOperation[];
}): WalletBalanceSummary => {
  const accountBalance = input.accounts.reduce((sum, account) => sum + Number(account.balance || 0), 0);
  const pendingRecurringIncome = input.recurringIncomes
    .filter(income => income.active && !input.receivedIncomeIds.has(income.id))
    .reduce((sum, income) => sum + Number(income.amount || 0), 0);
  const monthPayables = input.payables
    // Contas do mês e contas vencidas ainda não pagas entram na projeção.
    .filter(payable => !['PAID', 'CANCELED'].includes(payable.status) && Boolean(payable.due_date)
      && String(payable.due_date).slice(0, 7) <= input.month)
    .reduce((sum, payable) => sum + Number(payable.outstanding_balance || 0), 0);
  const openCardInvoices = Math.max(0, Number(input.openCardInvoices || 0));
  const pendingIn = pendingRemaining(input.pendingOperations, 'IN', input.month);
  const pendingOut = pendingRemaining(input.pendingOperations, 'OUT', input.month);
  const totalResources = accountBalance + pendingRecurringIncome + pendingIn;
  const totalLiabilities = openCardInvoices + monthPayables + pendingOut;
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
      pendingBalance: pendingRecurringIncome + pendingIn,
    }),
  };
};

const cents = (value: number) => Math.round(value * 100) / 100;

const pendingRemaining = (rows: WalletPendingOperation[] | undefined, direction: 'IN' | 'OUT', month: string, accountId?: string) =>
  (rows || [])
    .filter(row => row.status === 'PENDING' && row.direction === direction
      && String(row.expected_date).slice(0, 7) <= month && (!accountId || row.account_id === accountId))
    .reduce((sum, row) => sum + Math.max(0, Number(row.amount) - Number(row.posted_amount || 0)), 0);

export type AccountProjectionLine = { label: string; amount: number };
export type AccountProjection = {
  accountId: string | null;
  name: string;
  balance: number;
  lines: AccountProjectionLine[];
  projected: number;
};

/**
 * Saldo previsto por conta no mês (somente leitura): saldo atual + receitas fixas a receber
 * + entradas pendentes − saídas pendentes − contas a pagar − faturas que vencem até o fim do mês.
 * Itens sem conta definida ficam em "Sem conta definida" para a soma bater com o total.
 */
export function calculateAccountProjections(input: {
  accounts: PersonalWalletAccount[];
  recurringIncomes: WalletRecurringIncome[];
  receivedIncomeIds: Set<string>;
  payables: PersonalWalletPayable[];
  invoices: Array<{ accountId: string | null; amount: number }>;
  pendingOperations?: WalletPendingOperation[];
  month: string;
}): AccountProjection[] {
  const ids = new Set(input.accounts.map(account => account.id));
  const owner = (id: string | null | undefined) => (id && ids.has(id) ? id : null);
  const incomes = (accountId: string | null) => input.recurringIncomes
    .filter(income => income.active && !input.receivedIncomeIds.has(income.id) && owner(income.destination_account_id) === accountId)
    .reduce((sum, income) => sum + Number(income.amount || 0), 0);
  const payables = (accountId: string | null) => input.payables
    .filter(payable => !['PAID', 'CANCELED'].includes(payable.status) && Boolean(payable.due_date)
      && String(payable.due_date).slice(0, 7) <= input.month && owner(payable.origin_account_id) === accountId)
    .reduce((sum, payable) => sum + Number(payable.outstanding_balance || 0), 0);
  const invoices = (accountId: string | null) => input.invoices
    .filter(invoice => owner(invoice.accountId) === accountId)
    .reduce((sum, invoice) => sum + Math.max(0, Number(invoice.amount || 0)), 0);
  // Pendente de conta fora da lista (arquivada/oculta) vai para "Sem conta definida": as somas batem com o total.
  const orphanPending = (input.pendingOperations || []).filter(row => !ids.has(row.account_id));
  const build = (accountId: string | null, name: string, balance: number): AccountProjection => {
    const pendingIn = accountId ? pendingRemaining(input.pendingOperations, 'IN', input.month, accountId) : pendingRemaining(orphanPending, 'IN', input.month);
    const pendingOut = accountId ? pendingRemaining(input.pendingOperations, 'OUT', input.month, accountId) : pendingRemaining(orphanPending, 'OUT', input.month);
    const lines: AccountProjectionLine[] = [
      { label: 'Receitas fixas a receber', amount: cents(incomes(accountId)) },
      { label: 'Entradas pendentes', amount: cents(pendingIn) },
      { label: 'Saídas pendentes', amount: -cents(pendingOut) },
      { label: 'Contas a pagar', amount: -cents(payables(accountId)) },
      { label: 'Faturas de cartão', amount: -cents(invoices(accountId)) },
    ].filter(line => Math.abs(line.amount) >= 0.005);
    return { accountId, name, balance: cents(balance), lines, projected: cents(balance + lines.reduce((sum, line) => sum + line.amount, 0)) };
  };
  const result = input.accounts.map(account => build(account.id, account.nickname, Number(account.balance || 0)));
  const unassigned = build(null, 'Sem conta definida', 0);
  if (unassigned.lines.length) result.push(unassigned);
  return result;
}
