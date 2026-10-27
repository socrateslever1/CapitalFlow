import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight, CalendarClock, CreditCard, Landmark, RefreshCw,
  Scale, TrendingDown, TrendingUp, AlertCircle,
} from 'lucide-react';
import type { UserProfile } from '../../../types';
import type {
  PersonalWalletAccount, PersonalWalletCard, PersonalWalletPayable,
} from '../../../services/personalWallet.service';
import { formatMoney } from '../../../utils/formatters';
import { BankLogo } from '../../../components/wallet/BankLogo';
import { calculateWalletBalance } from '../../../components/wallet/walletBalanceDomain';
import { getEffectiveInvoiceCycles } from '../../../components/wallet/invoiceStatementDomain';
import { getBankVisual, getCreditSummary, walletAccountTypeLabel } from '../../../components/wallet/walletPresentation';
import { walletRepository, type WalletSnapshot } from '../services/walletRepository';

type Props = {
  activeUser?: UserProfile | null;
  onNavigate: (path: string) => void;
};
type Commitment = {
  id: string;
  title: string;
  institution: string;
  dueDate: string;
  amount: number;
  accountLabel: string;
  category: 'CARD' | 'PAYABLE';
};

const money = (value: number) => formatMoney(Number.isFinite(value) ? value : 0);
const sum = <T,>(items: T[], getter: (item: T) => number) =>
  items.reduce((total, item) => total + (Number(getter(item)) || 0), 0);
