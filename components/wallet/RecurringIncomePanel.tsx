import React,{useState} from 'react';
import {CalendarDays,CheckCircle2,Plus,Repeat,Save,Trash2,X} from 'lucide-react';
import {PersonalWalletAccount,WalletRecurringIncome,personalWalletService} from '../../services/personalWallet.service';
import {formatMoney} from '../../utils/formatters';
import {generateUUID} from '../../utils/generators';
import {WalletMetricStrip} from './WalletMetricStrip';
type Props={accounts:PersonalWalletAccount[];incomes:WalletRecurringIncome[];receivedIds:Set<string>;onSaved:()=>Promise<void>};
const field='mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-white';
const month=new Date().toISOString().slice(0,7)+'-01';
export const RecurringIncomePanel:React.FC<Props>=({accounts,incomes,receivedIds,onSaved})=>{
 const [open,setOpen]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [form,setForm]=useState({description:'',category:'Salário',amount:'',receipt_day:'5',destination_account_id:accounts[0]?.id||''});
 const update=(k:keyof typeof form,v:string)=>setForm(old=>({...old,[k]:v}));
 const save=async(e:React.FormEvent)=>{e.preventDefault();if(busy)return;setBusy(true);setError('');
  try{await personalWalletService.createRecurringIncome({
   description:form.description,category:form.category,amount:Number(form.amount),receipt_day:Number(form.receipt_day),destination_account_id:form.destination_account_id
  });await onSaved();setOpen(false);setForm({description:'',category:'Salário',amount:'',receipt_day:'5',destination_account_id:accounts[0]?.id||''});}
  catch(reason){setError(reason instanceof Error?reason.message:'Erro ao cadastrar');}finally{setBusy(false);}
 };
 const perform=async(action:()=>Promise<unknown>)=>{if(busy)return;setBusy(true);setError('');try{await action();await onSaved();}catch(reason){setError(reason instanceof Error?reason.message:'Falha na operação');}finally{setBusy(false);}};
 const active=incomes.filter(x=>x.active);
 const projected=active.reduce((sum,x)=>sum+Number(x.amount),0);
 const received=active.filter(x=>receivedIds.has(x.id)).reduce((sum,x)=>sum+Number(x.amount),0);
 return <section className="space-y-5">
  <header className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 text-base font-semibold text-white"><Repeat size={18} className="text-slate-400"/>Receitas fixas</h2><p className="mt-1 text-sm text-slate-400">Projeção mensal, sem lançamento automático.</p></div><button type="button" onClick={()=>setOpen(true)} className="flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"><Plus size={17}/>Nova receita</button></header>
  <WalletMetricStrip items={[
    {label:'Previsto por mês',value:formatMoney(projected)},
    {label:'Confirmado neste mês',value:formatMoney(received),tone:'positive'},
    {label:'A receber neste mês',value:formatMoney(projected-received)},
  ]}/>
  {!active.length?<p className="rounded-xl border border-dashed border-slate-700 p-4 text-xs text-slate-400">Cadastre salário, aluguel recebido ou outro rendimento recorrente.</p>:<div className="divide-y divide-slate-800">{active.map(x=><div key={x.id} className="flex items-center justify-between gap-2 py-3">
   <div className="min-w-0"><strong className="block truncate text-sm text-white">{x.description}</strong><p className="text-xs text-slate-400">{x.category} · dia {x.receipt_day} · {accounts.find(a=>a.id===x.destination_account_id)?.nickname||'Conta'}</p><strong className="text-xs text-emerald-300">{formatMoney(x.amount)}</strong></div>
   <div className="flex shrink-0 items-center gap-1">
    <button type="button" disabled={busy||receivedIds.has(x.id)} onClick={()=>perform(()=>personalWalletService.postRecurringIncome(x.id,month,generateUUID()))}
      className="flex items-center gap-1 rounded-lg border border-emerald-700/50 px-2 py-2 text-[11px] font-semibold text-emerald-300 disabled:opacity-50"><CheckCircle2 size={13}/>{receivedIds.has(x.id)?'Recebido':'Receber'}</button>
    <button type="button" disabled={busy} onClick={()=>perform(()=>personalWalletService.deactivateRecurringIncome(x.id))} aria-label={'Desativar '+x.description} className="rounded-lg p-2 text-slate-400 hover:text-rose-300"><Trash2 size={15}/></button>
   </div>
  </div>)}</div>}
  {error&&<p role="alert" className="text-xs text-rose-300">{error}</p>}
  {open&&<div role="dialog" aria-modal="true" aria-label="Nova receita fixa" className="fixed inset-0 z-[2500] flex items-end justify-center bg-slate-950/85 sm:items-center sm:p-4">
   <form onSubmit={save} className="flex max-h-[93dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-slate-700 bg-slate-900 sm:rounded-3xl">
    <header className="flex items-center justify-between border-b border-slate-800 p-4"><h2 className="text-base font-bold text-white">Cadastrar receita fixa</h2><button type="button" aria-label="Fechar" onClick={()=>setOpen(false)}><X size={18}/></button></header>
    <div className="grid min-h-0 gap-3 overflow-y-auto p-4 sm:grid-cols-2">
     <label className="text-xs text-slate-300 sm:col-span-2">Descrição<input required maxLength={240} value={form.description} onChange={e=>update('description',e.target.value)} className={field} placeholder="Salário, aluguel recebido..."/></label>
     <label className="text-xs text-slate-300">Categoria<input required maxLength={100} value={form.category} onChange={e=>update('category',e.target.value)} className={field}/></label>
     <label className="text-xs text-slate-300">Valor mensal<input required min="0.01" step="0.01" type="number" value={form.amount} onChange={e=>update('amount',e.target.value)} className={field}/></label>
     <label className="text-xs text-slate-300">Dia de recebimento<input required type="number" min="1" max="31" value={form.receipt_day} onChange={e=>update('receipt_day',e.target.value)} className={field}/></label>
     <label className="text-xs text-slate-300">Conta de destino<select required value={form.destination_account_id} onChange={e=>update('destination_account_id',e.target.value)} className={field}><option value="">Selecione</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.nickname}</option>)}</select></label>
     <p className="flex items-center gap-2 text-xs text-slate-400 sm:col-span-2"><CalendarDays size={15}/> O saldo será creditado somente ao tocar em Receber. O mesmo mês não é lançado duas vezes.</p>
     {error&&<p className="text-xs text-rose-300 sm:col-span-2">{error}</p>}
    </div>
    <footer className="flex justify-end gap-2 border-t border-slate-800 p-4"><button type="button" onClick={()=>setOpen(false)} className="rounded-lg border border-slate-700 px-4 py-2 text-xs text-slate-300">Cancelar</button><button type="submit" disabled={busy} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white"><Save size={15}/>Salvar</button></footer>
   </form>
  </div>}
 </section>;
};
