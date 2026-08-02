import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Landmark,
  RefreshCw,
  RotateCcw,
  Search,
  Wallet,
} from 'lucide-react';
import { CapitalSource, LedgerEntry, Loan } from '../types';
import { formatMoney } from '../utils/formatters';
import { getInstallmentOpenAmount, isInstallmentOpen } from '../utils/loanStatus';
import { filterOperationalSources, isTestSource } from '../utils/testSource';
import { supabase } from '../lib/supabase';
import { safeUUID } from '../utils/uuid';

interface FinancialStatementPageProps {
  profileId: string;
  loans: Loan[];
  sources: CapitalSource[];
  isStealthMode: boolean;
  isLoading: boolean;
  onRefresh: () => Promise<void> | void;
  onOpenLoan: (loanId: string) => void;
}

type Movement = LedgerEntry & {
  loanId: string | null;
  debtorName: string;
  sourceName: string;
  direction: 'IN' | 'OUT';
  createdAt?: string;
  operatorId?: string | null;
  idempotencyKey?: string | null;
  reversedOfTransactionId?: string | null;
};

type PeriodMode = 'DAY' | 'MONTH' | 'RANGE';

const OUT_TYPES = new Set([
  'LOAN_INITIAL',
  'LOAN_CREATED',
  'LEND_MORE',
  'NOVO_APORTE',
  'APORTE',
  'PROFIT_WITHDRAWAL',
  'WITHDRAWAL',
  'EXPENSE',
]);
const TEST_CATEGORIES = new Set(['TEST', 'TESTE', 'SANDBOX', 'HOMOLOGACAO']);

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/;

const dateInputValue = (value: Date) =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;

const monthKey = (value: Date) => dateInputValue(value).slice(0, 7);