const dayKey = (date: Date) => {
  const year = date.getFullYear();
  return year + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' +
    String(date.getDate()).padStart(2, '0');
};
const dueDateForCard = (month: string, dueDay: number | null) => {
  const match = /^(\d{4})-(\d{2})/.exec(month);
  if (!match || !dueDay) return null;
  const year = Number(match[1]);
  const index = Number(match[2]) - 1;
  if (index < 0 || index > 11 || dueDay < 1 || dueDay > 31) return null;
  const last = new Date(year, index + 1, 0).getDate();
  return dayKey(new Date(year, index, Math.min(dueDay, last)));
};
const dateLabel = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
  }).format(new Date(year, month - 1, day));
};
const sourceAccount = (
  accounts: PersonalWalletAccount[],
  cards: PersonalWalletCard[],
  accountId?: string | null,
  cardId?: string | null,
) => {
  const card = cardId ? cards.find(item => item.id === cardId) : null;
  const account = accounts.find(item => item.id === (accountId || card?.account_id));
  if (account) return account.nickname;
  return card ? 'Origem: ' + card.nickname : 'Conta de pagamento não definida';
};
const getOverviewAccounts = (accounts: PersonalWalletAccount[]) => {
  const seen = new Set<string>();
  return accounts.filter(account => {
    const identity = [
      account.account_type,
      account.nickname.trim().toLocaleLowerCase('pt-BR'),
      String(account.bank_name || '').trim().toLocaleLowerCase('pt-BR'),
      Number(account.balance || 0).toFixed(2),
    ].join('|');
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
};
const isOpenPayable = (payable: PersonalWalletPayable) =>
  !['PAID', 'CANCELED'].includes(payable.status) && Number(payable.outstanding_balance) > 0;

const deriveOverview = (snapshot: WalletSnapshot, today: string) => {
  const month = today.slice(0, 7);
  const accounts = snapshot.accounts;
  const cards = snapshot.cards.filter(card => card.status !== 'CANCELED');
  const accountBalance = sum(accounts, account => Number(account.balance));
  const institutionKeys = new Set(accounts.map(account =>
    getBankVisual(account.institution_key || account.bank_name || account.nickname).key,
  ));
  const credit = getCreditSummary(cards);
  const invoiceList: Commitment[] = cards.flatMap(card =>
    getEffectiveInvoiceCycles(card.id, snapshot.expenses, snapshot.installments)
      .filter(cycle => cycle.amount > 0)
      .flatMap(cycle => {
        const dueDate = dueDateForCard(cycle.dueMonth, card.due_day);
        return dueDate ? [{
          id: card.id + ':' + cycle.dueMonth,
          title: 'Fatura ' + card.nickname,
          institution: card.issuer || card.nickname,
          dueDate,
          amount: cycle.amount,
          accountLabel: sourceAccount(accounts, cards, card.account_id),
          category: 'CARD' as const,
        }] : [];
      }),
  );
  // Only the current calendar month's invoices enter the monthly projection.
  const currentInvoiceTotal = sum(
    invoiceList.filter(invoice => invoice.dueDate.slice(0, 7) === month),
    invoice => invoice.amount,
  );
  const receivedIds = new Set(snapshot.recurringReceipts
    .filter(receipt => String(receipt.reference_month).slice(0, 7) === month)
    .map(receipt => receipt.income_id));

  const balance = calculateWalletBalance({
    accounts,
    recurringIncomes: snapshot.recurringIncomes,
    receivedIncomeIds: receivedIds,
    openCardInvoices: currentInvoiceTotal,
    payables: snapshot.payables,
    month,
  });

  const openPayables: Commitment[] = snapshot.payables.filter(isOpenPayable)
    .filter(payable => Boolean(payable.due_date))
    .map((payable: PersonalWalletPayable) => ({
      id: 'payable:' + payable.id,
      title: payable.description || payable.creditor_name,
      institution: payable.creditor_name,
      dueDate: payable.due_date!,
      amount: Math.max(0, Number(payable.outstanding_balance || 0)),
      accountLabel: sourceAccount(
        accounts, cards, payable.origin_account_id, payable.origin_card_id,
      ),
      category: 'PAYABLE',
    }));
  const limit = new Date(today + 'T12:00:00');
  limit.setDate(limit.getDate() + 45);
  const limitDate = dayKey(limit);
  const upcoming = [...invoiceList, ...openPayables]
    .filter(item => item.dueDate <= limitDate)
    .sort((first, second) =>
      first.dueDate.localeCompare(second.dueDate) || first.title.localeCompare(second.title),
    )
    .slice(0, 8);

  return {
    accounts, cards, accountBalance, institutionCount: institutionKeys.size,
    credit, currentInvoiceTotal, balance, upcoming,
  };
};

export const WalletOverviewPage: React.FC<Props> = ({ onNavigate }) => {
  const [snapshot, setSnapshot] = useState<WalletSnapshot | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [today, setToday] = useState(() => dayKey(new Date()));
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const result = await walletRepository.load();
    setSnapshot(result);
    setToday(dayKey(new Date()));
    setError('');
  }, []);

  useEffect(() => {
    let mounted = true;
    walletRepository.load()
      .then(result => { if (mounted) { setSnapshot(result); setToday(dayKey(new Date())); } })
      .catch(reason => {
        if (mounted) setError(
          reason instanceof Error ? reason.message : 'Não foi possível carregar a carteira.',
        );
      });
    const onChange = () => {
      void refresh().catch(() => {
        if (mounted) setError('Falha ao sincronizar. Os valores podem estar desatualizados.');
      });
    };
    window.addEventListener('capitalflow:wallet-updated', onChange);
    return () => {
      mounted = false;
      window.removeEventListener('capitalflow:wallet-updated', onChange);
    };
  }, [refresh]);

  const overview = useMemo(
    () => snapshot ? deriveOverview(snapshot, today) : null,
    [snapshot, today],
  );
  const retry = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try { await refresh(); }
    catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível atualizar.');
    } finally { setRefreshing(false); }
  };
  const go = (route: 'contas' | 'cartoes' | 'dividas') => onNavigate(route);

  if (!overview) {
    return <section className="mx-auto w-full max-w-7xl px-4 sm:px-6">
      {error ? <div role="alert" className="rounded-2xl border border-rose-500/30 bg-slate-900 p-6 text-sm text-rose-200">
        <AlertCircle className="mb-2" size={24}/> {error}
        <button type="button" onClick={() => void retry()}
          className="mt-4 block rounded-lg bg-blue-600 px-4 py-2 text-white">
          Tentar novamente
        </button>
      </div> : <div aria-label="Carregando visão geral" className="grid animate-pulse gap-4 lg:grid-cols-2">
        <div className="h-64 rounded-2xl bg-slate-900"/>
        <div className="h-64 rounded-2xl bg-slate-900"/>
      </div>}
    </section>;
  }

  const { accounts, cards, balance, credit, upcoming } = overview;
  const overviewAccounts = getOverviewAccounts(accounts);
  const selectedOverviewCardId = cards.some(card => card.id === selectedCardId) ? selectedCardId : cards[0]?.id || null;
  const orderedCards = selectedOverviewCardId
    ? [cards.find(card => card.id === selectedOverviewCardId)!, ...cards.filter(card => card.id !== selectedOverviewCardId)]
    : cards;
  const deficit = balance.projectedBalance < 0;

  return <section aria-label="Visão geral da carteira"
    className="mx-auto w-full max-w-7xl space-y-4 px-4 pb-24 sm:px-6 lg:pb-8">
    <div className="flex items-center justify-between gap-3">
      <div>
        <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight">Panorama financeiro</h2>
        <p className="text-xs md:text-sm text-slate-400 mt-0.5">Resumo consolidado das suas finanças</p>
      </div>
      <div className="flex items-center gap-2"><button aria-label="Atualizar indicadores da carteira" type="button" onClick={() => void retry()}
        disabled={refreshing} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-white/10 hover:bg-white/5 text-slate-300 transition-all disabled:opacity-40 shadow-sm"><RefreshCw size={14} className={refreshing ? 'animate-spin text-blue-400' : 'text-slate-400'}/><span className="hidden sm:inline">Atualizar</span></button></div>
    </div>
    {error && <div role="alert" className="rounded-xl border border-amber-600/30 bg-amber-950/20 p-3 text-xs text-amber-200">{error}</div>}

    <div className="grid grid-cols-1 items-stretch gap-4 lg:grid lg:grid-cols-12 lg:gap-6">
      {/* Coluna Esquerda: LIQUIDEZ IMEDIATA */}
      <article className="relative flex h-full min-w-0 flex-col justify-between overflow-hidden rounded-2xl border border-white/10 bg-slate-900/70 p-4 shadow-2xl backdrop-blur-xl before:pointer-events-none before:absolute before:left-0 before:top-0 before:h-48 before:w-48 before:rounded-full before:bg-emerald-500/10 before:blur-3xl sm:p-5 lg:col-span-6 lg:p-6">
        <div className="relative z-10">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-emerald-400">
            <Landmark size={17}/> Liquidez imediata
          </div>
          <strong className="my-1 block text-3xl font-extrabold tracking-tight tabular-nums text-white lg:text-4xl">
            {money(overview.accountBalance)}
          </strong>
          <p className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
            {overview.institutionCount} {overview.institutionCount === 1 ? 'instituição' : 'instituições'}
          </p>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {overviewAccounts.length ? overviewAccounts.slice(0, 2).map(account => {
              const visual = getBankVisual(account.institution_key || account.bank_name || account.nickname);
              const visualStyles = visual as typeof visual & Partial<Record<'cardBg' | 'cardBorder' | 'cardGlow' | 'logoBg' | 'logoBorder' | 'badgeBg' | 'badgeBorder' | 'badgeText' | 'badgeDot' | 'badgeDotGlow', string>>;
              const cardBg = visualStyles.cardBg || `linear-gradient(145deg, color-mix(in srgb, ${visual.accent} 16%, rgba(15, 23, 42, 0.9)) 0%, color-mix(in srgb, ${visual.accent} 4%, rgba(2, 6, 23, 0.95)) 100%)`;
              const cardBorder = visualStyles.cardBorder || `color-mix(in srgb, ${visual.accent} 45%, rgba(255, 255, 255, 0.12))`;
              const cardGlow = visualStyles.cardGlow || `0 10px 26px -6px color-mix(in srgb, ${visual.accent} 22%, rgba(0, 0, 0, 0.65))`;
              const logoBg = visualStyles.logoBg || `color-mix(in srgb, ${visual.accent} 15%, #0f172a)`;
              const logoBorder = visualStyles.logoBorder || `color-mix(in srgb, ${visual.accent} 50%, rgba(255, 255, 255, 0.2))`;
              const badgeBg = visualStyles.badgeBg || `color-mix(in srgb, ${visual.accent} 16%, rgba(15, 23, 42, 0.9))`;
              const badgeBorder = visualStyles.badgeBorder || `color-mix(in srgb, ${visual.accent} 35%, rgba(255, 255, 255, 0.12))`;
              const badgeText = visualStyles.badgeText || `color-mix(in srgb, ${visual.accent} 35%, #ffffff)`;
              const badgeDot = visualStyles.badgeDot || visual.accent;
              const badgeDotGlow = visualStyles.badgeDotGlow || `0 0 6px ${visual.accent}`;

              return (
                <div
                  key={account.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Abrir detalhes da conta ${account.nickname}`}
                  onClick={() => go('contas')}
                  onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); go('contas'); } }}
                  className="group relative flex min-h-[122px] cursor-pointer flex-col justify-between overflow-hidden rounded-2xl border p-4 shadow-lg outline-none transition-all duration-300 hover:-translate-y-0.5 hover:scale-[1.01] hover:shadow-xl focus-visible:ring-2 focus-visible:ring-white/60 active:scale-[.99]"
                  style={{
                    borderColor: cardBorder,
                    background: cardBg,
                    boxShadow: cardGlow
                  }}
                >
                  <div className="pointer-events-none absolute inset-x-4 top-0 h-px opacity-70" style={{ background: `linear-gradient(90deg, transparent, ${visual.accent}, transparent)` }} />
                  <div
                    className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full blur-2xl opacity-15 transition-opacity group-hover:opacity-30"
                    style={{ backgroundColor: visual.accent }}
                  />

                  <div className="relative z-10 flex items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <BankLogo
                        name={account.institution_key || account.bank_name}
                        alternateName={account.nickname}
                        size="sm"
                        className="shadow-sm transition-transform duration-200 group-hover:scale-105"
                        style={{
                          borderColor: logoBorder,
                          backgroundColor: logoBg
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-bold text-white tracking-tight">{visual.name}</span>
                        {account.nickname && account.account_type !== 'CASH' && account.nickname.toLowerCase() !== visual.name.toLowerCase() && (
                          <span className="block truncate text-[10px] text-slate-400 font-medium">{account.nickname}</span>
                        )}
                      </div>
                    </div>
                    <ArrowRight size={14} className="shrink-0 text-white/35 transition-transform group-hover:translate-x-0.5 group-hover:text-white/70" aria-hidden="true" />
                  </div>

                  <div className="relative z-10 mt-3">
                    <strong className="block text-xl sm:text-2xl font-black tracking-tight tabular-nums text-white">
                      {money(Number(account.balance))}
                    </strong>
                    <div className="mt-2.5 flex items-center">
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide"
                        style={{
                          backgroundColor: badgeBg,
                          border: `1px solid ${badgeBorder}`,
                          color: badgeText,
                        }}
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full shrink-0"
                          style={{
                            backgroundColor: badgeDot,
                            boxShadow: badgeDotGlow
                          }}
                        />
                        {walletAccountTypeLabel(account.account_type)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            }) : <p className="col-span-2 rounded-xl border border-dashed border-slate-700 p-5 text-xs text-slate-400">
              Nenhuma conta cadastrada.
            </p>}
          </div>
        </div>

        <div className="mt-6 border-t border-white/5 pt-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() => go('contas')}
            className="group inline-flex items-center gap-2 text-xs font-semibold text-emerald-400 transition-colors hover:text-emerald-300 cursor-pointer"
          >
            <span>Ver detalhes das contas</span>
            <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
          </button>
        </div>
      </article>

      {/* Coluna Direita: CARTÕES */}
      <article className="relative flex h-full min-w-0 flex-col justify-between overflow-hidden rounded-2xl border border-white/10 bg-slate-900/70 bg-gradient-to-br from-blue-950/30 via-slate-900/80 to-slate-950/80 p-4 shadow-2xl backdrop-blur-xl sm:p-5 lg:col-span-6 lg:p-6">
        <div className="relative z-10">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-300">
            <CreditCard size={17}/> Cartões
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <p className="text-[11px] text-slate-400">Faturas do mês</p>
              <strong className="mt-1 block text-xl font-black tabular-nums text-white sm:text-2xl">
                {money(overview.currentInvoiceTotal)}
              </strong>
            </div>
            <div>
              <p className="text-[11px] text-slate-400">Limite livre</p>
              <strong className="mt-1 block text-xl font-black tabular-nums text-emerald-300 sm:text-2xl">
                {money(credit.available)}
              </strong>
            </div>
          </div>
          <div className="mt-5">
            <div className="mb-2 flex justify-between text-[11px] text-slate-400">
              <span>Limite utilizado</span>
              <strong className="text-slate-200">{Math.round(credit.percentage)}%</strong>
            </div>
            <div role="progressbar" aria-label="Uso do limite de crédito"
              aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(credit.percentage)}
              className="h-2.5 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, credit.percentage))}%` }}/>
            </div>
          </div>

          {/* Cartões com animação 3D de sobreposição (Apple Wallet style), expansão no hover e elevação */}
          <div className="relative mt-4 h-[126px] w-full" aria-label="Seus cartões">
            {cards.length ? (
              <div className="flex gap-2 py-1 items-center overflow-x-auto scrollbar-hide touch-pan-x sm:-space-x-32 sm:gap-0 sm:hover:-space-x-16 transition-all duration-300">
                {orderedCards.map(card => {
                  const index = orderedCards.indexOf(card);
                  const account = accounts.find(item => item.id === card.account_id);
                  const institution = card.institution_key || account?.institution_key || card.issuer || card.nickname;
                  const visual = getBankVisual(institution);
                  const isSelected = card.id === selectedOverviewCardId;
                  return <button type="button" key={card.id}
                    onClick={() => setSelectedCardId(card.id)}
                    aria-label={`Abrir cartão ${card.nickname}`}
                    aria-pressed={isSelected}
                    style={{
                      background: `linear-gradient(135deg, ${card.primary_color || visual.accent}, ${visual.secondary})`,
                      zIndex: 30 - index * 5,
                      transform: `scale(${1 - index * 0.04}) translateY(${index * 2}px)`,
                    }}
                    className={`group relative flex aspect-[1.586/1] h-[108px] shrink-0 touch-manipulation flex-col justify-between rounded-xl border p-3 text-left text-white shadow-xl shadow-black/40 transition-all duration-300 hover:!-translate-y-2.5 hover:!scale-105 hover:!z-50 hover:shadow-2xl hover:border-white/50 cursor-pointer sm:h-[114px] ${isSelected ? 'border-white/70 ring-2 ring-white/35' : 'border-white/25'}`}>
                    <div className="flex min-w-0 items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <BankLogo name={institution} alternateName={card.nickname} size="sm"/>
                        <span className="truncate text-[11px] font-bold text-white drop-shadow-sm">{card.nickname}</span>
                      </div>
                      <span className="text-[9px] font-semibold uppercase tracking-wider text-white/80 bg-black/25 px-1.5 py-0.5 rounded">{isSelected ? 'Selecionado' : card.brand || 'Crédito'}</span>
                    </div>
                    <div className="flex items-end justify-between gap-1 pt-2">
                      <span className="text-[10px] font-mono tracking-widest text-white/90 drop-shadow-sm">•••• {card.last_four || '----'}</span>
                      <span className="text-[9px] font-medium text-white/70 group-hover:text-white transition-colors">Ver fatura →</span>
                    </div>
                  </button>;
                })}
              </div>
            ) : <p className="py-4 text-xs text-slate-400">Nenhum cartão cadastrado.</p>}
          </div>
        </div>

        <button type="button" onClick={() => go('cartoes')}
          className="group relative z-10 mt-6 inline-flex w-full items-center justify-between gap-2 border-t border-white/5 pt-4 text-left text-xs font-semibold text-blue-300 transition-colors hover:text-blue-200">
          <span>Ver cartões e faturas</span> <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5"/>
        </button>
      </article>
    </div>

    {/* 1. SEÇÃO BALANÇO DO MÊS */}
    <article className="bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-2xl p-5 lg:p-6 shadow-xl mb-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-300">
            <Scale size={17} className="text-violet-300"/> Balanço do mês
          </div>
          <p className="mt-1 text-xs text-slate-400">{today.slice(5, 7)}/{today.slice(0, 4)}</p>
        </div>
        <span className={'rounded-full border px-3 py-1 text-xs font-semibold ' +
          (deficit ? 'border-rose-500/30 bg-rose-500/10 text-rose-300' :
            'border-emerald-500/30 bg-emerald-500/10 text-emerald-300')}>
          {deficit ? 'Déficit' : 'Superávit'}
        </span>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-12">
        {/* Card de Recursos */}
        <div className="bg-emerald-950/25 border border-emerald-500/20 rounded-xl p-4 lg:col-span-6">
          <h3 className="mb-3 flex items-center gap-2 text-xs font-bold text-emerald-400"><TrendingUp size={16} className="text-emerald-400"/> Recursos</h3>
          <div className="space-y-3 text-xs">
            <div className="flex justify-between gap-3 text-slate-300"><span>Saldo em contas</span><strong className="text-white font-semibold">{money(balance.accountBalance)}</strong></div>
            <div className="flex justify-between gap-3 text-slate-300"><span>Receitas a receber</span><strong className="text-white font-semibold">{money(balance.pendingRecurringIncome)}</strong></div>
            <div className="flex justify-between gap-3 border-t border-emerald-500/20 pt-3 font-bold text-emerald-300"><span>Total de recursos</span><strong className="text-emerald-300 font-bold">{money(balance.totalResources)}</strong></div>
          </div>
        </div>
        {/* Card de Passivos */}
        <div className="bg-rose-950/25 border border-rose-500/20 rounded-xl p-4 lg:col-span-6">
          <h3 className="mb-3 flex items-center gap-2 text-xs font-bold text-rose-400"><TrendingDown size={16} className="text-rose-400"/> Passivos</h3>
          <div className="space-y-3 text-xs">
            <div className="flex justify-between gap-3 text-slate-300"><span>Faturas de cartão do mês</span><strong className="text-white font-semibold">{money(balance.openCardInvoices)}</strong></div>
            <div className="flex justify-between gap-3 text-slate-300"><span>Dívidas e contas a pagar do mês</span><strong className="text-white font-semibold">{money(balance.monthPayables)}</strong></div>
            <div className="flex justify-between gap-3 border-t border-rose-500/20 pt-3 font-bold text-rose-300"><span>Total de passivos</span><strong className="text-rose-300 font-bold">{money(balance.totalLiabilities)}</strong></div>
          </div>
        </div>
      </div>
      {/* Faixa de Saldo Projetado */}
      <div className="bg-slate-950/60 border border-white/5 rounded-xl p-4 mt-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-bold text-slate-300">Saldo projetado do mês</p>
          <p className="text-xs text-slate-400 mt-0.5">Saldo disponível menos valores a pagar</p>
        </div>
        <strong className={'text-2xl lg:text-3xl font-extrabold tracking-tight tabular-nums ' + (deficit ? 'text-rose-400' : 'text-emerald-400')}>
          {money(balance.projectedBalance)}
        </strong>
      </div>
    </article>

    {/* 2. SEÇÃO COMPROMISSOS PRÓXIMOS */}
    <article className="bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-2xl p-5 lg:p-6 shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-white"><CalendarClock size={18} className="text-amber-300"/> Compromissos próximos</h2>
          <p className="mt-1 text-xs text-slate-400">Vencidos e próximos 45 dias</p>
        </div>
        <button type="button" onClick={() => go('dividas')} className="flex items-center gap-1.5 text-xs font-semibold text-blue-300 hover:text-blue-200 transition-colors">
          <span>Ver contas a pagar</span> <ArrowRight size={15}/>
        </button>
      </div>
      <div className="mt-5">
        {upcoming.length ? upcoming.map(item => {
          const overdue = item.dueDate < today;
          return (
            <div
              key={item.id}
              className="bg-slate-950/40 hover:bg-slate-800/40 border border-white/5 hover:border-white/10 rounded-xl p-3.5 mb-2.5 transition-all flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between"
            >
              {/* Lado Esquerdo */}
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-300">
                  <BankLogo name={item.institution} alternateName={item.title} size="sm" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{item.title}</p>
                  <p className="mt-0.5 truncate text-xs text-slate-400">{item.institution} · {item.accountLabel}</p>
                </div>
              </div>

              {/* Centro & Lado Direito */}
              <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                  overdue
                    ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                    : 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                }`}>
                  {overdue ? 'Vencido · ' : ''}{dateLabel(item.dueDate)}
                </span>
                <strong className="text-base lg:text-lg font-bold text-white tracking-tight tabular-nums">
                  {money(item.amount)}
                </strong>
              </div>
            </div>
          );
        }) : <p className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-xs text-slate-400">
          Nenhum compromisso com vencimento informado nos próximos 45 dias.
        </p>}
      </div>
    </article>
  </section>;
};

export const OverviewPage = WalletOverviewPage;
export default WalletOverviewPage;

