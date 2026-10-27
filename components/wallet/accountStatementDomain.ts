export type AccountStatementEntry = {
  id: string;
  date: string;
  label: string;
  category: string;
  // Operation badges are intentionally extensible as new ledger integrations are added.
  tag: string;
  amount: number;
};

type AccountLike = { id: string; nickname: string };
type OperationLike = {
  id: string; request_id?: string; operation_type: string;
  from_account_id: string | null; to_account_id: string | null;
  amount: number; description: string; category: string;
  operation_date: string; occurred_at?: string | null; recipient_name?: string | null;
  pix_key?: string | null; external_identifier?: string | null; created_at: string;
  charge_id?: string | null;
  contract_id?: string | null;
  installment_id?: string | null;
};
type ExpenseLike = {
  id: string; account_id?: string | null; status: string;
  expense_date: string; description: string; amount: number;
};
type InvoicePaymentLike = {
  id: string; request_id?: string; card_id?: string; due_month?: string; account_id: string | null;
  amount: number; source: string; created_at: string;
};
type StatementRowLike = {
  id: string; document_hash?: string; row_key?: string; target_kind: string; target_id: string; entry_date: string;
  description: string; amount: number; category: string;
};

export function buildAccountStatementEntries(input: {
  accountId: string;
  accounts: AccountLike[];
  operations: OperationLike[];
  expenses: ExpenseLike[];
  invoicePayments: InvoicePaymentLike[];
  statementRows: StatementRowLike[];
}): AccountStatementEntry[] {
  const operationRequestIds = new Set(
    input.operations.map(operation => operation.request_id).filter(Boolean),
  );
  const operationEntries = input.operations
    .filter(operation => operation.from_account_id === input.accountId || operation.to_account_id === input.accountId)
    .map(operation => {
      const incoming = operation.to_account_id === input.accountId;
      const otherId = incoming ? operation.from_account_id : operation.to_account_id;
      const other = input.accounts.find(account => account.id === otherId);
      let tag: AccountStatementEntry['tag'] = 'Movimentação';
      let category = operation.category;
      if (operation.operation_type === 'TRANSFER') {
        tag = 'Transferência interna';
        category = `${incoming ? 'Recebida de' : 'Enviada para'} ${other?.nickname || 'outra conta'}`;
      } else if (operation.operation_type === 'EXTERNAL_TRANSFER') {
        tag = 'PIX/TED enviado';
        category = [
          operation.recipient_name ? `Para ${operation.recipient_name}` : null,
          operation.pix_key ? `PIX ${operation.pix_key}` : null,
          operation.external_identifier ? `ID ${operation.external_identifier}` : null,
        ].filter(Boolean).join(' · ') || operation.category;
      } else if (operation.operation_type === 'PAYMENT') {
        tag = 'Pagamento de fatura';
      } else if (operation.operation_type === 'RECEIPT' && operation.charge_id) {
        tag = 'Cobrança recebida';
      } else if (operation.operation_type === 'LOAN_DISBURSEMENT') {
        tag = 'Empréstimo concedido';
        category = 'Empréstimo concedido';
      } else if (operation.operation_type === 'LOAN_REPAYMENT') {
        tag = 'Parcela recebida';
        category = operation.category || 'Parcela recebida';
      } else if (operation.operation_type === 'INCOME' && operation.category === 'Saldo inicial') {
        tag = 'Saldo inicial';
      }
      return {
        id: operation.id,
        date: operation.operation_date,
        label: operation.description,
        category,
        tag,
        amount: incoming ? Number(operation.amount) : -Number(operation.amount),
      };
    });
  const legacyExpenses = input.expenses
    .filter(expense => expense.account_id === input.accountId && expense.status === 'PAID')
    .map(expense => ({
      id: `legacy-expense-${expense.id}`,
      date: expense.expense_date,
      label: expense.description,
      category: 'Despesa já registrada',
      tag: 'Movimentação' as const,
      amount: -Number(expense.amount || 0),
    }));
  const legacyInvoicePayments = input.invoicePayments
    .filter(payment => payment.account_id === input.accountId
      && payment.source === 'ACCOUNT'
      && (!payment.request_id || !operationRequestIds.has(payment.request_id)))
    .map(payment => ({
      id: `card-payment-${payment.id}`,
      date: payment.created_at,
      label: 'Pagamento de fatura',
      category: 'Cartão de crédito (registro anterior)',
      tag: 'Pagamento de fatura' as const,
      amount: -Number(payment.amount || 0),
    }));
  const importedRows = input.statementRows
    .filter(row => row.target_kind === 'ACCOUNT' && row.target_id === input.accountId)
    .map(row => ({
      id: `import-${row.id}`,
      date: row.entry_date,
      label: row.description,
      category: row.category,
      tag: 'Importado de PDF' as const,
      amount: Number(row.amount),
    }));
  return [...operationEntries, ...legacyExpenses, ...legacyInvoicePayments, ...importedRows]
    .sort((left, right) => right.date.localeCompare(left.date));
}

export type OpenInvoiceOption = {
  cardId: string;
  cardName: string;
  dueMonth: string;
  openAmount: number;
};

export function buildOpenInvoiceOptions(
  cards: Array<{ id: string; nickname: string }>,
  expenses: Array<{ id: string; card_id?: string | null }>,
  installments: Array<{ id?: string; expense_id: string; due_month: string; amount: number; paid_amount?: number; status: string }>,
): OpenInvoiceOption[] {
  const expenseCard = new Map(expenses.filter(expense => expense.card_id).map(expense => [expense.id, expense.card_id as string]));
  const totals = new Map<string, number>();
  for (const installment of installments) {
    if (installment.status !== 'PENDING') continue;
    const cardId = expenseCard.get(installment.expense_id);
    if (!cardId) continue;
    const openAmount = Math.max(0, Number(installment.amount) - Number(installment.paid_amount || 0));
    if (openAmount <= 0) continue;
    const key = `${cardId}:${installment.due_month}`;
    totals.set(key, Number(((totals.get(key) || 0) + openAmount).toFixed(2)));
  }
  return [...totals.entries()].map(([key, openAmount]) => {
    const separator = key.indexOf(':');
    const cardId = key.slice(0, separator);
    const dueMonth = key.slice(separator + 1);
    return { cardId, dueMonth, openAmount, cardName: cards.find(card => card.id === cardId)?.nickname || 'Cartão' };
  }).sort((left, right) => left.dueMonth.localeCompare(right.dueMonth) || left.cardName.localeCompare(right.cardName));
}