const parseDate = (value: string) => {
  const match = String(value || '').match(DATE_ONLY_PATTERN);
  if (match) {
    const [, year, month, day] = match;
    return new Date(Number(year), Number(month) - 1, Number(day), 12);
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
};

const movementDateKey = (value: string) => {
  const match = String(value || '').match(DATE_ONLY_PATTERN);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : dateInputValue(parseDate(value));
};

const getMonthPeriod = (key: string) => {
  const [year, month] = key.split('-').map(Number);
  const start = new Date(year, month - 1, 1, 12);
  const end = new Date(year, month, 0, 12);

  return {
    start,
    end,
  };
};

const normalizeRange = (startValue: string, endValue: string) => {
  if (startValue <= endValue) return { startKey: startValue, endKey: endValue };
  return { startKey: endValue, endKey: startValue };
};

const getMovementDirection = (entry: LedgerEntry): 'IN' | 'OUT' => {
  const type = String(entry.type || '').toUpperCase();
  if (OUT_TYPES.has(type)) return 'OUT';
  return Number(entry.amount || 0) < 0 ? 'OUT' : 'IN';
};

const getPaymentGroupKey = (movement: Pick<Movement, 'idempotencyKey'>) =>
  String(movement.idempotencyKey || '').replace(/(_lucro|_profit)$/i, '');

const formatDateTime = (value?: string) => {
  const date = parseDate(value || '');
  if (date.getTime() <= 0) return 'data não registrada';
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getLoanOpenAmount = (loan: Loan) => {
  const agreement = loan.activeAgreement;
  if (agreement && ['ACTIVE', 'ATIVO'].includes(String(agreement.status).toUpperCase())) {
    return (agreement.installments || []).reduce(
      (total, installment) =>
        total + Math.max(0, Number(installment.amount || 0) - Number(installment.paidAmount || 0)),
      0
    );
  }

  return (loan.installments || []).reduce(
    (total, installment) =>
      total + (isInstallmentOpen(installment) ? getInstallmentOpenAmount(installment) : 0),
    0
  );
};

export const FinancialStatementPage: React.FC<FinancialStatementPageProps> = ({
  profileId,
  loans,
  sources,
  isStealthMode,
  isLoading,
  onRefresh,
  onOpenLoan,
}) => {
  const today = useMemo(() => new Date(), []);
  const [periodMode, setPeriodMode] = useState<PeriodMode>('MONTH');
  const [selectedDay, setSelectedDay] = useState(() => dateInputValue(new Date()));
  const [selectedMonth, setSelectedMonth] = useState(() => monthKey(new Date()));
  const [rangeStart, setRangeStart] = useState(() => dateInputValue(getMonthPeriod(monthKey(new Date())).start));
  const [rangeEnd, setRangeEnd] = useState(() => dateInputValue(new Date()));
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'ALL' | 'IN' | 'OUT' | 'RECEIVABLE'>('ALL');
  const [databaseEntries, setDatabaseEntries] = useState<any[] | null>(null);
  const [statementRefreshKey, setStatementRefreshKey] = useState(0);
  const [reversingGroupKey, setReversingGroupKey] = useState<string | null>(null);

  useEffect(() => {
    const safeProfileId = safeUUID(profileId);
    if (!safeProfileId || !navigator.onLine) {
      setDatabaseEntries(null);
      return;
    }

    let cancelled = false;
    void supabase
      .from('transacoes')
      .select('id, loan_id, source_id, installment_id, agreement_id, date, type, amount, principal_delta, interest_delta, late_fee_delta, notes, category, meta, idempotency_key, operator_id, created_at, reversed_of_transaction_id')
      .eq('profile_id', safeProfileId)
      .order('date', { ascending: false })
      .limit(5000)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error('[FinancialStatement] Falha ao carregar transações:', error.message);
          setDatabaseEntries(null);
          return;
        }
        setDatabaseEntries(data || []);
      });

    return () => {
      cancelled = true;
    };
  }, [profileId, statementRefreshKey]);

  const handleRefresh = async () => {
    await onRefresh();
    setStatementRefreshKey((current) => current + 1);
  };

  const handleReversePaymentGroup = async (movement: Movement) => {
    const groupKey = getPaymentGroupKey(movement);
    const safeProfileId = safeUUID(profileId);
    if (!safeProfileId || !groupKey) {
      alert('Não foi possível identificar o grupo deste recebimento.');
      return;
    }

    const confirmed = window.confirm(
      `Estornar o recebimento de ${movement.debtorName}?\n\n` +
      `O sistema vai criar lançamentos negativos, devolver o saldo da parcela e ajustar a fonte de capital/lucro.`
    );
    if (!confirmed) return;

    setReversingGroupKey(groupKey);
    const { data, error } = await supabase.rpc('reverse_payment_group', {
      p_profile_id: safeProfileId,
      p_idempotency_key: groupKey,
      p_reason: 'Estorno manual pelo extrato',
      p_operator_id: safeProfileId,
    });
    setReversingGroupKey(null);

    if (error) {
      console.error('[FinancialStatement] Falha ao estornar recebimento:', error);
      alert(error.message || 'Erro ao estornar recebimento.');
      return;
    }

    const summary = data as any;
    alert(
      `Estorno registrado.\n\n` +
      `Valor: ${formatMoney(Number(summary?.amount || 0), isStealthMode)}\n` +
      `Capital: ${formatMoney(Number(summary?.principal || 0), isStealthMode)}\n` +
      `Lucro/juros: ${formatMoney(Number(summary?.interest || 0) + Number(summary?.late_fee || 0), isStealthMode)}`
    );
    await handleRefresh();
  };

  const operationalSources = useMemo(() => filterOperationalSources(sources), [sources]);
  const testSourceIds = useMemo(
    () => new Set(sources.filter(isTestSource).map((source) => source.id)),
    [sources]
  );
  const sourceById = useMemo(
    () => new Map(operationalSources.map((source) => [source.id, source.name])),
    [operationalSources]
  );
  const operationalLoans = useMemo(
    () => loans.filter((loan) => !testSourceIds.has(loan.sourceId)),
    [loans, testSourceIds]
  );
  const loanById = useMemo(
    () => new Map(operationalLoans.map((loan) => [loan.id, loan])),
    [operationalLoans]
  );

  const movements = useMemo<Movement[]>(() => {
    const entries = databaseEntries
      ? databaseEntries.map((entry) => ({
          id: String(entry.id),
          loanId: entry.loan_id ? String(entry.loan_id) : null,
          date: String(entry.date || ''),
          type: String(entry.type || ''),
          amount: Number(entry.amount || 0),
          principalDelta: Number(entry.principal_delta || 0),
          interestDelta: Number(entry.interest_delta || 0),
          lateFeeDelta: Number(entry.late_fee_delta || 0),
          sourceId: entry.source_id ? String(entry.source_id) : undefined,
          installmentId: entry.installment_id ? String(entry.installment_id) : undefined,
          agreementId: entry.agreement_id ? String(entry.agreement_id) : undefined,
          notes: entry.notes,
          category: entry.category,
          meta: entry.meta,
          createdAt: entry.created_at ? String(entry.created_at) : undefined,
          operatorId: entry.operator_id ? String(entry.operator_id) : null,
          idempotencyKey: entry.idempotency_key ? String(entry.idempotency_key) : null,
          reversedOfTransactionId: entry.reversed_of_transaction_id ? String(entry.reversed_of_transaction_id) : null,
        }))
      : operationalLoans.flatMap((loan) =>
          (loan.ledger || []).map((entry) => ({ ...entry, loanId: loan.id }))
        );

    return entries
      .filter((entry) => {
        const category = String(entry.category || '').toUpperCase();
        const loan = entry.loanId ? loanById.get(entry.loanId) : undefined;
        if (entry.loanId && !loan) return false;
        if (TEST_CATEGORIES.has(category)) return false;
        if (entry.sourceId && testSourceIds.has(entry.sourceId)) return false;
        return Math.abs(Number(entry.amount || 0)) > 0.005;
      })
      .map((entry) => {
        const loan = entry.loanId ? loanById.get(entry.loanId) : undefined;
        return {
          ...entry,
          debtorName: loan?.debtorName || 'Movimentação geral',
          sourceName: entry.sourceId ? sourceById.get(entry.sourceId) || 'Fonte removida' : 'Sem fonte',
          direction: getMovementDirection(entry),
        } as Movement;
      })
      .sort((a, b) => parseDate(b.date).getTime() - parseDate(a.date).getTime());
  }, [databaseEntries, loanById, operationalLoans, sourceById, testSourceIds]);

  const selectedPeriod = useMemo(() => {
    if (periodMode === 'DAY') return { startKey: selectedDay, endKey: selectedDay };
    if (periodMode === 'RANGE') return normalizeRange(rangeStart, rangeEnd);
    const month = getMonthPeriod(selectedMonth);
    return { startKey: dateInputValue(month.start), endKey: dateInputValue(month.end) };
  }, [periodMode, rangeEnd, rangeStart, selectedDay, selectedMonth]);

  const periodMovements = useMemo(() => {
    return movements.filter((movement) => {
      const dateKey = movementDateKey(movement.date);
      return dateKey >= selectedPeriod.startKey && dateKey <= selectedPeriod.endKey;
    });
  }, [movements, selectedPeriod]);

  const reversedPaymentGroups = useMemo(() => {
    const groups = new Set<string>();
    movements.forEach((movement) => {
      const key = String(movement.meta?.reversal_of_idempotency_key || '');
      if (key) groups.add(key);
    });
    return groups;
  }, [movements]);

  const totals = useMemo(() => {
    return periodMovements.reduce(
      (result, movement) => {
        const amount = Math.abs(Number(movement.amount || 0));
        if (movement.direction === 'OUT') result.out += amount;
        else {
          result.in += amount;
          result.principal += Math.max(0, Number(movement.principalDelta || 0));
          result.profit +=
            Math.max(0, Number(movement.interestDelta || 0)) +
            Math.max(0, Number(movement.lateFeeDelta || 0));
        }
        return result;
      },
      { in: 0, out: 0, principal: 0, profit: 0 }
    );
  }, [periodMovements]);

  const receivables = useMemo(
    () =>
      operationalLoans
        .map((loan) => ({ loan, amount: getLoanOpenAmount(loan) }))
        .filter(({ amount }) => amount > 0.05)
        .sort((a, b) => b.amount - a.amount),
    [operationalLoans]
  );

  const receivableTotal = useMemo(
    () => receivables.reduce((total, item) => total + item.amount, 0),
    [receivables]
  );

  const filteredMovements = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return periodMovements.filter((movement) => {
      if (view !== 'ALL' && view !== 'RECEIVABLE' && movement.direction !== view) return false;
      if (!normalizedSearch) return true;
      return [movement.debtorName, movement.notes, movement.category, movement.sourceName]
        .some((value) => String(value || '').toLowerCase().includes(normalizedSearch));
    });
  }, [periodMovements, search, view]);

  const caixaLivre = operationalSources.find((source) =>
    /caixa livre|lucro|dispon[ií]vel/i.test(source.name || '')
  );

  const movePeriod = (delta: number) => {
    if (periodMode === 'DAY') {
      const date = parseDate(selectedDay);
      date.setDate(date.getDate() + delta);
      setSelectedDay(dateInputValue(date));
      return;
    }

    if (periodMode === 'RANGE') {
      const start = parseDate(selectedPeriod.startKey);
      const end = parseDate(selectedPeriod.endKey);
      const duration = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
      start.setDate(start.getDate() + duration * delta);
      end.setDate(end.getDate() + duration * delta);
      setRangeStart(dateInputValue(start));
      setRangeEnd(dateInputValue(end));
      return;
    }

    const [year, month] = selectedMonth.split('-').map(Number);
    setSelectedMonth(monthKey(new Date(year, month - 1 + delta, 1)));
  };

  const periodStartDate = parseDate(selectedPeriod.startKey);
  const periodEndDate = parseDate(selectedPeriod.endKey);
  const periodLabel = selectedPeriod.startKey === selectedPeriod.endKey
    ? periodStartDate.toLocaleDateString('pt-BR')
    : `${periodStartDate.toLocaleDateString('pt-BR')} a ${periodEndDate.toLocaleDateString('pt-BR')}`;
  const periodTitle = periodMode === 'DAY'
    ? 'Movimento diário'
    : periodMode === 'MONTH'
      ? periodStartDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
      : 'Período personalizado';

  const resetPeriod = () => {
    const todayKey = dateInputValue(today);
    setSelectedDay(todayKey);
    setSelectedMonth(todayKey.slice(0, 7));
    setRangeStart(dateInputValue(getMonthPeriod(todayKey.slice(0, 7)).start));
    setRangeEnd(todayKey);
  };

  return (
    <main className="mx-auto w-full max-w-[1500px] space-y-2.5 px-4 pb-28 pt-3 md:space-y-4 md:px-6 md:pb-8">
      <header className="flex items-center justify-between gap-3 border-b border-slate-800/70 pb-3 md:pb-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-blue-500/30 bg-blue-600 text-white md:h-12 md:w-12">
            <Wallet size={18} className="md:h-6 md:w-6" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-base font-black uppercase text-white md:text-2xl">
              Extrato <span className="text-blue-500">financeiro</span>
            </h1>
            <p className="mt-0.5 text-[8px] font-bold uppercase text-slate-500 md:mt-1 md:text-xs">
              Visão geral do negócio
            </p>
          </div>
        </div>
        <button type="button" onClick={handleRefresh} disabled={isLoading} className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-blue-700 bg-blue-600/10 text-blue-400 disabled:opacity-50 md:h-10 md:w-10" aria-label="Atualizar extrato">
          <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </header>

      <div className="flex w-full items-center gap-1.5 md:ml-auto md:max-w-md md:gap-2">
          <button type="button" onClick={() => movePeriod(-1)} className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-slate-700 bg-slate-900 text-slate-300 md:h-10 md:w-10" aria-label="Período anterior">
            <ArrowLeft size={17} />
          </button>
          <div className="flex h-8 min-w-0 flex-1 items-center justify-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-2 text-[10px] font-bold capitalize text-white md:h-10 md:min-w-[170px] md:px-3 md:text-xs">
            <CalendarDays size={14} className="shrink-0 text-blue-400" />
            <span className="text-center">
              <span className="hidden md:block">{periodTitle}</span>
              <span className="block truncate text-[9px] font-medium text-slate-400 md:text-slate-500">{periodLabel}</span>
            </span>
          </div>
          <button type="button" onClick={() => movePeriod(1)} className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-slate-700 bg-slate-900 text-slate-300 md:h-10 md:w-10" aria-label="Próximo período">
            <ArrowRight size={17} />
          </button>
      </div>

      <section className="flex flex-col gap-1.5 border-y border-slate-800/70 bg-[#020817]/40 py-2 md:gap-3 md:px-2 md:py-2.5 lg:flex-row lg:items-center">
        <div className="grid grid-cols-3 gap-1 rounded-md bg-slate-900/80 p-0.5 md:p-1">
          {([
            ['DAY', 'Dia'],
            ['MONTH', 'Mês'],
            ['RANGE', 'Período'],
          ] as const).map(([mode, label]) => (
            <button
              type="button"
              key={mode}
              onClick={() => setPeriodMode(mode)}
              className={`h-7 min-w-0 rounded-md px-2 text-[9px] font-black uppercase transition md:h-9 md:min-w-[72px] md:px-3 md:text-[10px] ${
                periodMode === mode ? 'bg-blue-600 text-white shadow-[0_0_14px_rgba(37,99,235,0.2)]' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 md:gap-2">
          {periodMode === 'DAY' && (
            <input
              type="date"
              value={selectedDay}
              onChange={(event) => setSelectedDay(event.target.value)}
              className="h-8 min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-900 px-2 text-[11px] font-bold text-white outline-none focus:border-blue-500 md:h-10 md:flex-none md:px-3 md:text-xs"
              aria-label="Dia do extrato"
            />
          )}
          {periodMode === 'MONTH' && (
            <input
              type="month"
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
              className="h-8 min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-900 px-2 text-[11px] font-bold text-white outline-none focus:border-blue-500 md:h-10 md:flex-none md:px-3 md:text-xs"
              aria-label="Mês do extrato"
            />
          )}
          {periodMode === 'RANGE' && (
            <>
              <label className="flex items-center gap-2 text-[10px] font-bold uppercase text-slate-500">
                De
                <input
                  type="date"
                  value={rangeStart}
                  onChange={(event) => setRangeStart(event.target.value)}
                  className="h-8 min-w-0 rounded-md border border-slate-700 bg-slate-900 px-2 text-[10px] font-bold text-white outline-none focus:border-blue-500 md:h-10 md:px-3 md:text-xs"
                />
              </label>
              <label className="flex items-center gap-2 text-[10px] font-bold uppercase text-slate-500">
                Até
                <input
                  type="date"
                  value={rangeEnd}
                  onChange={(event) => setRangeEnd(event.target.value)}
                  className="h-8 min-w-0 rounded-md border border-slate-700 bg-slate-900 px-2 text-[10px] font-bold text-white outline-none focus:border-blue-500 md:h-10 md:px-3 md:text-xs"
                />
              </label>
            </>
          )}
          <button type="button" onClick={resetPeriod} className="h-8 rounded-md border border-slate-700 bg-slate-900 px-2.5 text-[9px] font-bold uppercase text-slate-300 md:h-10 md:px-3 md:text-[10px]">
            Hoje
          </button>
          <span className="ml-auto text-[9px] font-bold uppercase text-slate-600 md:text-[10px]">
            {periodMovements.length} movimentações
          </span>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3">
          <div className="text-[9px] font-black uppercase text-emerald-300/80">Capital retornado</div>
          <div className="mt-1 text-sm font-black text-emerald-300 md:text-lg">{formatMoney(totals.principal, isStealthMode)}</div>
          <p className="mt-1 text-[9px] leading-3 text-slate-500">Principal que voltou para a fonte do contrato.</p>
        </div>
        <div className="rounded-md border border-cyan-500/20 bg-cyan-500/5 p-3">
          <div className="text-[9px] font-black uppercase text-cyan-300/80">Lucro na casa</div>
          <div className="mt-1 text-sm font-black text-cyan-300 md:text-lg">{formatMoney(totals.profit, isStealthMode)}</div>
          <p className="mt-1 text-[9px] leading-3 text-slate-500">Juros, mora e multa recebidos.</p>
        </div>
        <div className="rounded-md border border-slate-700 bg-slate-900/60 p-3">
          <div className="text-[9px] font-black uppercase text-slate-500">Entradas</div>
          <div className="mt-1 text-sm font-black text-white md:text-lg">{formatMoney(totals.in, isStealthMode)}</div>
          <p className="mt-1 text-[9px] leading-3 text-slate-500">Capital + lucro no período.</p>
        </div>
        <div className="rounded-md border border-slate-700 bg-slate-900/60 p-3">
          <div className="text-[9px] font-black uppercase text-slate-500">Saídas/Estornos</div>
          <div className="mt-1 text-sm font-black text-rose-300 md:text-lg">{formatMoney(totals.out, isStealthMode)}</div>
          <p className="mt-1 text-[9px] leading-3 text-slate-500">Retiradas e ajustes negativos.</p>
        </div>
      </section>

      <section className="grid grid-cols-2 overflow-hidden border-y border-slate-800/70 bg-[#020817]/40 lg:grid-cols-4 lg:gap-2 lg:overflow-visible lg:border-0 lg:bg-transparent">
        {[
          { id: 'IN', label: 'Entradas no período', value: totals.in, icon: ArrowDownLeft, tone: 'text-emerald-400' },
          { id: 'OUT', label: 'Saídas no período', value: totals.out, icon: ArrowUpRight, tone: 'text-rose-400' },
          { id: 'RECEIVABLE', label: 'Carteira em aberto', value: receivableTotal, icon: Landmark, tone: 'text-amber-400' },
          { id: 'ALL', label: 'Fluxo líquido', value: totals.in - totals.out, icon: Wallet, tone: 'text-blue-400' },
        ].map((item, index) => (
          <button
            type="button"
            key={item.id}
            onClick={() => setView(item.id as typeof view)}
            className={`min-h-[62px] border-slate-800/70 px-2.5 py-2 text-left transition-colors md:px-3 md:py-2.5 ${
              index % 2 === 0 ? 'border-r lg:border-r' : ''
            } ${index < 2 ? 'border-b lg:border-b' : ''} lg:min-h-[96px] lg:rounded-md lg:border ${
              view === item.id ? 'bg-blue-500/10 lg:border-blue-500' : 'hover:bg-slate-900/70 lg:bg-slate-900/70'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <item.icon size={13} className={item.tone} />
              <span className="truncate text-[8px] font-black uppercase text-slate-500 md:text-[10px]">
                {item.label}
              </span>
            </div>
            <div className={`mt-1 truncate text-sm font-black md:mt-2 md:text-lg ${item.tone}`}>
              {formatMoney(item.value, isStealthMode)}
            </div>
          </button>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 rounded-md border border-slate-800 bg-slate-950">
          <div className="flex flex-col gap-3 border-b border-slate-800 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-black uppercase text-white">{view === 'RECEIVABLE' ? 'Valores a receber' : 'Movimentações'}</h2>
              <p className="text-[10px] text-slate-500">
                Capital retornado: {formatMoney(totals.principal, isStealthMode)} · Lucro/juros: {formatMoney(totals.profit, isStealthMode)}
              </p>
            </div>
            <label className="flex h-9 items-center gap-2 rounded-md border border-slate-800 bg-slate-900 px-3">
              <Search size={15} className="text-slate-500" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cliente ou fonte" className="w-full bg-transparent text-xs text-white outline-none placeholder:text-slate-600 sm:w-52" />
            </label>
          </div>

          <div className="divide-y divide-slate-800">
            {view === 'RECEIVABLE' ? (
              receivables.map(({ loan, amount }) => (
                <button type="button" key={loan.id} onClick={() => onOpenLoan(loan.id)} className="flex min-h-[72px] w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-900">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-black uppercase text-white">{loan.debtorName}</div>
                    <div className="mt-1 text-[10px] text-slate-500">Contrato #{loan.id.slice(0, 6).toUpperCase()}</div>
                  </div>
                  <div className="shrink-0 text-sm font-black text-amber-400">{formatMoney(amount, isStealthMode)}</div>
                </button>
              ))
            ) : filteredMovements.length > 0 ? (
              filteredMovements.map((movement) => {
                const groupKey = getPaymentGroupKey(movement);
                const canReverse =
                  movement.direction === 'IN' &&
                  Number(movement.amount || 0) > 0 &&
                  Boolean(groupKey) &&
                  ['PAGAMENTO', 'LUCRO'].includes(String(movement.category || '').toUpperCase()) &&
                  !movement.reversedOfTransactionId &&
                  !reversedPaymentGroups.has(groupKey);
                const isReversing = Boolean(groupKey && reversingGroupKey === groupKey);

                return (
                <div key={movement.id} role={movement.loanId ? 'button' : undefined} tabIndex={movement.loanId ? 0 : undefined} onClick={() => movement.loanId && onOpenLoan(movement.loanId)} onKeyDown={(event) => { if (movement.loanId && (event.key === 'Enter' || event.key === ' ')) onOpenLoan(movement.loanId); }} className={`grid min-h-[92px] w-full grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-3 text-left ${movement.loanId ? 'cursor-pointer hover:bg-slate-900' : ''}`}>
                  <div className="min-w-0">
                    <div className="truncate text-xs font-black uppercase text-white">{movement.debtorName}</div>
                    <div className="mt-1 truncate text-[10px] text-slate-400">{movement.notes || movement.category || movement.type}</div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[9px] uppercase text-slate-600">
                      <span>{parseDate(movement.date).toLocaleDateString('pt-BR')}</span>
                      <span>Destino: {movement.sourceName}</span>
                      <span>Criado: {formatDateTime(movement.createdAt || movement.date)}</span>
                      <span>Operador: {movement.operatorId ? movement.operatorId.slice(0, 8).toUpperCase() : 'não registrado'}</span>
                    </div>
                    {groupKey && (
                      <div className="mt-1 text-[9px] uppercase text-slate-700">
                        Grupo: {groupKey.slice(0, 12).toUpperCase()}
                        {reversedPaymentGroups.has(groupKey) ? ' · estornado' : ''}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2 text-right">
                    <div>
                    <div className={`text-sm font-black ${movement.direction === 'IN' ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {movement.direction === 'IN' ? '+' : '-'} {formatMoney(Math.abs(Number(movement.amount || 0)), isStealthMode)}
                    </div>
                    {movement.direction === 'IN' && (
                      <div className="mt-1 text-[9px] text-slate-500">
                        Capital {formatMoney(Math.max(0, Number(movement.principalDelta || 0)), isStealthMode)}
                        {' · '}Lucro {formatMoney(Math.max(0, Number(movement.interestDelta || 0)) + Math.max(0, Number(movement.lateFeeDelta || 0)), isStealthMode)}
                      </div>
                    )}
                    </div>
                    {canReverse && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleReversePaymentGroup(movement);
                        }}
                        disabled={isReversing}
                        className="inline-flex h-7 items-center gap-1 rounded-md border border-rose-500/40 bg-rose-500/10 px-2 text-[9px] font-black uppercase text-rose-300 hover:bg-rose-500/20 disabled:opacity-50"
                      >
                        <RotateCcw size={12} />
                        {isReversing ? 'Estornando' : 'Estornar'}
                      </button>
                    )}
                  </div>
                </div>
                );
              })
            ) : (
              <div className="px-4 py-14 text-center text-xs text-slate-500">Nenhuma movimentação encontrada neste período.</div>
            )}
          </div>
        </div>

        <aside className="space-y-3">
          <div className="rounded-md border border-slate-800 bg-slate-900/70 p-4">
            <div className="text-[10px] font-bold uppercase text-slate-500">Caixa Livre atual (lucro)</div>
            <div className="mt-2 text-xl font-black text-emerald-400">{formatMoney(caixaLivre?.balance || 0, isStealthMode)}</div>
            <p className="mt-2 text-[10px] leading-4 text-slate-500">
              Recebe juros, mora e multa. Capital retornado volta para a fonte do contrato e aparece separado no extrato.
            </p>
          </div>

          <div className="rounded-md border border-slate-800 bg-slate-900/70">
            <div className="border-b border-slate-800 px-4 py-3 text-[10px] font-bold uppercase text-slate-500">Saldos por fonte</div>
            <div className="divide-y divide-slate-800">
              {operationalSources.map((source) => (
                <div key={source.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="truncate text-xs font-bold text-slate-300">{source.name}</span>
                  <span className="shrink-0 text-xs font-black text-white">{formatMoney(source.balance, isStealthMode)}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
};
