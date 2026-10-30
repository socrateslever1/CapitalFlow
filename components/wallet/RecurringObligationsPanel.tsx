import React,{useState,useEffect,useRef} from 'react';
import {Repeat,Plus,Check,X,CalendarDays,PauseCircle,PlayCircle} from 'lucide-react';
import {personalWalletService,PersonalWalletAccount,PersonalWalletCard,WalletRecurringObligation} from '../../services/personalWallet.service';
import {formatMoney} from '../../utils/formatters';
import {parseWalletMoney} from '../../features/wallet/utils/parseWalletMoney';

type Props={accounts:PersonalWalletAccount[];cards:PersonalWalletCard[];items:WalletRecurringObligation[];onSaved:()=>Promise<void>;showCreateButton?:boolean;createRequest?:number};
const field='mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-sm text-white';
const month=()=>new Date().toISOString().slice(0,7)+'-01';
export const RecurringObligationsPanel:React.FC<Props>=({accounts,cards,items,onSaved,showCreateButton=true,createRequest})=>{
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const initialized=useRef(false);
 const [form,setForm]=useState({kind:'EXPENSE',description:'',creditor_name:'',creditor_type:'COMPANY',category:'Moradia',amount:'',due_day:'10',origin:''});
 const update=(key:keyof typeof form,value:string)=>setForm(old=>({...old,[key]:value}));
 const run=async(action:()=>Promise<unknown>,msg:string)=>{if(busy)return;setBusy(true);setError('');setNotice('');try{await action();await onSaved();setNotice(msg);}catch(e){setError(e instanceof Error?e.message:'Não foi possível concluir');}finally{setBusy(false);}};
 const submit=async(e:React.FormEvent)=>{e.preventDefault();const [origin_type,origin_id]=form.origin.split(':');await run(async()=>{
   if(!origin_id || !['ACCOUNT','CARD'].includes(origin_type))throw new Error('Escolha a origem do pagamento.');
   await personalWalletService.createRecurringObligation({
    kind:form.kind as 'EXPENSE'|'DEBT',description:form.description,creditor_name:form.creditor_name,
    creditor_type:form.creditor_type as 'PERSON'|'COMPANY',category:form.category,
    amount:parseWalletMoney(form.amount,'valor recorrente'),due_day:Number(form.due_day),origin_type:origin_type as 'ACCOUNT'|'CARD',
    origin_id,start_month:month()
   });
   await personalWalletService.generateRecurringObligations(month(),3);
   setOpen(false);setForm({kind:'EXPENSE',description:'',creditor_name:'',creditor_type:'COMPANY',category:'Moradia',amount:'',due_day:'10',origin:''});
  },'Recorrência cadastrada e próximos vencimentos gerados.');};
 useEffect(()=>{
   if(initialized.current || !items.some(x=>x.active))return;
   initialized.current=true;
   personalWalletService.generateRecurringObligations(month(),3)
     .then(n=>{if(n>0)onSaved().catch(()=>setError('Vencimentos criados; atualize a carteira para visualizar.'));})
     .catch(e=>setError(e instanceof Error?e.message:'Falha ao atualizar os vencimentos.'));
 },[items,onSaved]);
 useEffect(()=>{if(createRequest!==undefined)setOpen(true);},[createRequest]);
 const active=items.filter(x=>x.active);
 const monthly=active.reduce((sum,x)=>sum+Number(x.amount),0);
 return <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-3">
  <div className="flex items-center justify-between gap-2"><div><h3 className="flex items-center gap-2 text-sm font-bold text-white"><Repeat size={17} className="text-amber-300"/> Despesas recorrentes</h3><p className="text-xs text-slate-400">Vencimentos mensais sem débito automático</p></div>{showCreateButton && <button type="button" onClick={()=>setOpen(true)} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white"><Plus size={13} className="inline"/> Nova</button>}</div>
  <div className="flex items-center justify-between rounded-lg bg-slate-950 p-3 text-xs"><span className="text-slate-400">Compromissos mensais ativos</span><strong className="text-amber-300">{formatMoney(monthly)}</strong></div>
  <button type="button" disabled={busy||!active.length} onClick={()=>run(async()=>{await personalWalletService.generateRecurringObligations(month(),3);},'Vencimentos atualizados.')} className="w-full rounded-xl border border-blue-700 bg-blue-950/25 py-3 text-xs font-bold text-blue-200 disabled:opacity-40"><CalendarDays size={15} className="mr-1 inline"/> Gerar vencimentos dos próximos 3 meses</button>
  <p className="text-xs text-slate-400">A geração é idempotente: repetir a ação não duplica parcelas. A conta ou o cartão só será movimentado ao registrar o pagamento.</p>
  <div className="space-y-2">{items.map(item=><div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-3"><div className="min-w-0"><strong className="block truncate text-sm text-slate-200">{item.description}</strong><p className="truncate text-xs text-slate-400">{item.creditor_name} · {item.kind==='EXPENSE'?'Despesa':'Dívida'} · dia {item.due_day}</p><strong className="text-xs text-amber-300">{formatMoney(item.amount)}</strong></div><button type="button" disabled={busy} aria-label={(item.active?'Pausar ':'Reativar ')+item.description} onClick={()=>run(()=>personalWalletService.setRecurringObligationActive(item.id,!item.active),item.active?'Recorrência pausada.':'Recorrência reativada.')} className="rounded-lg border border-slate-700 p-2 text-slate-300">{item.active?<PauseCircle size={19}/>:<PlayCircle size={19}/>}</button></div>)}</div>
  {notice&&<p role="status" className="text-xs text-emerald-300">{notice}</p>}
  {error&&<p role="alert" className="text-xs text-rose-300">{error}</p>}
  {open&&<div role="dialog" aria-modal="true" aria-label="Nova despesa ou dívida fixa" className="fixed inset-0 z-[2500] flex items-end justify-center bg-black/80 sm:items-center sm:p-4"><form onSubmit={submit} className="max-h-[95dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-slate-700 bg-slate-900 p-5 text-white sm:rounded-3xl">
   <div className="flex items-center justify-between"><h3 className="text-base font-bold">Nova despesa ou dívida fixa</h3><button type="button" aria-label="Fechar" onClick={()=>setOpen(false)}><X size={18}/></button></div>
   <div className="mt-4 grid gap-3 sm:grid-cols-2">
    <label className="text-xs">Tipo<select className={field} value={form.kind} onChange={e=>update('kind',e.target.value)}><option value="EXPENSE">Despesa fixa</option><option value="DEBT">Dívida recorrente</option></select></label>
    <label className="text-xs">Credor<select className={field} value={form.creditor_type} onChange={e=>update('creditor_type',e.target.value)}><option value="PERSON">Pessoa física</option><option value="COMPANY">Empresa</option></select></label>
    <label className="text-xs">Descrição<input className={field} required maxLength={240} placeholder="Aluguel, internet, energia" value={form.description} onChange={e=>update('description',e.target.value)}/></label>
    <label className="text-xs">Nome do credor<input className={field} required maxLength={240} value={form.creditor_name} onChange={e=>update('creditor_name',e.target.value)}/></label>
    <label className="text-xs">Categoria<input className={field} required value={form.category} onChange={e=>update('category',e.target.value)}/></label>
    <label className="text-xs">Valor mensal (R$)<input className={field} required type="text" inputMode="decimal" autoComplete="off" placeholder="0,00" value={form.amount} onChange={e=>update('amount',e.target.value)}/></label>
    <label className="text-xs">Dia de vencimento<input className={field} required type="number" min="1" max="31" value={form.due_day} onChange={e=>update('due_day',e.target.value)}/></label>
    <label className="text-xs">Origem do pagamento<select className={field} required value={form.origin} onChange={e=>update('origin',e.target.value)}><option value="">Selecione</option><optgroup label="Conta bancária">{accounts.map(a=><option key={a.id} value={'ACCOUNT:'+a.id}>{a.nickname}</option>)}</optgroup><optgroup label="Cartão">{cards.filter(c=>c.status==='ACTIVE').map(c=><option key={c.id} value={'CARD:'+c.id}>{c.nickname}</option>)}</optgroup></select></label>
   </div>
   {error&&<p className="mt-3 text-xs text-rose-300">{error}</p>}
   <button type="submit" disabled={busy} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-bold disabled:opacity-50"><Check size={16}/>{busy?'Salvando...':'Salvar recorrência'}</button>
  </form></div>}
 </section>;
};
