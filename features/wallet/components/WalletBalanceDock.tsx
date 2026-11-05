import React from 'react';
import { WalletCards } from 'lucide-react';
import { formatMoney } from '../../../utils/formatters';
import { useWalletSnapshot } from '../hooks/useWalletSnapshot';

/** Saldo operacional compacto, presente também fora da Visão geral. */
export const WalletBalanceDock: React.FC = () => {
  const { data } = useWalletSnapshot();
  if (!data) return null;
  const accountBalance = data.accounts.reduce((sum, account) => sum + Number(account.balance || 0), 0);
  const cardAvailable = data.cards.reduce((sum, card) => sum + Math.max(0, Number(card.credit_limit || 0) - Number(card.used_limit || 0)), 0);
  return <aside aria-label="Saldo rápido da Carteira" className="sticky top-2 z-20 mb-3 flex min-w-0 items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/95 px-3 py-2 shadow-lg backdrop-blur sm:top-3 sm:px-4">
    <div className="flex min-w-0 items-center gap-2"><WalletCards size={16} className="shrink-0 text-blue-300"/><span className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-400">Saldo em contas</span></div>
    <div className="flex shrink-0 items-baseline gap-3"><strong className="text-sm tabular-nums text-emerald-300 sm:text-base">{formatMoney(accountBalance)}</strong><span className="hidden text-[11px] text-slate-500 sm:inline">Cartões disponíveis {formatMoney(cardAvailable)}</span></div>
  </aside>;
};
