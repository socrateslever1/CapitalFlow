import React from 'react';
import { ArrowRight, CreditCard, Landmark } from 'lucide-react';
import type { PersonalWalletAccount, PersonalWalletCard } from '../../../services/personalWallet.service';
import { AccountCardStack } from '../../../components/wallet/AccountCardStack';
import { BankLogo } from '../../../components/wallet/BankLogo';
import { getBankVisual, getCreditSummary } from '../../../components/wallet/walletPresentation';
import { formatMoney } from '../../../utils/formatters';
import { getCardSummaryDestination } from '../cardSummaryNavigation';

export const WalletOverviewSummary: React.FC<{
  accounts: PersonalWalletAccount[]; cards: PersonalWalletCard[];
  accountBalance: number; currentInvoiceTotal: number;
  credit: ReturnType<typeof getCreditSummary>;
  onNavigate: (path: string) => void;
}> = ({ accounts, cards, accountBalance, currentInvoiceTotal, credit, onNavigate }) => (
  <div className="grid items-start gap-5 lg:grid-cols-12">
    <article className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6 lg:col-span-6">
      <header className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-base font-bold text-white"><Landmark size={18} className="text-blue-400"/>Liquidez imediata</h3>
        <span className="text-xs font-medium text-slate-300">{accounts.length} {accounts.length === 1 ? 'conta' : 'contas'}</span>
      </header>
      <div className="mt-4 rounded-xl border border-slate-800/90 bg-slate-950/60 p-4">
        <p className="text-sm font-semibold text-slate-300">Saldo disponível</p>
        <p className={`mt-1.5 break-words text-3xl font-extrabold tracking-tight tabular-nums sm:text-4xl ${accountBalance < 0 ? 'text-rose-300' : 'text-emerald-300'}`}>
          {formatMoney(accountBalance)}
        </p>
        <p className="mt-1 text-xs sm:text-sm text-slate-300">Total livre para movimentação nas suas instituições</p>
      </div>
      <div className="mt-4"><AccountCardStack compact accounts={accounts.slice(0,4)} onOpen={() => onNavigate('contas')}/></div>
      <button type="button" onClick={() => onNavigate('contas')} className="mt-4 flex min-h-11 w-full items-center justify-between gap-2 border-t border-slate-800 pt-4 text-sm font-semibold text-blue-300 transition-colors hover:text-blue-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
        <span>Ver detalhes das contas</span> <ArrowRight size={17}/>
      </button>
    </article>
    <article className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6 lg:col-span-6">
      <header className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-base font-bold text-white"><CreditCard size={18} className="text-blue-400"/>Cartões</h3>
        <span className="text-xs font-medium text-slate-300">{cards.length} {cards.length === 1 ? 'ativo' : 'ativos'}</span>
      </header>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="min-w-0 rounded-xl border border-slate-800/90 bg-slate-950/60 p-4">
          <dt className="text-sm font-semibold text-slate-300">Faturas do mês</dt>
          <dd className="mt-1.5 break-words text-2xl sm:text-3xl font-extrabold tracking-tight tabular-nums text-white">{formatMoney(currentInvoiceTotal)}</dd>
        </div>
        <div className="min-w-0 rounded-xl border border-slate-800/90 bg-slate-950/60 p-4">
          <dt className="text-sm font-semibold text-slate-300">Limite disponível</dt>
          <dd className="mt-1.5 break-words text-2xl sm:text-3xl font-extrabold tracking-tight tabular-nums text-emerald-300">{formatMoney(credit.available)}</dd>
        </div>
      </dl>
      <div className="mt-4 flex items-center justify-between gap-3 text-xs text-slate-300"><span>Limite utilizado</span><strong className="tabular-nums text-slate-200">{Math.round(credit.percentage)}%</strong></div>
      <div role="progressbar" aria-label="Uso do limite de crédito" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(credit.percentage)} className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div className="h-full rounded-full bg-blue-500" style={{width:`${Math.min(100,Math.max(0,credit.percentage))}%`}}/>
      </div>
      <ul aria-label="Seus cartões" className="mt-4 divide-y divide-slate-800">
        {cards.slice(0,4).map(card => {
          const account=accounts.find(item => item.id===card.account_id);
          const institution=card.institution_key||account?.institution_key||card.issuer||card.nickname;
          const visual=getBankVisual(institution);
          return <li key={card.id}><button type="button" onClick={() => onNavigate(getCardSummaryDestination(card.id))} className="group flex min-h-14 w-full min-w-0 items-center justify-between gap-3 px-2 py-3 text-left transition-colors hover:bg-slate-800/60 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
            <span className="flex min-w-0 flex-1 items-center gap-3">
              <span className="h-8 w-1 shrink-0 rounded-full" style={{backgroundColor:card.primary_color || visual.accent}}/>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-700/80 bg-slate-950"><BankLogo name={institution} alternateName={card.nickname} size="sm"/></span>
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-sm sm:text-base font-semibold text-white">{card.nickname}</strong>
                <span className="mt-0.5 block truncate text-xs sm:text-sm text-slate-300">{card.brand || 'Crédito'} · •••• {card.last_four || '----'}</span>
              </span>
            </span>
            <span className="ml-auto shrink-0 text-right">
              <span className="block text-xs text-slate-300">Disponível</span>
              <strong className="mt-0.5 block text-base font-bold tabular-nums text-emerald-300">{formatMoney(Math.max(0,Number(card.credit_limit)-Number(card.used_limit)))}</strong>
            </span>
          </button></li>;
        })}
      </ul>
      {!cards.length && <p className="py-6 text-sm text-slate-300">Nenhum cartão cadastrado. Adicione um na aba Cartões.</p>}
      <button type="button" onClick={() => onNavigate('cartoes')} className="mt-4 flex min-h-11 w-full items-center justify-between gap-2 border-t border-slate-800 pt-4 text-sm font-semibold text-blue-300 transition-colors hover:text-blue-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"><span>Ver cartões e faturas</span> <ArrowRight size={17}/></button>
    </article>
  </div>
);
