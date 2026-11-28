import type { PersonalWalletCard, PersonalWalletExpense } from '../../../services/personalWallet.service';

/** A bank observation is not the calculated balance and is never live data. */
export type CardBankAvailableReference = {
  card_id: string;
  available_limit: number | null;
  updated_at: string;
  due_month?: string;
};

const inCents = (value: number): number => Math.round(value * 100);

/** Movimentos registrados no app, usados para atualizar uma referência bancária antiga. */
export type CardAvailableMovements = {
  expenses?: readonly Pick<PersonalWalletExpense, 'card_id' | 'amount' | 'status' | 'entry_type' | 'is_invoice_credit' | 'expense_date' | 'created_at'>[];
};

const manausDate = (iso: string): string => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Manaus', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date(iso));

/**
 * Valor acrescentado a UMA fatura por compras lançadas depois de uma referência
 * do banco (mesmo critério do disponível: registradas depois e com data
 * posterior ao dia da referência). Usado para não alertar diferença que é só
 * fruto dessas compras.
 */
export function getInvoiceAdditionsSinceReferenceCents(input: {
  cardId: string;
  dueMonth: string;
  referenceUpdatedAt: string;
  expenses: readonly Pick<PersonalWalletExpense, 'id' | 'card_id' | 'status' | 'entry_type' | 'is_invoice_credit' | 'expense_date' | 'created_at' | 'invoice_due_month'>[];
  installments: readonly { expense_id: string; due_month: string; amount: number; status: string }[];
  payments?: readonly { card_id: string; due_month: string; amount: number; created_at: string }[];
}): number {
  const referenceTime = Date.parse(input.referenceUpdatedAt);
  if (!Number.isFinite(referenceTime)) return 0;
  const referenceDay = manausDate(input.referenceUpdatedAt);
  const month = input.dueMonth.slice(0, 7);
  const recent = new Map(input.expenses
    .filter(expense => expense.card_id === input.cardId && expense.status !== 'CANCELED'
      && expense.entry_type !== 'INVOICE_OVERRIDE'
      && typeof expense.created_at === 'string' && Date.parse(expense.created_at) > referenceTime
      && String(expense.expense_date || '').slice(0, 10) > referenceDay)
    .map(expense => [expense.id, expense]));
  let cents = 0;
  for (const installment of input.installments) {
    const expense = recent.get(installment.expense_id);
    if (!expense || installment.status === 'CANCELED') continue;
    if (String(expense.invoice_due_month || installment.due_month).slice(0, 7) !== month) continue;
    const value = inCents(Math.abs(Number(installment.amount) || 0));
    cents += expense.is_invoice_credit ? -value : value;
  }
  for (const payment of input.payments || []) {
    if (payment.card_id !== input.cardId || String(payment.due_month).slice(0, 7) !== month) continue;
    if (!Number.isFinite(Date.parse(payment.created_at)) || Date.parse(payment.created_at) <= referenceTime) continue;
    cents -= inCents(Math.abs(Number(payment.amount) || 0));
  }
  return cents;
}

/**
 * Variação do limite usado desde a referência bancária, em centavos.
 * Conta só compras registradas DEPOIS da referência e com data POSTERIOR ao dia
 * dela: compras antigas (ou do mesmo dia) importadas depois já podiam estar no
 * número do banco. Pagamentos não são somados: o app não sabe se o banco já os
 * havia processado, e somar de novo superestimaria o disponível. Na dúvida, o
 * disponível fica menor, nunca maior.
 */
export function getUsageSinceReferenceCents(
  cardId: string,
  reference: CardBankAvailableReference,
  movements: CardAvailableMovements = {},
): number {
  const referenceTime = Date.parse(reference.updated_at);
  const referenceDay = manausDate(reference.updated_at);
  const after = (createdAt?: string | null) =>
    typeof createdAt === 'string' && Number.isFinite(Date.parse(createdAt)) && Date.parse(createdAt) > referenceTime;
  let cents = 0;
  for (const expense of movements.expenses || []) {
    if (expense.card_id !== cardId || expense.status === 'CANCELED' || expense.entry_type === 'INVOICE_OVERRIDE') continue;
    if (!after(expense.created_at) || String(expense.expense_date || '').slice(0, 10) <= referenceDay) continue;
    const value = inCents(Math.abs(Number(expense.amount) || 0));
    cents += expense.is_invoice_credit ? -value : value;
  }
  return cents;
}

/** Reuse one selection policy across Overview, Cards and the wallet dock. */
export function getCardAvailablePresentation(
  card: Pick<PersonalWalletCard, 'id' | 'credit_limit' | 'used_limit'>,
  facts: readonly CardBankAvailableReference[] = [],
  movements?: CardAvailableMovements,
): {
  amount: number;
  estimatedAmount: number;
  origin: 'BANK' | 'ESTIMATED';
  bankReference: CardBankAvailableReference | null;
  /** Variação registrada no app desde a referência bancária (positivo = mais uso). */
  usageSinceReference: number;
} {
  const estimatedAmount = Math.max(0, inCents(
    Math.max(0, Number(card.credit_limit) || 0) - Math.max(0, Number(card.used_limit) || 0),
  )) / 100;
  const bankReference = facts.filter(fact => fact.card_id === card.id &&
    fact.available_limit != null && Number.isFinite(Number(fact.available_limit)) &&
    Number(fact.available_limit) >= 0 &&
    typeof fact.updated_at === 'string' && Number.isFinite(Date.parse(fact.updated_at)))
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at) ||
      String(b.due_month || '').localeCompare(String(a.due_month || '')))[0] ?? null;
  const usageCents = bankReference ? getUsageSinceReferenceCents(card.id, bankReference, movements) : 0;
  const limitCents = Math.max(0, inCents(Number(card.credit_limit) || 0));
  const bankAmountCents = bankReference
    ? Math.min(limitCents || Number.MAX_SAFE_INTEGER,
      Math.max(0, inCents(Number(bankReference.available_limit)) - usageCents))
    : 0;
  return {
    amount: bankReference ? bankAmountCents / 100 : estimatedAmount,
    estimatedAmount,
    origin: bankReference ? 'BANK' : 'ESTIMATED',
    bankReference,
    usageSinceReference: usageCents / 100,
  };
}

export function formatCardAvailableOrigin(
  reference: CardBankAvailableReference | null,
  usageSinceReference = 0,
): string {
  if (!reference) return 'Limite estimado';
  const label = 'Disponível · banco ' + new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Manaus', day: '2-digit', month: '2-digit',
  }).format(new Date(reference.updated_at));
  // Deixa claro que o número do banco foi atualizado com lançamentos posteriores.
  return Math.round(usageSinceReference * 100) !== 0 ? label + ' + lançamentos' : label;
}
