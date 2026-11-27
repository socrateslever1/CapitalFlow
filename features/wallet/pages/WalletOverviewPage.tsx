import { PrivateMoney, useFinancialPrivacy } from '../../../contexts/FinancialPrivacyContext';
import { businessDateInManaus } from '../../../utils/businessDate';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight, CalendarClock, ChevronDown,
  Scale, TrendingDown, TrendingUp, AlertCircle,
} from 'lucide-react';
import type { UserProfile } from '../../../types';
import type {
  PersonalWalletAccount, PersonalWalletCard, PersonalWalletPayable,
} from '../../../services/personalWallet.service';
import { formatMoney } from '../../../utils/formatters';
import { BankLogo } from '../../../components/wallet/BankLogo';
import { buildInvoiceReminders } from '../utils/invoiceReminders';
import { calculateAccountProjections, calculateWalletBalance, describeWalletBalanceFact } from '../../../components/wallet/walletBalanceDomain';
import { getEffectiveInvoiceCycles, getInvoiceCycleDates, getPurchaseInvoiceMonth } from '../../../components/wallet/invoiceStatementDomain';
import { getBankVisual, getCreditSummary } from '../../../components/wallet/walletPresentation';
import { walletRepository, type WalletOverviewSnapshot } from '../services/walletRepository';
import { WalletOverviewSummary } from '../components/WalletOverviewSummary';
import { WalletSpendingGuide } from '../components/WalletSpendingGuide';
import { getWalletSpendingOverview } from '../domain/walletSpendingInsights';
import { buildWalletTimeline, type WalletTimelineEvent } from '../domain/walletTimeline';
import { QuickWalletActionsModal, type QuickActionMode } from '../components/QuickWalletActionsModal';
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
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Manaus', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const year = parts.find(part => part.type === 'year')?.value;
  const month = parts.find(part => part.type === 'month')?.value;
  const day = parts.find(part => part.type === 'day')?.value;
  return `${year}-${month}-${day}`;
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

