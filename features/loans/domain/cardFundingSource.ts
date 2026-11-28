/** Mirrors the funding route used when a new contract is saved. */
export function usesSingleCardSource(
  sourceType: string | undefined,
  paymentMethod: string | undefined,
  allocationCount: number,
): boolean {
  if (allocationCount > 1) return false;
  const type = String(sourceType || '').toUpperCase();
  return type === 'CARD' || (type === 'MISTO' && paymentMethod === 'CREDIT_CARD');
}

export function checkLinkedCardFunding(
  links: readonly { target_kind: string; target_id: string }[],
  card: { status: string; credit_limit: number; used_limit: number } | null,
  total: number,
): 'LINK' | 'CARD' | 'LIMIT' | null {
  if (links.length !== 1 || links[0].target_kind !== 'CARD') return 'LINK';
  if (!card || card.status !== 'ACTIVE') return 'CARD';
  const availableCents = Math.round(Number(card.credit_limit) * 100) - Math.round(Number(card.used_limit) * 100);
  const requiredCents = Math.round(total * 100);
  if (!Number.isFinite(availableCents) || !Number.isFinite(requiredCents) || requiredCents <= 0 || availableCents < requiredCents) return 'LIMIT';
  return null;
}

