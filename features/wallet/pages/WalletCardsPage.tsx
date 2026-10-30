import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, Sparkles, Camera, CreditCard } from 'lucide-react';
import { CardCameraScannerModal } from '../../../components/wallet/CardCameraScannerModal';
import type { UserProfile } from '../../../types';
import { useWalletOwnerDefaults } from '../hooks/useWalletOwnerDefaults';
import type { PersonalWalletCard } from '../../../services/personalWallet.service';
import { personalWalletService } from '../../../services/personalWallet.service';
import { BankStack } from '../../../components/wallet/BankStack';
import { CardInvoiceStatement } from '../../../components/wallet/CardInvoiceStatement';
import { CardEditModal } from '../../../components/wallet/CardEditModal';
import { PayInvoiceModal } from '../../../components/wallet/PayInvoiceModal';
import { WalletStatementImport } from '../../../components/wallet/WalletStatementImport';
import { FlatSmartStatementReader } from '../../../components/wallet/FlatSmartStatementReader';
import { InvoiceOverrideModal } from '../../../components/wallet/InvoiceOverrideModal';
import { getCardCreditPosition, getEffectiveInvoiceCycles, getInvoiceCycleDates, getSelectedInvoiceCycle, resolveInvoiceCycleState } from '../../../components/wallet/invoiceStatementDomain';
import { formatMoney } from '../../../utils/formatters';
import { generateUUID } from '../../../utils/generators';
import { CardOpeningFields, freshCardOpening, validateCardOpening } from '../components/CardOpeningFields';
import { useWalletSnapshot } from '../hooks/useWalletSnapshot';
import { WalletPageFrame } from '../components/WalletPageFrame';
import { getCardsForDisplay } from '../cardSummaryNavigation';
import { CardInitialBalancesModal } from '../../../components/wallet/CardInitialBalancesModal';
import { QuickExpenseModal } from '../components/QuickExpenseModal';
import { Modal, modalPrimaryActionClass, modalSecondaryActionClass } from '../../../components/ui/Modal';
import { WalletMetricStrip } from '../../../components/wallet/WalletMetricStrip';
import { parseWalletMoney } from '../utils/parseWalletMoney';
import { CardProtectedFields, emptyProtectedCard } from '../../../components/wallet/CardProtectedFields';
import { CardVaultModal } from '../../../components/wallet/CardVaultModal';
import { encryptCardData, validateCardNumber, type CardVaultEnvelope } from '../domain/cardVault';
import { BANK_CATALOG } from '../../../utils/bankLogoRegistry';

const CARD_EXPENSE_CATEGORIES = ['Compras', 'Alimentação', 'Mercado', 'Transporte', 'Saúde', 'Moradia', 'Assinaturas', 'Outros'];
const CARD_INSTALLMENT_OPTIONS = ['1', '2', '3', '4', '6', '10', '12'];

