import React,{useRef,useState} from 'react';
import {Loader2,PencilLine,X} from 'lucide-react';
import type {PersonalWalletCard} from '../../services/personalWallet.service';
import {generateUUID} from '../../utils/generators';
import {getInvoiceCycleDates} from './invoiceStatementDomain';
import {parseWalletMoney} from '../../features/wallet/utils/parseWalletMoney';

type Props={
 card:PersonalWalletCard;
 initialDueMonth:string;
 initialDueDate?:string|null;
 initialAmount:number;
 hasExistingConsolidation:boolean;
 onClose:()=>void;
 onSave:(dueMonth:string,amount:number,dueDate:string,requestId:string)=>Promise<void>;
};

export const InvoiceOverrideModal:React.FC<Props>=({
 card,initialDueMonth,initialDueDate,initialAmount,hasExistingConsolidation,onClose,onSave,
})=>{
 const [dueDate,setDueDate]=useState(
   initialDueDate || getInvoiceCycleDates(initialDueMonth,card.closing_day,card.due_day).dueDate,
 );
 const [amount,setAmount]=useState(initialAmount>0?initialAmount.toFixed(2).replace('.',','):'');
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState('');
 const request=useRef({signature:'',id:generateUUID()});
 const submit=async(event:React.FormEvent)=>{
  event.preventDefault();if(saving)return;
  setError('');
  try{
   const parsed=parseWalletMoney(amount,'valor da fatura');
   if(parsed<=0)throw new Error('Informe o valor da fatura.');
   const date=new Date(dueDate+'T00:00:00Z');
   if(!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0,10)!==dueDate)throw new Error('Informe uma data de vencimento válida.');
   const dueMonth=dueDate.slice(0,7)+'-01';
   if(!hasExistingConsolidation && dueMonth!==initialDueMonth.slice(0,7)+'-01')
     throw new Error('Esta fatura tem compras individuais. Para mudar o mês, ajuste o vencimento desses lançamentos.');
   const signature=dueMonth+'|'+dueDate+'|'+parsed.toFixed(2);
   if(request.current.signature!==signature)request.current={signature,id:generateUUID()};
   setSaving(true);
   await onSave(dueMonth,parsed,dueDate,request.current.id);
   onClose();
  }catch(reason){setError(reason instanceof Error?reason.message:'Não foi possível alterar a fatura.');}
  finally{setSaving(false);}
 };
 const input='mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white focus:border-blue-500';
 return <div role="dialog" aria-modal="true" aria-labelledby="wallet-invoice-title"
   className="fixed inset-0 z-[2300] flex items-end justify-center bg-slate-950/80 sm:items-center sm:p-4">
   <button type="button" className="absolute inset-0" aria-label="Fechar" disabled={saving} onClick={onClose}/>
   <form onSubmit={submit} className="relative max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl border border-slate-700 bg-slate-900 p-5 sm:max-w-md sm:rounded-2xl">
     <div className="flex items-center justify-between gap-2">
       <div><h2 id="wallet-invoice-title" className="text-lg font-bold text-white">Editar fatura</h2>
         <p className="mt-1 text-xs text-slate-400">{card.nickname}</p></div>
       <button type="button" aria-label="Fechar" disabled={saving} onClick={onClose}
         className="rounded-full bg-slate-800 p-2 text-slate-200"><X size={18}/></button>
     </div>
     <div className="mt-5 grid gap-4">
       <label className="text-sm text-slate-200">Valor da fatura (R$)
         <input name="wallet-invoice-value" type="text" inputMode="decimal" autoComplete="off"
           required placeholder="0,00" value={amount} onChange={event=>setAmount(event.target.value)}
           className={input}/>
       </label>
       <label className="text-sm text-slate-200">Vencimento
         <input name="wallet-invoice-due-date" type="date" required value={dueDate}
           onChange={event=>setDueDate(event.target.value)} className={input}/>
       </label>
     </div>
     {error&&<p role="alert" className="mt-3 text-xs text-rose-300">{error}</p>}
     <button type="submit" disabled={saving} className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white disabled:opacity-50">
       {saving?<Loader2 size={17} className="animate-spin"/>:<PencilLine size={17}/>}
       {saving?'Salvando…':'Salvar alterações'}
     </button>
   </form>
 </div>;
};
