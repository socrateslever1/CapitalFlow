/** First render uses the full snapshot; a per-card query must never flash estimates. */
export type CardFactsQuery<T> = Readonly<{
  cardId: string;
  source: readonly T[] | undefined;
  outcome: 'READY' | 'ERROR';
  facts: readonly T[];
}>;
export type CardFactsView<T> = { facts: T[]; status: 'LOADING' | 'READY' | 'ERROR' };
export function resolveCardInvoiceFactsView<T extends { card_id: string }>(
  cardId: string | null,
  snapshotFacts: readonly T[] | undefined,
  fetched: CardFactsQuery<T> | null,
): CardFactsView<T> {
  if (!cardId) return { facts: [], status: 'READY' };
  const snapshot = (snapshotFacts || []).filter(fact => fact.card_id === cardId);
  if (!fetched || fetched.cardId !== cardId || fetched.source !== snapshotFacts) {
    return { facts: snapshot, status: 'LOADING' };
  }
  return fetched.outcome === 'ERROR'
    ? { facts: snapshot, status: 'ERROR' }
    : { facts: fetched.facts.filter(fact => fact.card_id === cardId), status: 'READY' };
}
