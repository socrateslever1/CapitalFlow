import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CalendarClock, BarChart3, CreditCard, Landmark, TrendingDown, TrendingUp } from 'lucide-react';
import { PrivateMoney, useFinancialPrivacy } from '../../../contexts/FinancialPrivacyContext';
import { formatMoney } from '../../../utils/formatters';
import { walletRepository, type WalletOverviewSnapshot } from '../services/walletRepository';
import { WalletPageFrame } from '../components/WalletPageFrame';
import { deriveOverview } from './WalletOverviewPage';

const localDate = (): string => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return now.getFullYear() + '-' + month + '-' + day;
};

const DateOfCommitment: React.FC<{ value: string }> = ({ value }) => {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return <>{new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(date)}</>;
};

export const WalletReportPage: React.FC<{ onNavigate: (path: string) => void }> = ({ onNavigate }) => {
  const privacyHidden = useFinancialPrivacy();
  const [snapshot, setSnapshot] = useState<WalletOverviewSnapshot | null>(null);
  const [today, setToday] = useState(localDate);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refresh = useCallback(async (force = false) => {
    const result = await walletRepository.loadOverview({ force });
    setSnapshot(result);
    setToday(localDate());
    setError('');
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void walletRepository.loadOverview()
      .then(result => { if (active) { setSnapshot(result); setToday(localDate()); setError(''); } })
      .catch(() => { if (active) setError('Não foi possível carregar o relatório.'); })
      .finally(() => { if (active) setLoading(false); });
    const onUpdated = () => {
      void refresh(true).catch(() => {
        if (active) setError('Não foi possível atualizar os indicadores. Confira a conexão.');
      });
    };
    window.addEventListener('capitalflow:wallet-updated', onUpdated);
    return () => { active = false; window.removeEventListener('capitalflow:wallet-updated', onUpdated); };
  }, [refresh]);

  const report = useMemo(() => snapshot ? deriveOverview(snapshot, today) : null, [snapshot, today]);
  const monthLabel = useMemo(() => {
    const [year, month] = today.split('-').map(Number);
    return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })
      .format(new Date(year, month - 1, 15));
  }, [today]);

  const cards = report ? [
    { label: 'Saldo em contas', value: report.balance.accountBalance, color: 'text-emerald-300', Icon: Landmark },
    { label: 'Receitas previstas', value: report.balance.pendingRecurringIncome, color: 'text-sky-300', Icon: TrendingUp },
    { label: 'Faturas do mês', value: report.balance.openCardInvoices, color: 'text-amber-300', Icon: CreditCard },
    { label: 'Outros compromissos', value: report.balance.monthPayables, color: 'text-rose-300', Icon: CalendarClock },
  ] : [];

  return <WalletPageFrame title="Relatório da Carteira"
    description={'Balanço e compromissos de ' + monthLabel + '. Valores da sua carteira, sem movimentar dinheiro.'}
    loading={loading} error={error}
    onRefresh={() => void refresh(true).catch(() => setError('Não foi possível atualizar o relatório.'))}
    actions={<button type="button" onClick={() => onNavigate('visao-geral')}
      className="flex min-h-11 items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800">
      <ArrowLeft size={15}/> Voltar
    </button>}>
    {report && privacyHidden && <section aria-label="Relatório financeiro protegido"
      className="rounded-xl border border-slate-800 bg-slate-900 p-5 text-sm text-slate-300">
      Valores, categorias, percentuais e vencimentos estão ocultos.
      Use o controle de privacidade para visualizar o relatório.
    </section>}
    {report && !privacyHidden && <>
      <section aria-label="Resumo financeiro do mês" className="rounded-xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
        <h3 className="flex items-center gap-2 text-sm font-bold text-white"><BarChart3 size={17} className="text-blue-400"/> Visão do mês</h3>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {cards.map(({ label, value, color, Icon }) => <div key={label}
            className="min-w-0 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
            <span className="flex items-start gap-1.5 text-[11px] text-slate-300">
              <Icon size={14} className="mt-0.5 shrink-0"/>{label}
            </span>
            <strong className={'mt-2 block break-words text-base font-bold tabular-nums ' + color}>
              <PrivateMoney value={formatMoney(value)}/>
            </strong>
          </div>)}
        </div>
        <div className="mt-3 rounded-lg border border-slate-700/80 bg-slate-950/60 p-3">
          <p className="text-xs text-slate-300">Projeção após compromissos cadastrados</p>
          <p className={'mt-1 break-words text-xl font-bold tabular-nums ' +
            (report.balance.projectedBalance < 0 ? 'text-rose-300' : 'text-emerald-300')}>
            <PrivateMoney value={formatMoney(report.balance.projectedBalance)}/>
          </p>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
          Projeção = saldo em contas + receitas recorrentes ainda previstas − faturas e compromissos do mês.
          Não equivale ao saldo bancário nem ao lucro de empréstimos.
        </p>
      </section>
      <section aria-label="Despesas por categoria" className="rounded-xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-white">Despesas por categoria</h3>
          <strong className="text-base font-bold tabular-nums text-white"><PrivateMoney value={formatMoney(report.spending.total)}/></strong>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          {report.spending.count} {report.spending.count === 1 ? 'lançamento no mês' : 'lançamentos no mês'}
        </p>
        {report.spending.categories.length ? <ul className="mt-4 space-y-3">
          {report.spending.categories.map(category => <li key={category.name}>
            <div className="mb-1 flex justify-between gap-3 text-xs">
              <span className="min-w-0 truncate text-slate-200">{category.name}</span>
              <span className="shrink-0 tabular-nums text-slate-300">
                <PrivateMoney value={formatMoney(category.amount)}/> · {category.percentage}%
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full rounded-full bg-blue-500" style={{ width: Math.min(100, category.percentage) + '%' }}/>
            </div>
          </li>)}
        </ul> : <p className="mt-4 text-sm text-slate-400">Nenhuma despesa registrada neste mês.</p>}
        <p className="mt-3 text-[11px] text-slate-400">
          As despesas refletem o valor original das compras, inclusive parceladas.
          Não devem ser somadas novamente às faturas do balanço.
        </p>
      </section>
      <section aria-label="Próximos vencimentos" className="rounded-xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
        <h3 className="text-sm font-bold text-white">Próximos vencimentos</h3>
        {report.upcoming.length ? <ul className="mt-3 divide-y divide-slate-800">
          {report.upcoming.map(item => <li key={item.id} className="flex min-w-0 items-center justify-between gap-3 py-3 text-xs">
            <div className="min-w-0">
              <p className="truncate font-semibold text-slate-200">{item.title}</p>
              <p className="mt-1 text-slate-400"><DateOfCommitment value={item.dueDate}/> · {item.institution}</p>
            </div>
            <strong className="shrink-0 tabular-nums text-white"><PrivateMoney value={formatMoney(item.amount)}/></strong>
          </li>)}
        </ul> : <p className="mt-3 text-sm text-slate-400">Nenhum vencimento próximo identificado.</p>}
        <p className="mt-2 text-[11px] text-slate-400">Exibição limitada aos próximos oito registros com vencimento até 45 dias.</p>
      </section>
    </>}
  </WalletPageFrame>;
};
