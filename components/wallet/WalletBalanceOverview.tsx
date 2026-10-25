import React from 'react';
import { ArrowDownRight, ArrowUpRight, Landmark, ReceiptText, Scale, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import type { PersonalWalletAccount, PersonalWalletPayable, WalletRecurringIncome } from '../../services/personalWallet.service';
import { formatMoney } from '../../utils/formatters';
import { calculateWalletBalance } from './walletBalanceDomain';

type WalletBalanceOverviewProps = {
  accounts: PersonalWalletAccount[];
  recurringIncomes: WalletRecurringIncome[];
  receivedIncomeIds: Set<string>;
  openCardInvoices: number;
  payables: PersonalWalletPayable[];
  month: string;
};

export const WalletBalanceOverview: React.FC<WalletBalanceOverviewProps> = (props) => {
  const balance = calculateWalletBalance(props);
  const positive = balance.projectedBalance >= 0;
  return (
    <section aria-labelledby="wallet-balance-title" className="rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[.2em] text-blue-400"><Scale size={14}/> Visão consolidada</p>
          <h2 id="wallet-balance-title" className="mt-1 text-base font-black text-white">Balanço Geral da Carteira</h2>
          <p className="mt-1 text-[11px] text-slate-400">Recursos disponíveis e obrigações do mês, sem misturar instituições.</p>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-extrabold ${positive ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-rose-500/30 bg-rose-500/10 text-rose-300'}`}>
          {positive ? <TrendingUp size={13}/> : <TrendingDown size={13}/>} {positive ? 'Superávit Projetado' : 'Déficit Previsto'}
        </span>
      </header>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-emerald-500/15 bg-emerald-950/20 p-4">
          <h3 className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-emerald-300"><ArrowUpRight size={16}/> Recursos disponíveis</h3>
          <div className="mt-3 space-y-2 text-xs">
            <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-slate-400"><Landmark size={14}/> Saldos em conta</span><strong className="text-slate-100">{formatMoney(balance.accountBalance)}</strong></div>
            <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-slate-400"><Wallet size={14}/> Receitas a receber</span><strong className="text-slate-100">{formatMoney(balance.pendingRecurringIncome)}</strong></div>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-emerald-500/15 pt-3"><span className="text-xs font-bold text-emerald-300">Total de Recursos</span><strong className="text-base font-black text-emerald-300">{formatMoney(balance.totalResources)}</strong></div>
        </div>

        <div className="rounded-2xl border border-rose-500/15 bg-rose-950/20 p-4">
          <h3 className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-rose-300"><ArrowDownRight size={16}/> Obrigações e dívidas</h3>
          <div className="mt-3 space-y-2 text-xs">
            <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-slate-400"><ReceiptText size={14}/> Faturas abertas</span><strong className="text-slate-100">{formatMoney(balance.openCardInvoices)}</strong></div>
            <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-slate-400"><Scale size={14}/> Contas a pagar no mês</span><strong className="text-slate-100">{formatMoney(balance.monthPayables)}</strong></div>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-rose-500/15 pt-3"><span className="text-xs font-bold text-rose-300">Total de Passivos</span><strong className="text-base font-black text-rose-300">{formatMoney(balance.totalLiabilities)}</strong></div>
        </div>
      </div>

      <div className={`mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3 ${positive ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-rose-500/20 bg-rose-500/5'}`}>
        <span className="text-xs font-bold text-slate-300">Saldo Projetado do Mês</span>
        <strong className={`text-lg font-black ${positive ? 'text-emerald-300' : 'text-rose-300'}`}>{formatMoney(balance.projectedBalance)}</strong>
      </div>
    </section>
  );
};
