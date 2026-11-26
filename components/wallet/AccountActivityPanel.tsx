import React, { useMemo, useReducer, useRef, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, CreditCard, FileDown, FileUp, History, Plus, Search, Trash2, Pencil, Wallet, X } from 'lucide-react';
import { PersonalWalletAccount, PersonalWalletExpense, PersonalWalletInvoicePayment, WalletAccountOperation, WalletStatementRow, personalWalletService } from '../../services/personalWallet.service';
import { formatMoney } from '../../utils/formatters';
import { PrivateMoney } from '../../contexts/FinancialPrivacyContext';
import { getAccountMovementPreview, getAccountTransferPreview } from '../../features/wallet/domain/accountTransferPreview';
import { generateUUID } from '../../utils/generators';
import { FinancialCalculatorInput } from '../forms/FinancialCalculatorInput';
import { parseWalletMoney } from '../../features/wallet/utils/parseWalletMoney';
import { WalletStatementImport } from './WalletStatementImport';
import { buildAccountStatementEntries } from './accountStatementDomain';
import { Modal, modalPrimaryActionClass } from '../ui/Modal';
import { SelectOptionList } from '../ui/SelectOptionList';
import { BankLogo } from './BankLogo';
import { notifyFinancialDataChanged } from '../../utils/appSyncEvents';
import { accountCategoryReducer, initialAccountCategorySelection } from './accountCategorySelection';
import { createFinancialSearchMatcher } from '../../features/wallet/utils/financialSearch';
import { suggestWalletAccountCategory } from '../../features/wallet/domain/suggestWalletAccountCategory';
import { withWalletOperationDeadline, WalletOperationTimeoutError } from '../../features/wallet/utils/operationConfirmation';

