import type { CapitalSource } from '../../types';

export type WalletReferenceKind = 'ACCOUNT' | 'CARD';
export type WalletReference = {
  source_id: string;
  target_kind: WalletReferenceKind;
  target_id: string;
  allocated_amount?: number | null;
};
export type WalletResource = {
  id: string;
  nickname: string;
  balance?: number | null;
  available_limit?: number | null;
  status?: string | null;
  capital_source_id?: string | null;
};

export const encodeWalletReference = (kind: WalletReferenceKind, id: string): string => kind + ':' + id;

export function decodeWalletReference(raw: string): { kind: WalletReferenceKind; id: string } | null {
  const match = /^(ACCOUNT|CARD):([0-9a-f]{8}-[0-9a-f-]{27,})$/i.exec(raw);
  return match ? { kind: match[1] as WalletReferenceKind, id: match[2] } : null;
}

export function getSourceWalletAvailability(
  source: Pick<CapitalSource, 'balance'>,
  link: WalletReference | null,
  accounts: readonly WalletResource[],
  cards: readonly WalletResource[],
): { kind: 'MANUAL' | WalletReferenceKind | 'UNAVAILABLE'; amount: number | null; label: string; differs: boolean } {
  const manual = Number(source.balance);
  if (!link) {
    return {
      kind: 'MANUAL',
      amount: Number.isFinite(manual) ? manual : null,
      label: 'Valor informado na fonte',
      differs: false,
    };
  }
  const target = (link.target_kind === 'ACCOUNT' ? accounts : cards)
    .find(item => item.id === link.target_id);
  if (!target || (link.target_kind === 'CARD' && target.status !== 'ACTIVE')
      || (link.target_kind === 'ACCOUNT' && target.capital_source_id)) {
    return { kind: 'UNAVAILABLE', amount: null, label: 'Recurso indisponível', differs: false };
  }
  const rawValue = link.target_kind === 'ACCOUNT' ? target.balance : target.available_limit;
  const value = Number(rawValue);
  if (rawValue == null || !Number.isFinite(value)) {
    return { kind: 'UNAVAILABLE', amount: null, label: 'Disponibilidade não confirmada', differs: false };
  }
  return {
    kind: link.target_kind,
    amount: Math.round(value * 100) / 100,
    label: link.target_kind === 'ACCOUNT' ? 'Saldo da conta' : 'Crédito disponível no cartão',
    differs: Number.isFinite(manual) && Math.round(value * 100) !== Math.round(manual * 100),
  };
}
