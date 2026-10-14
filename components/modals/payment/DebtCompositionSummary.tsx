import React from 'react';
import { AlertCircle, CheckCircle2, Receipt } from 'lucide-react';
import { getDueStatus } from '../../../utils/dateHelpers';
import { formatMoney } from '../../../utils/formatters';

interface DebtCompositionSummaryProps {
  principal: number;
  interest: number;
  lateFee: number;
  total: number;
  dueDate?: string | Date | null;
  isStealthMode?: boolean;
}

export const DebtCompositionSummary: React.FC<DebtCompositionSummaryProps> = ({
  principal,
  interest,
  lateFee,
  total,
  dueDate,
  isStealthMode = false,
}) => {
  const dueInfo = dueDate ? getDueStatus(dueDate) : null;
  const hasLateFee = Number(lateFee || 0) > 0.05;

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/55 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Receipt size={13} className="shrink-0 text-blue-400" />
          <span className="truncate text-[9px] font-black uppercase tracking-[0.1em] text-slate-300">
            Composição da dívida
          </span>
        </div>

        {dueInfo?.daysLate ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[8px] font-black uppercase text-rose-400">
            <AlertCircle size={9} /> {dueInfo.daysLate} dias em atraso
          </span>
        ) : dueInfo?.isToday ? (
          <span className="shrink-0 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[8px] font-black uppercase text-amber-400">
            Vence hoje
          </span>
        ) : dueInfo ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[8px] font-black uppercase text-emerald-400">
            <CheckCircle2 size={9} /> Em dia
          </span>
        ) : null}
      </div>

      <div className="mt-2 grid grid-cols-3 overflow-hidden rounded-lg border border-slate-800 bg-slate-950/55 divide-x divide-slate-800">
        <div className="min-w-0 px-2 py-2.5 text-center">
          <p className="text-[7.5px] font-black uppercase tracking-wider text-slate-500">Capital</p>
          <p className="mt-1 truncate text-[11px] font-black tabular-nums text-slate-100">
            {formatMoney(principal, isStealthMode)}
          </p>
        </div>
        <div className="min-w-0 px-2 py-2.5 text-center">
          <p className="text-[7.5px] font-black uppercase tracking-wider text-blue-400/80">Juros</p>
          <p className="mt-1 truncate text-[11px] font-black tabular-nums text-blue-300">
            {formatMoney(interest, isStealthMode)}
          </p>
        </div>
        <div className="min-w-0 px-2 py-2.5 text-center">
          <p className={`text-[7.5px] font-black uppercase tracking-wider ${hasLateFee ? 'text-rose-400/90' : 'text-slate-500'}`}>
            Atraso
          </p>
          <p className={`mt-1 truncate text-[11px] font-black tabular-nums ${hasLateFee ? 'text-rose-300' : 'text-slate-400'}`}>
            {formatMoney(lateFee, isStealthMode)}
          </p>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-3 border-t border-slate-800/80 pt-2">
        <span className="text-[8px] font-black uppercase tracking-wider text-slate-500">Total desta parcela</span>
        <span className="text-sm font-black tabular-nums text-white">{formatMoney(total, isStealthMode)}</span>
      </div>
    </section>
  );
};
