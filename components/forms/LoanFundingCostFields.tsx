import React from 'react';
import { formatMoney } from '../../utils/formatters';

type Props = {
  principal: number;
  totalPayable: string;
  feePercent: string;
  onChange: (totalPayable: string, feePercent: string) => void;
  required?: boolean;
  disabled?: boolean;
};

/** O custo do financiamento nunca integra o principal ou os juros devidos pelo cliente. */
export const LoanFundingCostFields: React.FC<Props> = ({
  principal, totalPayable, feePercent, onChange, required = false, disabled = false,
}) => {
  const total = Number(String(totalPayable || '').replace(',', '.'));
  const hasTotal = String(totalPayable ?? '').trim() !== '';
  const cost = hasTotal && Number.isFinite(total) && Number.isFinite(principal)
    ? Math.max(0, Math.round((total - principal) * 100) / 100)
    : 0;
  const rounded = (value: number) => (Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2);
  const changeCost = (raw: string) => {
    if (raw === '') { onChange('', ''); return; }
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || !Number.isFinite(principal) || principal <= 0) return;
    const roundedCost = Number(rounded(value));
    onChange(rounded(principal + roundedCost),
      String(Number((roundedCost / principal * 100).toFixed(6))));
  };
  const changePercent = (raw: string) => {
    if (raw === '') { onChange('', ''); return; }
    const rate = Number(raw);
    if (!Number.isFinite(rate) || rate < 0 || !Number.isFinite(principal) || principal <= 0) return;
    const roundedCost = Number(rounded(principal * rate / 100));
    onChange(rounded(principal + roundedCost), raw);
  };
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block space-y-1 text-xs font-semibold text-slate-200">
        Custo da operação (R$)
        <input type="number" inputMode="decimal" min="0" max="1000000000" step="0.01"
          required={required} disabled={disabled} aria-label="Custo da operação em reais"
          value={hasTotal ? String(Number(cost.toFixed(2))) : ''}
          onChange={event => changeCost(event.target.value)}
          placeholder="Ex.: 9,98"
          className="mt-1 min-h-12 w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-sm font-semibold text-white outline-none focus:border-blue-400 disabled:opacity-50" />
      </label>
      <label className="block space-y-1 text-xs font-semibold text-slate-200">
        Taxa equivalente (%)
        <input type="number" inputMode="decimal" min="0" max="100000" step="any"
          disabled={disabled} aria-label="Taxa da operação em porcentagem"
          value={hasTotal ? feePercent || String(Number((cost / Math.max(principal,1) * 100).toFixed(6))) : ''}
          onChange={event => changePercent(event.target.value)}
          placeholder="Ex.: 4,99"
          className="mt-1 min-h-12 w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-sm font-semibold text-white outline-none focus:border-blue-400 disabled:opacity-50" />
      </label>
      <div className="sm:col-span-2 rounded-lg border border-slate-700/70 bg-slate-900/70 p-3 text-xs text-slate-300">
        <div className="flex justify-between gap-3"><span>Principal disponibilizado</span><strong className="text-white">{formatMoney(principal)}</strong></div>
        <div className="mt-2 flex justify-between gap-3"><span>Total da compra no cartão</span><strong className="text-white">{hasTotal ? formatMoney(principal + cost) : 'A informar'}</strong></div>
        <p className="mt-2 text-slate-400">Esse custo reduz seu lucro. A dívida e os juros do cliente permanecem inalterados.</p>
      </div>
    </div>
  );
};
