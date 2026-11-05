/**
 * Separação lógica da Minha Carteira em duas épocas: arquivo anterior e nova carteira.
 * O núcleo de empréstimos e as fontes de capital não participam deste filtro.
 */
export type WalletResetArchive = {
  archived_at: string;
  hidden_ids: Record<string, unknown>;
  restored_at?: string | null;
};

export function filterCurrentWalletRows<T extends { id: string }>(
  rows: readonly T[],
  archive: WalletResetArchive | null,
  collection: string,
): T[] {
  if (!archive || archive.restored_at) return [...rows];
  const ids = archive.hidden_ids?.[collection];
  if (!Array.isArray(ids)) throw new Error('Arquivo da carteira inválido: ' + collection);
  const excluded = new Set(ids.filter((id): id is string => typeof id === 'string'));
  return rows.filter(row => !excluded.has(row.id));
}

export function countWalletArchive(archive: WalletResetArchive | null): Record<string, number> {
  if (!archive || archive.restored_at) return {};
  return Object.fromEntries(Object.entries(archive.hidden_ids).map(([name, ids]) => [
    name, Array.isArray(ids) ? ids.length : 0,
  ]));
}
