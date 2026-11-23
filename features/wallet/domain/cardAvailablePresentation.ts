import type { PersonalWalletCard, PersonalWalletExpense, PersonalWalletInvoicePayment } from '../../../services/personalWallet.service';

/** An issuer observation is historical evidence, not a live limit. */
export type CardBankAvailableReference = {
  card_id: string;
  available_limit: number | null;
  updated_at: string;
  /** When the issuer amount was observed; distinct from subsequent row edits. */
  observed_at?: string | null;
  due_month?: string;
};

/** Read-only financial input. One purchase is counted once, not by installment count. */
export type CardAvailableLedger = {
  expenses: readonly Pick<PersonalWalletExpense,
    'card_id' | 'amount' | 'expense_date' | 'status' | 'entry_type' | 'is_invoice_credit' | 'is_opening_summary'>[];
  invoicePayments: readonly Pick<PersonalWalletInvoicePayment, 'card_id' | 'amount' | 'created_at'>[];
};

export type CardAvailablePresentation = {
  amount: number;
  estimatedAmount: number;
  origin: 'BANK' | 'BANK_ADJUSTED' | 'ESTIMATED';
  bankReference: CardBankAvailableReference | null;
  /** Net movement since the bank observation; cents rounded at entry boundaries. */
  movementSinceBank: number;
  purchasesSinceBank: number;
  creditsSinceBank: number;
  paymentsSinceBank: number;
};
const cents = (amount: number) => Math.round(amount * 100);
const finiteMoney = (value: unknown) => typeof value === 'number' || typeof value === 'string'
  ? Number.isFinite(Number(value)) ? Number(value) : null : null;

function manausDay(iso: string): string | null {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Manaus', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(time));
  const part = (type: string) => parts.find(value => value.type === type)?.value;
  const year = part('year'), month = part('month'), day = part('day');
  return year && month && day ? `${year}-${month}-${day}` : null;
}

/**
 * Reconcile a dated bank observation with subsequent, non-duplicated entries.
 * Historical purchases imported AFTER the observation remain excluded when
 * their effective purchase date is earlier than the bank's local observation
 * day. The same-day gap is deliberately not guessed from created_at:
 * without an issuer transaction timestamp, inclusion cannot be proven.
 * Both pages consume this exact function; no database write is performed.
 */
export function getCardAvailablePresentation(
  card: Pick<PersonalWalletCard, 'id' | 'credit_limit' | 'used_limit'>,
  facts: readonly CardBankAvailableReference[] = [],
  ledger?: CardAvailableLedger,
): CardAvailablePresentation {
  const estimatedAmount = Math.max(0, cents(
    Math.max(0, Number(card.credit_limit) || 0) - Math.max(0, Number(card.used_limit) || 0),
  )) / 100;
  const bankReference = facts.filter(fact => fact.card_id === card.id &&
    fact.available_limit != null && Number.isFinite(Number(fact.available_limit)) &&
    Number(fact.available_limit) >= 0 &&
    typeof fact.updated_at === 'string' && Number.isFinite(Date.parse(fact.updated_at)))
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at) ||
      String(b.due_month || '').localeCompare(String(a.due_month || '')))[0] ?? null;
  if (!bankReference) return {
    amount: estimatedAmount, estimatedAmount, origin: 'ESTIMATED', bankReference: null,
    movementSinceBank: 0, purchasesSinceBank: 0, creditsSinceBank: 0, paymentsSinceBank: 0,
  };
  // A saved issuer value and its updated_at are written together by the
  // authenticated issuer-confirmation RPC, including ON CONFLICT updates.
  // observed_at belongs to the original row insertion and MUST NOT anchor
  // a bank value that was subsequently corrected.
  const observation = bankReference.updated_at;
  const bankDay = manausDay(observation);
  // If the observation date cannot be established or the ledger is not yet
  // complete, preserve the dated reference instead of manufacturing a delta.
  if (!ledger || !bankDay) return {
    amount: cents(Number(bankReference.available_limit)) / 100,
    estimatedAmount, origin: 'BANK', bankReference,
    movementSinceBank: 0, purchasesSinceBank: 0, creditsSinceBank: 0, paymentsSinceBank: 0,
  };
  let purchaseCents = 0, creditCents = 0, paymentCents = 0;
  for (const entry of ledger.expenses) {
    if (entry.card_id !== card.id || entry.status === 'CANCELED' ||
      entry.is_opening_summary || entry.entry_type === 'INVOICE_OVERRIDE' ||
      typeof entry.expense_date !== 'string' || entry.expense_date.slice(0, 10) <= bankDay) continue;
    const amount = finiteMoney(entry.amount);
    if (amount === null || amount < 0) continue;
    if (entry.is_invoice_credit) creditCents += cents(amount);
    else purchaseCents += cents(amount);
  }
  const observationTime = Date.parse(observation);
  for (const payment of ledger.invoicePayments) {
    if (payment.card_id !== card.id || !Number.isFinite(Date.parse(payment.created_at)) ||
      Date.parse(payment.created_at) <= observationTime) continue;
    const amount = finiteMoney(payment.amount);
    if (amount !== null && amount > 0) paymentCents += cents(amount);
  }
  const movementCents = creditCents + paymentCents - purchaseCents;
  const baseCents = cents(Number(bankReference.available_limit));
  return {
    amount: Math.max(0, baseCents + movementCents) / 100,
    estimatedAmount,
    origin: movementCents === 0 ? 'BANK' : 'BANK_ADJUSTED',
    bankReference,
    movementSinceBank: movementCents / 100,
    purchasesSinceBank: purchaseCents / 100,
    creditsSinceBank: creditCents / 100,
    paymentsSinceBank: paymentCents / 100,
  };
}

export function formatCardAvailableOrigin(
  reference: CardBankAvailableReference | null,
  origin: CardAvailablePresentation['origin'] = reference ? 'BANK' : 'ESTIMATED',
): string {
  if (!reference) return 'Limite estimado';
  const date = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Manaus', day: '2-digit', month: '2-digit',
  }).format(new Date(reference.observed_at || reference.updated_at));
  return origin === 'BANK_ADJUSTED' ? 'Projetado · ' + date : 'Banco · ' + date;
}
