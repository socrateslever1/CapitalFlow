import type { WalletReference, WalletResource } from './sourceWalletReference';

export type SourceReferenceDisplay = {
  total: number | null;
  entries: Array<{
    kind: 'ACCOUNT' | 'CARD';
    name: string;
    amount: number | null;
    available: number | null;
    manuallyAllocated: boolean;
  }>;
};

/**
 * Calcula somente valores informativos da Minha Carteira.
 * Nenhum valor deve ser usado para alterar fontes.balance, ledger ou limites.
 * Ausência de dados não equivale a zero.
 */
export function buildSourceReferenceDisplay(
  links: readonly WalletReference[],
  accounts: readonly WalletResource[],
  cards: readonly WalletResource[],
): SourceReferenceDisplay | null {
  if (!links.length) return null;
  let totalCents = 0;
  let incomplete = false;
  const entries = links.map(link => {
    const resource = (link.target_kind === 'ACCOUNT' ? accounts : cards)
      .find(item => item.id === link.target_id);
    const valid = !!resource &&
      (link.target_kind === 'CARD'
        ? resource.status === 'ACTIVE'
        : !resource.capital_source_id);
    const raw = valid
      ? link.target_kind === 'ACCOUNT' ? resource?.balance : resource?.available_limit
      : null;
    const available = raw == null || !Number.isFinite(Number(raw))
      ? null : Math.round(Number(raw) * 100) / 100;
    const allocatedRaw = link.allocated_amount;
    const allocated = allocatedRaw == null ? null : Number(allocatedRaw);
    const manuallyAllocated = allocatedRaw != null;
    const amount = manuallyAllocated
      ? (Number.isFinite(allocated) && allocated >= 0 ? Math.round(allocated * 100) / 100 : null)
      : available;
    if (amount === null) incomplete = true;
    else totalCents += Math.round(amount * 100);
    return {
      kind: link.target_kind,
      name: resource?.nickname || 'Recurso indisponível',
      amount,
      available,
      manuallyAllocated,
    };
  });
  return {
    total: incomplete ? null : totalCents / 100,
    entries,
  };
}
