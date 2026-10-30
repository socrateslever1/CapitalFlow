import React from 'react';
import { ArrowRight, CalendarClock, CreditCard, Lightbulb, TrendingDown } from 'lucide-react';
import { formatMoney } from '../../../utils/formatters';
import type { SpendingOverview } from '../domain/walletSpendingInsights';

/** Banking-style, read-only spending guidance. No RPCs or financial writes. */
export const WalletSpendingGuide: React.FC<{
  projectedBalance: number;
  creditPercent: number;
  cardCount: number;
  pendingCount: number;
  spending: SpendingOverview;
  onNavigate: (path: string) => void;
}> = ({ projectedBalance, creditPercent, cardCount, pendingCount, spending, onNavigate }) => {
  const top = spending.categories[0];
  const hasCredit = cardCount > 0;
  const usage = Number.isFinite(creditPercent) ? Math.max(0, creditPercent) : 0;
  return <section aria-label="Ajuda para controlar gastos" className="min-w-0 rounded-xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
    <header className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h3 className="flex items-center gap-2 text-base font-semibold text-white"><Lightbulb size={18} className="text-cyan-300"/>Ajuda com meus gastos</h3>
        <p className="mt-1 text-xs text-slate-400">Acompanhe seus registros e identifique pontos de atenção.</p>
      </div>
      <span className="rounded-md border border-slate-700 px-2 py-1 text-[11px] font-medium text-slate-300">Somente leitura</span>
    </header>
    <div className="mt-4 grid min-w-0 gap-5 lg:grid-cols-12">
      <div className="min-w-0 lg:col-span-7">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h4 className="text-sm font-semibold text-white">Despesas registradas por categoria</h4>
            <p className="mt-0.5 text-xs text-slate-400">Mês atual · {spending.count} {spending.count === 1 ? 'lançamento' : 'lançamentos'}</p>
          </div>
          <strong className="break-words text-lg font-bold tabular-nums text-white">{formatMoney(spending.total)}</strong>
        </div>
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
      <aside className="min-w-0 border-t border-slate-800 pt-4 lg:col-span-5 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0" aria-label="Orientações financeiras">
        <h4 className="text-sm font-semibold text-white">Pontos de atenção</h4>
        <div className="mt-3 divide-y divide-slate-800">
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
