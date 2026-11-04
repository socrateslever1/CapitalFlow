export type WalletTimelineKind = 'TRANSFER' | 'OPERATION' | 'INSTALLMENT' | 'PAYABLE' | 'INVOICE_PAYMENT';
export type WalletTimelineDirection = 'IN' | 'OUT' | 'NEUTRAL';
export type WalletTimelineStatus = 'PAID' | 'PENDING' | 'OVERDUE' | 'SCHEDULED';

export type WalletTimelineEvent = {
  id: string;
  kind: WalletTimelineKind;
  date: string;
  label: string;
  amount: number;
  direction: WalletTimelineDirection;
  status: WalletTimelineStatus;
  accountId?: string | null;
  cardId?: string | null;
  installmentNumber?: number;
  dueMonth?: string | null;
};

type OperationLike = {
  id: string;
  request_id?: string | null;
  operation_type: string;
  from_account_id: string | null;
  to_account_id: string | null;
  amount: number;
  description: string;
  operation_date: string;
  occurred_at?: string | null;
};

type ExpenseLike = { id: string; description: string; card_id?: string | null };
type InstallmentLike = {
  id: string;
  expense_id: string;
  installment_number: number;
  due_month: string;
  amount: number;
  paid_amount?: number;
  status: string;
};
type PayableLike = {
  id: string;
  description: string;
  creditor_name: string;
  outstanding_balance: number;
  due_date: string | null;
  status: string;
};
type InvoicePaymentLike = {
  id: string;
  request_id?: string | null;
  card_id: string;
  due_month: string;
  account_id: string | null;
  amount: number;
  created_at: string;
};

const finiteMoney = (value: unknown) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
};

const operationDirection = (operationType: string): WalletTimelineDirection => {
  if (operationType === 'TRANSFER') return 'NEUTRAL';
  if (['INCOME', 'RECEIPT', 'LOAN_DISBURSEMENT'].includes(operationType)) return 'IN';
  return 'OUT';
};

const eventStatus = (date: string, referenceDate: string, paid = false): WalletTimelineStatus => {
  if (paid) return 'PAID';
  return date < referenceDate ? 'OVERDUE' : date === referenceDate ? 'PENDING' : 'SCHEDULED';
};

/**
 * Builds a compact, read-only timeline from existing wallet facts.
 * Internal transfers stay NEUTRAL so the timeline never double-counts them
 * as income or expense in wallet totals.
 */
export function buildWalletTimeline(input: {
  referenceDate: string;
  operations: OperationLike[];
  expenses: ExpenseLike[];
  installments: InstallmentLike[];
  payables: PayableLike[];
  invoicePayments: InvoicePaymentLike[];
  limit?: number;
}): WalletTimelineEvent[] {
  const events: WalletTimelineEvent[] = [];
  const operationRequestIds = new Set(
    input.operations.map(operation => operation.request_id).filter(Boolean),
  );

  for (const operation of input.operations) {
    const date = String(operation.occurred_at || operation.operation_date).slice(0, 10);
    events.push({
      id: operation.id,
      kind: operation.operation_type === 'TRANSFER' ? 'TRANSFER' : 'OPERATION',
      date,
      label: operation.description || 'Movimentação',
      amount: Math.abs(finiteMoney(operation.amount)),
      direction: operationDirection(operation.operation_type),
      status: eventStatus(date, input.referenceDate),
      accountId: operation.to_account_id || operation.from_account_id,
    });
  }

  const expenseById = new Map(input.expenses.map(expense => [expense.id, expense]));
  for (const installment of input.installments) {
    if (installment.status !== 'PENDING') continue;
    const amount = Math.max(0, finiteMoney(installment.amount) - finiteMoney(installment.paid_amount));
    if (amount <= 0) continue;
    const expense = expenseById.get(installment.expense_id);
    if (!expense?.card_id) continue;
    const dueMonth = String(installment.due_month).slice(0, 7);
    const date = `${dueMonth}-01`;
    events.push({
      id: installment.id,
      kind: 'INSTALLMENT',
      date,
      label: expense.description || 'Parcela do cartão',
      amount,
      direction: 'OUT',
      status: eventStatus(date, input.referenceDate),
      cardId: expense.card_id,
      installmentNumber: installment.installment_number,
      dueMonth,
    });
  }

  for (const payable of input.payables) {
    if (!payable.due_date || ['PAID', 'CANCELED'].includes(payable.status)) continue;
    const amount = Math.max(0, finiteMoney(payable.outstanding_balance));
    if (amount <= 0) continue;
    events.push({
      id: payable.id,
      kind: 'PAYABLE',
      date: payable.due_date.slice(0, 10),
      label: payable.description || payable.creditor_name || 'Conta a pagar',
      amount,
      direction: 'OUT',
      status: eventStatus(payable.due_date.slice(0, 10), input.referenceDate),
    });
  }

  for (const payment of input.invoicePayments) {
    if (payment.request_id && operationRequestIds.has(payment.request_id)) continue;
    const date = String(payment.created_at).slice(0, 10);
    events.push({
      id: payment.id,
      kind: 'INVOICE_PAYMENT',
      date,
      label: 'Pagamento de fatura',
      amount: Math.abs(finiteMoney(payment.amount)),
      direction: 'OUT',
      status: 'PAID',
      accountId: payment.account_id,
      cardId: payment.card_id,
      dueMonth: String(payment.due_month).slice(0, 7),
    });
  }

  return events
    .sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id))
    .slice(0, input.limit ?? 20);
}