export const WalletCardsPage: React.FC<{ activeUser?: UserProfile | null; onNavigate: (path: string) => void }> = ({ activeUser }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedCardId = searchParams.get('card');
  const requestedAction = searchParams.get('acao');
  const { data, loading, error, refresh } = useWalletSnapshot();
  const [selectedId, setSelectedId] = useState<string | null>(requestedCardId);
  const [editing, setEditing] = useState<PersonalWalletCard | null>(null);
  const [paying, setPaying] = useState<PersonalWalletCard | null>(null);
  const [importing, setImporting] = useState(false);
  const [flatReaderOpen, setFlatReaderOpen] = useState(false);
  const readerRef = useRef<HTMLDivElement | null>(null);
  const openReader = () => {
    setFlatReaderOpen(true);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => readerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    });
  };
  const [creating, setCreating] = useState(false);
  const [thirdPartyCard, setThirdPartyCard] = useState(false);
  const ownerDefaults = useWalletOwnerDefaults(activeUser, creating);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [newExpense, setNewExpense] = useState(false);
  const [quickExpenseOpen, setQuickExpenseOpen] = useState(false);
  const [overriding, setOverriding] = useState(false);
  const [cardOpeningModalOpen, setCardOpeningModalOpen] = useState(false);
  const [statementMonth, setStatementMonth] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [createError,setCreateError]=useState('');
  const [protectedDraft,setProtectedDraft]=useState(emptyProtectedCard);
  const [vaultCard,setVaultCard]=useState<PersonalWalletCard|null>(null);
  const encryptedDraft=useRef<{requestId:string;envelope:CardVaultEnvelope}|null>(null);
  const requestId = useRef(generateUUID());
  const [opening, setOpening] = useState(freshCardOpening);
  const [initializing, setInitializing] = useState(false);
  const [pendingStatementDeletion, setPendingStatementDeletion] = useState<{ ids: string[]; count: number } | null>(null);
  const [selectedStatementRows, setSelectedStatementRows] = useState<Set<string>>(new Set());
  const [deletingStatement, setDeletingStatement] = useState(false);
  const [statementDeletionFeedback, setStatementDeletionFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const [existingOpening, setExistingOpening] = useState(freshCardOpening);
  const [cardForm, setCardForm] = useState({
    nickname: '', issuer: '', brand: 'Mastercard', last_four: '', credit_limit: '', due_day: '10',
    closing_day: '1', account_id: '', cardholder_name:'', expiry_month:'', expiry_year:'',
  });
  useEffect(() => {
    if (!creating || thirdPartyCard || !ownerDefaults.name) return;
    setCardForm(value => value.cardholder_name.trim()
      ? value : { ...value, cardholder_name: ownerDefaults.name });
  }, [creating, thirdPartyCard, ownerDefaults.name]);

  const [expenseForm, setExpenseForm] = useState({
    description: '', amount: '', category: 'Compras', installment_count: '1',
  });
  const availableCards = useMemo(() => (data?.cards || []).filter(card => card.status !== 'CANCELED'), [data]);
  const displayedCards = useMemo(
    () => getCardsForDisplay(availableCards, requestedCardId),
    [availableCards, requestedCardId],
  );
  const selected = availableCards.find(card => card.id === selectedId) || displayedCards[0] || null;
  const importedStatementRows = selected
    ? data?.statementRows.filter(row => {
      if (row.target_kind !== 'CARD' || row.target_id !== selected.id) return false;
      if (!row.expense_id) return true;
      return data.expenses.some(expense => expense.id === row.expense_id && expense.status !== 'CANCELED');
    }) || []
    : [];
  const importedStatementTotal = importedStatementRows.reduce((total, row) => total + Number(row.amount || 0), 0);
  const linkedStatementCount = importedStatementRows.filter(row => row.expense_id).length;
  const unlinkedStatementCount = importedStatementRows.length - linkedStatementCount;
  const removeImportedStatementRows = async (rowIds: string[]) => {
    setDeletingStatement(true);
    setStatementDeletionFeedback(null);
    const failedIds = new Set<string>();
    const failureMessages: string[] = [];
    let deletedCount = 0;
    try {
      const selectedRows = importedStatementRows.filter(item => rowIds.includes(item.id));
      const unlinkedRows = selectedRows.filter(row => !row.expense_id);
      const linkedRows = selectedRows.filter(row => row.expense_id);
      if (unlinkedRows.length) {
        try {
          const removed = await personalWalletService.deleteStatementRows(unlinkedRows.map(row => row.id));
          deletedCount += removed;
          if (removed !== unlinkedRows.length) {
            unlinkedRows.forEach(row => failedIds.add(row.id));
            failureMessages.push(`O banco removeu ${removed} de ${unlinkedRows.length} itens selecionados.`);
          }
        } catch (cause) {
          unlinkedRows.forEach(row => failedIds.add(row.id));
          failureMessages.push(cause instanceof Error ? cause.message : 'Falha ao excluir itens importados.');
        }
      }
      for (const row of linkedRows) {
        try {
          await personalWalletService.cancelExpense(row.expense_id!, generateUUID());
          deletedCount += 1;
        } catch (cause) {
          failedIds.add(row.id);
          failureMessages.push(cause instanceof Error ? cause.message : `Falha ao excluir ${row.description}.`);
        }
      }
      await refresh();
      setPendingStatementDeletion(null);
      setSelectedStatementRows(failedIds);
      if (failureMessages.length) {
        setStatementDeletionFeedback({
          tone: 'error',
          message: `${deletedCount} item(ns) removido(s); ${failedIds.size} falharam. ${failureMessages[0]}`,
        });
      } else {
        setStatementDeletionFeedback({ tone: 'success', message: `${deletedCount} item(ns) removido(s) do extrato.` });
      }
    } catch (cause) {
      setSelectedStatementRows(new Set(rowIds));
      setStatementDeletionFeedback({
        tone: 'error',
        message: cause instanceof Error ? cause.message : 'Não foi possível excluir a linha do extrato.',
      });
    } finally { setDeletingStatement(false); }
  };
  useEffect(() => {
    setSelectedId(requestedCardId);
  }, [requestedCardId]);
  useEffect(() => {
    if (requestedAction !== 'novo-cartao') return;
    setCreating(true);
    const next = new URLSearchParams(searchParams);
    next.delete('acao');
    setSearchParams(next, { replace: true });
  }, [requestedAction, searchParams, setSearchParams]);
  useEffect(() => {
    setSelectedStatementRows(new Set());
    setStatementDeletionFeedback(null);
  }, [selected?.id]);
  const creditPosition = useMemo(() => data && selected
    ? getCardCreditPosition(selected, data.expenses, data.installments)
    : null, [data, selected]);
  const invoiceCycles = useMemo(() => {
    if (!data || !selected) return [];
    const cycles = getEffectiveInvoiceCycles(selected.id, data.expenses, data.installments);
    const lastMonth = cycles.at(-1)?.dueMonth || creditPosition?.dueMonth || `${new Date().toLocaleDateString('en-CA').slice(0, 7)}-01`;
    const [year, month] = lastMonth.slice(0, 7).split('-').map(Number);
    const nextMonth = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
    if (!cycles.some(cycle => cycle.dueMonth === nextMonth)) cycles.push({ dueMonth: nextMonth, amount: 0, hasOverride: false });
    return cycles;
  }, [data, selected, creditPosition?.dueMonth]);
  useEffect(() => {
    if (selected) setStatementMonth(creditPosition?.dueMonth || new Date().toLocaleDateString('en-CA').slice(0, 7) + '-01');
  }, [selected?.id, creditPosition?.dueMonth]);
  const selectedCycle = selected && data
    ? getSelectedInvoiceCycle(selected.id, statementMonth, data.expenses, data.installments)
    : null;
  const selectedFutureCommitments = statementMonth
    ? invoiceCycles.filter(cycle => cycle.dueMonth > statementMonth).reduce((sum, cycle) => sum + cycle.amount, 0)
    : 0;
  const selectedIsOpeningCycle = Boolean(selected && statementMonth && (
    selected.opening_invoice_month
      ? selected.opening_invoice_month.slice(0, 7) === statementMonth.slice(0, 7)
      : creditPosition?.dueMonth === statementMonth
  ));
  const selectedInvoiceState = selected && statementMonth
    ? (selected.opening_invoice_month?.slice(0, 7) === statementMonth.slice(0, 7) && selected.opening_invoice_state
      ? selected.opening_invoice_state
      : resolveInvoiceCycleState({
        dueMonth: statementMonth,
        closingDay: selected.closing_day,
        dueDay: selected.due_day,
        outstanding: selectedCycle?.amount || 0,
        hasCycle: Boolean(selectedCycle?.amount),
      }))
    : undefined;
  const mayInitializeExisting = Boolean(selected && data && Number(selected.used_limit) === 0
    && Number(selected.current_bill) === 0
    && !data.expenses.some(expense => expense.card_id === selected.id)
    && !data.invoicePayments.some(payment => payment.card_id === selected.id));

  const createCard = async (event: React.FormEvent) => {
    event.preventDefault(); if (saving) return; setSaving(true); setNotice('');
    setCreateError('');
    try {
      if (thirdPartyCard && !cardForm.cardholder_name.trim()) {
        throw new Error('Informe o nome do titular do cartão de terceiros.');
      }
      const creditLimit = parseWalletMoney(cardForm.credit_limit, 'limite de crédito');
      const position = validateCardOpening(opening, creditLimit);
      if(Boolean(cardForm.expiry_month)!==Boolean(cardForm.expiry_year))throw new Error('Informe mês e ano da validade juntos.');
      let envelope:CardVaultEnvelope|null=null;
      let lastFour=cardForm.last_four||null;
      if(protectedDraft.number||protectedDraft.securityCode){
        const number=validateCardNumber(protectedDraft.number);
        lastFour=number.slice(-4);
        if(protectedDraft.password||protectedDraft.confirmation||protectedDraft.securityCode){
          if(protectedDraft.password!==protectedDraft.confirmation)throw new Error('As senhas do cofre não coincidem.');
          if(encryptedDraft.current?.requestId===requestId.current)envelope=encryptedDraft.current.envelope;
          else {
            envelope=await encryptCardData({number,securityCode:protectedDraft.securityCode},protectedDraft.password,await personalWalletService.ownerId(),requestId.current);
            encryptedDraft.current={requestId:requestId.current,envelope};
          }
        }
      }
      await personalWalletService.createCompleteCard({
        card: {
          nickname: (cardForm.nickname.trim() || cardForm.issuer.trim()), issuer: cardForm.issuer.trim(),
          brand: cardForm.brand || null, last_four: lastFour,
          credit_limit: creditLimit,
          due_day: Number(cardForm.due_day), closing_day: Number(cardForm.closing_day),
        },
        existingAccountId: cardForm.account_id || null,
        opening: position,
        requestId: requestId.current,
        identity:{cardholder_name:cardForm.cardholder_name.trim()||null,expiry_month:cardForm.expiry_month?Number(cardForm.expiry_month):null,expiry_year:cardForm.expiry_year?Number(cardForm.expiry_year):null},
        envelope,
      });
      await refresh(); setCreating(false); setThirdPartyCard(false); setOpening(freshCardOpening());
      requestId.current = generateUUID();
      setCardForm({
        nickname: '', issuer: '', brand: 'Mastercard', last_four: '', credit_limit: '',
        due_day: '10', closing_day: '1', account_id: '', cardholder_name:'', expiry_month:'', expiry_year:'',
      });
      setProtectedDraft(emptyProtectedCard());encryptedDraft.current=null;
    } catch (cause) { setCreateError(cause instanceof Error ? cause.message : 'Falha ao cadastrar cartão.'); }
    finally { setSaving(false); }
  };
  const initializeExisting = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected || !mayInitializeExisting || saving) return;
    setSaving(true); setNotice('');
    try {
      const position = validateCardOpening(existingOpening, Number(selected.credit_limit));
      if (position.used_limit === 0) {
        throw new Error('Informe a dívida anterior do cartão ou cancele.');
      }
      await personalWalletService.setSimpleCardOpening({ cardId: selected.id, creditLimit: Number(selected.credit_limit), usedLimit: position.used_limit, currentInvoice: position.invoice_amount, dueMonth: position.invoice_month, invoiceState: position.invoice_state || 'OPEN', requestId: requestId.current });
      await refresh();
      setInitializing(false);
      setExistingOpening(freshCardOpening());
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Falha ao registrar a situação inicial.');
    } finally { setSaving(false); }
  };

  const createExpense = async (event: React.FormEvent) => {
    event.preventDefault(); if (!selected || saving) return; setSaving(true); setNotice('');
    try {
      await personalWalletService.createExpense({
        description: expenseForm.description, amount: Number(expenseForm.amount),
        category: expenseForm.category, expense_date: new Date().toLocaleDateString('en-CA'),
        card_id: selected.id, status: 'PENDING', installment_count: Number(expenseForm.installment_count),
      });
      await refresh(); setNewExpense(false);
      setExpenseForm({ description: '', amount: '', category: 'Compras', installment_count: '1' });
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Falha ao lançar despesa.'); }
    finally { setSaving(false); }
  };
  return <WalletPageFrame title="Cartões e faturas" description="Acompanhe o limite, confira cada ciclo e organize seus pagamentos."
    error={error || notice} loading={loading} onRefresh={() => { void refresh().catch(() => {}); }}>
    {data && <>
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="min-w-0 self-start rounded-xl border border-slate-800 bg-slate-900 p-3 sm:p-4 lg:sticky lg:top-6 lg:col-span-5">
          <BankStack key={requestedCardId || 'all'} accounts={data.accounts} cards={displayedCards}
            onAccount={() => {}} onCard={card => setSelectedId(card.id)}
            onEditCard={card => setEditing(card)}
            onSelectionChange={card => setSelectedId(current => current === card?.id ? current : card?.id || null)}
            onCreateCard={() => setCreating(true)}
            onImportStatement={openReader}
            onNewExpense={card => { setSelectedId(card.id); setNewExpense(true); }}
            onPayInvoice={card => { setSelectedId(card.id); setPaying(card); }}/>
        </div>
        <div className="min-w-0 space-y-4 lg:col-span-7">
          <WalletMetricStrip items={[
            { label: 'Fatura selecionada', value: formatMoney(selectedCycle?.amount || 0) },
            { label: 'Faturas posteriores', value: formatMoney(selectedFutureCommitments) },
            { label: 'Limite disponível', value: formatMoney(creditPosition?.freeLimit || 0), tone: 'positive' },
          ]}/>
          {selected && selectedIsOpeningCycle && (Number(selected.initial_future_installments_balance || 0) > 0 || Number(selected.opening_unallocated_amount || 0) > 0) && <p className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-100">
            {formatMoney(Math.max(Number(selected.initial_future_installments_balance || 0), Number(selected.opening_unallocated_amount || 0)))} em gastos iniciais ainda sem detalhamento. Esse valor já está incluído no limite usado.
          </p>}
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white">Fatura {selected?.nickname || ''}</h3>
                </div>
                {selected && <select aria-label="Ciclo da fatura" value={statementMonth || ''} onChange={event => setStatementMonth(event.target.value)}
                  className="mt-2 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200">
                  {invoiceCycles.length ? invoiceCycles.map(cycle => <option key={cycle.dueMonth} value={cycle.dueMonth}>{cycle.dueMonth.slice(0, 7).split('-').reverse().join('/')}{cycle.hasOverride ? ' · consolidada' : ''}</option>) : <option value={statementMonth || ''}>{(statementMonth || '').slice(0, 7).split('-').reverse().join('/')}</option>}
                </select>}
              </div>
              {selected && <div className="flex flex-wrap gap-2">
                <button type="button" onClick={()=>setVaultCard(selected)} className="min-h-11 rounded-xl border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800">Dados completos do cartão</button>
                <button type="button" onClick={() => setQuickExpenseOpen(true)} className="rounded-xl bg-blue-600 hover:bg-blue-500 px-3 py-2 text-xs font-bold text-white">Lançamento rápido</button>
                <button type="button" onClick={() => setCardOpeningModalOpen(true)} className="rounded-xl border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-xs font-bold text-blue-200 hover:bg-blue-500/20">Situação inicial</button>
                <button type="button" onClick={() => setOverriding(true)} className="rounded-xl border border-amber-600/50 px-3 py-2 text-xs font-bold text-amber-200">✏️ Definir Valor da Fatura</button>
                <button type="button" onClick={() => setFlatReaderOpen(v => !v)} className={`rounded-xl px-3 py-2 text-xs font-bold transition flex items-center gap-1.5 ${flatReaderOpen ? 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/20' : 'border border-cyan-500/50 bg-cyan-950/40 text-cyan-200 hover:bg-cyan-900/40'}`}>
                  <Sparkles size={13} className={flatReaderOpen ? '' : 'text-cyan-400'} />
                  {flatReaderOpen ? 'Fechar importação' : 'Importar extrato ou fatura'}
                </button>

              </div>}
            </div>
            {flatReaderOpen && selected && (
              <div ref={readerRef} className="mb-4 scroll-mt-24">
                <FlatSmartStatementReader
                  kind="CARD"
                  targetId={selected.id}
                  targetName={selected.nickname}
                  initialDueMonth={statementMonth}
                  hasOpening={Boolean(selected.initial_balance_occurred_at)}
                  isFlat={true}
                  onClose={() => setFlatReaderOpen(false)}
                  onImported={async () => {
                    await refresh();
                    setFlatReaderOpen(false);
                  }}
                />
              </div>
            )}
            {selected ? <CardInvoiceStatement cardId={selected.id} dueMonth={statementMonth}
              openingBalance={selectedIsOpeningCycle ? Number(selected.initial_future_installments_balance || 0) : 0}
              expenses={data.expenses} installments={data.installments}
              invoiceState={selectedInvoiceState}
              cycleDates={statementMonth ? getInvoiceCycleDates(statementMonth, selected.closing_day, selected.due_day) : undefined}
              onEdit={async (input, mutationRequestId) => { await personalWalletService.updateExpense(input, mutationRequestId); await refresh(); }}
              onDelete={async (id, mutationRequestId) => { await personalWalletService.cancelExpense(id, mutationRequestId); await refresh(); }}
              className="m-0 border-0 bg-transparent p-0"/> :
              <p className="text-xs text-slate-400">Cadastre um cartão para visualizar o extrato.</p>}
          </div>
        </div>
      </div>
      {statementDeletionFeedback && <div role="status" className={`rounded-lg border px-3 py-2 text-xs ${statementDeletionFeedback.tone === 'success' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-rose-500/30 bg-rose-500/10 text-rose-200'}`}>
        {statementDeletionFeedback.message}
      </div>}
      {selected && importedStatementRows.length > 0 && <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <h3 className="text-sm font-bold text-white">Extrato importado do PDF</h3>
        <p className="mt-1 text-xs text-slate-400">Registros para conferência. Estes itens não são somados novamente ao limite ou à fatura.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2"><span className="block text-[10px] text-slate-500">Lançamentos</span><strong className="text-sm text-white">{importedStatementRows.length}</strong></div>
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2"><span className="block text-[10px] text-slate-500">Somente conferência</span><strong className="text-sm text-emerald-300">{unlinkedStatementCount}</strong></div>
          <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2"><span className="block text-[10px] text-slate-500">Vinculados à fatura</span><strong className="text-sm text-cyan-300">{linkedStatementCount}</strong></div>
        </div>
        <div className="mt-3 flex items-center justify-between rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs"><span className="text-slate-400">Total do extrato importado</span><strong className="text-white">{formatMoney(importedStatementTotal)}</strong></div>
        <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-[10px] text-slate-400">
          <button type="button" onClick={() => setSelectedStatementRows(current => current.size === importedStatementRows.length ? new Set() : new Set(importedStatementRows.map(row => row.id)))} className="rounded border border-slate-700 px-2 py-1 hover:bg-slate-800">{selectedStatementRows.size === importedStatementRows.length ? 'Limpar seleção' : 'Selecionar todos'}</button>
          <button type="button" disabled={!selectedStatementRows.size} onClick={() => setPendingStatementDeletion({ ids: [...selectedStatementRows], count: selectedStatementRows.size })} className="rounded border border-rose-500/30 px-2 py-1 font-semibold text-rose-300 disabled:opacity-40">Excluir selecionados ({selectedStatementRows.size})</button>
        </div>
        <div className="mt-3 max-h-80 divide-y divide-slate-800 overflow-y-auto">{importedStatementRows.map(row => <article key={row.id} className="flex items-center justify-between gap-3 py-3"><div className="flex min-w-0 items-start gap-2"><input type="checkbox" checked={selectedStatementRows.has(row.id)} onChange={() => setSelectedStatementRows(current => { const next = new Set(current); if (next.has(row.id)) next.delete(row.id); else next.add(row.id); return next; })} /><div className="min-w-0"><p className="truncate text-xs font-semibold text-slate-200">{row.description}</p><p className="mt-1 text-[10px] text-slate-500">{row.entry_date.split('-').reverse().join('/')} · {row.category} · {row.expense_id ? 'Vinculado à fatura' : 'Somente importado'}</p></div></div><div className="flex shrink-0 items-center gap-2"><strong className="text-xs text-slate-200">{formatMoney(row.amount)}</strong><button type="button" onClick={() => setPendingStatementDeletion({ ids: [row.id], count: 1 })} className="rounded border border-rose-500/30 px-2 py-1 text-[10px] font-semibold text-rose-300 hover:bg-rose-500/10">Excluir</button></div></article>)}</div>
      </section>}
      {pendingStatementDeletion && <Modal compact title="Excluir item importado?" subtitle="Esta linha será removida apenas do extrato importado." icon={<AlertTriangle size={17}/>} onClose={() => { if (!deletingStatement) setPendingStatementDeletion(null); }}>
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-slate-300">Excluir {pendingStatementDeletion.count} item(ns) selecionado(s) do extrato?</p>
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <button type="button" disabled={deletingStatement} onClick={() => { void removeImportedStatementRows(pendingStatementDeletion.ids); }} className={modalPrimaryActionClass}>{deletingStatement ? 'Excluindo...' : `Excluir ${pendingStatementDeletion.count} item(ns)`}</button>
            <button type="button" disabled={deletingStatement} onClick={() => setPendingStatementDeletion(null)} className={modalSecondaryActionClass}>Manter item</button>
          </div>
        </div>
      </Modal>}
      {creating && <Modal title="Novo cartão" subtitle="Identificação, numeração completa e situação inicial" icon={<CreditCard size={17}/>} onClose={() => {
          setCreating(false);
          setThirdPartyCard(false);
          setCardForm(value => ({ ...value, cardholder_name: ownerDefaults.name }));
          setProtectedDraft(emptyProtectedCard());
          encryptedDraft.current=null;
          setCreateError('');
        }} busy={saving}
        footer={<button type="submit" form="new-wallet-card-form" disabled={saving} className={modalPrimaryActionClass}>{saving ? 'Salvando...' : 'Salvar cartão'}</button>}>
       <form id="new-wallet-card-form" onSubmit={event => { void createCard(event); }} className="grid gap-3 sm:grid-cols-2">
        <datalist id="wallet-new-card-banks">{BANK_CATALOG.map(b => <option key={b.id} value={b.name}/>)}</datalist>
        <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-white">Identificação do cartão</h3>
            <p className="text-[11px] text-slate-400">Preencha os dados ou aponte a câmera para o cartão físico</p>
          </div>
          <button
            type="button"
            onClick={() => setScannerOpen(true)}
            className="flex items-center gap-1.5 rounded-xl border border-cyan-500/50 bg-cyan-950/40 px-3.5 py-2 text-xs font-bold text-cyan-200 hover:bg-cyan-900/50 hover:border-cyan-400 transition shadow-lg shadow-cyan-950/30"
          >
            <Camera size={15} className="text-cyan-400" />
            Escanear com a câmera (IA)
          </button>
        </div>
        {(['issuer', 'nickname', 'credit_limit', 'closing_day', 'due_day'] as const).map(field =>
          <label key={field} className="space-y-1 text-xs text-slate-300">
            {({issuer:'Instituição / Banco',nickname:'Apelido (opcional)',
              credit_limit:'Limite de crédito',closing_day:'Dia de fechamento',due_day:'Dia do vencimento'} as const)[field]}
            <input required={field !== 'nickname'} list={field === 'issuer' ? 'wallet-new-card-banks' : undefined} type={['closing_day','due_day'].includes(field) ? 'number':'text'}
              min={field === 'closing_day' || field === 'due_day' ? 1 : undefined}
              inputMode={field === 'credit_limit' ? 'decimal' : field === 'closing_day' || field === 'due_day' ? 'numeric' : undefined}
              placeholder={field === 'credit_limit' ? 'Ex.: 495,61' : field === 'nickname' ? 'Usa o nome do banco se vazio' : field === 'issuer' ? 'Ex.: Nubank, Itaú, Inter' : undefined}
              max={field === 'closing_day' || field === 'due_day' ? 31 : undefined}
              value={cardForm[field]} onChange={e => { requestId.current = generateUUID(); setCardForm(v => ({ ...v, [field]: e.target.value })); }}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white"/></label>)}
        <label className="space-y-1 text-xs text-slate-300">Bandeira
          <select value={cardForm.brand} onChange={e => { requestId.current = generateUUID(); setCardForm(v => ({ ...v, brand: e.target.value })); }}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white">
            {['Mastercard', 'Visa', 'Elo', 'American Express', 'Hipercard'].map(brand => <option key={brand} value={brand}>{brand}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs text-slate-300 sm:col-span-2">Conta vinculada (opcional)
          <select value={cardForm.account_id} onChange={e => {
            const nextAccountId = e.target.value;
            const matched = data.accounts.find(a => a.id === nextAccountId);
            requestId.current = generateUUID();
            setCardForm(v => ({
              ...v,
              account_id: nextAccountId,
              issuer: v.issuer || matched?.bank_name || matched?.nickname || '',
            }));
          }}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white">
            <option value="">Cartão independente (sem conta vinculada)</option>
            {data.accounts.map(account => <option key={account.id} value={account.id}>{account.nickname}</option>)}
          </select>
        </label>
        <div className="sm:col-span-2 rounded-lg border border-slate-700/70 bg-slate-950/60 p-3">
          <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm text-slate-200">
            <input type="checkbox" checked={thirdPartyCard} className="h-4 w-4 accent-blue-600"
              onChange={event => {
                const thirdParty = event.target.checked;
                setThirdPartyCard(thirdParty);
                requestId.current = generateUUID();
                setCardForm(value => ({...value,
                  cardholder_name: thirdParty ? '' : ownerDefaults.name || value.cardholder_name,
                }));
              }}/>
            Cartão de outra pessoa
          </label>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            {thirdPartyCard
              ? 'Informe o nome do titular autorizado deste cartão.'
              : ownerDefaults.name
                ? 'Titular preenchido pelo seu perfil CapitalFlow. Você pode editar o nome impresso.'
                : 'Informe o titular ou complete seu perfil CapitalFlow para preenchimento automático.'}
          </p>
        </div>
        <label className="space-y-1 text-xs text-slate-300">Nome impresso no cartão
          <input maxLength={120} autoComplete="cc-name" value={cardForm.cardholder_name} onChange={event=>{requestId.current=generateUUID();setCardForm(value=>({...value,cardholder_name:event.target.value}));}} className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white" placeholder="NOME DO TITULAR"/>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1 text-xs text-slate-300">Mês da validade<input type="number" min={1} max={12} autoComplete="cc-exp-month" value={cardForm.expiry_month} onChange={event=>{requestId.current=generateUUID();setCardForm(value=>({...value,expiry_month:event.target.value}));}} className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white" placeholder="MM"/></label>
          <label className="space-y-1 text-xs text-slate-300">Ano da validade<input type="number" min={2000} max={2200} autoComplete="cc-exp-year" value={cardForm.expiry_year} onChange={event=>{requestId.current=generateUUID();setCardForm(value=>({...value,expiry_year:event.target.value}));}} className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white" placeholder="AAAA"/></label>
        </div>
        <CardProtectedFields value={protectedDraft} onChange={value=>{requestId.current=generateUUID();encryptedDraft.current=null;setProtectedDraft(value);}}/>
        {createError&&<p role="alert" className="text-sm text-rose-300 sm:col-span-2">{createError}</p>}
        <div className="sm:col-span-2">
          <CardOpeningFields collapsible value={opening} creditLimit={(() => { try { return parseWalletMoney(cardForm.credit_limit || '0'); } catch { return 0; } })()}
            onChange={value => { requestId.current = generateUUID(); setOpening(value); }}/>
        </div>
       </form>
      </Modal>}
      {mayInitializeExisting && !creating && !newExpense && selected && <section className="rounded-2xl border border-amber-700/25 bg-slate-900 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-white">Cartão já estava em uso?</h3>
            <p className="mt-1 text-xs text-slate-400">Informe uma única vez a fatura e o limite já utilizados.</p>
          </div>
          <button type="button" onClick={() => setInitializing(value => !value)}
            className="rounded-xl border border-amber-600/40 px-3 py-2 text-xs font-bold text-amber-200">
            {initializing ? 'Fechar' : 'Informar saldo inicial'}
          </button>
        </div>
        {initializing && <form onSubmit={event => { void initializeExisting(event); }} className="mt-4 space-y-3">
          <CardOpeningFields creditLimit={Number(selected.credit_limit)} value={existingOpening} onChange={setExistingOpening}/>
          <button type="submit" disabled={saving}
            className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">
            {saving ? 'Salvando...' : 'Registrar situação inicial'}
          </button>
        </form>}
      </section>}
      {newExpense && selected && <form onSubmit={event => { void createExpense(event); }}
        className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:grid-cols-2">
        <h3 className="sm:col-span-2 text-sm font-bold text-white">Nova despesa em {selected.nickname}</h3>
        {(['description','amount','category','installment_count'] as const).map(field =>
          <label key={field} className="space-y-1 text-xs text-slate-300">
            {({description:'Descrição',amount:'Valor',category:'Categoria',installment_count:'Parcelas'} as const)[field]}
            <input required type={field === 'amount' || field === 'installment_count' ? 'number':'text'}
              min={field === 'installment_count' ? 1 : undefined} step={field === 'amount' ? '0.01' : undefined}
              value={expenseForm[field]} onChange={e => setExpenseForm(v => ({ ...v, [field]: e.target.value }))}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white"/></label>)}
        <div className="space-y-1.5 sm:col-span-2">
          <span className="block text-[11px] font-semibold text-slate-400">Categorias rápidas</span>
          <div className="flex flex-wrap gap-1.5">
            {CARD_EXPENSE_CATEGORIES.map(category => (
              <button
                key={category}
                type="button"
                onClick={() => setExpenseForm(v => ({ ...v, category }))}
                className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
                  expenseForm.category === category
                    ? 'border-blue-500 bg-blue-600/25 text-blue-100'
                    : 'border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-600'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <span className="block text-[11px] font-semibold text-slate-400">Parcelamento rápido</span>
          <div className="flex flex-wrap gap-1.5">
            {CARD_INSTALLMENT_OPTIONS.map(option => (
              <button
                key={option}
                type="button"
                onClick={() => setExpenseForm(v => ({ ...v, installment_count: option }))}
                className={`rounded-lg border px-2.5 py-1 text-xs font-bold transition ${
                  expenseForm.installment_count === option
                    ? 'border-emerald-500 bg-emerald-600/25 text-emerald-100'
                    : 'border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-600'
                }`}
              >
                {option === '1' ? 'À vista (1x)' : `${option}x`}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2 sm:col-span-2">
          <button type="button" onClick={() => setNewExpense(false)} className="rounded-xl border border-slate-700 px-4 py-3 text-xs text-white">Cancelar</button>
          <button type="submit" disabled={saving} className="rounded-xl bg-blue-600 px-4 py-3 text-xs font-bold text-white disabled:opacity-50">Registrar despesa</button>
        </div>
      </form>}
      {editing && <CardEditModal card={editing} accounts={data.accounts} onClose={() => setEditing(null)} onSaved={async () => { await refresh(); }}/>}
      {vaultCard && <CardVaultModal card={vaultCard} onClose={()=>setVaultCard(null)} onSaved={async()=>{await refresh();}}/>}
      {importing && selected && <WalletStatementImport kind="CARD" targetId={selected.id}
        initialDueMonth={statementMonth} hasOpening={Boolean(selected.initial_balance_occurred_at)}
        targetName={selected.nickname} onClose={() => setImporting(false)}
        onImported={async () => { await refresh(); }}/>}
      {paying && <PayInvoiceModal card={paying} accounts={data.accounts}
        invoiceAmount={paying.id === selected?.id ? selectedCycle?.amount || 0 : 0}
        dueMonth={statementMonth || undefined} onClose={() => setPaying(null)}
        onPay={async (cardId, month, accountId, amount, requestId) => {
          await personalWalletService.payInvoicePartial(cardId, month, accountId, amount, requestId);
          await refresh();
        }}/>}
      {overriding && selected && <InvoiceOverrideModal card={selected}
        initialDueMonth={statementMonth || creditPosition?.dueMonth || new Date().toLocaleDateString('en-CA').slice(0, 7) + '-01'}
        initialAmount={invoiceCycles.find(cycle => cycle.dueMonth === statementMonth)?.amount || 0}
        onClose={() => setOverriding(false)}
        onSave={async (dueMonth, amount, overrideRequestId) => {
          await personalWalletService.setMonthlyInvoiceOverride({ cardId: selected.id, dueMonth, amount, requestId: overrideRequestId });
          await refresh();
          setStatementMonth(dueMonth);
        }}/>}
      {cardOpeningModalOpen && selected && <CardInitialBalancesModal
        card={selected}
        initialDueMonth={statementMonth || creditPosition?.dueMonth}
        currentInvoiceAmount={creditPosition?.currentInvoice || 0}
        nativeFutureCommitments={Math.max(
          0,
          (creditPosition?.futureCommitments || 0) -
            Math.max(Number(selected.initial_future_installments_balance || 0), Number(selected.opening_unallocated_amount || 0)),
        )}
        onClose={() => setCardOpeningModalOpen(false)}
        onSaved={async () => { await refresh(); }}/>
      }
      {scannerOpen && (
        <CardCameraScannerModal
          onClose={() => setScannerOpen(false)}
          onCardRecognized={(scanned) => {
            requestId.current = generateUUID();
            setCardForm((prev) => ({
              ...prev,
              nickname: scanned.nickname || prev.nickname,
              issuer: scanned.issuer || prev.issuer,
              brand: scanned.brand || prev.brand,
              last_four: scanned.last_four || prev.last_four,
              credit_limit: scanned.credit_limit ? String(scanned.credit_limit) : prev.credit_limit,
              closing_day: scanned.closing_day ? String(scanned.closing_day) : prev.closing_day,
              due_day: scanned.due_day ? String(scanned.due_day) : prev.due_day,
            }));
            setNotice(`Cartão ${scanned.issuer} (${scanned.brand}) reconhecido com sucesso!`);
          }}
        />
      )}
      {quickExpenseOpen && <QuickExpenseModal
        accounts={data.accounts}
        cards={availableCards}
        defaultMethod="CARD"
        defaultCardId={selected?.id || null}
        onClose={() => setQuickExpenseOpen(false)}
        onSaved={async () => { await refresh(); }}/>}
    </>}
  </WalletPageFrame>;
};
