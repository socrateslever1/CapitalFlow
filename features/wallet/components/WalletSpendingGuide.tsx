import React from 'react';
import { ArrowRight, CalendarClock, CreditCard, Lightbulb, TrendingDown, TrendingUp, AlertTriangle } from 'lucide-react';
import { formatMoney } from '../../../utils/formatters';
import type { SpendingOverview } from '../domain/walletSpendingInsights';

/** Banking-style, read-only spending guidance. No RPCs or financial writes. */
export const WalletSpendingGuide: React.FC<{
  projectedBalance: number;
  creditPercent: number;
  cardCount: number;
  pendingCount: number;
  overdueCount?: number;
  dueSoonCount?: number;
  pendingIncome?: number;
  spending: SpendingOverview;
  onNavigate: (path: string) => void;
}> = ({ projectedBalance, creditPercent, cardCount, pendingCount, overdueCount = 0,
  dueSoonCount = 0, pendingIncome = 0, spending, onNavigate }) => {
  const top = spending.categories[0];
  const hasCredit = cardCount > 0;
  const usage = Number.isFinite(creditPercent) ? Math.max(0, creditPercent) : 0;
  const comparison = spending.previousTotal > 0
    ? Math.round((spending.total - spending.previousTotal) / spending.previousTotal * 100)
    : null;
  const urgent = overdueCount > 0 || projectedBalance < 0 || (cardCount > 0 && usage >= 80);
  return <section aria-label="Ajuda para controlar gastos" className="min-w-0 rounded-xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
    <header className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h3 className="flex items-center gap-2 text-base font-semibold text-white"><Lightbulb size={18} className="text-cyan-300"/>Saúde financeira</h3>
        <p className="mt-1 text-xs text-slate-300">Acompanhe despesas, vencimentos e receitas previstas.</p>
      </div>
      <span className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${urgent
        ? 'border-amber-700/60 bg-amber-950/30 text-amber-200'
        : 'border-slate-700 bg-slate-950/40 text-slate-300'}`}>
        {urgent ? 'Exige atenção' : 'Acompanhamento'}
      </span>
    </header>
    <div className="mt-4 grid min-w-0 gap-5 lg:grid-cols-12">
      <div className="order-2 min-w-0 lg:order-1 lg:col-span-7">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h4 className="text-sm font-semibold text-white">Despesas registradas por categoria</h4>
            <p className="mt-0.5 text-xs text-slate-300">Mês atual · {spending.count} {spending.count === 1 ? 'lançamento' : 'lançamentos'}</p>
          </div>
          <strong className="break-words text-lg font-bold tabular-nums text-white">{formatMoney(spending.total)}</strong>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-slate-300">
          {comparison === null
            ? 'Sem comparação percentual com o mês anterior.'
            : <><span className={comparison > 0 ? 'text-amber-200' : 'text-emerald-300'}>
              {comparison > 0 ? '+' : ''}{comparison}%
              </span> em relação às compras registradas no mês anterior ({formatMoney(spending.previousTotal)}).</>}
        </p>
        {spending.categories.length ? (
          <ol className="mt-4 space-y-3" aria-label="Categorias de despesas do mês">
            {spending.categories.map((category, index) => (
              <li key={category.name} className="min-w-0">
                <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate font-medium text-slate-200">{category.name}</span>
                  <span className="shrink-0 text-right tabular-nums text-slate-100">{formatMoney(category.amount)} <span className="text-slate-400">· {category.percentage}%</span></span>
                </div>
                <div role="progressbar" aria-label={category.name} aria-valuemin={0} aria-valuemax={100}
                  aria-valuenow={Math.min(100, category.percentage)}
                  className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                  <div className={`h-full rounded-full ${index === 0 ? 'bg-cyan-400' : 'bg-blue-500/80'}`}
                    style={{width: `${Math.min(100,Math.max(0,category.percentage))}%`}}/>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-4 rounded-lg border border-dashed border-slate-700 p-4 text-sm text-slate-300">
            Ainda não há despesas cadastradas neste mês para distribuir por categoria.
          </p>
        )}
        <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
          Soma dos valores originais das despesas cadastradas com data neste mês. Compras parceladas entram pelo valor total da compra; não é o valor pago nem a fatura do mês.
        </p>
      </div>
      <aside className="order-1 min-w-0 border-b border-slate-800 pb-4 lg:order-2 lg:col-span-5 lg:border-b-0 lg:border-l lg:pb-0 lg:pl-5" aria-label="Orientações financeiras">
        <h4 className="text-sm font-semibold text-white">O que merece atenção</h4>
        <div className="mt-3 divide-y divide-slate-800">
          {(overdueCount > 0 || dueSoonCount > 0) && <div className="flex gap-2 pb-3">
            <AlertTriangle size={17} className={`mt-0.5 shrink-0 ${overdueCount ? 'text-rose-300' : 'text-amber-300'}`}/>
            <p className="text-xs leading-relaxed text-slate-200">
              {overdueCount ? `${overdueCount} compromisso(s) vencido(s). ` : ''}
              {dueSoonCount ? `${dueSoonCount} compromisso(s) vence(m) nos próximos 7 dias.` : ''}
            </p>
          </div>}
          <div className="flex gap-2 py-2 first:pt-0">
            <TrendingDown size={17} className={projectedBalance < 0 ? 'mt-0.5 shrink-0 text-amber-300' : 'mt-0.5 shrink-0 text-emerald-300'}/>
            <p className="text-xs leading-relaxed text-slate-200">
              {projectedBalance < 0
                ? `A projeção do mês está negativa em ${formatMoney(Math.abs(projectedBalance))}. Revise seus compromissos.`
                : `Projeção do mês: ${formatMoney(projectedBalance)} após os compromissos cadastrados.`}
            </p>
          </div>
          <div className="flex gap-2 py-2">
            <CreditCard size={17} className={usage >= 80 ? 'mt-0.5 shrink-0 text-amber-300' : 'mt-0.5 shrink-0 text-cyan-300'}/>
            <p className="text-xs leading-relaxed text-slate-200">
              {!hasCredit
                ? 'Nenhum cartão de crédito ativo cadastrado.'
                : usage >= 80
                  ? `Atenção: ${Math.round(usage)}% do limite total dos cartões já está utilizado.`
                  : `${Math.round(usage)}% do limite total dos cartões está utilizado.`}
            </p>
          </div>
          <div className="flex gap-2 py-2">
            <CalendarClock size={17} className="mt-0.5 shrink-0 text-cyan-300"/>
            <p className="text-xs leading-relaxed text-slate-200">
              {pendingCount
                ? `${pendingCount >= 8 ? 'Pelo menos 8' : pendingCount} compromisso(s) exibido(s) vencidos ou com vencimento até 45 dias.`
                : 'Sem compromissos próximos identificados com data informada.'}
            </p>
          </div>
          {pendingIncome > 0 && <div className="flex gap-2 py-2">
            <TrendingUp size={17} className="mt-0.5 shrink-0 text-emerald-300"/>
            <div className="min-w-0">
              <p className="text-xs leading-relaxed text-slate-200">
                {formatMoney(pendingIncome)} em receitas recorrentes previstas e ainda não registradas como recebidas neste mês.
              </p>
              <button type="button" onClick={() => onNavigate('receitas')}
                className="mt-1 min-h-9 text-xs font-semibold text-blue-300 hover:text-blue-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
                Conferir receitas <ArrowRight size={13} className="inline"/>
              </button>
            </div>
          </div>}
          {top && <div className="py-2 text-xs leading-relaxed text-slate-200">
            Maior categoria nos registros do mês: <strong className="text-white">{top.name}</strong> ({top.percentage}%).
          </div>}
        </div>
        <button type="button" onClick={() => onNavigate('dividas')}
          className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-blue-300 hover:text-blue-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
          Ver compromissos <ArrowRight size={16}/>
        </button>
      </aside>
    </div>
  </section>;
};
