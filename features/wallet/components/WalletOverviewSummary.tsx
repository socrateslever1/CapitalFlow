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
  <div className="grid min-w-0 items-start gap-4 xl:grid-cols-12">
    <article className="min-w-0 rounded-xl border border-slate-800 bg-slate-900 p-3.5 sm:p-5 xl:col-span-6">
      <header className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white"><Landmark size={18} className="text-blue-400"/>Liquidez imediata</h3>
        <span className="text-xs font-medium text-slate-300">{accounts.length} {accounts.length === 1 ? 'conta' : 'contas'}</span>
      </header>
      <div className="mt-3 rounded-lg border border-slate-800/90 bg-slate-950/60 p-3">
        <p className="text-sm font-semibold text-slate-300">Saldo disponível</p>
        <p className={`mt-1.5 break-words text-xl font-bold tracking-tight tabular-nums sm:text-2xl ${accountBalance < 0 ? 'text-rose-300' : 'text-emerald-300'}`}>
          {formatMoney(accountBalance)}
        </p>
        <p className="mt-1 text-xs sm:text-sm text-slate-300">Total livre para movimentação nas suas instituições</p>
      </div>
      <div className="mt-4"><AccountCardStack compact accounts={accounts.slice(0,4)} onOpen={() => onNavigate('contas')}/></div>
      <button type="button" onClick={() => onNavigate('contas')} className="mt-4 flex min-h-11 w-full items-center justify-between gap-2 border-t border-slate-800 pt-4 text-sm font-semibold text-blue-300 transition-colors hover:text-blue-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
        <span>Ver detalhes das contas</span> <ArrowRight size={17}/>
      </button>
    </article>
    <article className="min-w-0 rounded-xl border border-slate-800 bg-slate-900 p-3.5 sm:p-5 xl:col-span-6">
      <header className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white"><CreditCard size={18} className="text-blue-400"/>Cartões</h3>
        <span className="text-xs font-medium text-slate-300">{cards.length} {cards.length === 1 ? 'ativo' : 'ativos'}</span>
      </header>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="min-w-0 rounded-lg border border-slate-800/90 bg-slate-950/60 p-3">
          <dt className="text-sm font-semibold text-slate-300">Faturas do mês</dt>
          <dd className="mt-1.5 break-words text-lg sm:text-xl font-bold tracking-tight tabular-nums text-white">{formatMoney(currentInvoiceTotal)}</dd>
        </div>
        <div className="min-w-0 rounded-lg border border-slate-800/90 bg-slate-950/60 p-3">
          <dt className="text-sm font-semibold text-slate-300">Limite disponível</dt>
          <dd className="mt-1.5 break-words text-lg sm:text-xl font-bold tracking-tight tabular-nums text-emerald-300">{formatMoney(credit.available)}</dd>
        </div>
      </dl>
      <div className="mt-4 flex items-center justify-between gap-3 text-xs text-slate-300"><span>Limite utilizado</span><strong className="tabular-nums text-slate-200">{Math.round(credit.percentage)}%</strong></div>
      <div role="progressbar" aria-label="Uso do limite de crédito" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(credit.percentage)} className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div className="h-full rounded-full bg-blue-500" style={{width:`${Math.min(100,Math.max(0,credit.percentage))}%`}}/>
      </div>
      <ul aria-label="Seus cartões" className="mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]">
        {cards.slice(0,4).map(card => {
          const account=accounts.find(item => item.id===card.account_id);
          const institution=card.institution_key||account?.institution_key||card.issuer||card.nickname;
          const visual=getBankVisual(institution);
          const accent=card.primary_color || visual.accent;
          const available=Math.max(0,Number(card.credit_limit)-Number(card.used_limit));
          return <li key={card.id} className="min-w-0 shrink-0 basis-[min(82%,280px)] snap-start sm:basis-[min(48%,300px)]">
            <button type="button" onClick={() => onNavigate(getCardSummaryDestination(card.id))}
              aria-label={`Abrir cartão ${card.nickname}, final ${card.last_four || 'não informado'}`}
              className="group relative flex aspect-[1.586/1] w-full flex-col justify-between overflow-hidden rounded-xl border border-white/15 bg-slate-950 p-4 text-left text-white shadow-sm transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              style={{background:`linear-gradient(145deg, ${accent}, #0f172a 88%)`}}>
              <span aria-hidden="true" className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full border border-white/10"/>
              <span className="relative flex min-w-0 items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/90"><BankLogo name={institution} alternateName={card.nickname} size="sm"/></span>
                  <span className="truncate text-sm font-bold">{card.nickname}</span>
                </span>
                <CreditCard size={19} className="shrink-0 text-white/75"/>
              </span>
              <span className="relative block">
                <span className="block text-xs font-medium tracking-[0.12em] text-white/80">••••  {card.last_four || '----'}</span>
                <span className="mt-2 flex items-end justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block text-[11px] text-white/75">Disponível</span>
                    <strong className="block break-words text-base font-semibold tabular-nums sm:text-lg">{formatMoney(available)}</strong>
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-white/90">{card.brand || 'Crédito'}</span>
                </span>
              </span>
            </button>
          </li>;
        })}
      </ul>
      {!cards.length && <p className="py-6 text-sm text-slate-300">Nenhum cartão cadastrado. Adicione um na aba Cartões.</p>}
      <button type="button" onClick={() => onNavigate('cartoes')} className="mt-4 flex min-h-11 w-full items-center justify-between gap-2 border-t border-slate-800 pt-4 text-sm font-semibold text-blue-300 transition-colors hover:text-blue-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"><span>Ver cartões e faturas</span> <ArrowRight size={17}/></button>
    </article>
  </div>
);
