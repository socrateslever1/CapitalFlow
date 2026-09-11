import React, { useMemo } from 'react';
import { formatMoney } from '../../utils/formatters';

export const LoanTotalPreview: React.FC<{ formData: any }> = ({ formData }) => {
  const preview = useMemo(() => {
    const principal = Number(formData.principal || 0);
    const rate = Number(formData.interestRate || 0);
    const isMonthly = formData.billingCycle === 'MONTHLY';
    if (!Number.isFinite(principal) || principal <= 0 || !Number.isFinite(rate) || rate < 0 || !isMonthly) return null;
    const interest = principal * (rate / 100);
    return { interest, total: principal + interest };
  }, [formData.principal, formData.interestRate, formData.billingCycle]);

  if (!preview) return null;
  return (
    <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-emerald-400">Valor previsto com juros</p>
          <p className="mt-1 text-[9px] font-bold uppercase text-slate-500">Juros previstos: {formatMoney(preview.interest)}</p>
        </div>
        <strong className="text-lg font-black tabular-nums text-white">{formatMoney(preview.total)}</strong>
      </div>
    </div>
  );
};