const deriveOverview = (snapshot: WalletOverviewSnapshot, today: string) => {
  const month = today.slice(0, 7);
  const accounts = snapshot.accounts;
  const cards = snapshot.cards.filter(card => card.status !== 'CANCELED');
  const accountBalance = sum(accounts, account => Number(account.balance));
  const institutionKeys = new Set(accounts.map(account =>
    getBankVisual(account.institution_key || account.bank_name || account.nickname).key,
  ));
  const credit = getCreditSummary(cards);
  const spending = getWalletSpendingOverview(snapshot.expenses, month, 4, snapshot.spendingOperations || []);
  const exactDueDates = new Map((snapshot.cardInvoiceDates || [])
    .map(item => [item.card_id + ':' + item.due_month.slice(0, 7), item.due_date] as const));
  const invoiceList: Commitment[] = cards.flatMap(card =>
    getEffectiveInvoiceCycles(card.id, snapshot.expenses, snapshot.installments)
      .filter(cycle => cycle.amount > 0)
      .flatMap(cycle => {
        const explicitDate=exactDueDates.get(card.id + ':' + cycle.dueMonth.slice(0, 7));
        if (!card.due_day && !explicitDate) return [];
        const { closingDate, dueDate } = getInvoiceCycleDates(
          cycle.dueMonth, card.closing_day, card.due_day, explicitDate, card,
        );
        const competence = closingDate.slice(5,7) + '/' + closingDate.slice(0,4);
        return [{
          id: card.id + ':' + cycle.dueMonth,
          title: 'Fatura ' + card.nickname + ' · competência ' + competence,
          institution: card.issuer || card.nickname,
          dueDate,
          amount: cycle.amount,
          accountLabel: sourceAccount(accounts, cards, card.account_id),
          category: 'CARD' as const,
        }];
      }),
  );
  // A projeção do mês inclui faturas do mês e faturas vencidas ainda não pagas:
  // dívida atrasada não some da previsão.
  // Compromissos: tudo que vence nos próximos 30 dias, mais o que já venceu e não foi pago.
  const horizon = new Date(today + 'T12:00:00Z');
  horizon.setUTCDate(horizon.getUTCDate() + 30);
  const horizonDate = horizon.toISOString().slice(0, 10);
  const currentInvoiceTotal = sum(
    invoiceList.filter(invoice => invoice.dueDate <= horizonDate),
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
    pendingOperations: snapshot.pendingOperations || [],
    horizonDate,
  });
  // Saldo previsto por conta: mesmas parcelas do total, distribuídas pela conta de cada item.
  const accountProjections = calculateAccountProjections({
    accounts,
    recurringIncomes: snapshot.recurringIncomes,
    receivedIncomeIds: receivedIds,
    payables: snapshot.payables,
    invoices: invoiceList.filter(invoice => invoice.dueDate <= horizonDate).map(invoice => ({
      accountId: cards.find(card => card.id === invoice.id.split(':')[0])?.account_id || null,
      amount: invoice.amount,
    })),
    pendingOperations: snapshot.pendingOperations || [],
    month,
    horizonDate,
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
  const allUpcoming = [...invoiceList, ...openPayables]
    .filter(item => item.dueDate <= limitDate)
    .sort((first, second) =>
      first.dueDate.localeCompare(second.dueDate) || first.title.localeCompare(second.title),
    );
  // Outstanding card invoices and unpaid personal obligations have different
  // legal/accounting meanings: do not label an invoice as a creditor's debt.
  const overdueCount = openPayables.filter(item => item.dueDate < today).length;
  const overdueInvoiceCount = invoiceList.filter(item => item.dueDate < today).length;
  const weekEnd = new Date(today + 'T12:00:00');
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekLimit = dayKey(weekEnd);
  const dueSoonCount = allUpcoming.filter(item => item.dueDate >= today && item.dueDate <= weekLimit).length;
  const upcoming = allUpcoming.slice(0, 8);
  const timelineEvents = buildWalletTimeline({
    referenceDate: today,
    operations: [],
    expenses: snapshot.expenses,
    installments: snapshot.installments,
    payables: snapshot.payables,
    invoicePayments: snapshot.invoicePayments,
    cards: snapshot.cards,
    cardInvoiceDates: snapshot.cardInvoiceDates,
    limit: 8,
  });

  return {
    accounts, cards, bankAvailableReferences: snapshot.bankAvailableReferences || [],
    cardMovements: { expenses: snapshot.expenses },
    accountBalance, institutionCount: institutionKeys.size,
    credit, currentInvoiceTotal, balance, accountProjections, upcoming, spending, overdueCount, overdueInvoiceCount, dueSoonCount,
    timelineEvents,
  };
};

export const WalletOverviewPage: React.FC<Props> = ({ activeUser, onNavigate }) => {
  const privacyHidden = useFinancialPrivacy();
  const [snapshot, setSnapshot] = useState<WalletOverviewSnapshot | null>(() =>
    typeof walletRepository.peekSyncOverview === 'function' ? walletRepository.peekSyncOverview() : null
  );
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [today, setToday] = useState(() => businessDateInManaus());
  const [quickModal, setQuickModal] = useState<{
    mode: QuickActionMode;
    cardId?: string | null;
    accountId?: string | null;
  } | null>(null);
  const refresh = useCallback(async () => {
    const result = await walletRepository.loadOverview({ force: true });
    setSnapshot(result);
    setToday(businessDateInManaus());
    setError('');
  }, []);

  useEffect(() => {
    let mounted = true;
    let hasCached = false;
    void walletRepository.peekCachedOverview().then(cached => {
      if (mounted && cached) {
        hasCached = true;
        setSnapshot(current => current ?? cached);
        setToday(businessDateInManaus());
      }
    });
    // Um resumo em cache é útil para o primeiro quadro, mas ao entrar na
    // Visão geral os valores devem ser revalidados com a mesma fonte do detalhe.
    walletRepository.loadOverview({ force: true })
      .then(result => { if (mounted) { setSnapshot(result); setToday(businessDateInManaus()); setError(''); } })
      .catch(reason => {
        if (mounted) setError(hasCached
          ? 'Falha ao atualizar. Os valores apresentados podem estar desatualizados.'
          : reason instanceof Error ? reason.message : 'Não foi possível carregar a carteira.');
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

  const { accounts, cards, balance, credit, upcoming, accountProjections } = overview;
  const deficit = balance.projectedBalance < 0;

  return <section aria-label="Visão geral da carteira"
    className="w-full min-w-0 space-y-4 pb-24 lg:pb-8">
    {error && <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-3 text-xs text-rose-200">{error}</div>}

    <WalletOverviewSummary accounts={accounts} cards={cards}
      bankAvailableReferences={overview.bankAvailableReferences}
      cardMovements={overview.cardMovements}
      accountBalance={overview.accountBalance}
      currentInvoiceTotal={overview.currentInvoiceTotal} credit={credit} onNavigate={onNavigate}/>

    <WalletSpendingGuide projectedBalance={balance.projectedBalance} creditPercent={credit.percentage}
      cardCount={cards.length} pendingCount={upcoming.length}
      overdueCount={overview.overdueCount} overdueInvoiceCount={overview.overdueInvoiceCount}
      dueSoonCount={overview.dueSoonCount}
      pendingIncome={balance.pendingRecurringIncome} spending={overview.spending} onNavigate={onNavigate}/>

    {(() => {
      // Lembrete no app: fatura que fecha ou vence em até 3 dias (regra de ciclo de cada cartão).
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Manaus' }).format(new Date());
      // Vencimento só avisa se a fatura ainda tem valor a pagar.
      const reminders = buildInvoiceReminders(cards, today)
        .filter(item => item.kind === 'CLOSE' || overview.upcoming.some(invoice => invoice.id.startsWith(item.cardId + ':') && invoice.dueDate === item.date))
        .map(item => ({ key: item.key, text: item.text }));
      if (!reminders.length) return null;
      return <aside aria-label="Lembretes de fatura" className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3">
        <p className="text-xs font-bold text-amber-200">Lembretes de fatura</p>
        <ul className="mt-1 space-y-0.5 text-xs text-amber-100/90">{reminders.map(item => <li key={item.key}>{item.text}</li>)}</ul>
      </aside>;
    })()}

    {/* 1. SEÇÃO BALANÇO DO MÊS */}
    <article className="rounded-xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base sm:text-lg font-bold text-white">
            <Scale size={18} className="text-blue-400"/> Balanço do mês ({today.slice(5, 7)}/{today.slice(0, 4)})
          </h3>
          <p className="mt-1 text-xs sm:text-sm text-slate-300">
            Saldo atual e previsão do mês. Não confunda receitas esperadas com dinheiro já recebido.
          </p>
        </div>
        <span className={'inline-flex h-7 items-center rounded-md border px-2.5 text-[11px] font-semibold ' +
          (privacyHidden ? 'border-slate-700 bg-slate-950/50 text-slate-300' :
           deficit ? 'border-rose-500/30 bg-rose-500/10 text-rose-300' :
             'border-emerald-500/30 bg-emerald-500/10 text-emerald-300')}>
          {privacyHidden ? 'Indicador oculto' : deficit ? 'Falta prevista' : 'Sobra prevista'}
        </span>
      </div>

      {/* Resumo compacto: valores do domínio sem nova lógica financeira. */}
      <dl className="mt-4 grid min-w-0 grid-cols-2 overflow-hidden rounded-xl border border-slate-800 bg-slate-950/60 sm:grid-cols-3">
        <div className="min-w-0 border-r border-slate-800 p-3 sm:p-4">
          <dt className="text-xs font-medium text-slate-300">Recursos do mês</dt>
          <dd className="mt-1 break-words text-base font-bold tabular-nums text-emerald-300 sm:text-lg"><PrivateMoney value={money(balance.totalResources)} /></dd>
        </div>
        <div className="min-w-0 p-3 sm:border-r sm:border-slate-800 sm:p-4">
          <dt className="text-xs font-medium text-slate-300">Compromissos (próx. 30 dias)</dt>
          <dd className="mt-1 break-words text-base font-bold tabular-nums text-rose-300 sm:text-lg"><PrivateMoney value={money(balance.totalLiabilities)} /></dd>
        </div>
        <div className={`col-span-2 min-w-0 border-t border-slate-800 p-3 sm:col-span-1 sm:border-t-0 sm:p-4 ${privacyHidden ? 'bg-slate-950/30' : deficit ? 'bg-rose-950/15' : 'bg-emerald-950/10'}`}>
          <dt className="text-xs font-semibold text-white">Sobra prevista após compromissos</dt>
          <dd className={`mt-1 break-words text-lg font-bold tabular-nums ${privacyHidden ? 'text-slate-300' : deficit ? 'text-rose-300' : 'text-emerald-300'}`}><PrivateMoney value={money(balance.projectedBalance)} /></dd>
        </div>
      </dl>
      {accountProjections.length > 0 && <details className="mt-3 rounded-xl border border-slate-800 bg-slate-950/40">
        <summary className="cursor-pointer px-3 py-2.5 text-xs font-semibold text-blue-200">Saldo previsto por conta</summary>
        <ul className="divide-y divide-slate-800 border-t border-slate-800">
          {accountProjections.map(item => <li key={item.accountId || 'none'} className="px-3 py-2.5">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="min-w-0 truncate font-semibold text-slate-100">{item.name}</span>
              <span className={`shrink-0 font-bold tabular-nums ${item.projected < 0 ? 'text-rose-300' : 'text-emerald-300'}`}><PrivateMoney value={money(item.projected)} /></span>
            </div>
            <dl className="mt-1 space-y-0.5 text-[11px] text-slate-400">
              {item.accountId && <div className="flex justify-between gap-2"><dt>Saldo atual</dt><dd className="tabular-nums"><PrivateMoney value={money(item.balance)} /></dd></div>}
              {item.lines.map(line => <div key={line.label} className="flex justify-between gap-2"><dt>{line.label}</dt>
                <dd className={`tabular-nums ${line.amount < 0 ? 'text-rose-300/90' : 'text-emerald-300/90'}`}>{line.amount < 0 ? '− ' : '+ '}<PrivateMoney value={money(Math.abs(line.amount))} /></dd></div>)}
            </dl>
          </li>)}
        </ul>
        <p className="border-t border-slate-800 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
          Próximos 30 dias, incluindo o que já venceu. Faturas entram na conta vinculada ao cartão.
        </p>
      </details>}
    </article>

    {/* 2. SEÇÃO COMPROMISSOS PRÓXIMOS */}
    <article className="rounded-xl border border-slate-800 bg-slate-900 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm sm:text-base font-bold text-white"><CalendarClock size={16} className="text-blue-400"/> Compromissos próximos</h2>
        <button type="button" onClick={() => go('dividas')} className="flex min-h-9 items-center gap-1 text-xs font-semibold text-blue-300 transition-colors hover:text-blue-200">
          <span>Ver contas a pagar</span> <ArrowRight size={14}/>
        </button>
      </div>
      {privacyHidden ? <p className="mt-2.5 rounded-lg border border-slate-800 bg-slate-950/40 p-2.5 text-xs text-slate-300">
        Detalhes e vencimentos ocultos pelo controle de privacidade.
      </p> : <div className="mt-2 divide-y divide-slate-800">
        {upcoming.length ? upcoming.map(item => {
          const overdue = item.dueDate < today;
          const subtitle = item.accountLabel && item.accountLabel !== item.institution
            ? `${item.institution} · ${item.accountLabel}`
            : item.institution;
          return (
            <div
              key={item.id}
              className="flex items-center justify-between gap-2.5 py-2"
            >
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-700/80 bg-slate-950 text-slate-200">
                  <BankLogo name={item.institution} alternateName={item.title} size="sm" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs sm:text-sm font-semibold text-white">{item.title}</p>
                  <p className="truncate text-[11px] text-slate-400">{subtitle}</p>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <strong className="block text-xs sm:text-sm font-bold text-white tracking-tight tabular-nums">
                  <PrivateMoney value={money(item.amount)} />
                </strong>
                <span className={`mt-0.5 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                  overdue
                    ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                    : 'border-slate-700 bg-slate-950 text-slate-300'
                }`}>
                  {overdue ? 'Vencido · ' : ''}{dateLabel(item.dueDate)}
                </span>
              </div>
            </div>
          );
        }) : <p className="rounded-xl border border-dashed border-slate-700 p-4 text-center text-xs text-slate-300">
          Nenhum compromisso previsto nos próximos 45 dias.
        </p>}
      </div>}
    </article>

    {quickModal?.mode === 'CASH_WALLET' && (
      <CreateAccountModal
        activeUser={activeUser}
        existingCards={cards}
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

// Reutilizado pelo relatório da Carteira sem duplicar as regras financeiras.
export { deriveOverview };
