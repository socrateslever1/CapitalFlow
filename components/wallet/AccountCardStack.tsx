import React, { useMemo } from 'react';
import { ArrowRight } from 'lucide-react';
import type { PersonalWalletAccount } from '../../services/personalWallet.service';
import { formatMoney } from '../../utils/formatters';
import { BankLogo } from './BankLogo';
import { getBankVisual, walletAccountTypeLabel } from './walletPresentation';

type Props = { accounts: PersonalWalletAccount[]; onOpen: (account: PersonalWalletAccount) => void };

export const AccountCardStack: React.FC<Props> = ({ accounts, onOpen }) => {
  const total = useMemo(() => accounts.reduce((sum, account) => sum + Number(account.balance || 0), 0), [accounts]);

  if (!accounts.length) return <div className="rounded-2xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-400">Nenhuma conta cadastrada.</div>;

  return <section aria-label="Contas bancárias" className="space-y-2">
    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
      <h2 className="text-sm font-bold text-white">Contas e carteiras</h2>
      <span className="text-[11px] text-slate-500">{accounts.length} cadastrada{accounts.length === 1 ? '' : 's'}</span>
    </div>
    <div className="space-y-2">
      {accounts.map(account => {
        const visual = getBankVisual(account.institution_key || account.bank_name || account.nickname);
        return <button key={account.id} type="button" onClick={() => onOpen(account)}
          className="group relative flex w-full items-center gap-3 overflow-hidden rounded-xl border border-white/10 px-3 py-3 text-left shadow-lg transition-all hover:-translate-y-0.5 hover:border-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
          style={{ background: `linear-gradient(105deg, color-mix(in srgb, ${visual.accent} 12%, rgba(15,23,42,.94)), rgba(15,23,42,.82))` }}>
          <span className="pointer-events-none absolute inset-y-0 left-0 w-1 opacity-80" style={{ backgroundColor: visual.accent }} />
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-slate-950/70">
            <BankLogo name={account.bank_name} alternateName={account.nickname} size="sm" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <strong className="truncate text-xs font-bold text-white">{account.nickname}</strong>
              <span className="hidden rounded-full px-2 py-0.5 text-[9px] font-semibold sm:inline-flex" style={{ color: visual.accent, backgroundColor: `${visual.accent}18` }}>
                {walletAccountTypeLabel(account.account_type)}
              </span>
            </span>
            <span className="mt-0.5 block truncate text-[10px] text-slate-500">{account.bank_name || (account.account_type === 'CASH' ? 'Dinheiro em espécie' : 'Instituição não informada')}</span>
          </span>
          <span className="shrink-0 text-right"><strong className="block text-sm font-black tabular-nums text-emerald-300">{formatMoney(Number(account.balance || 0))}</strong><span className="text-[10px] text-slate-500">Saldo disponível</span></span>
          <ArrowRight size={15} className="shrink-0 text-slate-600 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-300" />
        </button>;
      })}
    </div>
    <div className="flex items-center justify-between border-t border-slate-800 pt-3 text-xs text-slate-400"><span>Saldo total</span><strong className="text-emerald-300">{formatMoney(total)}</strong></div>
  </section>;
};
