import React, { useMemo } from 'react';
import { ArrowUpRight, Landmark, Wallet } from 'lucide-react';
import type { PersonalWalletAccount } from '../../services/personalWallet.service';
import { formatMoney } from '../../utils/formatters';
import { BankLogo } from './BankLogo';
import { getBankVisual, walletAccountTypeLabel } from './walletPresentation';

type Props = { accounts: PersonalWalletAccount[]; onOpen: (account: PersonalWalletAccount) => void };

/** Uma superfície consistente por instituição, sem simular cartões de crédito. */
export const AccountCardStack: React.FC<Props> = ({ accounts, onOpen }) => {
  const total = useMemo(() => accounts.reduce((sum, account) => sum + Number(account.balance || 0), 0), [accounts]);

  if (!accounts.length) return (
    <div className="rounded-2xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-400">
      Nenhuma conta cadastrada.
    </div>
  );

  return (
    <section aria-label="Contas e saldos" className="space-y-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-white">Suas contas</h2>
          <p className="mt-1 text-xs text-slate-400">Selecione uma conta para movimentar ou editar.</p>
        </div>
        <span className="rounded-lg border border-slate-700/70 bg-slate-950/60 px-2.5 py-1 text-[11px] text-slate-300">
          {accounts.length} {accounts.length === 1 ? 'conta' : 'contas'}
        </span>
      </header>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
        {accounts.map(account => {
          const visual = getBankVisual(account.institution_key || account.bank_name || account.nickname);
          const isCash = account.account_type === 'CASH';
          return (
            <button key={account.id} type="button" onClick={() => onOpen(account)}
              className="group relative flex min-h-[166px] min-w-0 flex-col justify-between overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950/70 p-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-500/80 hover:bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70">
              <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: visual.accent }} />
              <span aria-hidden="true" className="pointer-events-none absolute -right-8 -top-8 h-36 w-36 rounded-full opacity-[0.07]" style={{ backgroundColor: visual.accent }} />
              <span className="relative flex w-full items-start justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-900">
                    {isCash ? <Wallet size={21} className="text-amber-300" /> : <BankLogo name={account.bank_name} alternateName={account.nickname} size="sm" />}
                  </span>
                  <span className="min-w-0">
                    <strong className="block truncate text-sm font-bold text-white">{account.nickname}</strong>
                    <span className="block truncate text-[11px] text-slate-400">
                      {isCash ? 'Dinheiro em espécie' : account.bank_name || 'Instituição financeira'}
                    </span>
                  </span>
                </span>
                <ArrowUpRight size={18} className="shrink-0 text-slate-500 transition-colors group-hover:text-emerald-300" />
              </span>
              <span className="relative mt-5 flex items-end justify-between gap-2">
                <span className="min-w-0">
                  <span className="mb-1 block text-[10px] font-medium text-slate-400">Saldo disponível</span>
                  <strong className="block truncate text-xl font-extrabold tabular-nums tracking-tight text-white sm:text-2xl">{formatMoney(Number(account.balance || 0))}</strong>
                </span>
                <span className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-700/60 px-2 py-1 text-[10px] text-slate-300">
                  {!isCash && <Landmark size={11} />}
                  {walletAccountTypeLabel(account.account_type)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-500/15 bg-emerald-500/5 px-4 py-3">
        <span className="text-xs font-semibold text-slate-300">Saldo consolidado</span>
        <strong className="text-lg font-extrabold tabular-nums text-emerald-300">{formatMoney(total)}</strong>
      </div>
    </section>
  );
};
