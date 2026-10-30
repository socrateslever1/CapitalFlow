import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight, CalendarClock, ChevronDown, Plus, RefreshCw,
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
import { getBankVisual, getCreditSummary } from '../../../components/wallet/walletPresentation';
import { walletRepository, type WalletSnapshot } from '../services/walletRepository';
import { WalletOverviewSummary } from '../components/WalletOverviewSummary';
import { WalletSpendingGuide } from '../components/WalletSpendingGuide';
import { getWalletSpendingOverview } from '../domain/walletSpendingInsights';
import { QuickWalletActionsModal, type QuickActionMode } from '../components/QuickWalletActionsModal';
import { QuickExpenseModal } from '../components/QuickExpenseModal';
import { CreateAccountModal } from '../components/CreateAccountModal';

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
const isOpenPayable = (payable: PersonalWalletPayable) =>
  !['PAID', 'CANCELED'].includes(payable.status) && Number(payable.outstanding_balance) > 0;

const dedupePresentationAccounts = (accounts: PersonalWalletAccount[]) => {
  const seen = new Set<string>();
  return accounts.filter(account => {
    const key = [
      account.account_type,
      account.nickname.trim().toLocaleLowerCase(),
      (account.bank_name || '').trim().toLocaleLowerCase(),
      Number(account.balance || 0).toFixed(2),
    ].join('|');
    if (seen.has(key) && account.account_type === 'CASH') return false;
    seen.add(key);
    return true;
  });
};

const deriveOverview = (snapshot: WalletSnapshot, today: string) => {
  const month = today.slice(0, 7);
  const accounts = dedupePresentationAccounts(snapshot.accounts);
  const cards = snapshot.cards.filter(card => card.status !== 'CANCELED');
  const accountBalance = sum(accounts, account => Number(account.balance));
  const institutionKeys = new Set(accounts.map(account =>
    getBankVisual(account.institution_key || account.bank_name || account.nickname).key,
  ));
  const credit = getCreditSummary(cards);
  const spending = getWalletSpendingOverview(snapshot.expenses, month);
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
    credit, currentInvoiceTotal, balance, upcoming, spending,
  };
};

