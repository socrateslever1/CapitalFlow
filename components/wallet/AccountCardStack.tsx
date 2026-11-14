import { PrivateMoney, useFinancialPrivacy } from '../../contexts/FinancialPrivacyContext';
import React, { useMemo } from 'react';
import { ArrowUpRight, Wallet } from 'lucide-react';
import type { PersonalWalletAccount } from '../../services/personalWallet.service';
import { formatMoney } from '../../utils/formatters';
import { BankLogo } from './BankLogo';
import { getBankVisual, walletAccountTypeLabel } from './walletPresentation';

type Props = {
  accounts: PersonalWalletAccount[];
  onOpen: (account: PersonalWalletAccount) => void;
  compact?: boolean;
  headerActions?: React.ReactNode;
};

/** Uma superfície consistente por instituição, sem simular cartões de crédito. */
export const AccountCardStack: React.FC<Props> = ({ accounts, onOpen, compact = false, headerActions }) => {
  const privacyHidden = useFinancialPrivacy();
  const total = useMemo(() => accounts.reduce((sum, account) => sum + Number(account.balance || 0), 0), [accounts]);

  return (
    <section aria-label="Contas e saldos" className="space-y-4">
      {!compact && <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-base sm:text-lg font-bold text-white">Suas contas</h2>
            <span className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-0.5 text-xs font-medium text-slate-300">
              {privacyHidden ? '••••' : `${accounts.length} ${accounts.length === 1 ? 'conta' : 'contas'}`}
            </span>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-slate-300">Toque em uma conta para consultar o extrato, movimentar ou editar.</p>
        </div>
        {headerActions && <div className="flex flex-wrap items-center gap-2">{headerActions}</div>}
      </header>}
      {!accounts.length ? (
        <div className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-300">
          Nenhuma conta cadastrada.
        </div>
      ) : (
        <div className={compact ? 'divide-y divide-slate-800' : 'grid min-w-0 gap-2.5 sm:grid-cols-2 2xl:grid-cols-3'}>
          {accounts.map(account => {
            const isCash = account.account_type === 'CASH';
            const visual = getBankVisual(account.institution_key || account.bank_name || account.nickname);
            const balanceValue = Number(account.balance || 0);
            const bankSubtitle = !isCash && account.bank_name && account.bank_name.trim().toLowerCase() !== account.nickname.trim().toLowerCase()
              ? `${account.bank_name} · ${walletAccountTypeLabel(account.account_type)}`
              : walletAccountTypeLabel(account.account_type);
            return (
              <button key={account.id} type="button" onClick={() => onOpen(account)}
                className={`group flex w-full min-w-0 gap-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${compact ? 'min-h-12 items-center justify-between rounded-lg px-2.5 py-2.5 hover:bg-slate-800/60' : 'min-h-[68px] items-center justify-between rounded-xl border border-slate-800 bg-slate-950/70 px-3.5 py-2.5 hover:border-slate-700 hover:bg-slate-900/90'}`}>
                <span className="flex min-w-0 flex-1 items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="h-7 w-0.5 shrink-0 rounded-full"
                    style={{ backgroundColor: visual.accent }}
                  />
                  <span className={`flex shrink-0 items-center justify-center rounded-lg border border-slate-700/80 bg-slate-950 ${compact ? 'h-9 w-9' : 'h-10 w-10'}`}>
                    {isCash ? <Wallet size={20} className="text-amber-300" /> : <BankLogo name={account.bank_name} alternateName={account.nickname} size="sm" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate text-sm sm:text-base font-semibold text-white">{account.nickname}</strong>
                    <span className="mt-0.5 block truncate text-xs text-slate-400">
                      {bankSubtitle}
                    </span>
                  </span>
                </span>
                <span className="ml-auto flex shrink-0 items-center gap-2.5 text-right">
                  <span className="min-w-0 text-right">
                    {!compact && <span className="block text-[11px] font-medium text-slate-400">Saldo disponível</span>}
                    <strong className={`block break-words font-bold tabular-nums ${compact ? 'text-sm sm:text-base' : 'text-sm sm:text-base'} ${privacyHidden ? 'text-slate-300' : balanceValue < 0 ? 'text-rose-300' : 'text-emerald-300'}`}>
                      <PrivateMoney value={formatMoney(balanceValue)} />
                    </strong>
                  </span>
                  <ArrowUpRight size={16} aria-hidden="true" className="shrink-0 text-slate-500 transition-colors group-hover:text-blue-300" />
                </span>
              </button>
            );
          })}
        </div>
      )}
      {!compact && accounts.length > 0 && <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800/80 bg-slate-950/60 px-4 py-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-300">Saldo consolidado</span>
        <strong className={`text-right text-base sm:text-lg font-extrabold tabular-nums ${privacyHidden ? 'text-slate-300' : total < 0 ? 'text-rose-300' : 'text-emerald-300'}`}><PrivateMoney value={formatMoney(total)} /></strong>
      </div>}
    </section>
  );
};
