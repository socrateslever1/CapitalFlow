import React, { useMemo, useState } from 'react';
import { formatMoney, cleanNumberStr } from '../../utils/formatters';

export const LoanTotalPreview: React.FC<{ formData: any; setFormData: (value: any) => void }> = ({ formData, setFormData }) => {
  const [mode, setMode] = useState<'RATE' | 'VALUE'>('RATE');

  const preview = useMemo(() => {
    const principal = Number(formData.principal || 0);
    const rate = Number(formData.interestRate || 0);
    const isMonthly = formData.billingCycle === 'MONTHLY';
    if (!Number.isFinite(principal) || principal <= 0 || !Number.isFinite(rate) || rate < 0 || !isMonthly) return null;
    const interest = principal * (rate / 100);
    return { interest, total: principal + interest, rate };
  }, [formData.principal, formData.interestRate, formData.billingCycle]);

  if (!preview) return null;

  const principal = Number(formData.principal || 0);
  const interestValue = preview.interest;

  const setInterestByValue = (raw: string) => {
    const normalized = cleanNumberStr(raw);
    const value = Number(normalized || 0);
    const nextRate = principal > 0 ? (value / principal) * 100 : 0;
    setFormData({ ...formData, interestRate: Number.isFinite(nextRate) ? String(Number(nextRate.toFixed(6))) : '0' });
  };

  return (
    <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-emerald-400">Valor previsto com juros</p>
          <p className="mt-1 text-[9px] font-bold uppercase text-slate-500">Juros previstos: {formatMoney(interestValue)}</p>
        </div>
        <strong className="text-lg font-black tabular-nums text-white">{formatMoney(preview.total)}</strong>
      </div>

      <div className="flex bg-slate-950/70 p-1 rounded-lg border border-slate-800/80">
        <button
          type="button"
          onClick={() => setMode('RATE')}
          className={`flex-1 py-2 rounded-md text-[9px] font-black uppercase transition-all ${mode === 'RATE' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-white'}`}
        >
          Juros em %
        </button>
        <button
          type="button"
          onClick={() => setMode('VALUE')}
          className={`flex-1 py-2 rounded-md text-[9px] font-black uppercase transition-all ${mode === 'VALUE' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-white'}`}
        >
          Juros em R$
        </button>
      </div>

      {mode === 'VALUE' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end animate-in fade-in duration-200">
          <div>
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 ml-1">Valor dos juros</label>
            <div className="mt-1 flex items-center gap-2 h-12 rounded-lg bg-slate-950/70 border border-slate-800/80 px-4">
              <span className="text-slate-500 font-black">R$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={Number(interestValue.toFixed(2)) || ''}
                onChange={(e) => setInterestByValue(e.target.value)}
                className="w-full bg-transparent outline-none text-white font-black"
              />
            </div>
          </div>
          <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-blue-400">Taxa equivalente</p>
            <p className="mt-1 text-lg font-black text-white tabular-nums">{preview.rate.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}%</p>
          </div>
        </div>
      )}
    </div>
  );
};