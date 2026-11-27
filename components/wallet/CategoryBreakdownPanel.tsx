import React from 'react';
import { MarqueeText } from '../ui/MarqueeText';
import { PrivateMoney, useFinancialPrivacy } from '../../contexts/FinancialPrivacyContext';
import { formatMoney } from '../../utils/formatters';
import type { CategoryBreakdown } from '../../features/wallet/domain/walletCategoryBreakdown';
import { CategoryGaugeIcon } from './CategoryGaugeIcon';

type Props = {
  title: string;
  breakdown: CategoryBreakdown;
  /** Dias corridos do período; quando informado, mostra o gasto médio por dia. */
  elapsedDays?: number;
  layout?: 'strip' | 'list';
  emptyText?: string;
  note?: string;
};

/**
 * Gastos por categoria com ícone e anel medidor. O anel é a fatia da categoria
 * no total do período (não é orçamento). Somente leitura.
 */
export const CategoryBreakdownPanel: React.FC<Props> = ({
  title, breakdown, elapsedDays, layout = 'strip', emptyText = 'Nenhum gasto com categoria neste período.', note,
}) => {
  const hidden = useFinancialPrivacy();
  const perDay = (amount: number) => elapsedDays && elapsedDays > 0 ? Math.round(amount * 100 / elapsedDays) / 100 : null;
  return (
    <section aria-label={title} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h4 className="text-xs font-bold text-slate-200">{title}</h4>
        {breakdown.total > 0 && <span className="text-[11px] tabular-nums text-slate-400"><PrivateMoney value={formatMoney(breakdown.total)} /></span>}
      </div>
      {breakdown.slices.length === 0 ? (
        <p className="text-xs text-slate-400">{emptyText}</p>
      ) : layout === 'strip' ? (
        <ul className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:thin]" aria-label="Categorias">
          {breakdown.slices.map(slice => (
            <li key={slice.name} className="flex w-[72px] shrink-0 flex-col items-center gap-1 text-center"
              aria-label={hidden ? slice.name : `${slice.name}: ${slice.percentage}% do total`}>
              <CategoryGaugeIcon category={slice.name} percentage={hidden ? null : slice.percentage} />
              <MarqueeText text={slice.name} className="w-full text-[11px] font-semibold text-slate-200" />
              <span className="text-[10px] tabular-nums text-slate-400">{!hidden && <>{slice.percentage}% · </>}<PrivateMoney value={formatMoney(slice.amount)} /></span>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="space-y-2.5" aria-label="Categorias">
          {breakdown.slices.map(slice => {
            const daily = perDay(slice.amount);
            return (
              <li key={slice.name} className="flex items-center gap-3" aria-label={hidden ? slice.name : `${slice.name}: ${slice.percentage}% do total`}>
                <CategoryGaugeIcon category={slice.name} percentage={hidden ? null : slice.percentage} size={42} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-100">{slice.name}</span>
                  <span className="block text-[11px] tabular-nums text-slate-400">
                    {daily !== null ? <><PrivateMoney value={formatMoney(daily)} />/dia · </> : null}
                    {slice.count} {slice.count === 1 ? 'lançamento' : 'lançamentos'}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block text-sm font-bold tabular-nums text-white"><PrivateMoney value={formatMoney(slice.amount)} /></span>
                  {!hidden && <span className="block text-[11px] tabular-nums text-slate-400">{slice.percentage}%</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {note && <p className="mt-2 text-[10px] text-slate-500">{note}</p>}
    </section>
  );
};
