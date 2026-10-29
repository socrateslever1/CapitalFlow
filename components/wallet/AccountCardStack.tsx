import React, { useMemo } from 'react';
import { ArrowUpRight, Wallet } from 'lucide-react';
import type { PersonalWalletAccount } from '../../services/personalWallet.service';
import { formatMoney } from '../../utils/formatters';
import { BankLogo } from './BankLogo';
import { walletAccountTypeLabel } from './walletPresentation';

type Props = { accounts: PersonalWalletAccount[]; onOpen: (account: PersonalWalletAccount) => void; compact?: boolean };

/** Uma superfície consistente por instituição, sem simular cartões de crédito. */
export const AccountCardStack: React.FC<Props> = ({ accounts, onOpen, compact = false }) => {
  const total = useMemo(() => accounts.reduce((sum, account) => sum + Number(account.balance || 0), 0), [accounts]);

  if (!accounts.length) return (
    <div className="rounded-2xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-400">
      Nenhuma conta cadastrada.
    </div>
  );

  return (
    <section aria-label="Contas e saldos" className="space-y-4">
      {!compact && <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-white">Suas contas</h2>
          <p className="mt-1 text-sm text-slate-400">Selecione uma conta para movimentar ou editar.</p>
        </div>
        <span className="rounded-lg border border-slate-700/70 bg-slate-950/60 px-2.5 py-1 text-[11px] text-slate-300">
          {accounts.length} {accounts.length === 1 ? 'conta' : 'contas'}
        </span>
      </header>}
      <div className="divide-y divide-slate-800">
        {accounts.map(account => {
          const isCash = account.account_type === 'CASH';
          return (
            <button key={account.id} type="button" onClick={() => onOpen(account)}
              className="group flex min-h-24 w-full min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3 py-3 text-left transition-colors hover:bg-slate-800/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
              <span className="flex min-w-0 flex-1 items-center gap-3">
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-900">
                    {isCash ? <Wallet size={21} className="text-amber-300" /> : <BankLogo name={account.bank_name} alternateName={account.nickname} size="sm" />}
                  </span>
                  <span className="min-w-0">
                    <strong className="block truncate text-sm font-bold text-white">{account.nickname}</strong>
                    <span className="mt-1 block truncate text-xs text-slate-400">
                      {walletAccountTypeLabel(account.account_type)}
                    </span>
                  </span>
                </span>
              </span>
              <span className="ml-auto flex min-w-0 items-center gap-3 text-right">
                <span className="min-w-0">
                  <span className="mb-1 block text-xs text-slate-400">Saldo disponível</span>
                  <strong className={`block break-words text-base font-semibold tabular-nums ${Number(account.balance)<0 ? 'text-rose-300' : 'text-white'}`}>{formatMoney(Number(account.balance || 0))}</strong>
                </span>
                <ArrowUpRight size={17} className="hidden shrink-0 text-slate-500 group-hover:text-blue-300 sm:block" />
              </span>
            </button>
          );
        })}
      </div>
      {!compact && <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 px-3 pt-4">
        <span className="text-xs font-semibold text-slate-300">Saldo consolidado</span>
        <strong className="text-lg font-extrabold tabular-nums text-emerald-300">{formatMoney(total)}</strong>
      </div>}
    </section>
  );
};
