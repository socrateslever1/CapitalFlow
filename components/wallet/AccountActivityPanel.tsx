import React, { useMemo, useReducer, useRef, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, CreditCard, FileDown, FileUp, History, Plus, Search, Trash2, Pencil } from 'lucide-react';
import { PersonalWalletAccount, PersonalWalletExpense, PersonalWalletInvoicePayment, WalletAccountOperation, WalletStatementRow, personalWalletService } from '../../services/personalWallet.service';
import { formatMoney } from '../../utils/formatters';
import { generateUUID } from '../../utils/generators';
import { FinancialCalculatorInput } from '../forms/FinancialCalculatorInput';
import { parseWalletMoney } from '../../features/wallet/utils/parseWalletMoney';
import { WalletStatementImport } from './WalletStatementImport';
import { buildAccountStatementEntries } from './accountStatementDomain';
import { Modal, modalPrimaryActionClass } from '../ui/Modal';
import { SelectOptionList } from '../ui/SelectOptionList';
import { notifyFinancialDataChanged } from '../../utils/appSyncEvents';
import { accountCategoryReducer, initialAccountCategorySelection } from './accountCategorySelection';

type Props = {
  account: PersonalWalletAccount;
  accounts: PersonalWalletAccount[];
  operations: WalletAccountOperation[];
  statementRows: WalletStatementRow[];
  expenses: PersonalWalletExpense[];
  invoicePayments: PersonalWalletInvoicePayment[];
  onSaved: () => Promise<void>;
};
type Action = Exclude<WalletAccountOperation['operation_type'], 'EXTERNAL_TRANSFER' | 'CAPITAL_SYNC'>;
const labels: Record<Action,string> = {
  LOAN_DISBURSEMENT:'Empréstimo concedido', LOAN_REPAYMENT:'Parcela recebida',
  INCOME:'Receita', RECEIPT:'Recebimento', EXPENSE:'Despesa', PAYMENT:'Pagamento', TRANSFER:'Transferência',
};
const fmtDate=(date:string)=>new Date(date.slice(0,10)+'T12:00:00').toLocaleDateString('pt-BR');
const localToday=()=>{const value=new Date();value.setMinutes(value.getMinutes()-value.getTimezoneOffset());return value.toISOString().slice(0,10);};
const input='w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm text-white outline-none focus:border-emerald-500';
const commonCategories = ['Outros', 'Alimentação', 'Transporte', 'Moradia', 'Serviços', 'Compras', 'Saúde', 'Educação', 'Lazer', 'Recebimento', 'Salário'];
const tagClass = (tag: string) => {
  if (tag === 'Empréstimo concedido') return 'border-rose-700/60 bg-rose-950/30 text-rose-200';
  if (tag === 'Parcela recebida') return 'border-emerald-700/60 bg-emerald-950/30 text-emerald-200';
  if (tag === 'PIX/TED enviado') return 'border-amber-700/60 bg-amber-950/30 text-amber-200';
  if (tag === 'Pagamento de fatura') return 'border-violet-700/60 bg-violet-950/30 text-violet-200';
  if (tag === 'Transferência interna') return 'border-cyan-700/60 bg-cyan-950/30 text-cyan-200';
  if (tag === 'Importado de PDF') return 'border-slate-600 bg-slate-800 text-slate-300';
  return 'border-emerald-700/60 bg-emerald-950/30 text-emerald-200';
};
export const AccountActivityPanel: React.FC<Props> = ({account,accounts,operations,statementRows,expenses,invoicePayments,onSaved}) => {
  const [action,setAction]=useState<Action|null>(null);
  const [amount,setAmount]=useState('');
  const [description,setDescription]=useState('');
  const [categoryState,dispatchCategory]=useReducer(accountCategoryReducer,initialAccountCategorySelection);
  const category=categoryState.value;
  const [destination,setDestination]=useState('');
  const [date,setDate]=useState(localToday());
  const [importOpen,setImportOpen]=useState(false);
  const [saving,setSaving]=useState(false);
  const [voidingId,setVoidingId]=useState<string|null>(null);
  const [error,setError]=useState('');
  const [success,setSuccess]=useState('');
  const [search,setSearch]=useState('');
  const [openingAmount,setOpeningAmount]=useState('');
  const [openingDate,setOpeningDate]=useState(localToday());
  const [openingSaving,setOpeningSaving]=useState(false);
  const [openingModalOpen,setOpeningModalOpen]=useState(false);
  const [voidTarget,setVoidTarget]=useState<WalletAccountOperation|null>(null);
  const [editTarget,setEditTarget]=useState<WalletAccountOperation|null>(null);
  const [editAmount,setEditAmount]=useState('');
  const [editDescription,setEditDescription]=useState('');
  const [editCategory,setEditCategory]=useState('');
  const [editDate,setEditDate]=useState('');
  const [editSaving,setEditSaving]=useState(false);
  const editRequestRef=useRef({signature:'',id:generateUUID()});
  const transactionRef=useRef({signature:'',id:generateUUID()});
  const openingRef=useRef({signature:'',id:generateUUID()});
  const parsedAmount=(() => { try { return parseWalletMoney(amount); } catch { return NaN; } })();

  const entries=useMemo(()=>buildAccountStatementEntries({
    accountId:account.id,accounts,operations,expenses,invoicePayments,statementRows,
  }),[account.id,accounts,operations,expenses,invoicePayments,statementRows]);
  const filtered=entries.filter(x=>(x.label+' '+x.category+' '+x.tag).toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')));
  const statementTotal=filtered.reduce((total, entry)=>total+Number(entry.amount||0),0);
  const others=accounts.filter(a=>a.id!==account.id);
  const categoryOptions=[...new Set([...commonCategories,...operations.map(operation=>operation.category).filter(Boolean)])];
  const canInitializeOpening=Number(account.balance)===0&&!operations.some(op=>op.from_account_id===account.id||op.to_account_id===account.id);

  const clear=()=>{setAction(null);setAmount('');setDescription('');dispatchCategory({type:'reset'});setDestination('');setError('');};
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
      notifyFinancialDataChanged({ wallet: true, capital: Boolean(account.capital_source_id) });
      await onSaved();
      transactionRef.current={signature:'',id:generateUUID()};
      clear();
      setSuccess('Movimentação registrada no extrato e saldo atualizado.');
    }catch(err:any){setError(err?.message||'Não foi possível registrar a operação.');}
    finally{setSaving(false);}
  };
  const submitOpening=async(e:React.FormEvent)=>{
    e.preventDefault();
    let value=NaN;
    try { value=parseWalletMoney(openingAmount); } catch { /* mantém validação existente */ }
    if(openingSaving)return;
    if(!Number.isFinite(value)||value<=0||Math.abs(value*100-Math.round(value*100))>0.00001){setError('Informe um saldo inicial válido.');return;}
    const occurredAt=new Date(`${openingDate}T12:00:00`).toISOString();
    const signature=[account.id,value.toFixed(2),occurredAt].join(':');
    if(openingRef.current.signature!==signature)openingRef.current={signature,id:generateUUID()};
    setOpeningSaving(true);setError('');setSuccess('');
    try{
      await personalWalletService.initializeAccountOpening({accountId:account.id,amount:value,occurredAt,requestId:openingRef.current.id});
      notifyFinancialDataChanged({ wallet: true, capital: Boolean(account.capital_source_id) });
      await onSaved();
      openingRef.current={signature:'',id:generateUUID()};setOpeningAmount('');setOpeningModalOpen(false);
      setSuccess('Saldo inicial registrado de forma auditável.');
    }catch(err:any){setError(err?.message||'Não foi possível registrar o saldo inicial.');}
    finally{setOpeningSaving(false);}
  };
  const startEditing = (operation: WalletAccountOperation) => {
    setEditTarget(operation);
    setEditAmount(String(operation.amount));
    setEditDescription(operation.description);
    setEditCategory(operation.category || 'Outros');
    setEditDate(operation.operation_date);
    setError('');
    setSuccess('');
  };
  const saveEdited = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editTarget || editSaving) return;
    let value: number;
    try { value = parseWalletMoney(editAmount,'valor da movimentação'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Valor inválido.'); return; }
    if (value <= 0 || !editDescription.trim() || editDescription.trim().length > 240 ||
        editCategory.trim().length > 100 || !editDate) {
      setError('Confira o valor, descrição, categoria e data.');
      return;
    }
    const signature=[editTarget.id,value.toFixed(2),editDescription.trim(),editCategory.trim(),editDate].join('|');
    if (editRequestRef.current.signature !== signature)
      editRequestRef.current={signature,id:generateUUID()};
    setEditSaving(true); setError(''); setSuccess('');
    try {
      await personalWalletService.editManualAccountOperation({
        operationId: editTarget.id,amount:value,description:editDescription,
        category:editCategory,date:editDate,requestId:editRequestRef.current.id,
      });
      await onSaved();
      notifyFinancialDataChanged({wallet:true,capital:Boolean(account.capital_source_id)});
      setEditTarget(null);
      editRequestRef.current={signature:'',id:generateUUID()};
      setSuccess('Lançamento atualizado e saldo confirmado. A revisão ficou registrada para auditoria.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível atualizar o lançamento.');
    } finally { setEditSaving(false); }
  };
  const confirmVoidManual = async (operation: WalletAccountOperation) => {
    if (saving || voidingId) return;
    setVoidingId(operation.id);
    setError(''); setSuccess('');
    try {
      await personalWalletService.voidManualAccountOperation(operation.id);
      notifyFinancialDataChanged({ wallet: true, capital: Boolean(account.capital_source_id) });
      await onSaved();
      setVoidTarget(null);
      setSuccess('Lançamento excluído do extrato e saldo corrigido. Histórico de auditoria preservado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível excluir o lançamento.');
    } finally {
      setVoidingId(null);
    }
  };
  const canVoid = (entryId: string) => {
    const operation = operations.find(item => item.id === entryId);
    if (!operation || operation.voided_at || operation.voids_operation_id) return null;
    if (!['EXPENSE','INCOME','RECEIPT'].includes(operation.operation_type)) return null;
    if (operation.contract_id || operation.installment_id || operation.charge_id) return null;
    if (['Saldo inicial','Ajuste de Saldo','Estorno de lançamento'].includes(operation.category)) return null;
    return operation;
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
      {canInitializeOpening&&<div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan-800/50 bg-cyan-950/20 p-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-cyan-100">Saldo inicial auditável</h3>
          <p className="text-xs text-cyan-300/80">Disponível somente antes da primeira movimentação e sem alterar saldos existentes automaticamente.</p>
        </div>
        <button type="button" onClick={()=>{setError('');setSuccess('');setOpeningModalOpen(true);}} className="min-h-10 rounded-lg bg-cyan-700 px-4 py-2 text-xs font-bold text-white hover:bg-cyan-600">
          Saldo inicial
        </button>
      </div>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {([
          ['INCOME',ArrowDownLeft,'Receita'],
          ['RECEIPT',Plus,'Receber'],
          ['EXPENSE',ArrowUpRight,'Despesa'],
          ['PAYMENT',CreditCard,'Pagar'],
          ['TRANSFER',ArrowLeftRight,'Transferir'],
        ] as const).map(([value,Icon,label])=>(
          <button type="button" key={value} onClick={()=>{setAction(value);setError('');setSuccess('');}}
            className={`flex flex-col items-center justify-center gap-2 rounded-xl border px-2 py-4 text-xs font-semibold transition-colors ${action===value?'border-emerald-400 bg-emerald-900/30 text-white':'border-slate-700 bg-slate-950 text-slate-300 hover:border-emerald-500'}`}>
            <Icon size={20} className={value==='EXPENSE'||value==='PAYMENT'?'text-rose-400':'text-emerald-400'}/>{label}
          </button>
        ))}
      </div>
      {error && !action && !openingModalOpen && !voidTarget && <p role="alert" className="mt-3 rounded-lg border border-rose-700/50 p-3 text-xs text-rose-300">{error}</p>}
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
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3">
          <Search size={15} className="shrink-0 text-slate-500"/>
          <input aria-label="Buscar movimentações" className="w-full bg-transparent py-2 text-xs text-white outline-none" placeholder="Buscar descrição ou categoria" value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        <div className="flex shrink-0 items-center justify-between gap-3 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs sm:min-w-[220px]">
          <span className="text-slate-400">Resultado das movimentações{search ? ' filtradas' : ''}</span>
          <strong className={`whitespace-nowrap tabular-nums ${statementTotal>=0?'text-emerald-300':'text-rose-300'}`}>{statementTotal>=0?'+':'−'}{formatMoney(Math.abs(statementTotal))}</strong>
        </div>
      </div>
      {filtered.length===0?<p className="rounded-lg border border-dashed border-slate-700 p-4 text-xs text-slate-400">Ainda não há movimentações operacionais ou importadas nesta conta.</p>:
      <div className="divide-y divide-slate-800">{filtered.map(m=>(
        <div key={m.id} className="flex items-center justify-between gap-3 py-3">
          <div className="min-w-0"><p className="truncate text-xs font-semibold text-white">{m.label}</p><div className="mt-1 flex flex-wrap items-center gap-1.5"><span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${tagClass(m.tag)}`}>{m.tag}</span><span className="text-[11px] text-slate-400">{fmtDate(m.date)} · {m.category}</span></div></div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <strong className={`text-sm ${m.amount>=0?'text-emerald-300':'text-rose-300'}`}>{m.amount>=0?'+':'−'}{formatMoney(Math.abs(m.amount))}</strong>
            {canVoid(m.id) && <button type="button" disabled={!!voidingId || saving || editSaving}
              onClick={() => { const op=canVoid(m.id); if(op) startEditing(op); }}
              aria-label={'Editar lançamento ' + m.label}
              className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-[11px] text-blue-300 hover:bg-blue-950/40 disabled:opacity-40">
              <Pencil size={13}/>Editar
            </button>}
            {canVoid(m.id) && <button type="button" disabled={!!voidingId || saving || editSaving}
              onClick={() => { const operation=canVoid(m.id); if(operation){ setError(''); setSuccess(''); setVoidTarget(operation); } }}
              aria-label={'Excluir lançamento ' + m.label}
              className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-[11px] text-rose-300 hover:bg-rose-950/40 disabled:opacity-40">
              <Trash2 size={13}/>{voidingId===m.id?'Excluindo...':'Excluir'}
            </button>}
          </div>
        </div>
      ))}</div>}
    </div>
    {action && (
      <Modal
        variant="wallet"
        size="md"
        title={labels[action]}
        subtitle={account.nickname}
        busy={saving}
        onClose={clear}
        footer={
          <button
            type="submit"
            form="account-activity-form"
            disabled={saving}
            className={modalPrimaryActionClass}
          >
            {saving ? 'Registrando...' : 'Confirmar lançamento'}
          </button>
        }
      >
        <form id="account-activity-form" onSubmit={submit} className="space-y-3">
          {action==='TRANSFER' && <p className="text-xs text-amber-300">Transferência contábil entre suas contas cadastradas. Não envia PIX nem transfere valores no banco.</p>}
          {action==='PAYMENT' && <p className="text-xs text-amber-300">Para quitar fatura de cartão, utilize a opção Faturas. Registrar aqui também causaria débito em duplicidade.</p>}
          {action==='RECEIPT' && <p className="text-xs text-slate-400">Registra o recebimento informado. Não solicita dinheiro nem gera cobrança PIX.</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-slate-300">Valor (R$)
              <FinancialCalculatorInput required className={input} value={amount} onCommit={setAmount} fieldLabel="valor do lançamento" placeholder="0,00"/>
            </label>
            <label className="text-xs text-slate-300">Data
              <input required className={input} type="date" max={localToday()} value={date} onChange={e=>setDate(e.target.value)}/>
            </label>
            {action==='TRANSFER' && <div className="space-y-1 text-xs text-slate-300 sm:col-span-2">
              <span className="block">Conta de destino</span>
              <SelectOptionList
                ariaLabel="Conta de destino"
                value={destination}
                placeholder="Selecione outra conta"
                options={others.map((item) => ({
                  value: item.id,
                  label: item.nickname,
                  rightValue: formatMoney(item.balance),
                }))}
                onChange={setDestination}
              />
            </div>}
            <label className="text-xs text-slate-300 sm:col-span-2">Descrição
              <input required maxLength={240} className={input} value={description} onChange={e=>setDescription(e.target.value)} placeholder={action==='TRANSFER'?'Transferência entre contas':'Descreva a movimentação'}/>
            </label>
            <div className="space-y-1 text-xs text-slate-300 sm:col-span-2">
              <span className="block">Categoria</span>
              <SelectOptionList
                ariaLabel="Categoria"
                value={categoryState.customMode ? '__custom__' : category}
                placeholder="Selecione a categoria"
                options={[
                  ...categoryOptions.map((option) => ({ value: option, label: option })),
                  { value: '__custom__', label: 'Outra categoria...' },
                ]}
                onChange={(selected) => dispatchCategory({type:'select',value:selected})}
              />
            </div>
            {categoryState.customMode && <label className="text-xs text-slate-300 sm:col-span-2">Nome da categoria
              <input required maxLength={100} className={input} value={category} onChange={e=>dispatchCategory({type:'type',value:e.target.value})} placeholder="Digite a categoria"/>
            </label>}
          </div>
          {error && <p role="alert" className="rounded-lg border border-rose-700/50 p-3 text-xs text-rose-300">{error}</p>}
        </form>
      </Modal>
    )}
    {openingModalOpen && canInitializeOpening && (
      <Modal
        variant="wallet"
        compact
        title="Saldo inicial auditável"
        subtitle={account.nickname}
        busy={openingSaving}
        onClose={() => { if (!openingSaving) { setOpeningModalOpen(false); setError(''); } }}
        footer={
          <button
            type="submit"
            form="account-opening-form"
            disabled={openingSaving}
            className={modalPrimaryActionClass}
          >
            {openingSaving ? 'Registrando...' : 'Registrar saldo inicial'}
          </button>
        }
      >
        <form id="account-opening-form" onSubmit={submitOpening} className="space-y-3">
          <p className="text-xs text-cyan-200/80">Disponível somente antes da primeira movimentação e sem alterar saldos existentes automaticamente.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-slate-300">Valor (R$)<FinancialCalculatorInput required className={input} value={openingAmount} onCommit={setOpeningAmount} fieldLabel="saldo inicial" placeholder="0,00"/></label>
            <label className="text-xs text-slate-300">Data<input required type="date" max={localToday()} className={input} value={openingDate} onChange={e=>setOpeningDate(e.target.value)}/></label>
          </div>
          {error && <p role="alert" className="rounded-lg border border-rose-700/50 p-3 text-xs text-rose-300">{error}</p>}
        </form>
      </Modal>
    )}
    {editTarget && (
      <Modal variant="wallet" size="md" title="Editar movimentação" subtitle={account.nickname}
        busy={editSaving} onClose={() => { if (!editSaving) {setEditTarget(null);setError('');} }}
        footer={<button type="submit" form="wallet-edit-operation-form" disabled={editSaving}
          className={modalPrimaryActionClass}>{editSaving?'Salvando...':'Salvar alterações'}</button>}>
        <form id="wallet-edit-operation-form" onSubmit={saveEdited} className="space-y-3">
          <p className="text-xs text-slate-400">Somente lançamento manual. O banco ajustará o saldo pela diferença, preservando o histórico de revisões.</p>
          <label className="block space-y-1 text-xs text-slate-300">Valor (R$)
            <FinancialCalculatorInput required className={input} value={editAmount}
              onCommit={setEditAmount} fieldLabel="valor da movimentação" />
          </label>
          <label className="block space-y-1 text-xs text-slate-300">Descrição
            <input required maxLength={240} className={input} value={editDescription}
              onChange={e=>setEditDescription(e.target.value)}/>
          </label>
          <label className="block space-y-1 text-xs text-slate-300">Categoria
            <input maxLength={100} className={input} value={editCategory}
              onChange={e=>setEditCategory(e.target.value)}/>
          </label>
          <label className="block space-y-1 text-xs text-slate-300">Data
            <input required type="date" max={localToday()} className={input}
              value={editDate} onChange={e=>setEditDate(e.target.value)}/>
          </label>
          {error && <p role="alert" className="rounded-lg border border-rose-700/50 p-3 text-xs text-rose-300">{error}</p>}
        </form>
      </Modal>
    )}
    {voidTarget && (
      <Modal
        variant="wallet"
        compact
        title="Excluir lançamento"
        subtitle={account.nickname}
        busy={Boolean(voidingId)}
        onClose={() => { if (!voidingId) { setVoidTarget(null); setError(''); } }}
        footer={
          <button
            type="button"
            disabled={Boolean(voidingId)}
            onClick={() => { void confirmVoidManual(voidTarget); }}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-xs font-black uppercase text-white hover:bg-rose-500 focus-visible:outline-2 focus-visible:outline-rose-400 disabled:opacity-50"
          >
            {voidingId ? 'Excluindo...' : 'Excluir lançamento'}
          </button>
        }
      >
        <div className="space-y-3 text-xs text-slate-200">
          <p>
            Excluir o lançamento <strong className="text-white">{voidTarget.description}</strong> ({formatMoney(Number(voidTarget.amount))})?
          </p>
          <p className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-slate-400">
            O valor será devolvido ou debitado da conta automaticamente. A trilha de auditoria será preservada.
          </p>
          {error && <p role="alert" className="rounded-lg border border-rose-700/50 p-3 text-xs text-rose-300">{error}</p>}
        </div>
      </Modal>
    )}
    {importOpen && <WalletStatementImport kind="ACCOUNT" targetId={account.id} targetName={account.nickname}
      onClose={()=>setImportOpen(false)} onImported={onSaved}/>}
  </section>);
};
