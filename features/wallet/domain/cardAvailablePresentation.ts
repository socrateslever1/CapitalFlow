import type { PersonalWalletCard } from '../../../services/personalWallet.service';

/** A bank observation is not the calculated balance and is never live data. */
export type CardBankAvailableReference = {
  card_id: string;
  available_limit: number | null;
  updated_at: string;
  due_month?: string;
};

const inCents = (value: number): number => Math.round(value * 100);

/** Reuse one selection policy across Overview, Cards and the wallet dock. */
export function getCardAvailablePresentation(
  card: Pick<PersonalWalletCard, 'id' | 'credit_limit' | 'used_limit'>,
  facts: readonly CardBankAvailableReference[] = [],
): {
  amount: number;
  estimatedAmount: number;
  origin: 'BANK' | 'ESTIMATED';
  bankReference: CardBankAvailableReference | null;
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
  return {
    amount: bankReference ? inCents(Number(bankReference.available_limit)) / 100 : estimatedAmount,
    estimatedAmount,
    origin: bankReference ? 'BANK' : 'ESTIMATED',
    bankReference,
  };
}

export function formatCardAvailableOrigin(reference: CardBankAvailableReference | null): string {
  if (!reference) return 'Limite estimado';
  return 'Banco · ' + new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Manaus', day: '2-digit', month: '2-digit',
  }).format(new Date(reference.updated_at));
}
