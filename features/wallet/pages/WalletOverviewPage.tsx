import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight, CalendarClock, CreditCard, Landmark, RefreshCw,
  Scale, TrendingDown, TrendingUp, AlertCircle,
} from 'lucide-react';
import type { UserProfile } from '../../../types';
import type {
  PersonalWalletAccount, PersonalWalletCard,
  PersonalWalletPayable, PersonalWalletExpense,
  PersonalWalletExpenseInstallment,
} from '../../../services/personalWallet.service';
import { formatMoney } from '../../../utils/formatters';
import { BankLogo } from '../../../components/wallet/BankLogo';
import { calculateWalletBalance } from '../../../components/wallet/walletBalanceDomain';
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
  const expenseMap = new Map<string, PersonalWalletExpense>(
    snapshot.expenses.map(expense => [expense.id, expense]),
  );
  const cardMap = new Map(cards.map(card => [card.id, card]));
  const invoices = new Map<string, Commitment>();

  snapshot.installments.forEach((installment: PersonalWalletExpenseInstallment) => {
    if (installment.status !== 'PENDING') return;
    const expense = expenseMap.get(installment.expense_id);
    const card = expense?.card_id ? cardMap.get(expense.card_id) : null;
    if (!card) return;
    const outstanding = Math.max(
      0, Number(installment.amount || 0) - Number(installment.paid_amount || 0),
    );
    if (outstanding <= 0) return;
    const dueMonth = String(installment.due_month).slice(0, 7);
    const dueDate = dueDateForCard(dueMonth, card.due_day);
    if (!dueDate) return;
    const key = card.id + ':' + dueMonth;
    const old = invoices.get(key);
    invoices.set(key, {
      id: key,
      title: 'Fatura ' + card.nickname,
      institution: card.issuer || card.nickname,
      dueDate,
      amount: (old?.amount || 0) + outstanding,
      accountLabel: sourceAccount(accounts, cards, card.account_id),
      category: 'CARD',
    });
  });

  const invoiceList = [...invoices.values()];
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
  const deficit = balance.projectedBalance < 0;

  return <section aria-label="Visão geral da carteira"
    className="mx-auto w-full max-w-7xl space-y-5 px-4 pb-24 sm:px-6 lg:pb-8">
    <div className="flex items-center justify-between gap-3">
      <div>
        <h2 className="text-base font-black text-white sm:text-lg">Panorama financeiro</h2>
        <p className="text-[11px] text-slate-400">Resumo das suas finanças</p>
      </div>
      <button aria-label="Atualizar indicadores da carteira" type="button" onClick={() => void retry()}
        disabled={refreshing} className="rounded-xl border border-slate-700 p-2.5 text-slate-300 hover:text-white disabled:opacity-40">
        <RefreshCw size={17} className={refreshing ? 'animate-spin' : ''}/>
      </button>
    </div>
    {error && <div role="alert" className="rounded-xl border border-amber-600/30 bg-amber-950/20 p-3 text-xs text-amber-200">{error}</div>}

    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <article className="flex min-w-0 flex-col rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/40 via-slate-900 to-slate-900 p-4 sm:p-5 lg:col-span-6">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-emerald-300">
          <Landmark size={17}/> Liquidez imediata
        </div>
        <strong className="mt-3 text-3xl font-black tabular-nums text-emerald-300 sm:text-4xl">
          {money(overview.accountBalance)}
        </strong>
        <p className="mt-1 text-xs text-slate-400">
          {overview.institutionCount} {overview.institutionCount === 1 ? 'instituição' : 'instituições'}
        </p>
        <div className="mt-4 flex snap-x gap-2 overflow-x-auto pb-2">
          {accounts.length ? accounts.map(account => {
            const visual = getBankVisual(account.institution_key || account.bank_name || account.nickname);
            return <div key={account.id}
              className="min-w-[150px] max-w-[220px] flex-1 shrink-0 snap-start rounded-xl border border-white/10 bg-slate-950/75 p-3">
              <div className="flex items-center gap-2">
                <BankLogo name={account.institution_key || account.bank_name} alternateName={account.nickname} size="sm"/>
                <span className="truncate text-xs font-bold text-slate-100">{visual.name}</span>
              </div>
              <strong className="mt-3 block text-sm font-black tabular-nums text-white">
                {money(Number(account.balance))}
              </strong>
              <p className="mt-1 truncate text-[10px] text-slate-400">
                {walletAccountTypeLabel(account.account_type)}
              </p>
            </div>;
          }) : <p className="rounded-xl border border-dashed border-slate-700 p-5 text-xs text-slate-400">
            Nenhuma conta cadastrada.
          </p>}
        </div>
        <button type="button" onClick={() => go('contas')}
          className="mt-auto flex items-center justify-between border-t border-slate-700/70 pt-4 text-left text-xs font-bold text-emerald-300">
          Ver contas <ArrowRight size={16}/>
        </button>
      </article>

      <article className="flex min-w-0 flex-col rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-950/30 via-slate-900 to-slate-900 p-4 sm:p-5 lg:col-span-6">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-blue-300">
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
            <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all"
              style={{ width: credit.percentage + '%' }}/>
          </div>

        </div>
        <div className="mt-4 flex snap-x gap-2 overflow-x-auto pb-3" aria-label="Seus cartões">
          {cards.length ? cards.map(card => {
            const account = accounts.find(item => item.id === card.account_id);
            const institution = card.institution_key || account?.institution_key || card.issuer || card.nickname;
            const visual = getBankVisual(institution);
            return <button type="button" key={card.id} onClick={() => go('cartoes')}
              aria-label={`Abrir cartão ${card.nickname}`}
              className="relative flex aspect-[1.586/1] min-w-[152px] max-w-[206px] flex-1 shrink-0 snap-start flex-col justify-between overflow-hidden rounded-xl border border-white/20 p-3 text-left text-white shadow-md"
              style={{ background: `linear-gradient(135deg, ${card.primary_color || visual.accent}, ${visual.secondary})` }}>
              <div className="flex min-w-0 items-center gap-1.5">
                <BankLogo name={institution} alternateName={card.nickname} size="sm"/>
                <span className="truncate text-[11px] font-bold">{card.nickname}</span>
              </div>
              <div className="flex items-end justify-between gap-1">
                <span className="text-[10px] font-semibold uppercase text-white/80">{card.brand || 'Crédito'}</span>
                <span className="text-[10px] tracking-wider text-white/90">•••• {card.last_four || '----'}</span>
              </div>
            </button>;
          }) : <p className="py-3 text-xs text-slate-400">Nenhum cartão cadastrado.</p>}
        </div>
        <button type="button" onClick={() => go('cartoes')}
          className="mt-auto flex items-center justify-between border-t border-slate-700/70 pt-4 text-left text-xs font-bold text-blue-300">
          Ver cartões e faturas <ArrowRight size={16}/>
        </button>
      </article>
    </div>

    <article className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-300">
            <Scale size={17} className="text-violet-300"/> Balanço do mês
          </div>
          <p className="mt-1 text-[11px] text-slate-500">{today.slice(5, 7)}/{today.slice(0, 4)}</p>
        </div>
        <span className={'rounded-full border px-3 py-1 text-[10px] font-bold ' +
          (deficit ? 'border-rose-500/30 bg-rose-500/10 text-rose-300' :
            'border-emerald-500/30 bg-emerald-500/10 text-emerald-300')}>
          {deficit ? 'Déficit' : 'Superávit'}
        </span>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-12">
        <div className="rounded-xl border border-emerald-500/15 bg-emerald-950/10 p-4 lg:col-span-6">
          <h3 className="mb-3 flex items-center gap-2 text-xs font-bold text-emerald-300"><TrendingUp size={16}/> Recursos</h3>
          <div className="space-y-3 text-xs">
            <div className="flex justify-between gap-3 text-slate-300"><span>Saldo em contas</span><strong>{money(balance.accountBalance)}</strong></div>
            <div className="flex justify-between gap-3 text-slate-300"><span>Receitas a receber</span><strong>{money(balance.pendingRecurringIncome)}</strong></div>
            <div className="flex justify-between gap-3 border-t border-slate-700 pt-3 font-bold text-emerald-300"><span>Total de recursos</span><strong>{money(balance.totalResources)}</strong></div>
          </div>
        </div>
        <div className="rounded-xl border border-rose-500/15 bg-rose-950/10 p-4 lg:col-span-6">
          <h3 className="mb-3 flex items-center gap-2 text-xs font-bold text-rose-300"><TrendingDown size={16}/> Passivos</h3>
          <div className="space-y-3 text-xs">
            <div className="flex justify-between gap-3 text-slate-300"><span>Faturas de cartão do mês</span><strong>{money(balance.openCardInvoices)}</strong></div>
            <div className="flex justify-between gap-3 text-slate-300"><span>Dívidas e contas a pagar do mês</span><strong>{money(balance.monthPayables)}</strong></div>
            <div className="flex justify-between gap-3 border-t border-slate-700 pt-3 font-bold text-rose-300"><span>Total de passivos</span><strong>{money(balance.totalLiabilities)}</strong></div>
          </div>
        </div>
      </div>
      <div className={'mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 ' +
        (deficit ? 'border-rose-500/20 bg-rose-950/20' : 'border-emerald-500/20 bg-emerald-950/20')}>
        <div>
          <p className="text-xs font-bold text-slate-300">Saldo projetado do mês</p>
          <p className="text-[10px] text-slate-500">Saldo disponível menos valores a pagar</p>
        </div>
        <strong className={'text-xl font-black tabular-nums sm:text-2xl ' + (deficit ? 'text-rose-300' : 'text-emerald-300')}>
          {money(balance.projectedBalance)}
        </strong>
      </div>
    </article>

    <article className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-black text-white"><CalendarClock size={18} className="text-amber-300"/> Compromissos próximos</h2>
          <p className="mt-1 text-[11px] text-slate-400">Vencidos e próximos 45 dias</p>
        </div>
        <button type="button" onClick={() => go('dividas')} className="flex items-center gap-1 text-xs font-bold text-blue-300">
          Ver contas a pagar <ArrowRight size={15}/>
        </button>
      </div>
      <div className="mt-4 space-y-2">
        {upcoming.length ? upcoming.map(item => {
          const overdue = item.dueDate < today;
          return <div key={item.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/65 p-3 sm:grid-cols-[minmax(0,1fr)_140px_150px]">
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-white">{item.title}</p>
              <p className="mt-0.5 truncate text-[10px] text-slate-400">{item.institution} · {item.accountLabel}</p>
            </div>
            <div className="text-right sm:text-left">
              <p className={'text-[11px] font-bold ' + (overdue ? 'text-rose-300' : 'text-amber-300')}>
                {overdue ? 'Vencido · ' : ''}{dateLabel(item.dueDate)}
              </p>
              <p className="text-[10px] text-slate-500">{item.category === 'CARD' ? 'Fatura de cartão' : 'Conta a pagar'}</p>
            </div>
            <strong className="col-span-2 text-right text-xs tabular-nums text-white sm:col-span-1">{money(item.amount)}</strong>
          </div>;
        }) : <p className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-xs text-slate-400">
          Nenhum compromisso com vencimento informado nos próximos 45 dias.
        </p>}
      </div>
    </article>
  </section>;
};
