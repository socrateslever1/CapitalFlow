import { PrivateMoney, useFinancialPrivacy } from '../../contexts/FinancialPrivacyContext';
import React,{useMemo,useState,useRef} from 'react';
import {Building2,CheckCircle2,FileUp,HandCoins,Plus,UserRound,X} from 'lucide-react';
import {PersonalWalletAccount,PersonalWalletCard,PersonalWalletPayable} from '../../services/personalWallet.service';
import {formatMoney} from '../../utils/formatters';
import {generateUUID} from '../../utils/generators';
import {derivePayableStatus,summarizePayables} from './payablesDomain';
import {WalletMetricStrip} from './WalletMetricStrip';
import {FinancialCalculatorInput} from '../forms/FinancialCalculatorInput';
import {parseWalletMoney} from '../../features/wallet/utils/parseWalletMoney';
type Props={
 payables:PersonalWalletPayable[];accounts:PersonalWalletAccount[];cards:PersonalWalletCard[];
 saving:boolean;onCreate?:()=>void;showCreateButton?:boolean;onPay:(input:{
 payableId:string;accountId:string|null;cardId:string|null;amount:number;receipt:File|null;requestId:string;
 split?: {sources:Array<{kind:'ACCOUNT'|'CARD';id:string;amount:number;interestRate:number}>};
 })=>Promise<void>;
};
type PaymentSource={kind:'ACCOUNT'|'CARD';id:string;amount:string;interestRate:string};
const labels={PENDING:'Pendente',PARTIAL:'Parcial',PAID:'Liquidado',OVERDUE:'Atrasado',CANCELED:'Cancelado'} as const;
const badge={PENDING:'text-amber-300',PARTIAL:'text-blue-300',PAID:'text-emerald-300',OVERDUE:'text-rose-300',CANCELED:'text-slate-400'} as const;
export const WalletPayablesPanel:React.FC<Props>=({payables,accounts,cards,saving,onCreate,showCreateButton=true,onPay})=>{
 const hideFinancialValues = useFinancialPrivacy();
 const summary=useMemo(()=>summarizePayables(payables),[payables]);
 const [listMode,setListMode]=useState<'open'|'history'>('open');
 const activePayables=useMemo(()=>payables.filter(p=>!['PAID','CANCELED'].includes(derivePayableStatus(p))),[payables]);
 const historicalPayables=useMemo(()=>payables.filter(p=>['PAID','CANCELED'].includes(derivePayableStatus(p)))
   .sort((a,b)=>String(b.paid_at||b.due_date||'').localeCompare(String(a.paid_at||a.due_date||''))),[payables]);
 const visiblePayables=listMode==='open'?activePayables:historicalPayables;
 const [selected,setSelected]=useState<PersonalWalletPayable|null>(null);
 const [value,setValue]=useState('');
 const [source,setSource]=useState('');
 const [accountSource,setAccountSource]=useState('');
 const [cardSource,setCardSource]=useState('');
 const [splitMode,setSplitMode]=useState(false);
 const [accountAmount,setAccountAmount]=useState('');
 const [cardAmount,setCardAmount]=useState('');
 const [cardInterestRate,setCardInterestRate]=useState('');
 const [paymentTotal,setPaymentTotal]=useState('');
 const [splitSources,setSplitSources]=useState<PaymentSource[]>([]);
 const [receipt,setReceipt]=useState<File|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const request=useRef(generateUUID());
 const activateSplit=(checked:boolean)=>{
  setSplitMode(checked);setError('');
  if (!checked || !selected) return;
  setPaymentTotal(Number(selected.outstanding_balance).toFixed(2));
  const preferred=accountSource.replace(/^account:/,'') || accounts[0]?.id || '';
  const account=accounts.find(item=>item.id===preferred);
  const accountPart=Math.min(Number(selected.outstanding_balance),Math.max(0,Number(account?.balance || 0)));
  const cardPart=Math.max(0,Number(selected.outstanding_balance)-accountPart);
  setSplitSources([{kind:'ACCOUNT',id:preferred,amount:accountPart.toFixed(2),interestRate:''},{kind:'CARD',id:cardSource.replace(/^card:/,'') || cards.find(c=>c.status==='ACTIVE')?.id || '',amount:cardPart.toFixed(2),interestRate:''}]);
 };
 const changeAccountPart=(next:string)=>{
  setAccountAmount(next);
  if (!selected) return;
  try { setCardAmount(Math.max(0,Number(selected.outstanding_balance)-parseWalletMoney(next || '0')).toFixed(2)); } catch { setCardAmount(''); }
 };
 const splitDistributed=splitSources.reduce((sum,line)=>{try{return sum+parseWalletMoney(line.amount||'0');}catch{return sum;}},0);
 const splitRemaining=Math.max(0,parseWalletMoney(paymentTotal||'0')-splitDistributed);
 const reset=()=>{setSelected(null);setValue('');setSource('');setAccountSource('');setCardSource('');setSplitMode(false);setAccountAmount('');setCardAmount('');setCardInterestRate('');setPaymentTotal('');setSplitSources([]);setReceipt(null);setError('');request.current=generateUUID();};
 const start=(p:PersonalWalletPayable)=>{
  setSelected(p);setValue(String(p.outstanding_balance));setPaymentTotal(String(p.outstanding_balance));setAccountAmount('');setCardAmount('');setCardInterestRate('');setAccountSource(p.origin_type==='ACCOUNT'&&p.origin_account_id?'account:'+p.origin_account_id:'');setCardSource(p.origin_type==='CARD'&&p.origin_card_id?'card:'+p.origin_card_id:'');setSplitSources([{kind:'ACCOUNT',id:p.origin_account_id||'',amount:'',interestRate:''},{kind:'CARD',id:p.origin_card_id||'',amount:'',interestRate:''}]);setSplitMode(false);setError('');
  request.current=generateUUID();
  setSource(p.origin_type==='ACCOUNT'&&p.origin_account_id?'account:'+p.origin_account_id:
            p.origin_type==='CARD'&&p.origin_card_id?'card:'+p.origin_card_id:'');
 };
 const submit=async(event:React.FormEvent)=>{
  event.preventDefault();if(!selected||busy||saving)return;
  const [kind,id]=source.split(':');
  if (!splitMode && (!id||(kind!=='account'&&kind!=='card'))){setError('Escolha uma conta ou cartão para realizar o pagamento.');return;}
  const amount=splitMode ? parseWalletMoney(paymentTotal || '0') : parseWalletMoney(value);
  if(!Number.isFinite(amount)||amount<=0||amount>selected.outstanding_balance){setError('Valor inválido.');return;}
  const split = splitMode ? splitSources.map(item => ({kind:item.kind,id:item.id,amount:parseWalletMoney(item.amount || '0'),interestRate:Number(String(item.interestRate || '0').replace(',','.'))})).filter(item => item.amount > 0) : undefined;
  if (splitMode && (!split?.length || Math.abs(split.reduce((sum,item)=>sum+item.amount,0)-amount)>0.009)) { setError('Distribua exatamente o total entre as fontes.'); return; }
  if (splitMode && split?.some(item=>!item.id || !Number.isFinite(item.interestRate) || item.interestRate<0 || item.interestRate>100)) { setError('Confira as fontes e as taxas informadas.'); return; }
  setBusy(true);setError('');
  try{
   await onPay({payableId:selected.id,accountId:splitMode ? null : (kind==='account'?id:null),cardId:splitMode ? null : (kind==='card'?id:null),amount,receipt,requestId:request.current,split: split ? {sources:split} : undefined});
   reset();
  }catch(reason){setError(reason instanceof Error?reason.message:'Falha ao registrar pagamento.');}
  finally{setBusy(false);}
 };
 return <div className="space-y-4">
  <header className="flex items-center justify-between"><div><h2 className="flex items-center gap-2 text-sm font-bold text-white"><HandCoins size={17} className="text-rose-300"/>Contas a pagar</h2><p className="text-xs text-slate-400">Dívidas, parcelas e obrigações pontuais</p></div>{showCreateButton && <button type="button" onClick={onCreate} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-rose-300"><Plus size={14}/>Nova</button>}</header>
  <WalletMetricStrip items={[
    {label:'Passivo aberto',value:formatMoney(summary.total)},
    {label:'Vencido',value:formatMoney(summary.overdue),tone:summary.overdue>0?'negative':undefined},
    {label:'Próximos 30 dias',value:formatMoney(summary.next30Days)},
  ]}/>
  <div role="group" aria-label="Situação das contas a pagar" className="flex gap-2">
    <button type="button" onClick={()=>setListMode('open')} aria-pressed={listMode==='open'}
      className={'min-h-10 rounded-lg border px-3 text-xs font-semibold '+(listMode==='open'?'border-blue-500 bg-blue-950/40 text-blue-200':'border-slate-700 text-slate-300')}>
      Em aberto ({activePayables.length})
    </button>
    <button type="button" onClick={()=>setListMode('history')} aria-pressed={listMode==='history'}
      className={'min-h-10 rounded-lg border px-3 text-xs font-semibold '+(listMode==='history'?'border-emerald-500 bg-emerald-950/30 text-emerald-200':'border-slate-700 text-slate-300')}>
      Histórico ({historicalPayables.length})
    </button>
  </div>
  {!visiblePayables.length?<p className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-xs text-slate-300">
    {listMode==='open'?'Nenhuma conta a pagar em aberto.':'Nenhum compromisso liquidado ou cancelado no histórico.'}
  </p>:<div className="grid gap-2 sm:grid-cols-2">{visiblePayables.map(p=>{
   const status=derivePayableStatus(p);return <article key={p.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
    <div className="flex items-start justify-between gap-2">
     <div className="flex min-w-0 items-center gap-2">{p.creditor_type==='COMPANY'?<Building2 size={18} className="shrink-0 text-slate-300"/>:<UserRound size={18} className="shrink-0 text-slate-300"/>}<div className="min-w-0"><strong className="block truncate text-sm text-white">{p.creditor_name}</strong><span className="block truncate text-xs text-slate-400">{p.description}</span></div></div>
     <span className={'text-[10px] font-bold '+badge[status]}>{labels[status]}</span>
    </div>
    <div className="mt-3 flex items-end justify-between gap-2"><div>
      <span className="block text-xs text-slate-400">{status==='PAID'?'Valor quitado':status==='CANCELED'?'Valor cancelado':'Saldo devedor'}</span>
      <strong className={'text-base '+(status==='PAID'?'text-emerald-300':status==='CANCELED'?'text-slate-400':'text-rose-300')}>
        <PrivateMoney value={formatMoney(status==='PAID'?p.total_amount:p.outstanding_balance)} />
      </strong>
    </div><div className="text-right text-xs text-slate-400">
      {status==='PAID' ? 'Quitado em '+String(p.paid_at||'').slice(0,10).split('-').reverse().join('/') : 'Total '+formatMoney(p.total_amount)}
      <br/>Venc. {p.due_date||'não informado'}
    </div></div>
    {listMode==='open'&&!['PAID','CANCELED'].includes(status)&&<button type="button" onClick={()=>start(p)} className="mt-3 w-full rounded-lg bg-emerald-600 py-2.5 text-xs font-bold text-white">Pagar dívida</button>}
   </article>;
  })}</div>}
  {selected&&<div role="dialog" aria-modal="true" aria-label="Pagar dívida" className="fixed inset-0 z-[2400] flex items-end justify-center bg-slate-950/85 sm:items-center sm:p-4">
   <form onSubmit={submit} className="max-h-[calc(100dvh-1rem)] w-full max-w-md space-y-3 overflow-y-auto overscroll-contain rounded-t-3xl border border-slate-700 bg-slate-900 p-5 pb-8 text-white sm:max-h-[calc(100dvh-2rem)] sm:rounded-3xl">
    <header className="flex items-center justify-between"><div><span className="text-xs text-emerald-400">Registrar pagamento</span><h3 className="text-lg font-bold">{selected.creditor_name}</h3></div><button type="button" aria-label="Fechar" onClick={reset}><X size={18}/></button></header>
    <p className="text-xs text-slate-400">Saldo devedor: <PrivateMoney value={formatMoney(selected.outstanding_balance)} /></p>
    <label className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 p-3 text-xs text-slate-200"><input type="checkbox" checked={splitMode} onChange={e=>activateSplit(e.target.checked)} className="h-4 w-4 accent-emerald-500"/> Dividir entre conta e cartão</label>
    {!splitMode ? <label className="block text-xs text-slate-300">Valor pago<FinancialCalculatorInput required value={value} onCommit={setValue} fieldLabel="valor pago" placeholder="0,00" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-white"/></label> : <div className="space-y-3">
      <div className="rounded-2xl border border-blue-500/30 bg-blue-950/25 p-4">
        <div className="flex items-end justify-between gap-3"><label className="min-w-0 flex-1 text-[11px] font-semibold uppercase tracking-wide text-blue-200">Total necessário<FinancialCalculatorInput required value={paymentTotal} onCommit={setPaymentTotal} fieldLabel="total necessário" placeholder="0,00" className="mt-1 w-full border-blue-500/40 bg-slate-950 p-2 text-lg font-bold text-white"/></label><div className="text-right text-xs text-slate-400"><span className="block">Distribuído</span><strong className="text-emerald-300"><PrivateMoney value={formatMoney(splitDistributed)} /></strong></div></div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800"><div className={`h-full rounded-full ${splitRemaining===0?'bg-emerald-400':'bg-amber-400'}`} style={{width:`${Math.min(100,splitDistributed/Math.max(0.01,parseWalletMoney(paymentTotal||'0'))*100)}%`}}/></div>
        <div className="mt-1 text-right text-[11px] text-slate-400">{splitRemaining>0?`Falta distribuir ${formatMoney(splitRemaining)}`:'Total distribuído'}</div>
      </div>
      <div className="space-y-2">
      {splitSources.map((line,index)=>{ const base=parseWalletMoney(line.amount||'0'); const rate=Number(String(line.interestRate||'0').replace(',','.')); const charge=line.kind==='CARD'&&Number.isFinite(rate)?base+base*rate/100:base; return <div key={index} className="min-w-0 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
        <div className="flex items-center gap-2"><select aria-label={`Tipo da fonte ${index+1}`} value={line.kind} onChange={e=>setSplitSources(rows=>rows.map((row,i)=>i===index?{...row,kind:e.target.value as 'ACCOUNT'|'CARD',id:'',interestRate:e.target.value==='CARD'?row.interestRate:''}:row))} className="w-28 shrink-0 rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-white"><option value="ACCOUNT">Conta</option><option value="CARD">Cartão</option></select><select aria-label={`Fonte ${index+1}`} value={line.id} onChange={e=>setSplitSources(rows=>rows.map((row,i)=>i===index?{...row,id:e.target.value}:row))} className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-white"><option value="">Escolha a fonte</option>{(line.kind==='ACCOUNT'?accounts:cards.filter(c=>c.status==='ACTIVE')).map(item=><option key={item.id} value={item.id}>{item.nickname}</option>)}</select>{splitSources.length>1&&<button type="button" onClick={()=>setSplitSources(rows=>rows.filter((_,i)=>i!==index))} className="shrink-0 p-1 text-xs font-semibold text-rose-300" aria-label={`Remover fonte ${index+1}`}>×</button>}</div>
        <div className="mt-2 grid min-w-0 gap-2 sm:grid-cols-2"><label className="min-w-0 text-[11px] text-slate-400">Valor<FinancialCalculatorInput value={line.amount} onCommit={next=>setSplitSources(rows=>rows.map((row,i)=>i===index?{...row,amount:next}:row))} fieldLabel="parte do pagamento" placeholder="0,00" className="mt-1 w-full min-w-0 rounded-lg border border-slate-700 bg-slate-950 p-2 text-white"/></label>{line.kind==='CARD'?<label className="min-w-0 text-[11px] text-slate-400">Juros (%)<input value={line.interestRate} onChange={e=>setSplitSources(rows=>rows.map((row,i)=>i===index?{...row,interestRate:e.target.value}:row))} placeholder="0,00" className="mt-1 w-full min-w-0 rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-white"/></label>:<div className="self-end rounded-lg border border-slate-800 bg-slate-900 p-2 text-xs text-slate-500">Sem juros</div>}</div>
        {line.kind==='CARD'&&<div className="mt-2 flex items-center justify-between rounded-lg bg-amber-950/30 px-2 py-1.5 text-xs text-amber-200"><span>Total na fatura</span><strong><PrivateMoney value={formatMoney(charge)} /></strong></div>}
      </div>; })}
      </div>
      {splitSources.length<4&&<button type="button" onClick={()=>setSplitSources(rows=>[...rows,{kind:'ACCOUNT',id:'',amount:'',interestRate:''}])} className="w-full rounded-lg border border-dashed border-slate-700 p-2 text-xs font-semibold text-blue-300">+ Adicionar outra conta/cartão</button>}
    </div>}
    {!splitMode && <label className="block text-xs text-slate-300">Origem do pagamento
     <select required={(!splitMode || parseWalletMoney(accountAmount || '0') > 0)} value={splitMode ? accountSource : source} onChange={e=>{splitMode ? setAccountSource(e.target.value) : setSource(e.target.value);request.current=generateUUID();}} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-white">
      <option value="">Selecione conta ou cartão</option>
      <optgroup label="Contas bancárias">{accounts.map(a=><option key={a.id} value={'account:'+a.id}>{a.nickname} · {hideFinancialValues ? 'R$ ••••' : formatMoney(a.balance)}</option>)}</optgroup>
      {!splitMode && <optgroup label="Cartões de crédito">{cards.filter(c=>c.status==='ACTIVE').map(c=><option key={c.id} value={'card:'+c.id}>{c.nickname} · disponível {hideFinancialValues ? 'R$ ••••' : formatMoney(Math.max(0,Number(c.credit_limit)-Number(c.used_limit)))}</option>)}</optgroup>}
     </select>
    </label>}
    {!splitMode && source.startsWith('card:')&&<p className="rounded-lg border border-amber-600/30 bg-amber-950/20 p-3 text-xs text-amber-200">A parte do pagamento será lançada na fatura do cartão. Ela representa crédito, não uma retirada da conta bancária.</p>}
    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-700 p-3 text-xs text-slate-300"><FileUp size={16}/><span className="flex-1 truncate">{receipt?.name||'Comprovante (opcional)'}</span><input type="file" accept=".pdf,image/jpeg,image/png,image/webp" className="sr-only" onChange={e=>setReceipt(e.target.files?.[0]||null)}/></label>
    {error&&<p role="alert" className="text-xs text-rose-300">{error}</p>}
    <button type="submit" disabled={busy||saving} className="w-full rounded-lg bg-emerald-600 p-3 text-sm font-bold text-white disabled:opacity-40">{busy||saving?'Registrando...':'Confirmar pagamento'}</button>
   </form>
  </div>}
 </div>;
};
