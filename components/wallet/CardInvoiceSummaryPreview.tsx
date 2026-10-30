import React, { useEffect, useState } from 'react';
import type { CardInvoiceSummary } from '../../utils/cardInvoiceSummary';
import { parseWalletMoney } from '../../features/wallet/utils/parseWalletMoney';

type NumericKey = 'invoiceTotal' | 'minimumPayment' | 'creditLimit' |
  'usedLimit' | 'availableLimit' | 'futureInstallments';
const fields: ReadonlyArray<{key: NumericKey; label: string}> = [
  {key:'invoiceTotal', label:'Valor da fatura'},
  {key:'minimumPayment', label:'Pagamento mínimo'},
  {key:'creditLimit', label:'Limite total'},
  {key:'usedLimit', label:'Limite utilizado'},
  {key:'availableLimit', label:'Disponível informado'},
  {key:'futureInstallments', label:'Parcelas futuras'},
];
type Form = Record<NumericKey,string> & {dueDate:string};
const toForm = (summary: CardInvoiceSummary): Form => ({
  invoiceTotal: summary.invoiceTotal === null ? '' : String(summary.invoiceTotal).replace('.',','),
  minimumPayment: summary.minimumPayment === null ? '' : String(summary.minimumPayment).replace('.',','),
  creditLimit: summary.creditLimit === null ? '' : String(summary.creditLimit).replace('.',','),
  usedLimit: summary.usedLimit === null ? '' : String(summary.usedLimit).replace('.',','),
  availableLimit: summary.availableLimit === null ? '' : String(summary.availableLimit).replace('.',','),
  futureInstallments: summary.futureInstallments === null ? '' : String(summary.futureInstallments).replace('.',','),
  dueDate: summary.dueDate || '',
});

export const CardInvoiceSummaryPreview: React.FC<{
  summary: CardInvoiceSummary;
  onSave?: (summary: CardInvoiceSummary) => Promise<void>;
}> = ({ summary, onSave }) => {
  const [form,setForm] = useState<Form>(() => toForm(summary));
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState('');
  const [saved,setSaved] = useState(false);
  useEffect(() => {setForm(toForm(summary));setSaved(false);setError('');}, [summary]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!onSave || saving) return;
    setError('');setSaved(false);
    try {
      const parsed = Object.fromEntries(fields.map(({key,label}) => [
        key, form[key].trim() === '' ? null : parseWalletMoney(form[key], label),
      ])) as Record<NumericKey,number|null>;
      if (parsed.invoiceTotal !== null && parsed.minimumPayment !== null &&
          parsed.minimumPayment > parsed.invoiceTotal)
        throw new Error('O pagamento mínimo não pode superar o total da fatura.');
      if (form.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(form.dueDate))
        throw new Error('Data de vencimento inválida.');
      setSaving(true);
      await onSave({...summary,...parsed,dueDate:form.dueDate || null});
      setSaved(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível salvar os valores.');
    } finally {setSaving(false);}
  };
  return (
    <section aria-label="Resumo reconhecido da fatura" className="space-y-3 rounded-xl border border-slate-700 bg-slate-950/70 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong className="text-xs text-slate-100">Dados reconhecidos — confira e ajuste</strong>
        <span className="text-[11px] text-slate-400">{summary.institution || 'Banco não identificado'}
          {summary.cardLastFour ? ' · •••• ' + summary.cardLastFour : ''}
        </span>
      </div>
      <form onSubmit={event => { void submit(event); }} className="space-y-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {fields.map(({key,label}) => (
            <label className="rounded-lg bg-slate-900 px-2.5 py-2 text-[11px] text-slate-400" key={key}>
              {label} (R$)
              <input type="text" inputMode="decimal" autoComplete="off" disabled={saving}
                value={form[key]}
                onChange={event=>{setSaved(false);setForm(v=>({...v,[key]:event.target.value}));}}
                placeholder="Não informado" aria-label={label}
                className="mt-1 w-full min-w-0 rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs font-semibold text-white"/>
            </label>
          ))}
          <label className="rounded-lg bg-slate-900 px-2.5 py-2 text-[11px] text-slate-400">
            Data de vencimento
            <input type="date" value={form.dueDate} disabled={saving}
              onChange={event=>{setSaved(false);setForm(v=>({...v,dueDate:event.target.value}));}}
              className="mt-1 w-full min-w-0 rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-white"/>
          </label>
        </div>
        {summary.warnings.map((warning,index)=><p className="text-xs text-amber-200" key={index}>{warning}</p>)}
        <p className="text-[11px] leading-relaxed text-slate-400">
          Estes dados são uma fotografia da fatura, não pagamentos confirmados.
          Corrigir os valores não modifica compras, limite bancário ou saldo contábil.
        </p>
        {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
        {saved && <p role="status" className="text-xs text-emerald-300">Valores conferidos e salvos no ciclo da fatura.</p>}
        {onSave && <button type="submit" disabled={saving}
          className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">
          {saving?'Salvando…':'Salvar valores conferidos'}
        </button>}
      </form>
    </section>
  );
};
