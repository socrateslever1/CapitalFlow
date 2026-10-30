import React, { useRef, useState } from 'react';
import { CalendarDays, Loader2, PencilLine, X } from 'lucide-react';
import type { PersonalWalletCard } from '../../services/personalWallet.service';
import { generateUUID } from '../../utils/generators';

type Props = {
  card: PersonalWalletCard;
  initialDueMonth: string;
  initialAmount: number;
  onClose: () => void;
  onSave: (dueMonth: string, amount: number, requestId: string) => Promise<void>;
};

const parseMoney = (value: string) => Number(value.replace(/\s/g, '').replace(/\./g, '').replace(',', '.'));

export const InvoiceOverrideModal: React.FC<Props> = ({ card, initialDueMonth, initialAmount, onClose, onSave }) => {
  const [dueMonth, setDueMonth] = useState(initialDueMonth.slice(0, 7));
  const [amount, setAmount] = useState(initialAmount > 0 ? initialAmount.toFixed(2).replace('.', ',') : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(generateUUID());

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = parseMoney(amount);
    if (!/^\d{4}-\d{2}$/.test(dueMonth)) return setError('Selecione o mês da fatura.');
    if (!Number.isFinite(parsed) || parsed <= 0 || Math.abs(parsed * 100 - Math.round(parsed * 100)) > 0.000001) {
      return setError('Informe um valor positivo com até duas casas decimais.');
    }
    setSaving(true);
    setError('');
    try {
      await onSave(`${dueMonth}-01`, parsed, requestId.current);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível definir o valor da fatura.');
    } finally { setSaving(false); }
  };

  const field = 'mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20';
  return <div role="dialog" aria-modal="true" aria-labelledby="invoice-override-title"
    className="fixed inset-0 z-[2300] flex items-end justify-center bg-slate-950/80 backdrop-blur-sm sm:items-center sm:p-4">
    <button type="button" aria-label="Fechar ajuste de fatura" className="absolute inset-0 cursor-default" onClick={() => !saving && onClose()}/>
    <form onSubmit={submit} className="relative w-full rounded-t-3xl border border-slate-700 bg-slate-900 p-5 shadow-2xl sm:max-w-md sm:rounded-2xl">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 id="invoice-override-title" className="flex items-center gap-2 text-lg font-black text-white"><PencilLine size={18}/> Definir Valor da Fatura</h3>
          <p className="mt-1 text-xs text-slate-400">{card.nickname} · o valor consolidado substitui a soma do ciclo sem apagar os lançamentos.</p>
        </div>
        <button type="button" aria-label="Fechar" disabled={saving} onClick={onClose} className="rounded-full bg-slate-800 p-2 text-slate-400 hover:text-white"><X size={17}/></button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-bold text-slate-300">Mês de vencimento da fatura
          <span className="relative block"><CalendarDays className="pointer-events-none absolute left-3 top-4 text-slate-500" size={15}/>
            <input type="month" required value={dueMonth} onChange={event => setDueMonth(event.target.value)} className={`${field} pl-9`}/>
          </span>
        </label>
        <label className="text-xs font-bold text-slate-300">Valor fechado
          <input autoFocus inputMode="decimal" required value={amount} onChange={event => setAmount(event.target.value)} placeholder="0,00" className={field}/>
        </label>
      </div>
      <p className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-100">As parcelas posteriores continuam comprometendo o limite, mas não entram na fatura deste mês.</p>
      {error && <p role="alert" className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{error}</p>}
      <button type="submit" disabled={saving} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-extrabold text-white hover:bg-blue-500 disabled:opacity-60">
        {saving ? <Loader2 className="animate-spin" size={17}/> : <PencilLine size={17}/>} {saving ? 'Salvando…' : 'Aplicar valor consolidado'}
      </button>
    </form>
  </div>;
};
