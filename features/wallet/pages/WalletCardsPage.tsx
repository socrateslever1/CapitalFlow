import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, Sparkles, Camera, CreditCard } from 'lucide-react';
import { useWalletOwnerDefaults } from '../hooks/useWalletOwnerDefaults';
import { CardCameraScannerModal } from '../../../components/wallet/CardCameraScannerModal';
import type { UserProfile } from '../../../types';
import type { PersonalWalletCard, WalletCardInvoiceFacts } from '../../../services/personalWallet.service';
import type { CardInvoiceSummary } from '../../../utils/cardInvoiceSummary';
import { CardInvoiceSummaryPreview } from '../../../components/wallet/CardInvoiceSummaryPreview';
import { personalWalletService } from '../../../services/personalWallet.service';
import { CardRegistrationAttempt } from '../domain/cardRegistration';
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
import { CardVaultModal } from '../../../components/wallet/CardVaultModal';
import { WalletBankCombobox } from '../../../components/wallet/WalletBankCombobox';

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
  const [addProtectedAfterCreate, setAddProtectedAfterCreate] = useState(true);
  const [thirdPartyCard, setThirdPartyCard] = useState(false);
  const ownerDefaults = useWalletOwnerDefaults(activeUser, creating);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [newExpense, setNewExpense] = useState(false);
  const [quickExpenseOpen, setQuickExpenseOpen] = useState(false);
  const [overriding, setOverriding] = useState(false);
  const [cardOpeningModalOpen, setCardOpeningModalOpen] = useState(false);
  const [clearingInvoice, setClearingInvoice] = useState(false);
  const [clearInvoiceConfirm, setClearInvoiceConfirm] = useState<{ cardId: string; month: string; nickname: string } | null>(null);
  const [clearInvoiceError, setClearInvoiceError] = useState('');
  const clearInvoiceRequest = useRef({ signature: '', id: generateUUID() });
  const [statementMonth, setStatementMonth] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [invoiceFacts, setInvoiceFacts] = useState<WalletCardInvoiceFacts[]>([]);
  const [invoiceFactsError, setInvoiceFactsError] = useState('');
  const [invoiceFactsModalOpen, setInvoiceFactsModalOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [createError,setCreateError]=useState('');
  const [vaultCard,setVaultCard]=useState<PersonalWalletCard|null>(null);
  const requestId = useRef(generateUUID());
  const cardRegistrationAttempt = useRef(new CardRegistrationAttempt());
  const [opening, setOpening] = useState(freshCardOpening);
  const [initializing, setInitializing] = useState(false);
  const [pendingStatementDeletion, setPendingStatementDeletion] = useState<{ ids: string[]; count: number } | null>(null);
  const [selectedStatementRows, setSelectedStatementRows] = useState<Set<string>>(new Set());
  const [deletingStatement, setDeletingStatement] = useState(false);
  const [statementDeletionFeedback, setStatementDeletionFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const [existingOpening, setExistingOpening] = useState(freshCardOpening);
  const [cardForm, setCardForm] = useState({
    nickname: '', issuer: '', brand: 'Mastercard', last_four: '', credit_limit: '', due_day: '',
    closing_day: '', account_id: '', cardholder_name:'', expiry_month:'', expiry_year:'',
  });

  const [expenseForm, setExpenseForm] = useState({
    description: '', amount: '', category: 'Compras', installment_count: '1',
  });
  const availableCards = useMemo(() => (data?.cards || []).filter(card => card.status !== 'CANCELED'), [data]);
  const displayedCards = useMemo(
    () => getCardsForDisplay(availableCards, requestedCardId),
    [availableCards, requestedCardId],
  );
  const selected = availableCards.find(card => card.id === selectedId) || displayedCards[0] || null;
  useEffect(() => {
    const cardId = selected?.id;
    if (!cardId) { setInvoiceFacts([]); return; }
    let active = true;
    setInvoiceFactsError('');
    personalWalletService.loadCardInvoiceFacts(cardId).then(items => {
      if (active) setInvoiceFacts(items);
    }).catch(error => {
      if (active) {setInvoiceFacts([]);setInvoiceFactsError(error instanceof Error ? error.message : 'Não foi possível consultar os dados bancários.');}
    });
    return () => { active = false; };
  }, [selected?.id]);
  const refreshInvoiceFacts = async () => {
    if (!selected) return;
    setInvoiceFacts(await personalWalletService.loadCardInvoiceFacts(selected.id));
    setInvoiceFactsError('');
  };
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
  const savedInvoiceFacts = invoiceFacts.find(item => item.due_month.slice(0,7) === statementMonth?.slice(0,7)) || null;
  const editableInvoiceSummary: CardInvoiceSummary = {
    institution: (['Nubank','Mercado Pago','Itaú','C6 Bank','RecargaPay'] as const).find(
      name => name === savedInvoiceFacts?.issuer) || null,
    cardLastFour: selected?.last_four || null,
    multipleCards: false,
    invoiceTotal: savedInvoiceFacts?.invoice_total ?? null,
    minimumPayment: savedInvoiceFacts?.minimum_payment ?? null,
    creditLimit: savedInvoiceFacts?.credit_limit ?? null,
    usedLimit: savedInvoiceFacts?.used_limit ?? null,
    availableLimit: savedInvoiceFacts?.available_limit ?? null,
    futureInstallments: savedInvoiceFacts?.future_installments ?? null,
    dueDate: savedInvoiceFacts?.due_date ?? (selected && statementMonth ? getInvoiceCycleDates(statementMonth, selected.closing_day, selected.due_day).dueDate : null),
    warnings: [],
  };
  const saveManualInvoiceFacts = async (summary: CardInvoiceSummary) => {
    if (!selected || !statementMonth) throw new Error('Selecione o cartão e o mês.');
    await personalWalletService.saveCardInvoiceFacts({
      cardId:selected.id,
      dueMonth:statementMonth.slice(0,7)+'-01',
      dueDate:summary.dueDate, issuer:summary.institution || selected.issuer,
      invoiceTotal:summary.invoiceTotal, minimumPayment:summary.minimumPayment,
      creditLimit:summary.creditLimit, usedLimit:summary.usedLimit,
      availableLimit:summary.availableLimit, futureInstallments:summary.futureInstallments,
      sourceHash:null, sourceType:'MANUAL',
    });
    await refreshInvoiceFacts();
    setInvoiceFactsModalOpen(false);
  };
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
    ? resolveInvoiceCycleState({
        dueMonth: statementMonth,
        closingDay: selected.closing_day,
        dueDay: selected.due_day,
        outstanding: selectedCycle?.amount || 0,
        hasCycle: Boolean(selectedCycle?.amount),
        exactDueDate: savedInvoiceFacts?.due_date,
      })
    : undefined;
  const clearUnpaidInvoice = async () => {
    if (!clearInvoiceConfirm || clearingInvoice) return;
    const signature = clearInvoiceConfirm.cardId + ':' + clearInvoiceConfirm.month;
    if (clearInvoiceRequest.current.signature !== signature) {
      clearInvoiceRequest.current = { signature, id: generateUUID() };
    }
    setClearingInvoice(true);
    setClearInvoiceError('');
    try {
      await personalWalletService.cancelUnpaidInvoiceCycle(
        clearInvoiceConfirm.cardId, clearInvoiceConfirm.month, clearInvoiceRequest.current.id,
      );
      clearInvoiceRequest.current = { signature: '', id: generateUUID() };
      await refresh();
      setClearInvoiceConfirm(null);
    } catch (cause) {
      setClearInvoiceError(cause instanceof Error ? cause.message : 'Não foi possível cancelar a fatura.');
    } finally { setClearingInvoice(false); }
  };
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
      const creditLimit = parseWalletMoney(cardForm.credit_limit.trim() || '0', 'limite de crédito');
      const position = validateCardOpening(opening, creditLimit);
      if(Boolean(cardForm.expiry_month)!==Boolean(cardForm.expiry_year))throw new Error('Informe mês e ano da validade juntos.');
      const lastFour = cardForm.last_four.trim() || null;
      if (lastFour && !/^\d{4}$/.test(lastFour)) throw new Error('Informe apenas os quatro últimos dígitos.');
      const candidate = {
        card: {
          nickname: (cardForm.nickname.trim() || cardForm.issuer.trim()), issuer: cardForm.issuer.trim(),
          brand: cardForm.brand || null, last_four: lastFour,
          credit_limit: creditLimit,
          due_day: cardForm.due_day ? Number(cardForm.due_day) : null,
          closing_day: cardForm.closing_day ? Number(cardForm.closing_day) : null,
        },
        existingAccountId: cardForm.account_id || null,
        opening: position,
        requestId: requestId.current,
        identity:{cardholder_name:cardForm.cardholder_name.trim()||null,expiry_month:cardForm.expiry_month?Number(cardForm.expiry_month):null,expiry_year:cardForm.expiry_year?Number(cardForm.expiry_year):null},
        envelope: null,
      };
      let createdCardId:string|null=null;
      try {
        const saved=await personalWalletService.createCompleteCard(cardRegistrationAttempt.current.begin(candidate));
        createdCardId=saved.card_id;
        cardRegistrationAttempt.current.confirmed();
      } catch (cause) {
        cardRegistrationAttempt.current.failed(cause);
        if (cardRegistrationAttempt.current.pending) {
          throw new Error('A resposta do banco não foi confirmada. Tente salvar novamente; o sistema reutilizará a mesma solicitação para não duplicar o cartão.');
        }
        throw cause;
      }
      try { await refresh(); }
      catch { setNotice('Cartão salvo no banco, mas a lista não foi atualizada. Toque em atualizar.'); }
      setCreating(false); setThirdPartyCard(false); setOpening(freshCardOpening());
      if(addProtectedAfterCreate && createdCardId) {
        setVaultCard({
          id:createdCardId,nickname:candidate.card.nickname,issuer:candidate.card.issuer,
          brand:candidate.card.brand,last_four:candidate.card.last_four,
          credit_limit:candidate.card.credit_limit,used_limit:position.used_limit,
          current_bill:position.invoice_amount,closing_day:candidate.card.closing_day,
          due_day:candidate.card.due_day,status:'ACTIVE',
        });
      }
      requestId.current = generateUUID();
      setCardForm({
        nickname: '', issuer: '', brand: 'Mastercard', last_four: '', credit_limit: '',
        due_day: '', closing_day: '', account_id: '', cardholder_name:'', expiry_month:'', expiry_year:'',
      });
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
          {selected && <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2.5">
            <div className="min-w-0">
              <strong className="block text-xs text-white">Valores informados pelo banco</strong>
              <p className="mt-1 text-[11px] text-slate-400">
                {savedInvoiceFacts
                  ? 'Fatura ' + formatMoney(Number(savedInvoiceFacts.invoice_total ?? 0)) +
                    ' · Mínimo ' + (savedInvoiceFacts.minimum_payment === null ? 'não informado' : formatMoney(Number(savedInvoiceFacts.minimum_payment))) +
                    ' · Disponível ' + (savedInvoiceFacts.available_limit === null ? 'não informado' : formatMoney(Number(savedInvoiceFacts.available_limit)))
                  : 'Ainda não conferidos neste ciclo'}
              </p>
              {invoiceFactsError && <p className="mt-1 text-[11px] text-amber-300">Dados bancários indisponíveis: {invoiceFactsError}</p>}
            </div>
            <button type="button" onClick={()=>setInvoiceFactsModalOpen(true)}
              className="shrink-0 rounded-lg border border-blue-500/40 px-3 py-2 text-xs font-semibold text-blue-200">
              {savedInvoiceFacts?'Corrigir vencimento e valores':'Definir vencimento e valores'}
            </button>
          </div>}
          <WalletMetricStrip items={[
            { label: 'Saldo de fatura registrado', value: formatMoney(selectedCycle?.amount || 0) },
            { label: 'Faturas posteriores', value: formatMoney(selectedFutureCommitments) },
            { label: savedInvoiceFacts?.available_limit == null ? 'Disponível estimado' : 'Disponível informado pelo banco', value: formatMoney(savedInvoiceFacts?.available_limit == null ? (creditPosition?.freeLimit || 0) : Number(savedInvoiceFacts.available_limit)), tone: 'positive' },
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
                {selected && <select aria-label="Ciclo da fatura — competência e vencimento" value={statementMonth || ''} onChange={event => setStatementMonth(event.target.value)}
                  className="mt-2 max-w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-slate-200">
                  {invoiceCycles.length ? invoiceCycles.map(cycle => {
                    const dates=getInvoiceCycleDates(cycle.dueMonth,selected.closing_day,selected.due_day,
                      invoiceFacts.find(item=>item.due_month===cycle.dueMonth)?.due_date);
                    const competence=dates.closingDate.slice(5,7)+'/'+dates.closingDate.slice(0,4);
                    const due=dates.dueDate.slice(8,10)+'/'+dates.dueDate.slice(5,7)+'/'+dates.dueDate.slice(0,4);
                    return <option key={cycle.dueMonth} value={cycle.dueMonth}>{'Fatura '+competence+' · vence '+due+(cycle.hasOverride?' · consolidada':'')}</option>;
                  }) : <option value={statementMonth || ''}>Selecione uma fatura</option>}
                </select>}
              </div>
              {selected && <div className="flex flex-wrap gap-2">
                <button type="button" onClick={()=>setVaultCard(selected)} className="min-h-11 rounded-xl border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800">Dados completos do cartão</button>
                <button type="button" onClick={() => setQuickExpenseOpen(true)} className="rounded-xl bg-blue-600 hover:bg-blue-500 px-3 py-2 text-xs font-bold text-white">Lançamento rápido</button>
                <button type="button" onClick={() => setCardOpeningModalOpen(true)} className="rounded-xl border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-xs font-bold text-blue-200 hover:bg-blue-500/20">Situação inicial</button>
                <button type="button" onClick={() => setOverriding(true)} className="rounded-xl border border-amber-600/50 px-3 py-2 text-xs font-bold text-amber-200">✏️ Corrigir valor, mês e vencimento</button>
                {statementMonth && (selectedCycle?.amount || 0) > 0 && <button type="button" onClick={() => {setClearInvoiceError('');setClearInvoiceConfirm({cardId:selected.id,month:statementMonth,nickname:selected.nickname});}} className="min-h-11 rounded-xl border border-rose-600/50 px-3 py-2 text-xs font-semibold text-rose-200">Excluir fatura não paga</button>}
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
                  targetIssuer={selected.issuer} targetLastFour={selected.last_four}
                  existingRows={data.statementRows}
                  onSummarySaved={refreshInvoiceFacts}
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
              cycleDates={statementMonth ? getInvoiceCycleDates(statementMonth, selected.closing_day, selected.due_day, savedInvoiceFacts?.due_date) : undefined}
              onEdit={async (input, mutationRequestId) => { await personalWalletService.updateExpense(input, mutationRequestId); await refresh(); }}
              onDelete={async (id, mutationRequestId) => { await personalWalletService.cancelExpense(id, mutationRequestId); await refresh(); }}
              onCancelConsolidation={async (dueMonth, mutationRequestId) => { await personalWalletService.cancelInvoiceConsolidation(selected.id, dueMonth, mutationRequestId); await refresh(); }}
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
      {creating && <Modal title="Novo cartão" subtitle="Identificação e valores opcionais" icon={<CreditCard size={17}/>} onClose={() => {
          setCreating(false);
          setThirdPartyCard(false);
          setCreateError('');
        }} busy={saving}
        footer={<button type="submit" form="new-wallet-card-form" disabled={saving} className={modalPrimaryActionClass}>{saving ? 'Salvando...' : 'Salvar cartão'}</button>}>
       <form id="new-wallet-card-form" onSubmit={event => { void createCard(event); }} className="grid gap-3 sm:grid-cols-2">

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
        <WalletBankCombobox value={cardForm.issuer} disabled={saving}
          onChange={value=>{requestId.current=generateUUID();setCardForm(v=>({...v,issuer:value}));}}/>
        <label className="space-y-1 text-xs text-slate-300">
          Apelido (opcional)
          <input name="wallet-card-nickname" type="text" autoComplete="off" maxLength={120} placeholder="Ex.: Cartão principal" value={cardForm.nickname}
            onChange={e=>{requestId.current=generateUUID();setCardForm(v=>({...v,nickname:e.target.value}));}}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white"/>
        </label>
        <label className="space-y-1 text-xs text-slate-300">
          Final do cartão (opcional)
          <input name="wallet-card-last-four" autoComplete="off" inputMode="numeric" maxLength={4} pattern="[0-9]{4}" placeholder="Ex.: 1234"
            value={cardForm.last_four}
            onChange={e=>{requestId.current=generateUUID();setCardForm(v=>({...v,last_four:e.target.value.replace(/\D/g,'').slice(0,4)}));}}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white"/>
        </label>
        <label className="space-y-1 text-xs text-slate-300 sm:col-span-2">
          Limite total (R$, opcional)
          <input name="wallet-card-credit-limit" autoComplete="off" inputMode="decimal" placeholder="Pode informar ou importar pela fatura depois"
            value={cardForm.credit_limit}
            onChange={e=>{requestId.current=generateUUID();setCardForm(v=>({...v,credit_limit:e.target.value}));}}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white"/>
        </label>
        <p className="sm:col-span-2 text-xs leading-relaxed text-slate-400">
          Apenas o banco é obrigatório. Sem senha extra, número completo ou CVC.
          Os valores podem ser ajustados depois pela fatura.
        </p>
        <details className="sm:col-span-2 rounded-xl border border-slate-800 bg-slate-950/50">
          <summary className="cursor-pointer px-3 py-3 text-xs font-semibold text-blue-200">
            Mais informações (opcional): datas, bandeira, titular e vínculo
          </summary>
          <div className="grid gap-3 border-t border-slate-800 p-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs text-slate-300">Bandeira
              <select name="wallet-card-brand" autoComplete="off" value={cardForm.brand} onChange={e=>{requestId.current=generateUUID();setCardForm(v=>({...v,brand:e.target.value}));}}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white">
                {['Mastercard','Visa','Elo','American Express','Hipercard'].map(brand=><option key={brand} value={brand}>{brand}</option>)}
              </select>
            </label>
            {(['closing_day','due_day'] as const).map(field=>
              <label key={field} className="space-y-1 text-xs text-slate-300">
                {field==='closing_day'?'Dia do fechamento':'Dia do vencimento'}
                <input type="number" min={1} max={31} inputMode="numeric" placeholder="Não informado"
                  value={cardForm[field]} onChange={e=>{requestId.current=generateUUID();setCardForm(v=>({...v,[field]:e.target.value}));}}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white"/>
              </label>
            )}
            <label className="space-y-1 text-xs text-slate-300 sm:col-span-2">Conta vinculada (opcional)
              <select name="wallet-card-linked-account" value={cardForm.account_id} onChange={e=>{
                requestId.current=generateUUID();
                setCardForm(v=>({...v,account_id:e.target.value}));
              }} className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white">
                <option value="">Sem vínculo bancário</option>
                {data.accounts.map(account=><option key={account.id} value={account.id}>{account.nickname}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-200 sm:col-span-2">
              <input type="checkbox" checked={thirdPartyCard} className="h-4 w-4 accent-blue-600"
                onChange={e=>{setThirdPartyCard(e.target.checked);requestId.current=generateUUID();}}/>Cartão de outra pessoa
            </label>
            <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-slate-300">O nome impresso é independente do perfil</span>
              {!thirdPartyCard && ownerDefaults.name && <button type="button"
                onClick={()=>{requestId.current=generateUUID();setCardForm(v=>({...v,cardholder_name:ownerDefaults.name}));}}
                className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-blue-200">
                Usar nome do perfil
              </button>}
            </div>
            <label className="space-y-1 text-xs text-slate-300 sm:col-span-2">Nome impresso (opcional)
              <input type="text" maxLength={120} autoComplete="off" name="wallet-card-printed-name" placeholder="Nome do titular"
                value={cardForm.cardholder_name}
                onChange={e=>{requestId.current=generateUUID();setCardForm(v=>({...v,cardholder_name:e.target.value}));}}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white"/>
            </label>
            <label className="space-y-1 text-xs text-slate-300">Validade — mês
              <input type="number" min={1} max={12} placeholder="MM" value={cardForm.expiry_month}
                onChange={e=>{requestId.current=generateUUID();setCardForm(v=>({...v,expiry_month:e.target.value}));}}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white"/>
            </label>
            <label className="space-y-1 text-xs text-slate-300">Validade — ano
              <input type="number" min={2000} max={2200} placeholder="AAAA" value={cardForm.expiry_year}
                onChange={e=>{requestId.current=generateUUID();setCardForm(v=>({...v,expiry_year:e.target.value}));}}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white"/>
            </label>
          </div>
        </details>
        <label className="flex items-center gap-2 text-xs text-slate-200 sm:col-span-2">
          <input type="checkbox" checked={addProtectedAfterCreate}
            onChange={e=>setAddProtectedAfterCreate(e.target.checked)}
            className="h-4 w-4 accent-blue-600"/>
          Depois de salvar, adicionar o número completo para acesso rápido (opcional)
        </label>
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
      {invoiceFactsModalOpen && selected && <Modal title="Valores reais da fatura"
        subtitle={selected.nickname + ' · ' + (statementMonth || '').slice(0,7)}
        onClose={()=>setInvoiceFactsModalOpen(false)}>
        <CardInvoiceSummaryPreview key={selected.id + ':' + statementMonth + ':' + (savedInvoiceFacts?.updated_at || '')}
          summary={editableInvoiceSummary} onSave={saveManualInvoiceFacts}/>
      </Modal>}
      {clearInvoiceConfirm && <Modal title="Excluir fatura não paga?" subtitle={clearInvoiceConfirm.nickname + ' · ' + clearInvoiceConfirm.month.slice(0, 7)} busy={clearingInvoice} onClose={() => !clearingInvoice && setClearInvoiceConfirm(null)}
        footer={<button type="button" disabled={clearingInvoice} onClick={() => {void clearUnpaidInvoice();}} className={modalPrimaryActionClass}>Confirmar exclusão da fatura</button>}>
        <p className="text-xs leading-relaxed text-slate-300">Os lançamentos financeiros não pagos que pertencem exclusivamente a esta fatura serão cancelados e mantidos no histórico. A operação será bloqueada se houver pagamento ou parcelas de outros meses. Não há estorno automático.</p>
        {clearInvoiceError && <p role="alert" className="mt-3 text-xs text-rose-300">{clearInvoiceError}</p>}
      </Modal>}
      {editing && <CardEditModal card={editing} accounts={data.accounts} onClose={() => setEditing(null)} onSaved={async () => { await refresh(); }}/>}
      {vaultCard && <CardVaultModal card={vaultCard} onClose={()=>setVaultCard(null)} onSaved={async()=>{await refresh();}}/>}
      {importing && selected && <WalletStatementImport kind="CARD" targetId={selected.id}
        initialDueMonth={statementMonth} hasOpening={Boolean(selected.initial_balance_occurred_at)}
        targetName={selected.nickname} targetIssuer={selected.issuer} targetLastFour={selected.last_four} existingRows={data.statementRows} onSummarySaved={refreshInvoiceFacts} onClose={() => setImporting(false)}
        onImported={async () => { await refresh(); }}/>}
      {paying && <PayInvoiceModal card={paying} accounts={data.accounts}
        invoiceAmount={paying.id === selected?.id ? selectedCycle?.amount || 0 : 0}
        dueMonth={statementMonth || undefined} dueDate={statementMonth && selected ? getInvoiceCycleDates(statementMonth, selected.closing_day, selected.due_day, savedInvoiceFacts?.due_date).dueDate : null} onClose={() => setPaying(null)}
        onPay={async (cardId, month, accountId, amount, requestId) => {
          await personalWalletService.payInvoicePartial(cardId, month, accountId, amount, requestId);
          await refresh();
        }}/>}
      {overriding && selected && <InvoiceOverrideModal card={selected}
        initialDueMonth={statementMonth || creditPosition?.dueMonth || new Date().toLocaleDateString('en-CA').slice(0, 7) + '-01'}
        initialDueDate={savedInvoiceFacts?.due_date}
        initialAmount={invoiceCycles.find(cycle => cycle.dueMonth === statementMonth)?.amount || 0}
        hasExistingConsolidation={Boolean(selectedCycle?.hasOverride)}
        onClose={() => setOverriding(false)}
        onSave={async (dueMonth, amount, dueDate, overrideRequestId) => {
          await personalWalletService.correctInvoiceOverride({
            cardId:selected.id,
            previousDueMonth:selectedCycle?.hasOverride ? statementMonth : null,
            dueMonth,dueDate,amount,requestId:overrideRequestId,
          });
          await refresh();
          await refreshInvoiceFacts();
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
