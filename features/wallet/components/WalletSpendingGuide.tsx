import React from 'react';
import { ArrowRight } from 'lucide-react';
import { AppIcon } from '../../../components/icons/AppIcons';
import { formatMoney } from '../../../utils/formatters';
import { useFinancialPrivacy } from '../../../contexts/FinancialPrivacyContext';
import type { SpendingOverview } from '../domain/walletSpendingInsights';
import { CategoryGaugeIcon } from '../../../components/wallet/CategoryGaugeIcon';
import { getWalletCategoryVisual } from '../domain/walletCategoryVisual';

/** Banking-style, read-only spending guidance. No RPCs or financial writes. */
export const WalletSpendingGuide: React.FC<{
  projectedBalance: number;
  creditPercent: number;
  cardCount: number;
  pendingCount: number;
  overdueCount?: number;
  overdueInvoiceCount?: number;
  dueSoonCount?: number;
  pendingIncome?: number;
  spending: SpendingOverview;
  onNavigate: (path: string) => void;
}> = ({ projectedBalance, creditPercent, cardCount, pendingCount, overdueCount = 0,
  overdueInvoiceCount = 0, dueSoonCount = 0, pendingIncome = 0, spending, onNavigate }) => {
  const privacyHidden = useFinancialPrivacy();
  // No percentages, category names, labels, amounts or aria-valuenow
  // may reach the DOM when visual privacy is enabled.
  if (privacyHidden) return <section aria-label="Saúde financeira protegida"
    className="rounded-xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 text-base font-semibold text-white">
        <AppIcon name="bulb" size={20} />Saúde financeira
      </h3>
      <button type="button" onClick={() => onNavigate('relatorio')}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-700 px-3 text-xs font-semibold text-blue-300">
        <AppIcon name="dashboard" size={16} /> Relatório
      </button>
    </div>
    <p className="mt-3 text-sm text-slate-300">
      Indicadores, percentuais e gráficos ocultos pelo controle de privacidade.
    </p>
  </section>;
  const hasCredit = cardCount > 0;
  const usage = Number.isFinite(creditPercent) ? Math.max(0, creditPercent) : 0;
  const comparison = spending.previousTotal > 0
    ? Math.round((spending.total - spending.previousTotal) / spending.previousTotal * 100)
    : null;
  const urgent = overdueCount > 0 || overdueInvoiceCount > 0 || projectedBalance < 0 || (cardCount > 0 && usage >= 80);
  const plural = (count: number, singular: string, pluralWord: string) => `${count} ${count === 1 ? singular : pluralWord}`;
  return <section aria-label="Ajuda para controlar gastos" className="min-w-0 rounded-xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
    <header className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 text-base font-semibold text-white"><AppIcon name="bulb" size={20} />Saúde financeira</h3>
      <div className="flex items-center gap-2">
      <span className={`inline-flex h-7 items-center rounded-md px-2.5 text-[11px] font-semibold ${urgent
        ? 'bg-amber-950/50 text-amber-200'
        : 'bg-slate-800/70 text-slate-300'}`}>
        {urgent ? 'Exige atenção' : 'Acompanhamento'}
      </span>
      <button type="button" onClick={() => onNavigate('relatorio')}
        className="inline-flex h-7 items-center gap-1.5 rounded-md border border-slate-700 px-2.5 text-[11px] font-semibold text-blue-300 transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        aria-label="Abrir relatório da Carteira">
        <AppIcon name="dashboard" size={15} /> Relatório
      </button>
      </div>
    </header>
    <div className="mt-4 grid min-w-0 gap-5 lg:grid-cols-12">
      <div className="order-2 min-w-0 lg:order-1 lg:col-span-7">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h4 className="text-sm font-semibold text-white">Despesas por categoria</h4>
            <p className="mt-0.5 text-xs text-slate-400">Mês atual · {spending.count} {spending.count === 1 ? 'lançamento' : 'lançamentos'}</p>
          </div>
          <strong className="break-words text-lg font-bold tabular-nums text-white">{formatMoney(spending.total)}</strong>
        </div>
        {comparison !== null && (
          <p className="mt-2 text-xs leading-relaxed text-slate-300">
            <span className={comparison > 0 ? 'text-amber-200' : 'text-emerald-300'}>
              {comparison > 0 ? '+' : ''}{comparison}%
            </span> em relação ao mês anterior ({formatMoney(spending.previousTotal)}).
          </p>
        )}
        {spending.categories.length ? (
          <ol className="mt-4 space-y-3" aria-label="Categorias de despesas do mês">
            {spending.categories.map((category) => (
              <li key={category.name} className="flex min-w-0 items-center gap-3">
                {/* Ícone da categoria com anel da fatia no total do mês. */}
                <CategoryGaugeIcon category={category.name} percentage={category.percentage} size={40} />
                <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate font-medium text-slate-200">{category.name}</span>
                  <span className="shrink-0 text-right tabular-nums text-slate-100">{formatMoney(category.amount)} <span className="text-slate-400">· {category.percentage}%</span></span>
                </div>
                <div role="progressbar" aria-label={category.name} aria-valuemin={0} aria-valuemax={100}
                  aria-valuenow={Math.min(100, category.percentage)}
                  className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                  <div className="h-full rounded-full"
                    style={{width: `${Math.min(100,Math.max(0,category.percentage))}%`, backgroundColor: getWalletCategoryVisual(category.name).color}}/>
                </div>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-4 rounded-lg border border-dashed border-slate-700 p-4 text-sm text-slate-300">
            Ainda não há despesas cadastradas neste mês para distribuir por categoria.
          </p>
        )}
        {spending.count > 0 && spending.byMethod && (
          <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg border border-slate-800 bg-slate-950/60 p-2.5 text-[11px]">
            <div>
              <span className="block text-slate-400">Como gastou</span>
              <span className="mt-0.5 block font-semibold tabular-nums text-slate-100">
                Cartão {spending.byMethod.cardPercentage}% · Conta {spending.byMethod.accountPercentage}%
              </span>
            </div>
            <div className="text-right">
              <span className="block text-slate-400">Forma de compra</span>
              <span className="mt-0.5 block font-semibold tabular-nums text-slate-100">
                À vista {formatMoney(spending.byMethod.singleAmount)}
                {spending.byMethod.installmentCount > 0 ? ` · Compras parceladas ${formatMoney(spending.byMethod.installmentAmount)} (valor original)` : ''}
              </span>
            </div>
          </div>
        )}
        <p className="mt-3 text-[11px] text-slate-500">
          Valores originais lançados no mês · não equivale à fatura nem ao valor pago.
        </p>
      </div>
      <aside className="order-1 min-w-0 border-b border-slate-800 pb-4 lg:order-2 lg:col-span-5 lg:border-b-0 lg:border-l lg:pb-0 lg:pl-5" aria-label="Orientações financeiras">
        <h4 className="text-sm font-semibold text-white">O que merece atenção</h4>
        <div className="mt-3 space-y-3">
          {(overdueCount > 0 || overdueInvoiceCount > 0 || dueSoonCount > 0) && <div className="flex gap-2.5">
            <AppIcon name={overdueCount ? 'critical' : 'late'} size={18} className="mt-0.5 shrink-0" />
            <p className="text-xs leading-relaxed text-slate-200">
              {overdueCount ? `${overdueCount} conta(s) a pagar vencida(s). ` : ''}
              {overdueInvoiceCount ? `${overdueInvoiceCount} fatura(s) com data de vencimento ultrapassada sem quitação. ` : ''}
              {dueSoonCount ? `${dueSoonCount} fatura(s) ou obrigação(ões) vence(m) nos próximos 7 dias.` : ''}
            </p>
          </div>}
          <div className="flex gap-2.5">
            <AppIcon name={projectedBalance < 0 ? 'exposure' : 'trend'} size={18} className="mt-0.5 shrink-0" />
            <p className="text-xs leading-relaxed text-slate-200">
              {projectedBalance < 0
                ? `Projeção do mês negativa em ${formatMoney(Math.abs(projectedBalance))}.`
                : `Projeção do mês: ${formatMoney(projectedBalance)} após compromissos.`}
            </p>
          </div>
          <div className="flex gap-2.5">
            <AppIcon name="wallet" size={18} className="mt-0.5 shrink-0" />
            <p className="text-xs leading-relaxed text-slate-200">
              {!hasCredit
                ? 'Nenhum cartão de crédito ativo cadastrado.'
                : usage >= 80
                  ? `Atenção: ${Math.round(usage)}% do limite total dos cartões utilizado.`
                  : `${Math.round(usage)}% do limite total dos cartões utilizado.`}
            </p>
          </div>
          <div className="flex gap-2.5">
            <AppIcon name="calendar" size={18} className="mt-0.5 shrink-0" />
            <p className="text-xs leading-relaxed text-slate-200">
              {pendingCount
                ? `${pendingCount >= 8 ? 'Pelo menos 8 compromissos' : plural(pendingCount, 'compromisso próximo', 'compromissos próximos')} nos próximos 45 dias.`
                : 'Sem compromissos próximos com data informada.'}
            </p>
          </div>
          {pendingIncome > 0 && <div className="flex gap-2.5">
            <AppIcon name="growth" size={18} className="mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs leading-relaxed text-slate-200">
                {formatMoney(pendingIncome)} em receitas recorrentes previstas ainda não recebidas.
              </p>
              <button type="button" onClick={() => onNavigate('contas')}
                className="mt-1 text-xs font-semibold text-blue-300 hover:text-blue-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
                Conferir receitas <ArrowRight size={13} className="inline"/>
              </button>
            </div>
          </div>}
        </div>
        <button type="button" onClick={() => onNavigate('dividas')}
          className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-300 hover:text-blue-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
          Ver compromissos <ArrowRight size={14}/>
        </button>
      </aside>
    </div>
  </section>;
};
