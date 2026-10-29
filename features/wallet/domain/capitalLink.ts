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
