import { PrivateMoney } from '../../../contexts/FinancialPrivacyContext';
import React from 'react';
import { WalletCards } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { formatMoney } from '../../../utils/formatters';
import { useWalletSnapshot } from '../hooks/useWalletSnapshot';
import { getWalletRoute } from '../routes';

/** Saldo operacional compacto, presente também fora da Visão geral. */
export const WalletBalanceDock: React.FC = () => {
  const location = useLocation();
  const route = getWalletRoute(location.pathname);
  const { data } = useWalletSnapshot();
  if (route === 'visao-geral' || !data) return null;
  const accountBalance = data.accounts.reduce((sum, account) => sum + Number(account.balance || 0), 0);
  const cardAvailable = data.cards.reduce((sum, card) => sum + Math.max(0, Number(card.credit_limit || 0) - Number(card.used_limit || 0)), 0);
  return <aside aria-label="Saldo em contas" className="mb-3 flex w-full min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800/90 bg-slate-950/85 px-3 py-2">
    <div className="flex min-w-0 items-center gap-2"><WalletCards size={15} className="shrink-0 text-blue-300"/><span className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-400">Saldo em contas</span></div>
    <div className="flex min-w-0 items-baseline gap-3"><strong className="truncate text-sm font-bold tabular-nums text-emerald-300 sm:text-base"><PrivateMoney value={formatMoney(accountBalance)} /></strong><span className="hidden text-[11px] text-slate-400 sm:inline">Cartões disponíveis <PrivateMoney value={formatMoney(cardAvailable)} /></span></div>
  </aside>;
};