export const WalletOverviewPage: React.FC<Props> = ({ onNavigate }) => {
  const [snapshot, setSnapshot] = useState<WalletSnapshot | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [today, setToday] = useState(() => dayKey(new Date()));
  const [quickModal, setQuickModal] = useState<{
    mode: QuickActionMode;
    cardId?: string | null;
    accountId?: string | null;
  } | null>(null);
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
    return <section className="w-full min-w-0">
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
  const deficit = balance.projectedBalance < 0;

  return <section aria-label="Visão geral da carteira"
    className="w-full min-w-0 space-y-4 pb-24 lg:pb-8">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight">Panorama financeiro</h2>
        <p className="mt-1 text-sm text-slate-300">Resumo consolidado de contas, cartões e compromissos do mês</p>
      </div>
      <button type="button" onClick={() => setQuickModal({ mode: 'EXPENSE', accountId: accounts[0]?.id || null })}
        className="ml-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"><Plus size={17}/><span className="hidden sm:inline">Lançar despesa</span><span className="sm:hidden">Despesa</span></button>
      <button aria-label="Atualizar indicadores da carteira" type="button" onClick={() => void retry()}
        disabled={refreshing} className="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl border border-slate-700 px-3 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-40">
        <RefreshCw size={14} className={refreshing ? 'animate-spin text-blue-400' : 'text-slate-300'}/>
        <span className="hidden sm:inline">Atualizar</span>
      </button>
    </div>
    {error && <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-3 text-xs text-rose-200">{error}</div>}

    <WalletOverviewSummary accounts={accounts} cards={cards} accountBalance={overview.accountBalance}
      currentInvoiceTotal={overview.currentInvoiceTotal} credit={credit} onNavigate={onNavigate}/>

    <WalletSpendingGuide projectedBalance={balance.projectedBalance} creditPercent={credit.percentage}
      cardCount={cards.length} pendingCount={upcoming.length} spending={overview.spending} onNavigate={onNavigate}/>

    {/* 1. SEÇÃO BALANÇO DO MÊS */}
    <article className="rounded-xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base sm:text-lg font-bold text-white">
            <Scale size={18} className="text-blue-400"/> Balanço do mês ({today.slice(5, 7)}/{today.slice(0, 4)})
          </h3>
          <p className="mt-1 text-xs sm:text-sm text-slate-300">
            Entradas, saídas e saldo previsto conforme os lançamentos cadastrados.
          </p>
        </div>
        <span className={'rounded-full border px-3.5 py-1 text-xs sm:text-sm font-bold ' +
          (deficit ? 'border-rose-500/30 bg-rose-500/10 text-rose-300' :
            'border-emerald-500/30 bg-emerald-500/10 text-emerald-300')}>
          {deficit ? 'Déficit no mês' : 'Superávit no mês'}
        </span>
      </div>

      {/* Resumo compacto: valores do domínio sem nova lógica financeira. */}
      <dl className="mt-4 grid min-w-0 grid-cols-2 overflow-hidden rounded-xl border border-slate-800 bg-slate-950/60 sm:grid-cols-3">
        <div className="min-w-0 border-r border-slate-800 p-3 sm:p-4">
          <dt className="text-xs font-medium text-slate-300">Recursos</dt>
          <dd className="mt-1 break-words text-base font-bold tabular-nums text-emerald-300 sm:text-lg">{money(balance.totalResources)}</dd>
        </div>
        <div className="min-w-0 p-3 sm:border-r sm:border-slate-800 sm:p-4">
          <dt className="text-xs font-medium text-slate-300">Compromissos</dt>
          <dd className="mt-1 break-words text-base font-bold tabular-nums text-rose-300 sm:text-lg">{money(balance.totalLiabilities)}</dd>
        </div>
        <div className={`col-span-2 min-w-0 border-t border-slate-800 p-3 sm:col-span-1 sm:border-t-0 sm:p-4 ${deficit ? 'bg-rose-950/15' : 'bg-emerald-950/10'}`}>
          <dt className="text-xs font-semibold text-white">Projeção após compromissos</dt>
          <dd className={`mt-1 break-words text-lg font-bold tabular-nums ${deficit ? 'text-rose-300' : 'text-emerald-300'}`}>{money(balance.projectedBalance)}</dd>
        </div>
      </dl>
      <details className="group mt-3 border-t border-slate-800 pt-3">
        <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold text-blue-300 hover:text-blue-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
          Ver composição do balanço <ChevronDown size={16} aria-hidden="true" className="transition-transform group-open:rotate-180"/>
        </summary>
        <div className="grid gap-4 pt-3 lg:grid-cols-12">
          <div className="min-w-0 lg:col-span-6">
            <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold text-emerald-300"><TrendingUp size={15}/> Origem dos recursos</h4>
            <dl className="space-y-2 text-sm tabular-nums">
              <div className="flex flex-wrap justify-between gap-2"><dt className="text-slate-300">Saldos em conta</dt><dd className="font-semibold text-white">{money(balance.accountBalance)}</dd></div>
              <div className="flex flex-wrap justify-between gap-2"><dt className="text-slate-300">Receitas a receber no mês</dt><dd className="font-semibold text-white">{money(balance.pendingRecurringIncome)}</dd></div>
            </dl>
          </div>
          <div className="min-w-0 border-t border-slate-800 pt-3 lg:col-span-6 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
            <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold text-rose-300"><TrendingDown size={15}/> Origem dos compromissos</h4>
            <dl className="space-y-2 text-sm tabular-nums">
              <div className="flex flex-wrap justify-between gap-2"><dt className="text-slate-300">Faturas com vencimento no mês</dt><dd className="font-semibold text-white">{money(balance.openCardInvoices)}</dd></div>
              <div className="flex flex-wrap justify-between gap-2"><dt className="text-slate-300">Dívidas e contas do mês</dt><dd className="font-semibold text-white">{money(balance.monthPayables)}</dd></div>
            </dl>
          </div>
        </div>
      </details>
    </article>

    {/* 2. SEÇÃO COMPROMISSOS PRÓXIMOS */}
    <article className="rounded-xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base sm:text-lg font-bold text-white"><CalendarClock size={18} className="text-blue-400"/> Compromissos próximos</h2>
          <p className="mt-1 text-xs sm:text-sm text-slate-300">Até 8 obrigações vencidas ou com vencimento nos próximos 45 dias</p>
        </div>
        <button type="button" onClick={() => go('dividas')} className="flex min-h-10 items-center gap-1.5 text-sm font-semibold text-blue-300 transition-colors hover:text-blue-200">
          <span>Ver contas a pagar</span> <ArrowRight size={16}/>
        </button>
      </div>
      <div className="mt-4 divide-y divide-slate-800">
        {upcoming.length ? upcoming.map(item => {
          const overdue = item.dueDate < today;
          return (
            <div
              key={item.id}
              className="flex flex-col gap-2 rounded-lg px-1 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              {/* Lado Esquerdo */}
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-700/80 bg-slate-950 text-slate-200">
                  <BankLogo name={item.institution} alternateName={item.title} size="sm" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm sm:text-base font-semibold text-white">{item.title}</p>
                  <p className="mt-0.5 truncate text-xs sm:text-sm text-slate-300">{item.institution} · {item.accountLabel}</p>
                </div>
              </div>

              {/* Centro & Lado Direito */}
              <div className="flex items-center justify-between gap-3 sm:justify-end shrink-0">
                <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                  overdue
                    ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                    : 'border-slate-700 bg-slate-950 text-slate-200'
                }`}>
                  {overdue ? 'Vencido · ' : ''}{dateLabel(item.dueDate)}
                </span>
                <strong className="text-right text-base sm:text-lg font-bold text-white tracking-tight tabular-nums">
                  {money(item.amount)}
                </strong>
              </div>
            </div>
          );
        }) : <p className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-300">
          Nenhum compromisso com vencimento informado nos próximos 45 dias.
        </p>}
      </div>
    </article>

    {quickModal?.mode === 'EXPENSE' && (
      <QuickExpenseModal
        accounts={accounts}
        cards={cards}
        defaultMethod={quickModal.accountId ? 'ACCOUNT' : 'CARD'}
        defaultAccountId={quickModal.accountId}
        defaultCardId={quickModal.cardId}
        onClose={() => setQuickModal(null)}
        onSaved={async () => {
          await refresh();
        }}
      />
    )}

    {quickModal?.mode === 'CASH_WALLET' && (
      <CreateAccountModal
        onClose={() => setQuickModal(null)}
        onSaved={async () => {
          await refresh();
        }}
      />
    )}

    {quickModal?.mode === 'CARD_OPENING' && (
      <QuickWalletActionsModal
        mode="CARD_OPENING"
        accounts={accounts}
        cards={cards}
        expenses={snapshot?.expenses || []}
        installments={snapshot?.installments || []}
        invoicePayments={snapshot?.invoicePayments || []}
        initialCardId={quickModal.cardId}
        initialAccountId={quickModal.accountId}
        onClose={() => setQuickModal(null)}
        onSaved={async () => {
          await refresh();
        }}
      />
    )}
  </section>;
};

export const OverviewPage = WalletOverviewPage;
export default WalletOverviewPage;
