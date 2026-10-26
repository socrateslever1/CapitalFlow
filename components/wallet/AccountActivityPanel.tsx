import React, { useMemo, useRef, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, CreditCard, FileDown, FileUp, History, Plus, Search } from 'lucide-react';
import { PersonalWalletAccount, PersonalWalletExpense, PersonalWalletInvoicePayment, WalletAccountOperation, WalletStatementRow, personalWalletService } from '../../services/personalWallet.service';
import { formatMoney } from '../../utils/formatters';
import { generateUUID } from '../../utils/generators';
import { WalletStatementImport } from './WalletStatementImport';
import { buildAccountStatementEntries } from './accountStatementDomain';

type Props = {
  account: PersonalWalletAccount;
  accounts: PersonalWalletAccount[];
  operations: WalletAccountOperation[];
  statementRows: WalletStatementRow[];
  expenses: PersonalWalletExpense[];
  invoicePayments: PersonalWalletInvoicePayment[];
  onSaved: () => Promise<void>;
};
type Action = Exclude<WalletAccountOperation['operation_type'], 'EXTERNAL_TRANSFER'>;
const labels: Record<Action,string> = {
  INCOME:'Receita', RECEIPT:'Recebimento', EXPENSE:'Despesa', PAYMENT:'Pagamento', TRANSFER:'Transferência',
};
const fmtDate=(date:string)=>new Date(date.slice(0,10)+'T12:00:00').toLocaleDateString('pt-BR');
const localToday=()=>{const value=new Date();value.setMinutes(value.getMinutes()-value.getTimezoneOffset());return value.toISOString().slice(0,10);};
const input='w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm text-white outline-none focus:border-emerald-500';
export const AccountActivityPanel: React.FC<Props> = ({account,accounts,operations,statementRows,expenses,invoicePayments,onSaved}) => {
  const [action,setAction]=useState<Action|null>(null);
  const [amount,setAmount]=useState('');
  const [description,setDescription]=useState('');
  const [category,setCategory]=useState('Outros');
  const [destination,setDestination]=useState('');
  const [date,setDate]=useState(localToday());
  const [importOpen,setImportOpen]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [success,setSuccess]=useState('');
  const [search,setSearch]=useState('');
  const [openingAmount,setOpeningAmount]=useState('');
  const [openingDate,setOpeningDate]=useState(localToday());
  const [openingSaving,setOpeningSaving]=useState(false);
  const transactionRef=useRef({signature:'',id:generateUUID()});
  const openingRef=useRef({signature:'',id:generateUUID()});
  const parsedAmount=Number(amount.trim().replace(',','.'));

  const entries=useMemo(()=>buildAccountStatementEntries({
    accountId:account.id,accounts,operations,expenses,invoicePayments,statementRows,
  }),[account.id,accounts,operations,expenses,invoicePayments,statementRows]);
  const filtered=entries.filter(x=>(x.label+' '+x.category+' '+x.tag).toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')));
  const others=accounts.filter(a=>a.id!==account.id);
  const canInitializeOpening=Number(account.balance)===0&&!operations.some(op=>op.from_account_id===account.id||op.to_account_id===account.id);

  const clear=()=>{setAction(null);setAmount('');setDescription('');setCategory('Outros');setDestination('');setError('');};
  const submit=async(e:React.FormEvent)=>{
    e.preventDefault();
    if(!action||saving)return;
    if(!Number.isFinite(parsedAmount)||parsedAmount<=0||Math.abs(parsedAmount*100-Math.round(parsedAmount*100))>0.00001){setError('Valor inválido.');return;}
    const toAccount=(action==='INCOME'||action==='RECEIPT')?account.id:action==='TRANSFER'?destination:null;
    const fromAccount=(action==='EXPENSE'||action==='PAYMENT'||action==='TRANSFER')?account.id:null;
    if(action==='TRANSFER'&&!destination){setError('Selecione uma conta de destino.');return;}
    const signature=[action,fromAccount,toAccount,parsedAmount.toFixed(2),description,date,category].join(':');
    if(transactionRef.current.signature!==signature) transactionRef.current={signature,id:generateUUID()};
    setSaving(true);setError('');setSuccess('');
    try{
      await personalWalletService.recordAccountOperation({
        type:action,fromAccountId:fromAccount,toAccountId:toAccount,
        amount:parsedAmount,description,category,date,requestId:transactionRef.current.id,
      });
      await onSaved();
      transactionRef.current={signature:'',id:generateUUID()};
      clear();
      setSuccess('Movimentação registrada no extrato e saldo atualizado.');
    }catch(err:any){setError(err?.message||'Não foi possível registrar a operação.');}
    finally{setSaving(false);}
  };
  const submitOpening=async(e:React.FormEvent)=>{
    e.preventDefault();
    const value=Number(openingAmount.trim().replace(',','.'));
    if(openingSaving)return;
    if(!Number.isFinite(value)||value<=0||Math.abs(value*100-Math.round(value*100))>0.00001){setError('Informe um saldo inicial válido.');return;}
    const occurredAt=new Date(`${openingDate}T12:00:00`).toISOString();
    const signature=[account.id,value.toFixed(2),occurredAt].join(':');
    if(openingRef.current.signature!==signature)openingRef.current={signature,id:generateUUID()};
    setOpeningSaving(true);setError('');setSuccess('');
    try{
      await personalWalletService.initializeAccountOpening({accountId:account.id,amount:value,occurredAt,requestId:openingRef.current.id});
      await onSaved();
      openingRef.current={signature:'',id:generateUUID()};setOpeningAmount('');
      setSuccess('Saldo inicial registrado de forma auditável.');
    }catch(err:any){setError(err?.message||'Não foi possível registrar o saldo inicial.');}
    finally{setOpeningSaving(false);}
  };
  const exportCsv=()=>{
    const records=[['Data','Movimentação','Categoria','Valor BRL'],...filtered.map(x=>[fmtDate(x.date),x.label,x.category,x.amount.toFixed(2)])];
    const csv='\uFEFF'+records.map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(';')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    const anchor=document.createElement('a');anchor.href=url;anchor.download=`extrato-${account.nickname.replace(/[^a-z0-9-]/gi,'_')}.csv`;anchor.click();URL.revokeObjectURL(url);
  };

  return (<section className="space-y-4">
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div><h2 className="text-base font-bold text-white">Movimentar conta</h2><p className="text-xs text-slate-400">Gerencie seus registros financeiros sem sair da carteira.</p></div>
        <button type="button" onClick={()=>setImportOpen(true)} className="flex items-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-200">
          <FileUp size={15}/> Importar PDF
        </button>
      </div>
      {canInitializeOpening&&<form onSubmit={submitOpening} className="mb-4 grid gap-3 rounded-xl border border-cyan-800/50 bg-cyan-950/20 p-4 sm:grid-cols-3">
        <div className="sm:col-span-3"><h3 className="text-sm font-bold text-cyan-100">Saldo inicial auditável</h3><p className="text-xs text-cyan-300/80">Disponível somente antes da primeira movimentação e sem alterar saldos existentes automaticamente.</p></div>
        <label className="text-xs text-slate-300">Valor (R$)<input required inputMode="decimal" className={input} value={openingAmount} onChange={e=>setOpeningAmount(e.target.value)} placeholder="0,00"/></label>
        <label className="text-xs text-slate-300">Data<input required type="date" max={localToday()} className={input} value={openingDate} onChange={e=>setOpeningDate(e.target.value)}/></label>
        <button type="submit" disabled={openingSaving} className="self-end rounded-lg bg-cyan-700 px-4 py-3 text-xs font-bold text-white disabled:opacity-50">{openingSaving?'Registrando...':'Registrar saldo inicial'}</button>
      </form>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {([
          ['INCOME',ArrowDownLeft,'Receita'],
          ['RECEIPT',Plus,'Receber'],
          ['EXPENSE',ArrowUpRight,'Despesa'],
          ['PAYMENT',CreditCard,'Pagar'],
          ['TRANSFER',ArrowLeftRight,'Transferir'],
        ] as const).map(([value,Icon,label])=>(
          <button type="button" key={value} onClick={()=>{setAction(action===value?null:value);setError('');setSuccess('');}}
            className={`flex flex-col items-center justify-center gap-2 rounded-xl border px-2 py-4 text-xs font-semibold transition-colors ${action===value?'border-emerald-400 bg-emerald-900/30 text-white':'border-slate-700 bg-slate-950 text-slate-300 hover:border-emerald-500'}`}>
            <Icon size={20} className={value==='EXPENSE'||value==='PAYMENT'?'text-rose-400':'text-emerald-400'}/>{label}
          </button>
        ))}
      </div>
      {action && <form onSubmit={submit} className="mt-4 space-y-3 rounded-xl border border-slate-700 bg-slate-950/70 p-4">
        <div className="flex items-center justify-between"><h3 className="text-sm font-bold text-white">{labels[action]}</h3>
          <button type="button" onClick={clear} className="text-xs text-slate-400">Cancelar</button></div>
        {action==='TRANSFER' && <p className="text-xs text-amber-300">Transferência contábil entre suas contas cadastradas. Não envia PIX nem transfere valores no banco.</p>}
        {action==='PAYMENT' && <p className="text-xs text-amber-300">Para quitar fatura de cartão, utilize a opção Faturas. Registrar aqui também causaria débito em duplicidade.</p>}
        {action==='RECEIPT' && <p className="text-xs text-slate-400">Registra o recebimento informado. Não solicita dinheiro nem gera cobrança PIX.</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-slate-300">Valor (R$)
            <input required className={input} inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0,00"/>
          </label>
          <label className="text-xs text-slate-300">Data
            <input required className={input} type="date" max={localToday()} value={date} onChange={e=>setDate(e.target.value)}/>
          </label>
          {action==='TRANSFER' && <label className="text-xs text-slate-300 sm:col-span-2">Conta de destino
            <select required className={input} value={destination} onChange={e=>setDestination(e.target.value)}>
              <option value="">Selecione outra conta</option>
              {others.map(x=><option key={x.id} value={x.id}>{x.nickname} — {formatMoney(x.balance)}</option>)}
            </select>
          </label>}
          <label className="text-xs text-slate-300 sm:col-span-2">Descrição
            <input required maxLength={240} className={input} value={description} onChange={e=>setDescription(e.target.value)} placeholder={action==='TRANSFER'?'Transferência entre contas':'Descreva a movimentação'}/>
          </label>
          <label className="text-xs text-slate-300 sm:col-span-2">Categoria
            <input maxLength={100} className={input} value={category} onChange={e=>setCategory(e.target.value)}/>
          </label>
        </div>
        <button type="submit" disabled={saving} className="rounded-lg bg-emerald-600 px-5 py-3 text-xs font-bold text-white disabled:opacity-50">
          {saving?'Registrando...':'Confirmar lançamento'}
        </button>
      </form>}
      {error && <p role="alert" className="mt-3 rounded-lg border border-rose-700/50 p-3 text-xs text-rose-300">{error}</p>}
      {success && <p role="status" className="mt-3 rounded-lg border border-emerald-700/50 p-3 text-xs text-emerald-300">{success}</p>}
    </div>

    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="flex items-center gap-2 text-base font-bold text-white"><History size={19} className="text-cyan-400"/> Extrato da conta</h2>
          <p className="text-xs text-slate-400">Movimentações registradas neste módulo: {entries.length}</p></div>
        <button type="button" onClick={exportCsv} disabled={!filtered.length} className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200 disabled:opacity-40">
          <FileDown size={14}/> Exportar CSV
        </button>
      </div>
      <div className="mb-3 flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3">
        <Search size={16} className="text-slate-500"/>
        <input aria-label="Buscar movimentações" className="w-full bg-transparent py-3 text-xs text-white outline-none" placeholder="Buscar descrição ou categoria" value={search} onChange={e=>setSearch(e.target.value)}/>
      </div>
      {filtered.length===0?<p className="rounded-lg border border-dashed border-slate-700 p-4 text-xs text-slate-400">Ainda não há movimentações operacionais ou importadas nesta conta.</p>:
      <div className="divide-y divide-slate-800">{filtered.map(m=>(
        <div key={m.id} className="flex items-center justify-between gap-3 py-3">
          <div className="min-w-0"><p className="truncate text-xs font-semibold text-white">{m.label}</p><div className="mt-1 flex flex-wrap items-center gap-1.5"><span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${m.tag==='PIX/TED enviado'?'border-amber-700/60 bg-amber-950/30 text-amber-200':m.tag==='Pagamento de fatura'?'border-violet-700/60 bg-violet-950/30 text-violet-200':m.tag==='Transferência interna'?'border-cyan-700/60 bg-cyan-950/30 text-cyan-200':m.tag==='Importado de PDF'?'border-slate-600 bg-slate-800 text-slate-300':'border-emerald-700/60 bg-emerald-950/30 text-emerald-200'}`}>{m.tag}</span><span className="text-[11px] text-slate-400">{fmtDate(m.date)} · {m.category}</span></div></div>
          <strong className={`text-sm ${m.amount>=0?'text-emerald-300':'text-rose-300'}`}>{m.amount>=0?'+':'−'}{formatMoney(Math.abs(m.amount))}</strong>
        </div>
      ))}</div>}
    </div>
    {importOpen && <WalletStatementImport kind="ACCOUNT" targetId={account.id} targetName={account.nickname}
      onClose={()=>setImportOpen(false)} onImported={onSaved}/>}
  </section>);
};
