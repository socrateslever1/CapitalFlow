import { PrivateMoney } from '../../../contexts/FinancialPrivacyContext';
import React from 'react';
import { WalletCards } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { formatMoney } from '../../../utils/formatters';
import { useWalletSnapshot } from '../hooks/useWalletSnapshot';
import { getCardAvailablePresentation } from '../domain/cardAvailablePresentation';
import { getWalletRoute } from '../routes';

/** Saldo operacional compacto, presente também fora da Visão geral. */
export const WalletBalanceDock: React.FC = () => {
  const location = useLocation();
  const route = getWalletRoute(location.pathname);
  const { data } = useWalletSnapshot();
  if (route === 'visao-geral' || !data) return null;
  const accountBalance = data.accounts.reduce((sum, account) => sum + Number(account.balance || 0), 0);
  const cardAvailable = data.cards.reduce((sum, card) =>
    sum + Math.round(getCardAvailablePresentation(card, data.cardInvoiceFacts, data).amount * 100), 0) / 100;
  return <aside aria-label="Saldo em contas" className="mb-2 flex w-full min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800/80 bg-slate-950/80 px-2.5 py-1">
    <div className="flex min-w-0 items-center gap-1.5"><WalletCards size={13} className="shrink-0 text-blue-300" /><span className="truncate text-[10px] font-semibold uppercase tracking-wide text-slate-400">Saldo em contas</span></div>
    <div className="flex min-w-0 items-baseline gap-2.5"><strong className="truncate text-xs font-bold tabular-nums text-emerald-300 sm:text-sm"><PrivateMoney value={formatMoney(accountBalance)} /></strong><span className="hidden text-[11px] text-slate-400 sm:inline">Cartões disponíveis (banco/estimado) <PrivateMoney value={formatMoney(cardAvailable)} /></span></div>
  </aside>;
};
