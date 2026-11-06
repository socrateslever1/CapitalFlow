import type { PersonalWalletAccount } from '../../../services/personalWallet.service';
import type { CapitalSource } from '../../../types';

export function getCapitalLinkState(account: PersonalWalletAccount, sources: CapitalSource[]) {
  if (!account.capital_source_id) return { status: 'unlinked' as const, source: null };
  const source = sources.find(item => item.id === account.capital_source_id);
  if (!source) return { status: 'unavailable' as const, source: null };
  const walletBalance = Number(account.balance);
  const capitalBalance = Number(source.balance);
  const equal = Number.isFinite(walletBalance) && Number.isFinite(capitalBalance)
    && Math.round(walletBalance * 100) === Math.round(capitalBalance * 100);
  return { status: equal ? 'linked' as const : 'divergent' as const, source };
}

export type CapitalSourceLinkChoice = {
  source: CapitalSource;
  selectable: boolean;
  reason: string | null;
};

/**
 * Exibe TODAS as fontes ativas recebidas do Capital, sem confundir visibilidade
 * com elegibilidade de vínculo. A validação financeira não pode ser burlada
 * por um elemento de interface que simplesmente oculta as fontes inelegíveis.
 */
export function getAccountCapitalSourceChoices(
  account: PersonalWalletAccount,
  accounts: PersonalWalletAccount[],
  sources: CapitalSource[],
): CapitalSourceLinkChoice[] {
  return sources.map(source => {
    if (source.id === account.capital_source_id) {
      return { source, selectable: true, reason: null };
    }
    if (['CARD', 'MISTO'].includes(source.type)) {
      return { source, selectable: false, reason: 'fonte de crédito ou mista' };
    }
    if (accounts.some(other => other.id !== account.id && other.capital_source_id === source.id)) {
      return { source, selectable: false, reason: 'vinculada a outra conta' };
    }
    const walletBalance = Number(account.balance);
    const sourceBalance = Number(source.balance);
    if (!Number.isFinite(walletBalance) || !Number.isFinite(sourceBalance)
      || Math.round(walletBalance * 100) !== Math.round(sourceBalance * 100)) {
      return { source, selectable: false, reason: 'saldos diferentes' };
    }
    return { source, selectable: true, reason: null };
  });
}

/** Elegíveis para movimentação financeira; não corresponde à lista exibida. */
export function getEligibleAccountCapitalSources(
  account: PersonalWalletAccount,
  accounts: PersonalWalletAccount[],
  sources: CapitalSource[],
): CapitalSource[] {
  return getAccountCapitalSourceChoices(account, accounts, sources)
    .filter(choice => choice.selectable).map(choice => choice.source);
}