type Props = {
  account: PersonalWalletAccount;
  accounts: PersonalWalletAccount[];
  operations: WalletAccountOperation[];
  statementRows: WalletStatementRow[];
  cardFundedLoanIds?: readonly string[];
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
const tagClass = (tag: string, amount = 0) => {
  if (tag === 'Empréstimo concedido') return 'border-rose-700/50 bg-rose-950/30 text-rose-200';
  if (tag === 'Parcela recebida') return 'border-emerald-700/50 bg-emerald-950/30 text-emerald-200';
  if (tag === 'PIX/TED enviado') return 'border-amber-700/50 bg-amber-950/30 text-amber-200';
  if (tag === 'Pagamento de fatura') return 'border-violet-700/50 bg-violet-950/30 text-violet-200';
  if (tag === 'Transferência interna') return 'border-cyan-700/50 bg-cyan-950/30 text-cyan-200';
  if (tag === 'Importado de PDF') return 'border-slate-700 bg-slate-800/80 text-slate-300';
  if (tag === 'Movimentação') return 'border-slate-700/80 bg-slate-800/60 text-slate-300';
  return amount < 0
    ? 'border-rose-700/40 bg-rose-950/25 text-rose-200'
    : 'border-emerald-700/50 bg-emerald-950/30 text-emerald-200';
};
const AccountOptionIcon: React.FC<{ account: PersonalWalletAccount }> = ({ account }) =>
  account.account_type === 'CASH'
    ? <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-700/60 bg-slate-800">
        <Wallet size={17} className="text-amber-300" />
      </span>
    : <BankLogo name={account.bank_name || account.institution_key} alternateName={account.nickname} customImage={account.image_url} size="sm" />;

export const AccountActivityPanel: React.FC<Props> = ({account,accounts,operations,statementRows,expenses,invoicePayments,cardFundedLoanIds,onSaved}) => {
  const [action,setAction]=useState<Action|null>(null);
  const [amount,setAmount]=useState('');
  const [operationDraft,setOperationDraft]=useState<string|null>(null);
  const [description,setDescription]=useState('');
  const [categoryState,dispatchCategory]=useReducer(accountCategoryReducer,initialAccountCategorySelection);
  const [categoryManuallySelected,setCategoryManuallySelected]=useState(false);
  const suggestedCategory=suggestWalletAccountCategory(description,categoryManuallySelected);
  const category=suggestedCategory??categoryState.value;
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
  const deleteRequestRef=useRef<{id:string;request:string}|null>(null);
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
  const previewAmount=(() => {
    if (operationDraft===null) return parsedAmount;
    try { return parseWalletMoney(operationDraft); } catch { return NaN; }
  })();
  const isDebit=action==='EXPENSE'||action==='PAYMENT'||action==='TRANSFER';
  const isCredit=action==='INCOME'||action==='RECEIPT';
  const balancePreview=getAccountMovementPreview(Number(account.balance),previewAmount,isCredit?'CREDIT':'DEBIT');
  const amountEntered=Boolean((operationDraft??amount).trim());

  const entries=useMemo(()=>buildAccountStatementEntries({
    accountId:account.id,accounts,operations,expenses,invoicePayments,statementRows,cardFundedLoanIds,
  }),[account.id,accounts,operations,expenses,invoicePayments,statementRows,cardFundedLoanIds]);
  const searchMatches=useMemo(()=>createFinancialSearchMatcher(search),[search]);
  const filtered=entries.filter(entry=>searchMatches({
    texts:[entry.label,entry.category,entry.tag,account.nickname],
    amounts:[entry.amount],
    dates:[entry.date],
  }));
  const statementTotal=filtered.reduce((total, entry)=>total+Number(entry.amount||0),0);
  const others=accounts.filter(a=>a.id!==account.id);
  const categoryOptions=[...new Set([...commonCategories,...operations.map(operation=>operation.category).filter(Boolean),category])];
  const canInitializeOpening=Number(account.balance)===0&&!operations.some(op=>op.from_account_id===account.id||op.to_account_id===account.id);

  const clear=()=>{setAction(null);setAmount('');setOperationDraft(null);setDescription('');dispatchCategory({type:'reset'});setCategoryManuallySelected(false);setDestination('');setError('');};
  const submit=async(e:React.FormEvent)=>{
    e.preventDefault();
    if(!action||saving)return;
    if(!Number.isFinite(parsedAmount)||parsedAmount<=0||Math.abs(parsedAmount*100-Math.round(parsedAmount*100))>0.00001){setError('Valor inválido.');return;}
    const toAccount=(action==='INCOME'||action==='RECEIPT')?account.id:action==='TRANSFER'?destination:null;
    const fromAccount=(action==='EXPENSE'||action==='PAYMENT'||action==='TRANSFER')?account.id:null;
    if(action==='TRANSFER'&&(!destination||!others.some(item=>item.id===destination))){
      setError('Selecione uma conta de destino válida.');return;
    }
    if(isDebit){
      const currentPreview=getAccountTransferPreview(Number(account.balance),parsedAmount);
      if(currentPreview.balanceCents===null){setError('Saldo indisponível. Atualize a página antes de lançar.');return;}
      if(currentPreview.insufficientFunds){setError('O valor supera o saldo disponível na conta.');return;}
    }
    const effectiveCategory=action==='TRANSFER'?'Transferência interna':category;
    const signature=[action,fromAccount,toAccount,parsedAmount.toFixed(2),description,date,effectiveCategory].join(':');
    if(transactionRef.current.signature!==signature) transactionRef.current={signature,id:generateUUID()};
    setSaving(true);setError('');setSuccess('');
    const requestId=transactionRef.current.id;
    try{
      try {
        await withWalletOperationDeadline(personalWalletService.recordAccountOperation({
          type:action,fromAccountId:fromAccount,toAccountId:toAccount,
          amount:parsedAmount,description,category:effectiveCategory,date,requestId,
        }),18000);
      } catch (cause) {
        if (!(cause instanceof WalletOperationTimeoutError)) throw cause;
        // A requisição pode ter sido efetivada mesmo após esgotar a espera na interface.
        // Confirme o mesmo request_id sob RLS, sem criar outra operação ou alterar saldos.
        let confirmed=false;
        try {
          confirmed=await withWalletOperationDeadline(
            personalWalletService.hasRecordedAccountOperation(requestId),6000,
          );
        } catch { /* Resultado inconclusivo: manter request_id para repetição idempotente. */ }
        if (!confirmed) {
          setError('Não foi possível confirmar este lançamento. Ele ainda pode ser concluído. Confira o extrato antes de repetir a operação.');
          notifyFinancialDataChanged({wallet:true});
          return;
        }
      }
      // A RPC confirmou a escrita. A atualização do extrato é assíncrona e não
      // pode manter a janela presa em "Registrando..." nem duplicar refreshes.
      transactionRef.current={signature:'',id:generateUUID()};
      clear();
      setSuccess('Movimentação registrada. O extrato e o saldo serão atualizados automaticamente.');
      notifyFinancialDataChanged({ wallet: true, capital: Boolean(account.capital_source_id) });
    }catch(err:unknown){
      setError(err instanceof Error ? err.message : 'Não foi possível registrar a operação.');
    }finally{setSaving(false);}
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
      if (deleteRequestRef.current?.id !== operation.id) deleteRequestRef.current = { id: operation.id, request: generateUUID() };
      await personalWalletService.deleteWrongAccountOperation(operation.id, deleteRequestRef.current.request);
      deleteRequestRef.current = null;
      notifyFinancialDataChanged({ wallet: true, capital: Boolean(account.capital_source_id) });
      await onSaved();
      setVoidTarget(null);
      setSuccess('Lançamento apagado e saldo corrigido.');
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
          <button type="button" key={value} onClick={()=>{setAction(value);setAmount('');setOperationDraft(null);setDescription(value==='TRANSFER'?'Transferência entre contas':'');dispatchCategory({type:'reset'});setCategoryManuallySelected(false);setDestination('');setError('');setSuccess('');}}
            className={`flex flex-col items-center justify-center gap-2 rounded-xl border px-2 py-4 text-xs font-semibold transition-colors ${action===value?'border-emerald-400 bg-emerald-900/30 text-white':'border-slate-700 bg-slate-950 text-slate-300 hover:border-emerald-500'}`}>
            <Icon size={20} className={value==='EXPENSE'||value==='PAYMENT'?'text-rose-400':'text-emerald-400'}/>{label}
          </button>
        ))}
      </div>
      {error && !action && !openingModalOpen && !voidTarget && <p role="alert" className="mt-3 rounded-lg border border-rose-700/50 p-3 text-xs text-rose-300">{error}</p>}
      {success && <p role="status" className="mt-3 rounded-lg border border-emerald-700/50 p-3 text-xs text-emerald-300">{success}</p>}
    </div>

    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-6">
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="flex items-center gap-2 text-base font-bold text-white">
            <History size={18} className="text-cyan-400"/> Extrato da conta
          </h2>
          <span className="rounded-full border border-slate-700/80 bg-slate-950/80 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-slate-300">
            {search.trim() ? `${filtered.length}/${entries.length}` : entries.length}
          </span>
        </div>
        <button type="button" onClick={exportCsv} disabled={!filtered.length} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-700/90 bg-slate-950/60 px-3 py-1.5 text-xs font-semibold text-slate-200 transition-colors hover:border-slate-600 hover:bg-slate-800/80 hover:text-white disabled:opacity-40">
          <FileDown size={14}/> Exportar CSV
        </button>
      </div>

      <div className="mb-3.5 grid grid-cols-[minmax(0,1fr)_auto] items-stretch gap-2">
        <label className="flex min-h-10 min-w-0 items-center gap-2 rounded-xl border border-slate-700/80 bg-slate-950 px-2.5 sm:px-3 transition-colors focus-within:border-cyan-500/70 focus-within:ring-2 focus-within:ring-cyan-500/15">
          <Search size={14} className="shrink-0 text-slate-400" aria-hidden="true"/>
          <input
            type="search"
            aria-label="Buscar movimentações"
            className="min-w-0 flex-1 bg-transparent py-1.5 text-xs text-white outline-none placeholder:text-slate-500"
            placeholder="Buscar descrição, valor, data ou categoria"
            value={search}
            onChange={e=>setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              onClick={()=>setSearch('')}
              aria-label="Limpar busca"
              className="shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
            >
              <X size={13}/>
            </button>
          )}
        </label>

        <div
          aria-label="Resultado das movimentações"
          className="flex min-h-10 shrink-0 flex-col items-end justify-center rounded-xl bg-slate-950/65 px-2.5 py-1 ring-1 ring-inset ring-slate-800/90 sm:flex-row sm:items-center sm:gap-3 sm:px-3.5"
        >
          <span className="text-[9px] font-semibold uppercase tracking-wide text-slate-400 sm:text-[11px] sm:normal-case sm:tracking-normal">
            <span className="sm:hidden">{search ? 'Filtrado' : 'Resultado'}</span>
            <span className="hidden sm:inline">Resultado das movimentações{search ? ' filtradas' : ''}</span>
          </span>
          <strong className={`whitespace-nowrap text-xs sm:text-sm font-extrabold tabular-nums tracking-tight leading-tight ${statementTotal>=0?'text-emerald-300':'text-rose-300'}`}>
            <PrivateMoney value={`${statementTotal>=0?'+ ':'− '}${formatMoney(Math.abs(statementTotal))}`} />
          </strong>
        </div>
      </div>

      {filtered.length===0 ? (
        <p className="rounded-xl border border-dashed border-slate-800 px-4 py-5 text-center text-xs text-slate-400">
          {entries.length ? 'Nenhuma movimentação corresponde à busca.' : 'Ainda não há movimentações operacionais ou importadas nesta conta.'}
        </p>
      ) : (
        <div className="divide-y divide-slate-800/80">
          {filtered.map(m => {
            const positive = m.amount >= 0;
            const editableOp = canVoid(m.id);
            return (
              <article key={m.id} className="flex items-start justify-between gap-3 py-3 first:pt-1 last:pb-1">
                <div className="flex min-w-0 flex-1 items-start gap-2.5">
                  <span
                    aria-hidden="true"
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
                      positive
                        ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
                        : 'border-rose-500/25 bg-rose-500/10 text-rose-300'
                    }`}
                  >
                    {positive ? <ArrowDownLeft size={15} /> : <ArrowUpRight size={15} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold leading-snug text-slate-100">{m.label}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-slate-400">
                      <span className="tabular-nums text-slate-300/90">{fmtDate(m.date)}</span>
                      <span aria-hidden="true" className="text-slate-600">·</span>
                      <span className="truncate">{m.category}</span>
                      {m.tag !== 'Movimentação' && (
                        <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold leading-none ${tagClass(m.tag, m.amount)}`}>
                          {m.tag}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 flex-col items-end">
                  <strong className={`whitespace-nowrap text-sm sm:text-[15px] font-bold tabular-nums tracking-tight ${positive ? 'text-emerald-300' : 'text-rose-300'}`}>
                    <PrivateMoney value={`${positive ? '+ ' : '− '}${formatMoney(Math.abs(m.amount))}`} />
                  </strong>
                  {editableOp && (
                    <div className="mt-1 -mr-1.5 flex items-center gap-0.5">
                      <button
                        type="button"
                        disabled={!!voidingId || saving || editSaving}
                        onClick={() => startEditing(editableOp)}
                        aria-label={'Editar lançamento ' + m.label}
                        className="inline-flex min-h-7 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-slate-400 transition-colors hover:bg-slate-800 hover:text-blue-300 disabled:opacity-40"
                      >
                        <Pencil size={12}/> Editar
                      </button>
                      <button
                        type="button"
                        disabled={!!voidingId || saving || editSaving}
                        onClick={() => { setError(''); setSuccess(''); setVoidTarget(editableOp); }}
                        aria-label={'Excluir lançamento ' + m.label}
                        className="inline-flex min-h-7 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-slate-400 transition-colors hover:bg-rose-950/40 hover:text-rose-300 disabled:opacity-40"
                      >
                        <Trash2 size={12}/> {voidingId===m.id ? 'Excluindo...' : 'Excluir'}
                      </button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
    {action && (
      <Modal
        variant="wallet"
        size="md"
        title={labels[action]}
        subtitle={account.nickname}
        icon={<AccountOptionIcon account={account} />}
        busy={saving}
        onClose={clear}
        footer={
          <button
            type="submit"
            form="account-activity-form"
            disabled={saving || (isDebit && (balancePreview.balanceCents===null || balancePreview.insufficientFunds))}
            className={modalPrimaryActionClass}
          >
            {saving ? 'Registrando...' : 'Confirmar lançamento'}
          </button>
        }
      >
        <form id="account-activity-form" onSubmit={submit} className="space-y-3">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl border border-slate-700 bg-slate-950/70 p-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-200">Saldo disponível na conta</p>
              <p className="text-[11px] text-slate-400">Registrado no CapitalFlow</p>
            </div>
            <strong className="max-w-full break-all text-base font-extrabold tabular-nums text-emerald-300">
              {balancePreview.balanceCents===null ? 'Indisponível' : <PrivateMoney value={formatMoney(balancePreview.balanceCents/100)}/>}
            </strong>
          </div>
          {action==='TRANSFER' && <p className="text-xs text-amber-300">Transferência contábil entre contas cadastradas. Não envia PIX nem movimenta dinheiro no banco.</p>}
          {action==='PAYMENT' && <p className="text-xs text-amber-300">Para quitar fatura de cartão, utilize a opção Faturas. Registrar aqui também causaria débito em duplicidade.</p>}
          {action==='RECEIPT' && <p className="text-xs text-slate-400">Registra o recebimento informado. Não solicita dinheiro nem gera cobrança PIX.</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="block text-xs text-slate-300">Valor (R$)
                <FinancialCalculatorInput required className={input} value={amount}
                  onCommit={value=>{setAmount(value);setOperationDraft(null);}}
                  onDraftChange={setOperationDraft}
                  fieldLabel="valor do lançamento" placeholder="0,00"/>
              </label>
              {(isDebit||isCredit) && (
                <div className="flex flex-wrap items-center justify-between gap-1 rounded-lg bg-slate-950/60 px-3 py-2 text-xs">
                  <span className="text-slate-400">Saldo após {labels[action].toLocaleLowerCase('pt-BR')}</span>
                  <strong aria-live="polite" className={`tabular-nums ${balancePreview.insufficientFunds?'text-rose-300':'text-slate-100'}`}>
                    {!amountEntered||balancePreview.remainingCents===null ? '—' : <PrivateMoney value={formatMoney(balancePreview.remainingCents/100)}/>}
                  </strong>
                  {amountEntered && balancePreview.insufficientFunds && (
                    <p role="alert" className="w-full text-[11px] text-rose-300">Saldo insuficiente para este lançamento.</p>
                  )}
                </div>
              )}
            </div>
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
                  icon: <AccountOptionIcon account={item} />,
                  rightValue: formatMoney(item.balance),
                }))}
                onChange={setDestination}
              />
            </div>}
            <label className="text-xs text-slate-300 sm:col-span-2">Descrição
              <input required maxLength={240} className={input} value={description} onChange={e=>setDescription(e.target.value)} placeholder={action==='TRANSFER'?'Transferência entre contas':'Descreva a movimentação'}/>
            </label>
            {action!=='TRANSFER' && <div className="space-y-1 text-xs text-slate-300 sm:col-span-2">
              <span className="block">Categoria</span>
              <SelectOptionList
                ariaLabel="Categoria"
                value={categoryState.customMode ? '__custom__' : category}
                placeholder="Selecione a categoria"
                options={[
                  ...categoryOptions.map((option) => ({ value: option, label: option })),
                  { value: '__custom__', label: 'Outra categoria...' },
                ]}
                onChange={(selected) => {setCategoryManuallySelected(true);dispatchCategory({type:'select',value:selected});}}
              />
              {suggestedCategory && <p className="text-[11px] text-emerald-300">Categoria sugerida pela descrição. Você pode alterá-la.</p>}
            </div>}
            {action!=='TRANSFER' && categoryState.customMode && <label className="text-xs text-slate-300 sm:col-span-2">Nome da categoria
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
            O lançamento é apagado do registro e o saldo da conta é corrigido automaticamente. Não fica histórico desse lançamento.
          </p>
          {error && <p role="alert" className="rounded-lg border border-rose-700/50 p-3 text-xs text-rose-300">{error}</p>}
        </div>
      </Modal>
    )}
    {importOpen && <WalletStatementImport kind="ACCOUNT" targetId={account.id} targetName={account.nickname}
      onClose={()=>setImportOpen(false)} onImported={onSaved}/>}
  </section>);
};
