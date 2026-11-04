import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { formatMoney, parseCurrency } from '../../utils/formatters';

type Props = {
  principal: number;
  totalPayable: string;
  feePercent: string;
  onChange: (totalPayable: string, feePercent: string) => void;
  required?: boolean;
  disabled?: boolean;
  customerRate?: string;
  onAdjustCustomerRate?: (nextRate: string) => void;
};

/** O custo do financiamento nunca integra o principal devido pelo cliente. */
export const LoanFundingCostFields: React.FC<Props> = ({
  principal, totalPayable, feePercent, onChange, required = false, disabled = false,
  customerRate, onAdjustCustomerRate,
}) => {
  const [editing, setEditing] = React.useState<'COST' | 'RATE' | 'TOTAL' | null>(null);
  const [costDraft, setCostDraft] = React.useState('');
  const [rateDraft, setRateDraft] = React.useState('');
  const [totalDraft, setTotalDraft] = React.useState('');
  const total = parseCurrency(totalPayable);
  const hasTotal = String(totalPayable ?? '').trim() !== '';
  const cost = hasTotal && Number.isFinite(total) && Number.isFinite(principal)
    ? Math.max(0, Math.round((total - principal) * 100) / 100)
    : 0;
  const rounded = (value: number) => (Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2);
  const effectiveRate = hasTotal && principal > 0
    ? Number((cost / principal * 100).toFixed(4))
    : 0;

  const changeCost = (raw: string) => {
    if (!/^(?:\d{0,12}(?:[.,]\d{0,2})?|\d{1,3}(?:\.\d{3})+(?:,\d{0,2})?)$/.test(raw)) return;
    if (raw === '') { onChange('', ''); return; }
    const value = parseCurrency(raw);
    if (!Number.isFinite(value) || value < 0 || !Number.isFinite(principal) || principal <= 0) return;
    const roundedCost = Number(rounded(value));
    onChange(rounded(principal + roundedCost),
      String(Number((roundedCost / principal * 100).toFixed(6))));
  };

  const changePercent = (raw: string) => {
    if (!/^\d{0,6}(?:[.,]\d{0,6})?$/.test(raw)) return;
    if (raw === '') { onChange('', ''); return; }
    const rate = parseCurrency(raw);
    if (!Number.isFinite(rate) || rate < 0 || !Number.isFinite(principal) || principal <= 0) return;
    const roundedCost = Number(rounded(principal * rate / 100));
    onChange(rounded(principal + roundedCost), raw);
  };

  const changeTotal = (raw: string) => {
    if (!/^(?:\d{0,12}(?:[.,]\d{0,2})?|\d{1,3}(?:\.\d{3})+(?:,\d{0,2})?)$/.test(raw)) return;
    if (raw === '') { onChange('', ''); return; }
    const nextTotal = parseCurrency(raw);
    if (!Number.isFinite(nextTotal) || !Number.isFinite(principal) || principal <= 0) return;
    if (nextTotal < principal) return;
    const roundedCost = Math.max(0, Number(rounded(nextTotal - principal)));
    onChange(rounded(principal + roundedCost),
      String(Number((roundedCost / principal * 100).toFixed(6))));
  };

  const handleAddFeeToRate = () => {
    if (!onAdjustCustomerRate || effectiveRate <= 0) return;
    const baseRate = parseCurrency(customerRate || '0');
    const safeBase = Number.isFinite(baseRate) && baseRate > 0 ? baseRate : 0;
    const nextRate = Number((safeBase + effectiveRate).toFixed(4));
    onAdjustCustomerRate(String(nextRate));
  };

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="block space-y-1 text-xs font-semibold text-slate-200">
        Custo da operação (R$)
        <input type="text" inputMode="decimal"
          required={required} disabled={disabled} aria-label="Custo da operação em reais"
          value={editing === 'COST' ? costDraft : hasTotal ? cost.toFixed(2).replace('.', ',') : ''}
          onFocus={() => { setEditing('COST'); setCostDraft(hasTotal ? cost.toFixed(2).replace('.', ',') : ''); }}
          onBlur={() => setEditing(null)}
          onChange={event => { if (!/^[0-9.,]*$/.test(event.target.value)) return; setCostDraft(event.target.value); changeCost(event.target.value); }}
          placeholder="Ex.: 9,98"
          className="mt-1 min-h-12 w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-sm font-semibold text-white outline-none focus:border-blue-400 disabled:opacity-50" />
      </label>
      <label className="block space-y-1 text-xs font-semibold text-slate-200">
        Taxa equivalente (%)
        <input type="text" inputMode="decimal"
          disabled={disabled} aria-label="Taxa da operação em porcentagem"
          value={editing === 'RATE' ? rateDraft : hasTotal ? (feePercent || String(Number((cost / Math.max(principal,1) * 100).toFixed(6)))).replace('.', ',') : ''}
          onFocus={() => { setEditing('RATE'); setRateDraft(hasTotal ? (feePercent || String(Number((cost / Math.max(principal,1) * 100).toFixed(6)))).replace('.', ',') : ''); }}
          onBlur={() => setEditing(null)}
          onChange={event => { if (!/^[0-9.,]*$/.test(event.target.value)) return; setRateDraft(event.target.value); changePercent(event.target.value); }}
          placeholder="Ex.: 4,99"
          className="mt-1 min-h-12 w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-sm font-semibold text-white outline-none focus:border-blue-400 disabled:opacity-50" />
      </label>
      <label className="block space-y-1 text-xs font-semibold text-slate-200">
        Total cobrado no cartão (R$)
        <input type="text" inputMode="decimal"
          disabled={disabled} aria-label="Total cobrado no cartão em reais"
          value={editing === 'TOTAL' ? totalDraft : hasTotal ? (principal + cost).toFixed(2).replace('.', ',') : ''}
          onFocus={() => { setEditing('TOTAL'); setTotalDraft(hasTotal ? (principal + cost).toFixed(2).replace('.', ',') : ''); }}
          onBlur={() => setEditing(null)}
          onChange={event => { if (!/^[0-9.,]*$/.test(event.target.value)) return; setTotalDraft(event.target.value); changeTotal(event.target.value); }}
          placeholder={principal > 0 ? `Ex.: ${(principal * 1.05).toFixed(2).replace('.', ',')}` : 'Ex.: 209,98'}
          className="mt-1 min-h-12 w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-sm font-semibold text-white outline-none focus:border-blue-400 disabled:opacity-50" />
      </label>
      <div className="sm:col-span-3 rounded-lg border border-slate-700/70 bg-slate-900/70 p-3 text-xs text-slate-300 space-y-2">
        <div className="flex justify-between gap-3"><span>Principal disponibilizado</span><strong className="text-white tabular-nums">{formatMoney(principal)}</strong></div>
        <div className="flex justify-between gap-3"><span>Total da compra no cartão</span><strong className="text-white tabular-nums">{hasTotal ? formatMoney(principal + cost) : 'A informar'}</strong></div>
        {!disabled && onAdjustCustomerRate && effectiveRate > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-2">
            <span className="text-slate-300">
              Deseja embutir a taxa do cartão ({effectiveRate.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%) nos juros cobrados do cliente?
            </span>
            <button
              type="button"
              onClick={handleAddFeeToRate}
              className="inline-flex items-center gap-1 rounded-md border border-rose-500/30 bg-rose-500/15 px-2.5 py-1.5 text-[11px] font-bold text-rose-200 transition-colors hover:bg-rose-500/25"
            >
              <ArrowUpRight size={13} /> Somar +{effectiveRate.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% aos juros
            </button>
          </div>
        )}
        <p className="text-slate-400">O principal entregue ao cliente permanece {formatMoney(principal)}. Quando não repassado aos juros, o custo do cartão reduz apenas a sua margem líquida.</p>
      </div>
    </div>
  );
};
