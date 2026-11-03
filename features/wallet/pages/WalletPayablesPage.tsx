import React, {useCallback,useEffect,useMemo,useState} from 'react';
import {ChevronRight,ClipboardList,Plus,RefreshCw} from 'lucide-react';
import {useSearchParams} from 'react-router-dom';
import type {UserProfile} from '../../../types';
import {formatMoney} from '../../../utils/formatters';
import {BankLogo} from '../../../components/wallet/BankLogo';
import {WalletPageFrame} from '../components/WalletPageFrame';
import {walletRepository,type WalletOverviewSnapshot} from '../services/walletRepository';
import {deriveWalletCommitments,getCommitmentsWithinDays,type WalletCommitment} from '../domain/walletCommitments';

const WalletPayablesManagement=React.lazy(()=>import('./WalletPayablesManagement')
  .then(module=>({default:module.WalletPayablesManagement})));

type Props={activeUser?:UserProfile|null;onNavigate:(path:string)=>void};
const todayInManaus=()=>{
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Manaus',year:'numeric',month:'2-digit',day:'2-digit'})
    .formatToParts(new Date());
  const values=Object.fromEntries(parts.map(part=>[part.type,part.value]));
  return values.year+'-'+values.month+'-'+values.day;
};
const dateLabel=(iso:string)=>iso.slice(8,10)+'/'+iso.slice(5,7)+'/'+iso.slice(0,4);
const labelFor=(item:WalletCommitment)=>item.kind==='CARD_INVOICE'?'Cartão':
  item.kind==='RECURRING'?'Recorrente':item.kind==='DEBT'?'Dívida':'Conta';
const statusLabel=(item:WalletCommitment)=>item.status==='PARTIAL'?'Parcial':
  item.status==='OVERDUE'?'Vencido':'A vencer';

