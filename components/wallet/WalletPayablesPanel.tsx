import React,{useMemo,useState,useRef} from 'react';
import {Building2,CheckCircle2,FileUp,HandCoins,Plus,UserRound,X} from 'lucide-react';
import {PersonalWalletAccount,PersonalWalletCard,PersonalWalletPayable} from '../../services/personalWallet.service';
import {formatMoney} from '../../utils/formatters';
import {generateUUID} from '../../utils/generators';
import {derivePayableStatus,summarizePayables} from './payablesDomain';
type Props={
 payables:PersonalWalletPayable[];accounts:PersonalWalletAccount[];cards:PersonalWalletCard[];
 saving:boolean;onCreate?:()=>void;showCreateButton?:boolean;onPay:(input:{
 payableId:string;accountId:string|null;cardId:string|null;amount:number;receipt:File|null;requestId:string;
 })=>Promise<void>;
};
const labels={PENDING:'Pendente',PARTIAL:'Parcial',PAID:'Liquidado',OVERDUE:'Atrasado',CANCELED:'Cancelado'} as const;
const badge={PENDING:'text-amber-300',PARTIAL:'text-blue-300',PAID:'text-emerald-300',OVERDUE:'text-rose-300',CANCELED:'text-slate-400'} as const;
export const WalletPayablesPanel:React.FC<Props>=({payables,accounts,cards,saving,onCreate,showCreateButton=true,onPay})=>{
 const summary=useMemo(()=>summarizePayables(payables),[payables]);
 const [selected,setSelected]=useState<PersonalWalletPayable|null>(null);
 const [value,setValue]=useState('');
 const [source,setSource]=useState('');
 const [receipt,setReceipt]=useState<File|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const request=useRef(generateUUID());
 const reset=()=>{setSelected(null);setValue('');setSource('');setReceipt(null);setError('');request.current=generateUUID();};
 const start=(p:PersonalWalletPayable)=>{
  setSelected(p);setValue(String(p.outstanding_balance));setError('');
  request.current=generateUUID();
  setSource(p.origin_type==='ACCOUNT'&&p.origin_account_id?'account:'+p.origin_account_id:
            p.origin_type==='CARD'&&p.origin_card_id?'card:'+p.origin_card_id:'');
 };
 const submit=async(event:React.FormEvent)=>{
  event.preventDefault();if(!selected||busy||saving)return;
  const [kind,id]=source.split(':');
  if(!id||(kind!=='account'&&kind!=='card')){setError('Escolha uma conta ou cartão para realizar o pagamento.');return;}
  const amount=Number(value);if(!Number.isFinite(amount)||amount<=0||amount>selected.outstanding_balance){setError('Valor inválido.');return;}
  setBusy(true);setError('');
  try{
   await onPay({payableId:selected.id,accountId:kind==='account'?id:null,cardId:kind==='card'?id:null,amount,receipt,requestId:request.current});
   reset();
  }catch(reason){setError(reason instanceof Error?reason.message:'Falha ao registrar pagamento.');}
  finally{setBusy(false);}
 };
 return <div className="space-y-4">
  <header className="flex items-center justify-between"><div><h2 className="flex items-center gap-2 text-sm font-bold text-white"><HandCoins size={17} className="text-rose-300"/>Contas a pagar</h2><p className="text-xs text-slate-400">Dívidas, parcelas e obrigações pontuais</p></div>{showCreateButton && <button type="button" onClick={onCreate} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-rose-300"><Plus size={14}/>Nova</button>}</header>
  <div className="grid grid-cols-3 gap-2">
   {[['Passivo aberto',summary.total],['Vencido',summary.overdue],['Próx. 30 dias',summary.next30Days]].map(([name,amount])=><div key={String(name)} className="min-w-0 rounded-xl border border-slate-800 bg-slate-900 p-2.5"><span className="block text-[9px] text-slate-400">{name}</span><strong className="block truncate text-xs font-bold text-white">{formatMoney(Number(amount))}</strong></div>)}
  </div>
  {!payables.length?<p className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-xs text-slate-400">Nenhuma dívida contraída cadastrada.</p>:<div className="grid gap-2 sm:grid-cols-2">{payables.map(p=>{
   const status=derivePayableStatus(p);return <article key={p.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
    <div className="flex items-start justify-between gap-2">
     <div className="flex min-w-0 items-center gap-2">{p.creditor_type==='COMPANY'?<Building2 size={18} className="shrink-0 text-slate-300"/>:<UserRound size={18} className="shrink-0 text-slate-300"/>}<div className="min-w-0"><strong className="block truncate text-sm text-white">{p.creditor_name}</strong><span className="block truncate text-[11px] text-slate-400">{p.description}</span></div></div>
     <span className={'text-[10px] font-bold '+badge[status]}>{labels[status]}</span>
    </div>
    <div className="mt-3 flex items-end justify-between gap-2"><div><span className="block text-[10px] text-slate-400">Saldo devedor</span><strong className="text-base text-rose-300">{formatMoney(p.outstanding_balance)}</strong></div><div className="text-right text-[10px] text-slate-400">Total {formatMoney(p.total_amount)}<br/>Venc. {p.due_date||'não informado'}</div></div>
    {!['PAID','CANCELED'].includes(status)&&<button type="button" onClick={()=>start(p)} className="mt-3 w-full rounded-lg bg-emerald-600 py-2.5 text-xs font-bold text-white">Pagar dívida</button>}
   </article>;
  })}</div>}
  {selected&&<div role="dialog" aria-modal="true" aria-label="Pagar dívida" className="fixed inset-0 z-[2400] flex items-end justify-center bg-slate-950/85 sm:items-center sm:p-4">
   <form onSubmit={submit} className="w-full max-w-md space-y-3 rounded-t-3xl border border-slate-700 bg-slate-900 p-5 text-white sm:rounded-3xl">
    <header className="flex items-center justify-between"><div><span className="text-xs text-emerald-400">Registrar pagamento</span><h3 className="text-lg font-bold">{selected.creditor_name}</h3></div><button type="button" aria-label="Fechar" onClick={reset}><X size={18}/></button></header>
    <p className="text-xs text-slate-400">Saldo devedor: {formatMoney(selected.outstanding_balance)}</p>
    <label className="block text-xs text-slate-300">Valor pago<input required type="number" min="0.01" step="0.01" max={selected.outstanding_balance} value={value} onChange={e=>setValue(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-white"/></label>
    <label className="block text-xs text-slate-300">Origem do pagamento
     <select required value={source} onChange={e=>{setSource(e.target.value);request.current=generateUUID();}} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-white">
      <option value="">Selecione conta ou cartão</option>
      <optgroup label="Contas bancárias">{accounts.map(a=><option key={a.id} value={'account:'+a.id}>{a.nickname} · {formatMoney(a.balance)}</option>)}</optgroup>
      <optgroup label="Cartões de crédito">{cards.filter(c=>c.status==='ACTIVE').map(c=><option key={c.id} value={'card:'+c.id}>{c.nickname} · disponível {formatMoney(Math.max(0,Number(c.credit_limit)-Number(c.used_limit)))}</option>)}</optgroup>
     </select>
    </label>
    {source.startsWith('card:')&&<p className="rounded-lg border border-amber-600/30 bg-amber-950/20 p-3 text-xs text-amber-200">O pagamento será lançado na fatura do cartão. Ele representa crédito, não uma retirada da conta bancária.</p>}
    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-700 p-3 text-xs text-slate-300"><FileUp size={16}/><span className="flex-1 truncate">{receipt?.name||'Comprovante (opcional)'}</span><input type="file" accept=".pdf,image/jpeg,image/png,image/webp" className="sr-only" onChange={e=>setReceipt(e.target.files?.[0]||null)}/></label>
    {error&&<p role="alert" className="text-xs text-rose-300">{error}</p>}
    <button type="submit" disabled={busy||saving} className="w-full rounded-lg bg-emerald-600 p-3 text-sm font-bold text-white disabled:opacity-40">{busy||saving?'Registrando...':'Confirmar pagamento'}</button>
   </form>
  </div>}
 </div>;
};
