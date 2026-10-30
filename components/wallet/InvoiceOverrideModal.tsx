import React, { useRef, useState } from 'react';
import { CalendarDays, Loader2, PencilLine, X } from 'lucide-react';
import type { PersonalWalletCard } from '../../services/personalWallet.service';
import { generateUUID } from '../../utils/generators';
import { getInvoiceCycleDates } from './invoiceStatementDomain';
import { parseWalletMoney } from '../../features/wallet/utils/parseWalletMoney';

type Props = {
  card: PersonalWalletCard;
  initialDueMonth: string;
  initialDueDate?: string | null;
  initialAmount: number;
  hasExistingConsolidation: boolean;
  onClose: () => void;
  onSave: (dueMonth: string, amount: number, dueDate: string, requestId: string) => Promise<void>;
};

export const InvoiceOverrideModal: React.FC<Props> = ({
  card, initialDueMonth, initialDueDate, initialAmount,
  hasExistingConsolidation, onClose, onSave,
}) => {
  const originalMonth=initialDueMonth.slice(0,7);
  const [month,setMonth]=useState(originalMonth);
  const [dueDate,setDueDate]=useState(initialDueDate || getInvoiceCycleDates(
    initialDueMonth,card.closing_day,card.due_day,
  ).dueDate);
  const [amount,setAmount]=useState(initialAmount>0?initialAmount.toFixed(2).replace('.',','):'');
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const request=useRef<{key:string;id:string}>({key:'',id:generateUUID()});
  const visualMonth=/^\d{4}-(0[1-9]|1[0-2])$/.test(month)?month:originalMonth;
  const dates=getInvoiceCycleDates(visualMonth+'-01',card.closing_day,card.due_day,dueDate);
  const monthLabel=(date:string)=>new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'})
    .format(new Date(date.slice(0,7)+'-01T12:00:00Z'));

  const submit=async(event:React.FormEvent)=>{
    event.preventDefault();
    if(saving)return;
    setError('');
    try {
      const parsed=parseWalletMoney(amount,'valor consolidado');
      if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
        throw new Error('Informe o mês em que esta fatura será paga.');
      if(!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || dueDate.slice(0,7)!==month ||
         Number.isNaN(Date.parse(dueDate+'T00:00:00Z')) ||
         new Date(dueDate+'T00:00:00Z').toISOString().slice(0,10)!==dueDate)
        throw new Error('Informe a data exata de vencimento dentro do mês escolhido.');
      if(parsed<=0)throw new Error('Informe um valor positivo.');
      if(!hasExistingConsolidation && month!==originalMonth)
        throw new Error('Este ciclo contém lançamentos individuais. Corrija primeiro o vencimento de cada lançamento para não duplicar a cobrança.');
      const signature=[month,dueDate,parsed.toFixed(2)].join('|');
      if(request.current.key!==signature)request.current={key:signature,id:generateUUID()};
      setSaving(true);
      await onSave(month+'-01',parsed,dueDate,request.current.id);
      onClose();
    }catch(cause){setError(cause instanceof Error?cause.message:'Falha ao corrigir a fatura.');}
    finally{setSaving(false);}
  };
  const field='mt-1.5 w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20';
  return <div role="dialog" aria-modal="true" aria-labelledby="invoice-override-title"
    className="fixed inset-0 z-[2300] flex items-end justify-center overflow-hidden bg-slate-950/80 backdrop-blur-sm sm:items-center sm:p-4">
    <button type="button" aria-label="Fechar ajuste da fatura" className="absolute inset-0 cursor-default" onClick={()=>!saving&&onClose()}/>
    <form onSubmit={submit} className="relative max-h-[min(95dvh,850px)] w-full overflow-y-auto rounded-t-3xl border border-slate-700 bg-slate-900 p-5 shadow-2xl sm:max-w-lg sm:rounded-2xl">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 id="invoice-override-title" className="flex items-center gap-2 text-lg font-black text-white"><PencilLine size={18}/>Corrigir fatura</h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-300">{card.nickname} · valor, competência e vencimento são informações diferentes.</p>
        </div>
        <button type="button" aria-label="Fechar" disabled={saving} onClick={onClose}
          className="rounded-full bg-slate-800 p-2 text-slate-300 hover:text-white"><X size={17}/></button>
      </div>
      <div className="rounded-xl border border-blue-500/25 bg-blue-500/5 p-3 text-xs leading-relaxed text-slate-200">
        <span className="font-semibold">Competência (fechamento): {monthLabel(dates.closingDate)}</span>
        <span className="mt-1 block">Pagamento: {new Intl.DateTimeFormat('pt-BR',{timeZone:'UTC'}).format(new Date(dates.dueDate+'T12:00:00Z'))}</span>
        <span className="mt-2 block text-slate-400">Exemplo: a fatura de outubro pode vencer em 03/11. Ela é uma única dívida, não duas faturas.</span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-slate-200">Mês de pagamento
          <span className="relative block"><CalendarDays className="pointer-events-none absolute left-3 top-4 text-slate-400" size={15}/>
            <input name="wallet-invoice-payment-month" type="month" required value={month}
              onChange={event=>{
                const next=event.target.value;setMonth(next);
                if(/^\d{4}-\d{2}$/.test(next))setDueDate(getInvoiceCycleDates(next+'-01',card.closing_day,card.due_day).dueDate);
              }}
              className={field+' pl-9'}/>
          </span>
        </label>
        <label className="text-xs font-semibold text-slate-200">Data exata de vencimento
          <input name="wallet-invoice-due-date" type="date" required value={dueDate}
            onChange={event=>setDueDate(event.target.value)} className={field}/>
        </label>
        <label className="text-xs font-semibold text-slate-200 sm:col-span-2">Valor consolidado (R$)
          <input name="wallet-invoice-amount" type="text" inputMode="decimal" autoComplete="off"
            required value={amount} onChange={event=>setAmount(event.target.value)}
            placeholder="0,00" className={field}/>
        </label>
      </div>
      <p className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-100">
        {hasExistingConsolidation
          ? 'Corrigir o mês desloca a consolidação existente com histórico auditável. Se houver outra cobrança igual no destino, o banco só a reúne após verificar valores e pagamentos.'
          : 'Uma fatura formada por compras individuais deve ser corrigida pelos lançamentos, sem gerar uma nova consolidação de outro mês.'}
      </p>
      {error&&<p role="alert" className="mt-3 rounded-lg bg-rose-950/50 px-3 py-2 text-xs text-rose-200">{error}</p>}
      <button type="submit" disabled={saving} className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-60">
        {saving?<Loader2 className="animate-spin" size={17}/>:<PencilLine size={17}/>}
        {saving?'Salvando…':'Salvar correção sem duplicar'}
      </button>
    </form>
  </div>;
};
