import React from 'react';
import { ArrowRight, CreditCard, Landmark } from 'lucide-react';
import { PrivateMoney, useFinancialPrivacy } from '../../../contexts/FinancialPrivacyContext';
import type { PersonalWalletAccount, PersonalWalletCard } from '../../../services/personalWallet.service';
import { AccountCardStack } from '../../../components/wallet/AccountCardStack';
import { BankLogo } from '../../../components/wallet/BankLogo';
import { getBankVisual, getCreditSummary } from '../../../components/wallet/walletPresentation';
import { formatMoney } from '../../../utils/formatters';
import { getCardSummaryDestination } from '../cardSummaryNavigation';

type WalletOverviewSummaryProps = {
  accounts: PersonalWalletAccount[];
  cards: PersonalWalletCard[];
  accountBalance: number;
  currentInvoiceTotal: number;
  credit: ReturnType<typeof getCreditSummary>;
  onNavigate: (path: string) => void;
};

/**
 * Resumo progressivo: valores por instituição aparecem somente uma vez.
 * Totais consolidados só aparecem quando há mais de uma origem para somar.
 * Dados e cálculos continuam vindo do snapshot autoritativo da carteira.
 */
export const WalletOverviewSummary: React.FC<WalletOverviewSummaryProps> = ({
  accounts, cards, accountBalance, currentInvoiceTotal, credit, onNavigate,
}) => {
  const privacyHidden = useFinancialPrivacy();
  const multipleAccounts = accounts.length > 1;
  const multipleCards = cards.length > 1;

  return (
    <div className="grid min-w-0 items-start gap-3 xl:grid-cols-12">
      <article className="min-w-0 rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-3 sm:px-4 sm:py-3.5 xl:col-span-6">
        <header className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
            <Landmark size={17} className="text-blue-400" aria-hidden="true"/>Contas
          </h3>
          <span className="text-xs text-slate-400">
            {privacyHidden ? 'Contas protegidas' : `${accounts.length} ${accounts.length === 1 ? 'conta' : 'contas'}`}
          </span>
        </header>
        {multipleAccounts && (
          <div className="mt-2.5 flex items-baseline justify-between gap-2 rounded-lg bg-slate-950/60 px-2.5 py-2">
            <span className="text-xs text-slate-300">Saldo consolidado</span>
            <strong className={'text-base font-bold tabular-nums ' +
              (privacyHidden ? 'text-slate-300' : accountBalance < 0 ? 'text-rose-300' : 'text-emerald-300')}>
              <PrivateMoney value={formatMoney(accountBalance)}/>
            </strong>
          </div>
        )}
        <div className="mt-2">
          <AccountCardStack compact accounts={accounts.slice(0,4)}
            onOpen={() => onNavigate('contas')}/>
        </div>
        {accounts.length > 4 && (
          <button type="button" onClick={() => onNavigate('contas')}
            className="mt-2 flex min-h-9 w-full items-center justify-between border-t border-slate-800 pt-2 text-xs font-semibold text-blue-300 hover:text-blue-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
            Ver todas as contas <ArrowRight size={15} aria-hidden="true"/>
          </button>
        )}
      </article>

      <article className="min-w-0 rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-3 sm:px-4 sm:py-3.5 xl:col-span-6">
        <header className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
            <CreditCard size={17} className="text-blue-400" aria-hidden="true"/>Cartões
          </h3>
          <span className="text-xs text-slate-400">
            {privacyHidden ? 'Cartões protegidos' : `${cards.length} ${cards.length === 1 ? 'ativo' : 'ativos'}`}
          </span>
        </header>
        <div className="mt-2.5 flex flex-wrap items-baseline justify-between gap-2 text-xs">
          <span className="text-slate-300">Faturas com vencimento neste mês</span>
          <strong className="text-sm font-semibold tabular-nums text-white">
            <PrivateMoney value={formatMoney(currentInvoiceTotal)}/>
          </strong>
        </div>

        {multipleCards && (
          <div className="mt-2.5 border-t border-slate-800 pt-2.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-slate-300">
              <span>{privacyHidden ? 'Limite consolidado protegido' : `Disponível nos ${cards.length} cartões`}</span>
              <strong className="text-sm font-semibold tabular-nums text-emerald-300">
                <PrivateMoney value={formatMoney(credit.available)}/>
              </strong>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400">
              <span>Limite utilizado</span>
              <span className="tabular-nums">{privacyHidden ? '••••' : Math.round(credit.percentage) + '%'}</span>
            </div>
            {!privacyHidden && <div role="progressbar" aria-label="Uso consolidado do limite de crédito"
              aria-valuemin={0} aria-valuemax={100}
              aria-valuenow={Math.min(100, Math.max(0, Math.round(credit.percentage)))}
              className="mt-1 h-1 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full rounded-full bg-blue-500"
                style={{width:`${Math.min(100, Math.max(0, credit.percentage))}%`}}/>
            </div>}
          </div>
        )}

        {cards.length > 0 ? (
          <ul aria-label="Seus cartões"
            className="mt-3 flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-1 [scrollbar-width:thin]">
            {cards.slice(0,4).map(card => {
              const account = accounts.find(item => item.id === card.account_id);
              const institution = card.institution_key || account?.institution_key ||
                card.issuer || card.nickname;
              const visual = getBankVisual(institution);
              const accent = card.primary_color || visual.accent;
              const available = Math.max(0, Number(card.credit_limit) - Number(card.used_limit));
              return (
                <li key={card.id} className="min-w-0 shrink-0 basis-[min(78%,260px)] snap-start sm:basis-[min(48%,280px)]">
                  <button type="button" onClick={() => onNavigate(getCardSummaryDestination(card.id))}
                    aria-label={privacyHidden ? 'Abrir cartão protegido' : `Abrir cartão ${card.nickname}, final ${card.last_four || 'não informado'}`}
                    className="group relative flex h-[132px] w-full flex-col justify-between overflow-hidden rounded-xl border border-white/15 bg-slate-950 p-3 text-left text-white shadow-sm transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 sm:h-[142px]"
                    style={{background:`linear-gradient(145deg, ${accent}, #0f172a 88%)`}}>
                    <span aria-hidden="true" className="pointer-events-none absolute -right-10 -top-16 h-32 w-32 rounded-full border border-white/10"/>
                    <span className="relative flex min-w-0 items-start justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/90">
                          <BankLogo name={institution} alternateName={card.nickname} size="sm"/>
                        </span>
                        <span className="min-w-0">
                          <strong className="block truncate text-sm font-semibold">{card.nickname}</strong>
                          <span className="block text-[10px] tracking-wider text-white/75">
                            •••• {privacyHidden ? '••••' : card.last_four || '----'}
                          </span>
                        </span>
                      </span>
                      <CreditCard size={17} className="shrink-0 text-white/70" aria-hidden="true"/>
                    </span>
                    <span className="relative flex min-w-0 items-end justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block text-[10px] text-white/75">Limite disponível</span>
                        <strong className="block break-words text-base font-semibold tabular-nums">
                          <PrivateMoney value={formatMoney(available)}/>
                        </strong>
                      </span>
                      <span className="shrink-0 text-[10px] font-semibold text-white/80">
                        {card.brand || 'Crédito'}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="py-3 text-xs text-slate-400">
            Nenhum cartão cadastrado.
          </p>
        )}
        <button type="button" onClick={() => onNavigate('cartoes')}
          className="mt-2 flex min-h-9 w-full items-center justify-between gap-2 border-t border-slate-800 pt-2 text-xs font-semibold text-blue-300 transition-colors hover:text-blue-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
          <span>Ver cartões e faturas</span><ArrowRight size={15} aria-hidden="true"/>
        </button>
      </article>
    </div>
  );
};