export const WalletPayablesPage:React.FC<Props>=({activeUser,onNavigate})=>{
  const [searchParams,setSearchParams]=useSearchParams();
  const [managing,setManaging]=useState(()=>searchParams.get('gerenciar')==='1' ||
    searchParams.get('acao')==='novo-compromisso');
  const [snapshot,setSnapshot]=useState<WalletOverviewSnapshot|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [showAll,setShowAll]=useState(searchParams.get('filtro')!=='proximos');
  const [today,setToday]=useState(todayInManaus);
  const load=useCallback(async(force=false)=>{
    const result=await walletRepository.loadOverview({force});
    setSnapshot(result);setToday(todayInManaus());setError('');
  },[]);
  useEffect(()=>{
    let alive=true;
    walletRepository.loadOverview().then(result=>{
      if(alive){setSnapshot(result);setToday(todayInManaus());}
    }).catch(cause=>{
      if(alive)setError(cause instanceof Error?cause.message:'Falha ao carregar os compromissos.');
    }).finally(()=>{if(alive)setLoading(false);});
    const update=()=>{void walletRepository.loadOverview({force:true})
      .then(data=>{if(alive){setSnapshot(data);setToday(todayInManaus());setError('');}})
      .catch(()=>{if(alive)setError('Falha na atualização. Atualize a Carteira.');});};
    window.addEventListener('capitalflow:wallet-updated',update);
    return()=>{alive=false;window.removeEventListener('capitalflow:wallet-updated',update);};
  },[]);

  useEffect(()=>{
    if(searchParams.get('gerenciar')==='1' || searchParams.get('acao')==='novo-compromisso')setManaging(true);
    if(searchParams.get('filtro')==='proximos')setShowAll(false);
  },[searchParams]);

  const records=useMemo(()=>snapshot?deriveWalletCommitments(snapshot,today):[],[snapshot,today]);
  const upcoming=useMemo(()=>getCommitmentsWithinDays(records,today,45),[records,today]);
  const displayed=showAll?records:upcoming;
  const overdue=upcoming.filter(item=>item.dueDate<today).length;

  const goDetails=(item:WalletCommitment,pay=false)=>{
    if(item.kind==='CARD_INVOICE'){
      onNavigate('cartoes?card='+encodeURIComponent(item.cardId || '')+'&fatura='+encodeURIComponent(item.dueMonth || '')+
        (pay?'&acao=pagar-fatura':''));
    }else {
      setManaging(true);
      const params=new URLSearchParams(searchParams);
      params.set('gerenciar','1');
      if(pay && item.payableId)params.set('pagar',item.payableId);
      else params.delete('pagar');
      setSearchParams(params,{replace:true});
    }
  };
  const manage=()=>{
    setManaging(true);
    const next=new URLSearchParams(searchParams);
    next.set('gerenciar','1');
    setSearchParams(next,{replace:true});
  };
  const back=()=>{
    setManaging(false);
    const next=new URLSearchParams(searchParams);
    next.delete('gerenciar');next.delete('acao');next.delete('pagar');
    setSearchParams(next,{replace:true});
    void load(true).catch(()=>setError('Falha ao atualizar compromissos.'));
  };
  if(managing)return <>
    <button type="button" onClick={back} className="mb-3 min-h-11 rounded-xl border border-slate-700 px-4 text-sm text-blue-200">
      ← Voltar aos compromissos
    </button>
    <React.Suspense fallback={<div className="animate-pulse rounded-xl bg-slate-900 p-6 text-sm text-slate-300">Abrindo gerenciamento…</div>}>
      <WalletPayablesManagement activeUser={activeUser} onNavigate={onNavigate}/>
    </React.Suspense>
  </>;

  return <WalletPageFrame title="Compromissos" description="Faturas, contas e dívidas em um só lugar."
    loading={loading} error={error} onRefresh={()=>{void load(true).catch(cause=>setError(cause instanceof Error?cause.message:'Falha ao atualizar.'));}}
    actions={<button type="button" onClick={manage}
      className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
      <Plus size={17}/> Novo / gerenciar
    </button>}>
    {snapshot&&<section aria-label="Lista de compromissos" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900 px-3 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">{upcoming.length} compromisso(s) até 45 dias</p>
          <p className="text-xs text-slate-400">{overdue} vencido(s) · {records.length} pendente(s) no total</p>
        </div>
        <button type="button" onClick={()=>setShowAll(value=>!value)}
          className="min-h-10 rounded-lg border border-slate-700 px-3 text-xs font-semibold text-blue-200">
          {showAll?'Até 45 dias':'Ver todos'}
        </button>
      </div>
      {displayed.length===0?<div className="rounded-xl border border-dashed border-slate-700 bg-slate-900 p-6 text-center text-sm text-slate-300">
        {records.length?'Nenhum vencimento neste período. Selecione Ver todos.':'Nenhum compromisso financeiro pendente.'}
      </div>:<div className="divide-y divide-slate-800 overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
        {displayed.map(item=><article key={item.id} className="flex min-w-0 flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-slate-950">
              {item.kind==='CARD_INVOICE'?<BankLogo name={item.institution} alternateName={item.title} size="sm"/>:<ClipboardList size={19} className="text-slate-300"/>}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{item.title}</p>
              <p className="truncate text-xs text-slate-400">{labelFor(item)} · {item.institution}</p>
              <p className="text-xs text-slate-300">{dateLabel(item.dueDate)} · <span className={
                item.status==='OVERDUE'?'text-rose-300':item.status==='PARTIAL'?'text-amber-300':'text-slate-300'
              }>{statusLabel(item)}</span></p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
            <strong className="text-base font-bold tabular-nums text-white">{formatMoney(item.amount)}</strong>
            <div className="flex gap-2">
              <button type="button" onClick={()=>goDetails(item)}
                className="min-h-11 rounded-lg border border-slate-700 px-3 text-xs font-semibold text-slate-200">
                Ver <ChevronRight size={14} className="inline"/>
              </button>
              <button type="button" onClick={()=>goDetails(item,true)}
                className="min-h-11 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white">
                Pagar
              </button>
            </div>
          </div>
        </article>)}
      </div>}
      <button type="button" onClick={()=>{void load(true).catch(cause=>setError(cause instanceof Error?cause.message:'Falha ao atualizar.'));}}
        className="flex min-h-11 items-center gap-2 text-xs text-blue-200"><RefreshCw size={15}/>Atualizar</button>
    </section>}
  </WalletPageFrame>;
};
