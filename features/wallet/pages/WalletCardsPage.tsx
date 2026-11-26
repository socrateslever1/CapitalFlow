import { PrivateMoney, useFinancialPrivacy } from '../../../contexts/FinancialPrivacyContext';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Camera, CreditCard } from 'lucide-react';
import { useWalletOwnerDefaults } from '../hooks/useWalletOwnerDefaults';
import { CardCameraScannerModal } from '../../../components/wallet/CardCameraScannerModal';
import type { UserProfile } from '../../../types';
import type { PersonalWalletCard, WalletCardInvoiceFacts } from '../../../services/personalWallet.service';
import { issuerMatchesBank, type CardInvoiceSummary } from '../../../utils/cardInvoiceSummary';
import { personalWalletService } from '../../../services/personalWallet.service';
import { walletRepository } from '../services/walletRepository';
import { CardRegistrationAttempt } from '../domain/cardRegistration';
import { BankStack } from '../../../components/wallet/BankStack';
import { CardInvoiceStatement } from '../../../components/wallet/CardInvoiceStatement';
import { CardEditModal } from '../../../components/wallet/CardEditModal';
import { PayInvoiceModal } from '../../../components/wallet/PayInvoiceModal';
import { WalletStatementImport } from '../../../components/wallet/WalletStatementImport';
import { FlatSmartStatementReader } from '../../../components/wallet/FlatSmartStatementReader';
import { InvoiceOverrideModal } from '../../../components/wallet/InvoiceOverrideModal';
import { getCardCreditPosition, getInvoiceCycleDates, getPurchaseInvoiceMonth, getSelectedInvoiceCycle, getVisibleInvoiceCycles, resolveInvoiceCycleState } from '../../../components/wallet/invoiceStatementDomain';
import { formatMoney } from '../../../utils/formatters';
import { generateUUID } from '../../../utils/generators';
import { CardOpeningFields, freshCardOpening, validateCardOpening } from '../components/CardOpeningFields';
import { useWalletSnapshot } from '../hooks/useWalletSnapshot';
import { WalletPageFrame } from '../components/WalletPageFrame';
import { getCardsForDisplay } from '../cardSummaryNavigation';
import { CardInitialBalancesModal } from '../../../components/wallet/CardInitialBalancesModal';
import { QuickExpenseModal } from '../components/QuickExpenseModal';
import { Modal, modalPrimaryActionClass, modalSecondaryActionClass } from '../../../components/ui/Modal';
import { formatWalletMoneyInput, parseWalletMoney } from '../utils/parseWalletMoney';
import { resolveLiveBrazilianCentsChange, formatPastedBrazilianMoney } from '../utils/liveBrazilianMoneyInput';
import { resolveInvoiceMonthSelection, resolveManualInvoiceMonth } from '../utils/minhasFinancasWalletTools';
import { businessDateInManaus } from '../../../utils/businessDate';
import type { PersonalWalletExpense, PersonalWalletExpenseInstallment } from '../../../services/personalWallet.service';
import type { InstallmentDeleteScope } from '../../../components/wallet/CardInvoiceStatement';
import type { InvoiceRemainderAction } from '../../../components/wallet/PayInvoiceModal';
import { CardVaultModal } from '../../../components/wallet/CardVaultModal';
import { WalletBankCombobox } from '../../../components/wallet/WalletBankCombobox';
import { getCardAvailablePresentation, formatCardAvailableOrigin, getInvoiceAdditionsSinceReferenceCents } from '../domain/cardAvailablePresentation';
import { resolveCardInvoiceFactsView } from '../domain/cardInvoiceFactsView';
import { CategoryBreakdownPanel } from '../../../components/wallet/CategoryBreakdownPanel';
import { getCardInvoiceCategoryBreakdown } from '../domain/walletCategoryBreakdown';

/** Fatura identificada pelo mês de vencimento, como o banco a chama (ex.: "dez/2026"). */
const invoiceDueMonthLabel = (dueDate: string): string => {
  const [year, month] = dueDate.slice(0, 7).split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, 1))).replace('.', '').replace(' de ', '/');
};
const shortDayMonth = (isoDate: string): string => isoDate.slice(8, 10) + '/' + isoDate.slice(5, 7);

export const WalletCardsPage: React.FC<{ activeUser?: UserProfile | null; onNavigate: (path: string) => void }> = ({ activeUser }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedCardId = searchParams.get('card');
  const requestedAction = searchParams.get('acao');
  const closeFocusedCard = () => {
    if (location.state?.walletDetailFromOverview && Number(window.history.state?.idx ?? 0) > 0) {
      navigate(-1);
    } else {
      // Link direto: retornar primeiro à lista, nunca saltar ao Painel.
      navigate('/carteira/cartoes', { replace: true });
    }
  };
  useEffect(() => {
    if (!requestedCardId) return;
    const onBack = (event: Event) => { event.preventDefault(); closeFocusedCard(); };
    window.addEventListener('capitalflow:back', onBack);
    return () => window.removeEventListener('capitalflow:back', onBack);
  }, [requestedCardId, location.state, navigate]);
  const { data, loading, error, refresh } = useWalletSnapshot();
  const [selectedId, setSelectedId] = useState<string | null>(requestedCardId);
  const [editing, setEditing] = useState<PersonalWalletCard | null>(null);
  const [paying, setPaying] = useState<PersonalWalletCard | null>(null);
  const [importing, setImporting] = useState(false);
  const [flatReaderOpen, setFlatReaderOpen] = useState(false);
  const openReader = () => setFlatReaderOpen(true);
  const [creating, setCreating] = useState(false);
  const [addProtectedAfterCreate, setAddProtectedAfterCreate] = useState(true);
  const [thirdPartyCard, setThirdPartyCard] = useState(false);
  const ownerDefaults = useWalletOwnerDefaults(activeUser, creating);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [quickExpenseOpen, setQuickExpenseOpen] = useState(false);
  const [quickExpenseCardId, setQuickExpenseCardId] = useState<string | null>(null);
  const [quickExpenseDueMonth, setQuickExpenseDueMonth] = useState<string | null>(null);
  const hideFinancialValues = useFinancialPrivacy();
  const [overriding, setOverriding] = useState(false);
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [invoiceHistoryOpen, setInvoiceHistoryOpen] = useState(false);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [cardOpeningModalOpen, setCardOpeningModalOpen] = useState(false);
  const [clearingInvoice, setClearingInvoice] = useState(false);
  const [clearInvoiceConfirm, setClearInvoiceConfirm] = useState<{ cardId: string; month: string; nickname: string } | null>(null);
  const [clearInvoiceError, setClearInvoiceError] = useState('');
  const clearInvoiceRequest = useRef({ signature: '', id: generateUUID() });
  const [requestedStatementMonth, setStatementMonth] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [fetchedInvoiceFacts, setFetchedInvoiceFacts] = useState<{
    cardId: string;
    source: readonly WalletCardInvoiceFacts[] | undefined;
    outcome: 'READY' | 'ERROR';
    facts: WalletCardInvoiceFacts[];
  } | null>(null);
  const [invoiceFactsError, setInvoiceFactsError] = useState('');
  // Shared between automatic fetch and manual refresh. A late request cannot
  // overwrite facts belonging to a newer snapshot or selected card.
  const invoiceFactsRequestGeneration = useRef(0);
  const [editingBankAvailable, setEditingBankAvailable] = useState(false);
  const [bankAvailableDraft, setBankAvailableDraft] = useState('');
  const [savingBankAvailable, setSavingBankAvailable] = useState(false);
  const [bankAvailableFeedback, setBankAvailableFeedback] = useState('');
  const bankAvailableRequest = useRef({ signature: '', id: generateUUID() });
  const [applyingIssuerFacts, setApplyingIssuerFacts] = useState(false);
  const [issuerCommitFeedback, setIssuerCommitFeedback] = useState('');
  const issuerCommitRequest = useRef({ signature: '', id: generateUUID() });
  const [notice, setNotice] = useState('');
  const [createError, setCreateError] = useState('');
  const [vaultCard, setVaultCard] = useState<PersonalWalletCard | null>(null);
  const requestId = useRef(generateUUID());
  const cardRegistrationAttempt = useRef(new CardRegistrationAttempt());
  const [opening, setOpening] = useState(freshCardOpening);
  const [initializing, setInitializing] = useState(false);
  const [pendingStatementDeletion, setPendingStatementDeletion] = useState<{ ids: string[]; count: number } | null>(null);
  const [selectedStatementRows, setSelectedStatementRows] = useState<Set<string>>(new Set());
  const [removedStatementRowIds, setRemovedStatementRowIds] = useState<Set<string>>(new Set());
  const [deletingStatement, setDeletingStatement] = useState(false);
  const [statementDeletionFeedback, setStatementDeletionFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const [existingOpening, setExistingOpening] = useState(freshCardOpening);
  const [cardForm, setCardForm] = useState({
    nickname: '', issuer: '', brand: 'Mastercard', last_four: '', credit_limit: '', due_day: '',
    closing_day: '', account_id: '', cardholder_name: '', expiry_month: '', expiry_year: '',
  });
  const [newLinkedAccountNickname, setNewLinkedAccountNickname] = useState('');
  const availableCards = useMemo(() => (data?.cards || []).filter(card => card.status !== 'CANCELED'), [data]);
  const displayedCards = useMemo(
    () => getCardsForDisplay(availableCards, requestedCardId),
    [availableCards, requestedCardId],
  );
  const selected = availableCards.find(card => card.id === selectedId) || displayedCards[0] || null;
  // Reuse the bank facts from the complete (owner-scoped) snapshot immediately.
  const invoiceFactsView = useMemo(
    () => resolveCardInvoiceFactsView(selected?.id || null, data?.cardInvoiceFacts, fetchedInvoiceFacts),
    [selected?.id, data?.cardInvoiceFacts, fetchedInvoiceFacts],
  );
  const invoiceFacts = invoiceFactsView.facts;
  const availablePresentation = selected ? getCardAvailablePresentation(selected, invoiceFacts, data || undefined) : null;
  const bankLimitStatus: 'LOADING' | 'READY' | 'ERROR' =
    availablePresentation?.origin === 'BANK' ? 'READY' : invoiceFactsView.status;
  useEffect(() => {
    setEditingBankAvailable(false);
    setBankAvailableFeedback('');
  }, [selected?.id, requestedStatementMonth]);

  useEffect(() => {
    const generation = ++invoiceFactsRequestGeneration.current;
    const cardId = selected?.id;
    if (!cardId) {
      setFetchedInvoiceFacts(null);
      setInvoiceFactsError('');
      return;
    }
    const source = data?.cardInvoiceFacts;
    let active = true;
    setInvoiceFactsError('');
    walletRepository.loadCardInvoiceFacts(cardId).then(items => {
      if (active && generation === invoiceFactsRequestGeneration.current) {
        setFetchedInvoiceFacts({ cardId, source, outcome: 'READY', facts: items });
      }
    }).catch(cause => {
      if (active && generation === invoiceFactsRequestGeneration.current) {
        setFetchedInvoiceFacts({ cardId, source, outcome: 'ERROR', facts: [] });
        setInvoiceFactsError(cause instanceof Error ? cause.message : 'Não foi possível consultar os dados bancários.');
      }
    });
    return () => {
      active = false;
      if (generation === invoiceFactsRequestGeneration.current) {
        invoiceFactsRequestGeneration.current += 1;
      }
    };
  }, [selected?.id, data?.cardInvoiceFacts]);
  // Also invalidate an in-flight manual refresh if the page unmounts.
  useEffect(() => () => { invoiceFactsRequestGeneration.current += 1; }, []);
  const refreshInvoiceFacts = async () => {
    if (!selected) return;
    const generation = ++invoiceFactsRequestGeneration.current;
    const cardId = selected.id;
    const source = data?.cardInvoiceFacts;
    try {
      const items = await walletRepository.loadCardInvoiceFacts(cardId);
      if (generation !== invoiceFactsRequestGeneration.current) return;
      setFetchedInvoiceFacts({ cardId, source, outcome: 'READY', facts: items });
      setInvoiceFactsError('');
    } catch (cause) {
      // A rejected request from an older generation cannot revive a stale error.
      if (generation !== invoiceFactsRequestGeneration.current) return;
      setFetchedInvoiceFacts({ cardId, source, outcome: 'ERROR', facts: [] });
      setInvoiceFactsError(cause instanceof Error ? cause.message : 'Não foi possível consultar os dados bancários.');
      throw cause;
    }
  };
  const importedStatementRows = selected
    ? data?.statementRows.filter(row => {
      if (removedStatementRowIds.has(row.id)) return false;
      if (row.target_kind !== 'CARD' || row.target_id !== selected.id) return false;
      if (!row.expense_id) return true;
      return data.expenses.some(expense => expense.id === row.expense_id && expense.status !== 'CANCELED');
    }) || []
    : [];
  const importedStatementTotal = importedStatementRows.reduce((total, row) => total + Number(row.amount || 0), 0);
  const linkedStatementCount = importedStatementRows.filter(row => row.expense_id).length;
  const unlinkedStatementRows = importedStatementRows.filter(row => !row.expense_id);
  const unlinkedStatementCount = unlinkedStatementRows.length;
  const unlinkedStatementTotal = unlinkedStatementRows.reduce((total, row) => total + Number(row.amount || 0), 0);
  const removeImportedStatementRows = async (rowIds: string[]) => {
    setDeletingStatement(true);
    setStatementDeletionFeedback(null);
    const failedIds = new Set<string>();
    const failureMessages: string[] = [];
    let deletedCount = 0;
    const deletedRowIds: string[] = [];
    try {
      const unlinkedRows = unlinkedStatementRows.filter(item => rowIds.includes(item.id));
      if (unlinkedRows.length) {
        try {
          const removed = await personalWalletService.deleteStatementRows(unlinkedRows.map(row => row.id));
          deletedCount += removed;
          if (removed === unlinkedRows.length) {
            deletedRowIds.push(...unlinkedRows.map(row => row.id));
          } else {
            unlinkedRows.forEach(row => failedIds.add(row.id));
            failureMessages.push(`O banco removeu ${removed} de ${unlinkedRows.length} itens selecionados.`);
          }
        } catch (cause) {
          unlinkedRows.forEach(row => failedIds.add(row.id));
          failureMessages.push(cause instanceof Error ? cause.message : 'Falha ao excluir itens importados.');
        }
      }
      if (deletedRowIds.length) {
        setRemovedStatementRowIds(current => new Set([...current, ...deletedRowIds]));
      }
      setPendingStatementDeletion(failedIds.size
        ? { ids: [...failedIds], count: failedIds.size }
        : null);
      setSelectedStatementRows(failedIds);
      if (failureMessages.length) {
        setStatementDeletionFeedback({
          tone: 'error',
          message: `${deletedCount} item(ns) removido(s); ${failedIds.size} falharam. ${failureMessages[0]}`,
        });
      } else {
        setStatementDeletionFeedback({ tone: 'success', message: `${deletedCount} item(ns) removido(s) do extrato.` });
      }
      if (deletedCount > 0 || failedIds.size > 0) {
        void refresh().catch(() => {
          setStatementDeletionFeedback(current => current ? {
            tone: 'error',
            message: `${current.message} A lista não atualizou; abra a Carteira novamente para sincronizar.`,
          } : null);
        });
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
  useEffect(() => {
    const currentRowIds = new Set((data?.statementRows || []).filter(row =>
      row.target_kind === 'CARD'
      && row.target_id === selected?.id
      && !row.expense_id
    ).map(row => row.id));
    setRemovedStatementRowIds(current => {
      const remaining = new Set([...current].filter(id => currentRowIds.has(id)));
      return remaining.size === current.size ? current : remaining;
    });
    setSelectedStatementRows(current => {
      const remaining = new Set([...current].filter(id => currentRowIds.has(id)));
      return remaining.size === current.size ? current : remaining;
    });
    setPendingStatementDeletion(current => {
      if (!current) return null;
      const ids = current.ids.filter(id => currentRowIds.has(id));
      if (!ids.length) return null;
      return ids.length === current.ids.length ? current : { ids, count: ids.length };
    });
  }, [data?.statementRows, data?.expenses, selected?.id]);
  const creditPosition = useMemo(() => data && selected
    ? getCardCreditPosition(selected, data.expenses, data.installments)
    : null, [data, selected]);
  const invoiceCycles = useMemo(() => {
    if (!data || !selected) return [];
    return getVisibleInvoiceCycles(
      selected.id, data.expenses, data.installments, invoiceFacts,
      selected.invoice_cancel_requests,
    );
  }, [data, selected, invoiceFacts]);
  const suggestedNewInvoiceMonth = selected
    ? getPurchaseInvoiceMonth(businessDateInManaus(), selected.closing_day, selected.due_day)
    : businessDateInManaus().slice(0, 7) + '-01';
  // Keep the selected value in the list of rendered invoice cycles.
  // A stale cycle from a previously selected card must not make the browser
  // display one invoice in the select while the header shows another.
  // Abre na fatura a pagar (fechada e ainda não vencida, ou a aberta), não na
  // próxima: no dia do fechamento a fatura do mês continua sendo a que se paga.
  const statementMonth = resolveInvoiceMonthSelection(
    requestedStatementMonth,
    invoiceCycles,
    creditPosition?.dueMonth || suggestedNewInvoiceMonth,
  );
  useEffect(() => {
    setStatementMonth(null);
    setInvoiceHistoryOpen(false);
  }, [selected?.id]);
  const savedInvoiceFacts = invoiceFacts.find(item => item.card_id === selected?.id && item.due_month.slice(0, 7) === statementMonth?.slice(0, 7)) || null;
  // A conferência manual pode registrar o primeiro mês mesmo sem qualquer ciclo financeiro.
  const invoiceFactsSummaryForMonth = (targetMonth: string | null): CardInvoiceSummary => {
    const editedInvoiceFacts = invoiceFacts.find(item => item.card_id === selected?.id && item.due_month.slice(0, 7) === targetMonth?.slice(0, 7)) || null;
    const facts = editedInvoiceFacts;
    const isCurrentCycle = Boolean(targetMonth && creditPosition?.dueMonth && targetMonth.slice(0, 7) === creditPosition.dueMonth.slice(0, 7));
    return {
      institution: (['Nubank', 'Mercado Pago', 'Itaú', 'C6 Bank', 'RecargaPay', 'Bradesco', 'PicPay', 'Santander', 'Banco do Brasil', 'Inter', 'Caixa'] as const).find(
        name => (facts?.issuer || selected?.issuer) && issuerMatchesBank(facts?.issuer || selected?.issuer, name)) || null,
      cardLastFour: selected?.last_four || null,
      multipleCards: false,
      invoiceTotal: facts?.invoice_total ?? (isCurrentCycle && Number(selected?.current_bill || 0) > 0 ? Number(selected?.current_bill) : null),
      minimumPayment: facts?.minimum_payment ?? null,
      creditLimit: facts?.credit_limit ?? (selected?.credit_limit != null ? Number(selected.credit_limit) : null),
      usedLimit: facts?.used_limit ?? (isCurrentCycle && Number(creditPosition?.committedLimit || 0) > 0 ? Number(creditPosition?.committedLimit) : null),
      // Limite calculado pela Carteira não é um valor informado pelo emissor.
      availableLimit: editedInvoiceFacts?.available_limit ?? null,
      futureInstallments: facts?.future_installments ?? (isCurrentCycle && Number(selected?.initial_future_installments_balance || 0) > 0 ? Number(selected.initial_future_installments_balance) : null),
      dueDate: facts?.due_date ?? (selected && targetMonth ? getInvoiceCycleDates(targetMonth, selected.closing_day, selected.due_day).dueDate : null),
      warnings: [],
    };
  };
  const saveInvoiceFactsForMonth = async (dueMonth: string, summary: CardInvoiceSummary) => {
    const confirmedDueMonth = resolveManualInvoiceMonth(dueMonth);
    if (!selected || !confirmedDueMonth)
      throw new Error('Selecione um cartão e um mês de vencimento válido.');
    const confirmed = await personalWalletService.saveCardInvoiceFacts({
      cardId: selected.id,
      dueMonth: confirmedDueMonth,
      dueDate: summary.dueDate, issuer: summary.institution || selected.issuer,
      invoiceTotal: summary.invoiceTotal, minimumPayment: summary.minimumPayment,
      creditLimit: summary.creditLimit, usedLimit: summary.usedLimit,
      availableLimit: summary.availableLimit, futureInstallments: summary.futureInstallments,
      sourceHash: null, sourceType: 'MANUAL',
    });
    await Promise.all([refreshInvoiceFacts(), refresh()]);
    setStatementMonth(confirmed.due_month);
    return confirmed;
  };
  const selectedCycle = selected && data
    ? getSelectedInvoiceCycle(selected.id, statementMonth, data.expenses, data.installments)
    : null;
  const savedInvoiceTotalCents = savedInvoiceFacts?.invoice_total == null
    ? null : Math.round(Number(savedInvoiceFacts.invoice_total) * 100);
  // Compare o saldo líquido do ciclo, incluindo créditos e estornos.
  // A soma bruta superestimava R$ 172,00 quando havia crédito de R$ 86,00.
  const registeredInvoiceTotalCents = Math.round(Number(selectedCycle?.amount || 0) * 100);
  // Compras lançadas depois da referência do banco explicam parte da diferença;
  // só sobra para o aviso o que elas NÃO explicam.
  const invoiceAdditionsSinceReferenceCents = selected && data && statementMonth && savedInvoiceFacts?.updated_at
    ? getInvoiceAdditionsSinceReferenceCents({
      cardId: selected.id, dueMonth: statementMonth, referenceUpdatedAt: savedInvoiceFacts.updated_at,
      expenses: data.expenses, installments: data.installments,
      payments: data.invoicePayments,
    })
    : 0;
  const invoiceTotalDifferenceCents = savedInvoiceTotalCents === null
    ? null : savedInvoiceTotalCents + invoiceAdditionsSinceReferenceCents - registeredInvoiceTotalCents;

  const bankFactLastUpdate = savedInvoiceFacts?.updated_at
    ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Manaus', day: '2-digit', month: '2-digit' })
      .format(new Date(savedInvoiceFacts.updated_at))
    : null;
  const canCorrectBankReference = Boolean(
    selected && savedInvoiceFacts?.source_type === 'MANUAL' && data?.expenses.some(expense =>
      expense.card_id === selected.id && expense.status !== 'CANCELED'),
  );
  const saveObservedBankAvailable = async () => {
    if (!selected || !savedInvoiceFacts || !canCorrectBankReference || savingBankAvailable) return;
    setBankAvailableFeedback('');
    let amount: number;
    let limit: number;
    try {
      amount = parseWalletMoney(bankAvailableDraft, 'limite disponível');
      limit = Number(savedInvoiceFacts.credit_limit ?? selected.credit_limit);
      if (!Number.isFinite(limit) || limit <= 0 || !Number.isSafeInteger(Math.round(limit * 100))
        || amount > limit) throw new Error('O disponível deve estar entre zero e o limite total.');
    } catch (err) {
      setBankAvailableFeedback(err instanceof Error ? err.message : 'Valor inválido.');
      return;
    }
    const limitCents = Math.round(limit * 100);
    const amountCents = Math.round(amount * 100);
    const signature = [selected.id, savedInvoiceFacts.due_month, amountCents, savedInvoiceFacts.updated_at].join(':');
    if (bankAvailableRequest.current.signature !== signature) {
      bankAvailableRequest.current = { signature, id: generateUUID() };
    }
    setSavingBankAvailable(true);
    try {
      const result = await personalWalletService.saveCardInvoiceFacts({
        cardId: selected.id,
        dueMonth: savedInvoiceFacts.due_month,
        dueDate: savedInvoiceFacts.due_date,
        issuer: savedInvoiceFacts.issuer ?? selected.issuer,
        invoiceTotal: savedInvoiceFacts.invoice_total == null ? null : Number(savedInvoiceFacts.invoice_total),
        minimumPayment: savedInvoiceFacts.minimum_payment == null ? null : Number(savedInvoiceFacts.minimum_payment),
        creditLimit: limitCents / 100,
        usedLimit: (limitCents - amountCents) / 100,
        availableLimit: amountCents / 100,
        futureInstallments: savedInvoiceFacts.future_installments == null ? null : Number(savedInvoiceFacts.future_installments),
        sourceHash: null,
        sourceType: 'MANUAL',
      }, bankAvailableRequest.current.id);
      if (result.financial_applied) {
        // Esta tela só deve registrar a observação; uma abertura financeira não é esperada.
        throw new Error('A operação afetou a posição inicial; confira o histórico antes de repetir.');
      }
      await Promise.all([refreshInvoiceFacts(), refresh()]);
      bankAvailableRequest.current = { signature: '', id: generateUUID() };
      setEditingBankAvailable(false);
      setBankAvailableFeedback('Referência bancária atualizada. Os lançamentos e os limites calculados não foram alterados.');
    } catch (error) {
      setBankAvailableFeedback(error instanceof Error ? error.message : 'Não foi possível salvar a referência.');
    } finally {
      setSavingBankAvailable(false);
    }
  };
  const mayApplySavedIssuerFacts = Boolean(
    selected && savedInvoiceFacts && (selectedCycle?.amount || 0) === 0 &&
    Number(selected.current_bill || 0) === 0 &&
    Math.round(Number(selected.used_limit || 0) * 100) ===
    Math.round(Number(selected.initial_future_installments_balance || 0) * 100) &&
    savedInvoiceFacts.invoice_total != null && Number(savedInvoiceFacts.invoice_total) > 0 &&
    savedInvoiceFacts.used_limit != null && savedInvoiceFacts.credit_limit != null &&
    (!data || !data.expenses.some(expense => expense.card_id === selected.id && expense.status !== 'CANCELED'))
  );
  const applySavedIssuerFacts = async () => {
    if (!selected || !savedInvoiceFacts || applyingIssuerFacts || !mayApplySavedIssuerFacts) return;
    const signature = selected.id + ':' + savedInvoiceFacts.due_month + ':' + savedInvoiceFacts.updated_at;
    if (issuerCommitRequest.current.signature !== signature)
      issuerCommitRequest.current = { signature, id: generateUUID() };
    setApplyingIssuerFacts(true);
    setIssuerCommitFeedback('');
    try {
      const result = await personalWalletService.saveCardInvoiceFacts({
        cardId: selected.id, dueMonth: savedInvoiceFacts.due_month,
        dueDate: savedInvoiceFacts.due_date, issuer: savedInvoiceFacts.issuer,
        invoiceTotal: savedInvoiceFacts.invoice_total,
        minimumPayment: savedInvoiceFacts.minimum_payment,
        creditLimit: savedInvoiceFacts.credit_limit,
        usedLimit: savedInvoiceFacts.used_limit,
        availableLimit: savedInvoiceFacts.available_limit,
        futureInstallments: savedInvoiceFacts.future_installments,
        sourceHash: savedInvoiceFacts.source_hash,
        sourceType: savedInvoiceFacts.source_type,
      }, issuerCommitRequest.current.id);
      await Promise.all([refreshInvoiceFacts(), refresh()]);
      setStatementMonth(result.due_month);
      setIssuerCommitFeedback(result.note);
    } catch (error) {
      setIssuerCommitFeedback(error instanceof Error ? error.message : 'Falha ao confirmar a fatura.');
    } finally {
      setApplyingIssuerFacts(false);
    }
  };
  const selectedFutureCommitments = statementMonth
    ? invoiceCycles.filter(cycle => cycle.dueMonth > statementMonth).reduce((sum, cycle) => sum + cycle.amount, 0)
    : 0;
  const selectedIsOpeningCycle = Boolean(selected && statementMonth && selectedCycle?.hasOverride && (
    selected.opening_invoice_month
      ? selected.opening_invoice_month.slice(0, 7) === statementMonth.slice(0, 7)
      : creditPosition?.dueMonth === statementMonth
  ));
  // Operações com várias escritas rodam numa única RPC transacional e idempotente.
  const handleScopedInstallmentDelete = async (
    expense: PersonalWalletExpense,
    targetInstallment: PersonalWalletExpenseInstallment,
    scope: InstallmentDeleteScope,
    mutationRequestId: string,
  ) => {
    if (scope === 'ALL') {
      await personalWalletService.cancelExpense(expense.id, mutationRequestId);
    } else {
      await personalWalletService.cancelInstallments(expense.id, targetInstallment.id, scope, mutationRequestId);
    }
    await refresh();
  };

  const handleAdvanceInstallments = async (
    expense: PersonalWalletExpense,
    currentDueMonth: string,
    countToAdvance: number,
    discountAmount: number,
    mutationRequestId: string,
  ) => {
    if (countToAdvance < 1) return;
    await personalWalletService.advanceInstallments(
      expense.id,
      `${currentDueMonth.slice(0, 7)}-01`,
      countToAdvance,
      discountAmount,
      mutationRequestId,
    );
    await refresh();
  };

  const handleInvoiceRemainder = async (action: InvoiceRemainderAction, baseRequestId: string) => {
    if (!paying || !statementMonth || action.mode === 'KEEP_IN_CURRENT') return;
    const remainder = action.mode === 'ROLL_TO_NEXT' ? action.remainderAmount : action.remainderPrincipal;
    await personalWalletService.rollInvoiceRemainder({
      cardId: paying.id,
      dueMonth: statementMonth,
      mode: action.mode,
      nextDueMonth: action.nextDueMonth,
      expectedRemainder: remainder,
      installmentCount: action.mode === 'ROLL_TO_NEXT' ? 1 : action.installmentCount,
      totalAmount: action.mode === 'ROLL_TO_NEXT' ? remainder : action.totalFinancedAmount,
      requestId: baseRequestId,
    });
    await refresh();
  };
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
      if (Boolean(cardForm.expiry_month) !== Boolean(cardForm.expiry_year)) throw new Error('Informe mês e ano da validade juntos.');
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
        identity: { cardholder_name: cardForm.cardholder_name.trim() || null, expiry_month: cardForm.expiry_month ? Number(cardForm.expiry_month) : null, expiry_year: cardForm.expiry_year ? Number(cardForm.expiry_year) : null },
        envelope: null,
      };
      let createdCardId: string | null = null;
      const createNewAccount = cardForm.account_id === '__create__';
      if (createNewAccount && !newLinkedAccountNickname.trim()) {
        throw new Error('Informe o nome da nova conta vinculada.');
      }
      try {
        const saved = createNewAccount
          ? await personalWalletService.createCompleteCardWithNewAccount({
            ...cardRegistrationAttempt.current.begin(candidate),
            account: {
              nickname: newLinkedAccountNickname.trim(),
              bank_name: candidate.card.issuer,
              account_type: 'CHECKING',
            },
          })
          : await personalWalletService.createCompleteCard(cardRegistrationAttempt.current.begin(candidate));
        createdCardId = saved.card_id;
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
      if (addProtectedAfterCreate && createdCardId) {
        setVaultCard({
          id: createdCardId, nickname: candidate.card.nickname, issuer: candidate.card.issuer,
          brand: candidate.card.brand, last_four: candidate.card.last_four,
          credit_limit: candidate.card.credit_limit, used_limit: position.used_limit,
          current_bill: position.invoice_amount, closing_day: candidate.card.closing_day,
          due_day: candidate.card.due_day, status: 'ACTIVE',
        });
      }
      requestId.current = generateUUID();
      setCardForm({
        nickname: '', issuer: '', brand: 'Mastercard', last_four: '', credit_limit: '',
        due_day: '', closing_day: '', account_id: '', cardholder_name: '', expiry_month: '', expiry_year: '',
      });
      setNewLinkedAccountNickname('');
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

  return <WalletPageFrame
    error={error} notice={notice} noticeTone={notice.includes('reconhecido com sucesso') ? 'info' : 'error'} loading={loading} onRefresh={() => { void refresh().catch(() => { }); }}>
    {requestedCardId && <button type="button" onClick={closeFocusedCard}
      className="mb-3 inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-semibold text-slate-200 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
      <ArrowLeft size={18} className="mr-2" /> Voltar
    </button>}
    {data && <>
      <div className="grid gap-3 lg:grid-cols-12">
        <div className="min-w-0 self-start rounded-xl border border-slate-800 bg-slate-900 p-2.5 sm:p-3.5 lg:col-span-12">
          <BankStack key={requestedCardId || 'all'} accounts={data.accounts} cards={displayedCards}
            bankAvailableReferences={data.cardInvoiceFacts}
            bankLimitStatusCardId={selected?.id || null}
            cardMovements={data || undefined}
            bankLimitStatus={bankLimitStatus}
            bankLimitReference={selected && availablePresentation?.bankReference ? {
              cardId: selected.id,
              // Referência do banco atualizada pelos lançamentos registrados depois dela.
              amount: availablePresentation.amount,
              updatedAt: availablePresentation.bankReference.updated_at,
              usageSinceReference: availablePresentation.usageSinceReference,
            } : null}
            onAccount={() => { }} onCard={card => setSelectedId(card.id)}
            onEditCard={card => setEditing(card)}
            onSelectionChange={card => setSelectedId(current => current === card?.id ? current : card?.id || null)}
            onCreateCard={() => setCreating(true)}
            onImportStatement={openReader}
            onNewExpense={card => {
              setSelectedId(card.id);
              setQuickExpenseCardId(card.id);
              setQuickExpenseDueMonth(getPurchaseInvoiceMonth(businessDateInManaus(), card.closing_day, card.due_day));
              setQuickExpenseOpen(true);
            }}
            onPayInvoice={card => { setSelectedId(card.id); setPaying(card); }} />
        </div>
        <div className="min-w-0 space-y-2.5 sm:space-y-3 lg:col-span-12">
          {selected && (
            <details className="rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2 text-xs">
              <summary className="cursor-pointer font-medium text-slate-400 hover:text-slate-200">Valores do banco</summary>
              <div className="mt-2 grid gap-1.5 border-t border-slate-800 pt-2 text-slate-300">
                {savedInvoiceFacts ? (
                  <>
                    <div className="flex justify-between gap-2"><span>Fatura</span><strong><PrivateMoney value={savedInvoiceFacts.invoice_total == null ? 'Não informado' : formatMoney(Number(savedInvoiceFacts.invoice_total))} /></strong></div>
                    <div className="flex justify-between gap-2"><span>Mínimo</span><strong><PrivateMoney value={savedInvoiceFacts.minimum_payment == null ? 'Não informado' : formatMoney(Number(savedInvoiceFacts.minimum_payment))} /></strong></div>
                    <div className="flex justify-between gap-2"><span>Disponível informado</span><strong><PrivateMoney value={savedInvoiceFacts.available_limit == null ? 'Não informado' : formatMoney(Number(savedInvoiceFacts.available_limit))} /></strong></div>
                    {bankFactLastUpdate && <p className="text-[11px] text-slate-500">Referência salva em {bankFactLastUpdate}; não é consulta em tempo real.</p>}
                    {canCorrectBankReference && !editingBankAvailable && (
                      <button type="button" onClick={() => {
                        setBankAvailableDraft(savedInvoiceFacts.available_limit == null ? '' : Number(savedInvoiceFacts.available_limit).toFixed(2).replace('.', ','));
                        setBankAvailableFeedback('');
                        setEditingBankAvailable(true);
                      }} className="min-h-9 self-start rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-blue-300 hover:bg-slate-800">
                        Atualizar disponível
                      </button>
                    )}
                    {canCorrectBankReference && editingBankAvailable && (
                      <form onSubmit={event => { event.preventDefault(); void saveObservedBankAvailable(); }}
                        className="space-y-2 rounded-lg border border-slate-700 p-2">
                        <label className="block space-y-1">
                          <span className="text-xs text-slate-300">Disponível no aplicativo do banco (R$)</span>
                          <input type="text" inputMode="decimal" autoComplete="off" required
                            aria-label="Novo limite disponível informado pelo banco"
                            value={bankAvailableDraft}
                            onChange={event => { setBankAvailableDraft(event.target.value); setBankAvailableFeedback(''); }}
                            className="min-h-10 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 text-sm text-white focus-visible:outline-2 focus-visible:outline-blue-500"
                            placeholder="0,00" />
                        </label>
                        <p className="text-[11px] text-slate-400">Atualiza apenas a referência do banco. Não cria compras nem ajusta o limite contábil.</p>
                        <div className="flex flex-wrap gap-2">
                          <button type="submit" disabled={savingBankAvailable}
                            className="min-h-10 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white disabled:opacity-50">
                            {savingBankAvailable ? 'Salvando…' : 'Salvar referência'}
                          </button>
                          <button type="button" disabled={savingBankAvailable}
                            onClick={() => { setEditingBankAvailable(false); setBankAvailableFeedback(''); }}
                            className="min-h-10 rounded-lg border border-slate-700 px-3 text-xs font-semibold text-slate-200 disabled:opacity-50">Cancelar</button>
                        </div>
                      </form>
                    )}
                    {bankAvailableFeedback && <p role="status" className="text-[11px] text-amber-200">{bankAvailableFeedback}</p>}
                  </>
                ) : <span>Ainda não informado.</span>}
                {invoiceFactsError && <p role="alert" className="text-amber-300">{invoiceFactsError}</p>}
              </div>
            </details>
          )}
          {mayApplySavedIssuerFacts && <p className="text-xs text-amber-200">
            O banco informou uma posição diferente da abertura provisória. Aplicar os valores confirmados
            atualizará a fatura e os compromissos iniciais, sem criar compras individuais.
          </p>}
          {mayApplySavedIssuerFacts && <button type="button" disabled={applyingIssuerFacts}
            onClick={() => { void applySavedIssuerFacts(); }}
            className="min-h-11 rounded-xl border border-cyan-600/60 bg-cyan-950/30 px-4 py-2 text-xs font-semibold text-cyan-200 disabled:opacity-50">
            {applyingIssuerFacts ? 'Conferindo e aplicando…' : 'Aplicar valores já salvos à posição do cartão'}
          </button>}
          {issuerCommitFeedback && <p role="status" className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200">{issuerCommitFeedback}</p>}
          <div className="grid grid-cols-2 divide-x divide-slate-800 rounded-lg border border-slate-800 bg-slate-900/55 px-2 py-2" role="group" aria-label="Outros valores do cartão">
            <div className="min-w-0 pr-2">
              <span className="block truncate text-[11px] text-slate-400">Próximas faturas</span>
              <strong className="mt-1 block truncate text-sm font-bold tabular-nums text-slate-100"><PrivateMoney value={formatMoney(selectedFutureCommitments)} /></strong>
            </div>
            <div className="min-w-0 pl-2">
              <span className="block truncate text-[11px] text-slate-400">{bankLimitStatus === 'LOADING'
                ? 'Conferindo referência bancária'
                : bankLimitStatus === 'ERROR' ? 'Referência indisponível'
                  : formatCardAvailableOrigin(availablePresentation?.bankReference || null, availablePresentation?.usageSinceReference)}</span>
              <strong className="mt-1 block truncate text-sm font-bold tabular-nums text-emerald-300">
                <PrivateMoney value={bankLimitStatus === 'READY' && availablePresentation
                  ? formatMoney(availablePresentation.amount) : '—'} />
              </strong>
            </div>
          </div>
          {invoiceTotalDifferenceCents !== null && invoiceTotalDifferenceCents !== 0 && (
            <p role="status" className="text-[11px] text-amber-200">
              {/* Só aparece quando a diferença não é explicada pelas compras lançadas depois da referência. */}
              Fatura: {invoiceTotalDifferenceCents < 0 ? 'app acima' : 'app abaixo'} do total informado pelo banco{bankFactLastUpdate ? ' em ' + bankFactLastUpdate : ''}, sem contar compras lançadas depois: <strong><PrivateMoney value={formatMoney(Math.abs(invoiceTotalDifferenceCents) / 100)} /></strong>. Confira se há compra repetida ou ajuste do banco.
            </p>
          )}
          <div className="min-w-0">
            <div className="mb-3 flex min-w-0 flex-col gap-2">
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                  <h3 className="min-w-0 break-words text-sm font-bold text-white">Fatura {selected?.nickname || ''}</h3>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                    {invoiceCycles.length > 1 && <button type="button" onClick={() => setInvoiceHistoryOpen(true)}
                      aria-haspopup="dialog"
                      className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-[11px] font-semibold text-slate-200 hover:border-blue-500 hover:text-white">
                      Ver mais ({invoiceCycles.length - 1})
                    </button>}
                    <button type="button" onClick={() => setCreatingInvoice(true)}
                      className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-[11px] font-semibold text-slate-200 hover:border-blue-500 hover:text-white">
                      + Adicionar fatura
                    </button>
                  </div>
                </div>
                {selected && (
                  <div className="mt-2 space-y-1.5" role="group" aria-label="Faturas registradas">
                    {invoiceCycles.length === 0 && (
                      <p className="rounded-xl border border-dashed border-slate-700 p-4 text-xs text-slate-400">
                        Nenhuma fatura registrada. Adicione uma fatura ou lance uma compra no cartão.
                      </p>
                    )}
                    {invoiceCycles.filter(cycle => cycle.dueMonth === statementMonth).map(cycle => {
                      const fact = invoiceFacts.find(item =>
                        item.card_id === selected.id && item.due_month.slice(0, 7) === cycle.dueMonth.slice(0, 7));
                      const bankInvoiceTotal = fact?.invoice_total == null ? null : Number(fact.invoice_total);
                      const dates = getInvoiceCycleDates(cycle.dueMonth, selected.closing_day, selected.due_day, fact?.due_date);
                      const dueLabel = invoiceDueMonthLabel(dates.dueDate);
                      const closing = shortDayMonth(dates.closingDate);
                      const due = dates.dueDate.split('-').reverse().join('/');
                      const status = cycle.amount <= 0 ? 'REFERENCIA' : resolveInvoiceCycleState({
                        dueMonth: cycle.dueMonth, closingDay: selected.closing_day,
                        dueDay: selected.due_day, outstanding: cycle.amount,
                        hasCycle: true, exactDueDate: savedInvoiceFacts?.due_date ?? fact?.due_date,
                      });
                      const label = status === 'REFERENCIA' ? 'Sem lançamentos'
                        : status === 'OPEN' ? 'Aberta'
                          : status === 'CLOSED' ? 'Fechada'
                            : status === 'OVERDUE' ? 'Vencida' : 'Paga';
                      const active = statementMonth === cycle.dueMonth;
                      return (
                        <button key={cycle.dueMonth} type="button" aria-pressed={active}
                          onClick={() => { setStatementMonth(cycle.dueMonth); setActionMenuOpen(false); }}
                          className={`grid min-h-12 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-slate-700/60 px-0 py-2 text-left transition-colors ${active ? 'bg-slate-800/20' : 'hover:bg-slate-800/20'}`}>
                          <span className="min-w-0">
                            <span className={`block text-xs font-bold ${active ? 'text-white' : 'text-slate-200'}`}>Fatura {dueLabel}</span>
                            <span className="mt-1 block text-[11px] text-slate-400">{hideFinancialValues ? 'Vencimento protegido' : 'Fecha ' + closing + ' · vence ' + due}</span>
                          </span>
                          <span className="text-right">
                            <span className="block whitespace-nowrap text-sm font-bold tabular-nums text-white"><PrivateMoney value={formatMoney(cycle.amount)} /></span>
                            <span className={`mt-1 block text-[10px] ${hideFinancialValues ? 'text-slate-400' : status === 'OVERDUE' ? 'text-rose-300' : active ? 'text-blue-300' : 'text-slate-400'}`}>
                              {hideFinancialValues ? 'Situação protegida' : bankInvoiceTotal === null ? label : `${label} · banco informou ${formatMoney(bankInvoiceTotal)}`}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              {selected && <div className="relative flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => {
                  setQuickExpenseCardId(selected.id);
                  setQuickExpenseDueMonth(suggestedNewInvoiceMonth);
                  setQuickExpenseOpen(true);
                }}
                  className="min-h-10 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-blue-500">+ Lançar despesa</button>
                {statementMonth && (
                  <button type="button" onClick={() => setOverriding(true)}
                    className="min-h-10 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800">Ajustar fatura</button>
                )}
                <button type="button" aria-expanded={actionMenuOpen} onClick={() => setActionMenuOpen(value => !value)}
                  className="min-h-10 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800">
                  Mais opções
                </button>
                {actionMenuOpen && <div className="absolute right-0 top-full z-30 mt-1 min-w-56 max-w-[min(19rem,90vw)] rounded-xl border border-slate-700 bg-slate-950 p-1.5 shadow-2xl">
                  <button type="button" onClick={() => { setActionMenuOpen(false); setVaultCard(selected); }}
                    className="block w-full rounded-lg px-3 py-2.5 text-left text-xs text-slate-200 hover:bg-slate-800">Dados do cartão</button>
                  <button type="button" onClick={() => { setActionMenuOpen(false); setCardOpeningModalOpen(true); }}
                    className="block w-full rounded-lg px-3 py-2.5 text-left text-xs text-slate-200 hover:bg-slate-800">Situação inicial</button>
                  <button type="button" onClick={() => { setActionMenuOpen(false); setFlatReaderOpen(true); }}
                    className="block w-full rounded-lg px-3 py-2.5 text-left text-xs text-slate-200 hover:bg-slate-800">
                    Importar extrato ou fatura
                  </button>
                  {statementMonth && (selectedCycle?.amount || 0) > 0 && (
                    <button type="button" onClick={() => {
                      setActionMenuOpen(false);
                      setClearInvoiceError('');
                      setClearInvoiceConfirm({ cardId: selected.id, month: statementMonth, nickname: selected.nickname });
                    }} className="block w-full rounded-lg px-3 py-2.5 text-left text-xs text-rose-300 hover:bg-rose-950/30">
                      Excluir fatura não paga
                    </button>
                  )}
                </div>}
              </div>}
            </div>
            {invoiceHistoryOpen && selected && <Modal compact title={`Consultar faturas · ${selected.nickname}`}
              subtitle="Selecione o mês para consultar o extrato correspondente."
              onClose={() => setInvoiceHistoryOpen(false)}>
              <div className="max-h-[60vh] space-y-1.5 overflow-y-auto pr-1" role="group" aria-label="Consultar outras faturas">
                {[...invoiceCycles].reverse().map(cycle => {
                  const fact = invoiceFacts.find(item =>
                    item.card_id === selected.id && item.due_month.slice(0, 7) === cycle.dueMonth.slice(0, 7));
                  const bankInvoiceTotal = fact?.invoice_total == null ? null : Number(fact.invoice_total);
                  const dates = getInvoiceCycleDates(cycle.dueMonth, selected.closing_day, selected.due_day, fact?.due_date);
                  const dueLabel = invoiceDueMonthLabel(dates.dueDate);
                      const closing = shortDayMonth(dates.closingDate);
                  const due = dates.dueDate.split('-').reverse().join('/');
                  const state = cycle.amount <= 0 ? 'REFERENCIA' : resolveInvoiceCycleState({
                    dueMonth: cycle.dueMonth, closingDay: selected.closing_day,
                    dueDay: selected.due_day, outstanding: cycle.amount,
                    hasCycle: true, exactDueDate: fact?.due_date,
                  });
                  const label = state === 'REFERENCIA' ? 'Sem lançamentos'
                    : state === 'OPEN' ? 'Aberta'
                      : state === 'CLOSED' ? 'Fechada'
                        : state === 'OVERDUE' ? 'Vencida' : 'Paga';
                  const active = statementMonth === cycle.dueMonth;
                  return <button key={cycle.dueMonth} type="button" aria-current={active ? 'true' : undefined}
                    onClick={() => {
                      setStatementMonth(cycle.dueMonth);
                      setInvoiceHistoryOpen(false);
                      setActionMenuOpen(false);
                    }}
                    className={`grid min-h-12 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg border px-3 py-2 text-left ${active ? 'border-blue-500/70 bg-blue-500/10' : 'border-slate-800 bg-slate-950/40 hover:bg-slate-800/70'}`}>
                    <span className="min-w-0">
                      <strong className="block text-xs text-slate-100">Fatura {dueLabel}</strong>
                      <span className="mt-0.5 block text-[11px] text-slate-400">{hideFinancialValues ? 'Vencimento protegido' : 'Fecha ' + closing + ' · vence ' + due}</span>
                    </span>
                    <span className="text-right">
                      <strong className="block whitespace-nowrap text-xs tabular-nums text-white"><PrivateMoney value={formatMoney(cycle.amount)} /></strong>
                      <span className="mt-0.5 block text-[10px] text-slate-400">{hideFinancialValues ? 'Situação protegida' : bankInvoiceTotal === null ? label : `${label} · banco informou ${formatMoney(bankInvoiceTotal)}`}</span>
                    </span>
                  </button>;
                })}
              </div>
            </Modal>}
            {flatReaderOpen && selected && (
              <Modal
                variant="wallet"
                size="xl"
                title="Importar extrato ou fatura"
                subtitle={selected.nickname}
                footerMode="custom"
                onClose={() => setFlatReaderOpen(false)}
              >
                <FlatSmartStatementReader
                  kind="CARD"
                  targetId={selected.id}
                  targetName={selected.nickname}
                  targetIssuer={selected.issuer} targetLastFour={selected.last_four}
                  targetCreditLimit={Number(selected.credit_limit || 0) || null}
                  targetEstimatedUsedLimit={creditPosition?.committedLimit ?? null}
                  targetEstimatedFutureCommitments={creditPosition?.futureCommitments ?? null}
                  targetEstimatedAvailableLimit={creditPosition?.freeLimit ?? null}
                  targetEstimateDueMonth={creditPosition?.dueMonth}
                  existingRows={importedStatementRows}
                  onSummarySaved={async month => {
                    await Promise.all([refreshInvoiceFacts(), refresh()]);
                    setStatementMonth(month);
                  }}
                  initialDueMonth={statementMonth || suggestedNewInvoiceMonth}
                  closingDay={selected.closing_day}
                  dueDay={selected.due_day}
                  hasOpening={Boolean(selected.initial_balance_occurred_at)}
                  isFlat={true}
                  onClose={() => setFlatReaderOpen(false)}
                  onImported={async () => {
                    await refresh();
                    setFlatReaderOpen(false);
                  }}
                />
              </Modal>
            )}
            {selected && data && statementMonth && (() => {
              // Fatia de cada categoria nas compras da fatura selecionada (anel = participação, não orçamento).
              const breakdown = getCardInvoiceCategoryBreakdown(selected.id, statementMonth, data.expenses, data.installments);
              return breakdown.slices.length ? <div className="mb-3"><CategoryBreakdownPanel title="Gastos da fatura por categoria" breakdown={breakdown}
                note="O anel mostra a fatia de cada categoria nas compras desta fatura. Créditos e saldo consolidado de abertura não entram." /></div> : null;
            })()}
            {selected ? <CardInvoiceStatement cardId={selected.id} dueMonth={statementMonth}
              openingBalance={selectedIsOpeningCycle ? Math.max(Number(selected.initial_future_installments_balance || 0), Number(selected.opening_unallocated_amount || 0)) : 0}
              expenses={data.expenses} installments={data.installments}
              cycleDates={statementMonth ? getInvoiceCycleDates(statementMonth, selected.closing_day, selected.due_day, savedInvoiceFacts?.due_date) : undefined}
              onEdit={async (input, mutationRequestId) => { await personalWalletService.updateExpense(input, mutationRequestId); await refresh(); }}
              onDelete={async (id, mutationRequestId) => { await personalWalletService.cancelExpense(id, mutationRequestId); await refresh(); }}
              onScopedInstallmentDelete={handleScopedInstallmentDelete}
              onAdvanceInstallments={handleAdvanceInstallments}
              onCancelConsolidation={async (dueMonth, mutationRequestId) => { await personalWalletService.cancelInvoiceConsolidation(selected.id, dueMonth, mutationRequestId); await refresh(); }}
              className="m-0 border-0 bg-transparent p-0" /> :
              <p className="text-xs text-slate-400">Cadastre um cartão para visualizar o extrato.</p>}
          </div>
        </div>
      </div>
      {statementDeletionFeedback && <div role="status" className={`rounded-lg border px-3 py-2 text-xs ${statementDeletionFeedback.tone === 'success' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-rose-500/30 bg-rose-500/10 text-rose-200'}`}>
        {statementDeletionFeedback.message}
      </div>}
      {selected && importedStatementRows.length > 0 && <section className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-300"><strong className="text-slate-100">Conferência da importação:</strong> {linkedStatementCount} item(ns) já aparecem no extrato da fatura.</p>
          <p className="text-[11px] text-slate-400">Total importado: <strong className="text-slate-200"><PrivateMoney value={formatMoney(importedStatementTotal)} /></strong></p>
        </div>
        {unlinkedStatementCount > 0 && <>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-3">
            <p className="text-xs text-amber-200">{unlinkedStatementCount} item(ns) somente para conferência · <PrivateMoney value={formatMoney(unlinkedStatementTotal)} /></p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setSelectedStatementRows(current => current.size === unlinkedStatementCount ? new Set() : new Set(unlinkedStatementRows.map(row => row.id)))} className="min-h-8 rounded border border-slate-700 px-2.5 py-1.5 text-[10px] text-slate-300 hover:bg-slate-800">{selectedStatementRows.size === unlinkedStatementCount ? 'Limpar seleção' : 'Selecionar todos'}</button>
              <button type="button" disabled={!selectedStatementRows.size} onClick={() => setPendingStatementDeletion({ ids: [...selectedStatementRows], count: selectedStatementRows.size })} className="min-h-8 rounded border border-rose-500/30 px-2.5 py-1.5 text-[10px] font-semibold text-rose-300 disabled:opacity-40">Excluir ({selectedStatementRows.size})</button>
            </div>
          </div>
          <div className="mt-2 max-h-64 divide-y divide-slate-800 overflow-y-auto">{unlinkedStatementRows.map(row => <article key={row.id} className="flex items-center justify-between gap-3 py-2.5"><div className="flex min-w-0 items-start gap-2"><input type="checkbox" aria-label={`Selecionar ${row.description}`} className="mt-0.5 h-4 w-4 accent-blue-600" checked={selectedStatementRows.has(row.id)} onChange={() => setSelectedStatementRows(current => { const next = new Set(current); if (next.has(row.id)) next.delete(row.id); else next.add(row.id); return next; })} /><div className="min-w-0"><p className="truncate text-xs font-semibold text-slate-200">{row.description}</p><p className="mt-1 text-[10px] text-slate-400">{row.entry_date.split('-').reverse().join('/')} · {row.category} · somente conferência</p></div></div><div className="flex shrink-0 items-center gap-2"><strong className="text-xs text-slate-200"><PrivateMoney value={formatMoney(row.amount)} /></strong><button type="button" onClick={() => setPendingStatementDeletion({ ids: [row.id], count: 1 })} className="min-h-8 rounded border border-rose-500/30 px-2.5 py-1.5 text-[10px] font-semibold text-rose-300 hover:bg-rose-500/10">Excluir</button></div></article>)}</div>
        </>}
      </section>}
      {pendingStatementDeletion && <Modal compact title="Excluir item de conferência?" subtitle="Remove somente a linha não vinculada do registro do PDF; a fatura não muda." icon={<AlertTriangle size={17} />} onClose={() => { if (!deletingStatement) setPendingStatementDeletion(null); }}>
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-slate-300">Excluir {pendingStatementDeletion.count} item(ns) selecionado(s) do extrato?</p>
          {statementDeletionFeedback?.tone === 'error' && <p role="alert" className="text-xs text-rose-300">{statementDeletionFeedback.message}</p>}
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <button type="button" disabled={deletingStatement} onClick={() => { void removeImportedStatementRows(pendingStatementDeletion.ids); }} className={modalPrimaryActionClass}>{deletingStatement ? 'Excluindo...' : `Excluir ${pendingStatementDeletion.count} item(ns)`}</button>
            <button type="button" disabled={deletingStatement} onClick={() => setPendingStatementDeletion(null)} className={modalSecondaryActionClass}>Manter item</button>
          </div>
        </div>
      </Modal>}
      {creating && <Modal title="Novo cartão" subtitle="Identificação e valores opcionais" icon={<CreditCard size={17} />} onClose={() => {
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
            onChange={value => { requestId.current = generateUUID(); setCardForm(v => ({ ...v, issuer: value })); }} />
          <label className="space-y-1 text-xs text-slate-300">
            Apelido (opcional)
            <input name="wallet-card-nickname" type="text" autoComplete="off" maxLength={120} placeholder="Ex.: Cartão principal" value={cardForm.nickname}
              onChange={e => { requestId.current = generateUUID(); setCardForm(v => ({ ...v, nickname: e.target.value })); }}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white" />
          </label>
          <label className="space-y-1 text-xs text-slate-300">
            Final do cartão (opcional)
            <input name="wallet-card-last-four" autoComplete="off" inputMode="numeric" maxLength={4} pattern="[0-9]{4}" placeholder="Ex.: 1234"
              value={cardForm.last_four}
              onChange={e => { requestId.current = generateUUID(); setCardForm(v => ({ ...v, last_four: e.target.value.replace(/\D/g, '').slice(0, 4) })); }}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white" />
          </label>
          <label className="space-y-1 text-xs text-slate-300 sm:col-span-2">
            Limite total (R$, opcional)
            <input name="wallet-card-credit-limit" autoComplete="off" inputMode="decimal" placeholder="Pode informar ou importar pela fatura depois"
              value={cardForm.credit_limit}
              onChange={e => {
                const input = e.currentTarget;
                const next = resolveLiveBrazilianCentsChange(input.value, cardForm.credit_limit, (e.nativeEvent as InputEvent).inputType);
                if (!next) return;
                input.setCustomValidity('');
                requestId.current = generateUUID();
                setCardForm(v => ({ ...v, credit_limit: next.value }));
                requestAnimationFrame(() => {
                  if (document.activeElement === input) input.setSelectionRange(next.caret, next.caret);
                });
              }}
              onPaste={e => {
                e.preventDefault();
                try {
                  const next = formatPastedBrazilianMoney(e.clipboardData.getData('text'));
                  e.currentTarget.setCustomValidity('');
                  requestId.current = generateUUID();
                  setCardForm(v => ({ ...v, credit_limit: next }));
                  const input = e.currentTarget;
                  requestAnimationFrame(() => { if (document.activeElement === input) input.setSelectionRange(next.length, next.length); });
                } catch {
                  // Falha na colagem nunca substitui um valor válido anterior.
                  e.currentTarget.setCustomValidity('Limite colado inválido.');
                }
              }}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white" />
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
                <select name="wallet-card-brand" autoComplete="off" value={cardForm.brand} onChange={e => { requestId.current = generateUUID(); setCardForm(v => ({ ...v, brand: e.target.value })); }}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white">
                  {['Mastercard', 'Visa', 'Elo', 'American Express', 'Hipercard'].map(brand => <option key={brand} value={brand}>{brand}</option>)}
                </select>
              </label>
              {(['closing_day', 'due_day'] as const).map(field =>
                <label key={field} className="space-y-1 text-xs text-slate-300">
                  {field === 'closing_day' ? 'Dia do fechamento' : 'Dia do vencimento'}
                  <input type="number" min={1} max={31} inputMode="numeric" placeholder="Não informado"
                    value={cardForm[field]} onChange={e => { requestId.current = generateUUID(); setCardForm(v => ({ ...v, [field]: e.target.value })); }}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white" />
                </label>
              )}
              <label className="space-y-1 text-xs text-slate-300 sm:col-span-2">Conta vinculada (opcional)
                <select name="wallet-card-linked-account" value={cardForm.account_id} onChange={e => {
                  requestId.current = generateUUID();
                  setCardForm(v => ({ ...v, account_id: e.target.value }));
                }} className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white">
                  <option value="">Sem vínculo bancário</option>
                  {data.accounts.map(account => <option key={account.id} value={account.id}>{account.nickname}</option>)}
                  <option value="__create__">+ Criar conta vinculada agora</option>
                </select>
                {cardForm.account_id === '__create__' && <input type="text" required maxLength={120}
                  value={newLinkedAccountNickname} onChange={e => setNewLinkedAccountNickname(e.target.value)}
                  placeholder={`Ex.: ${cardForm.issuer || 'Minha conta'} principal`}
                  className="mt-2 w-full rounded-xl border border-blue-500/60 bg-slate-950 p-3 text-white" />}
                <span className="mt-1 block text-[11px] text-slate-400">A nova conta e o cartão serão criados e vinculados na mesma operação segura.</span>
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-200 sm:col-span-2">
                <input type="checkbox" checked={thirdPartyCard} className="h-4 w-4 accent-blue-600"
                  onChange={e => { setThirdPartyCard(e.target.checked); requestId.current = generateUUID(); }} />Cartão de outra pessoa
              </label>
              <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-slate-300">O nome impresso é independente do perfil</span>
                {!thirdPartyCard && ownerDefaults.name && <button type="button"
                  onClick={() => { requestId.current = generateUUID(); setCardForm(v => ({ ...v, cardholder_name: ownerDefaults.name })); }}
                  className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-blue-200">
                  Usar nome do perfil
                </button>}
              </div>
              <label className="space-y-1 text-xs text-slate-300 sm:col-span-2">Nome impresso (opcional)
                <input type="text" maxLength={120} autoComplete="off" name="wallet-card-printed-name" placeholder="Nome do titular"
                  value={cardForm.cardholder_name}
                  onChange={e => { requestId.current = generateUUID(); setCardForm(v => ({ ...v, cardholder_name: e.target.value })); }}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white" />
              </label>
              <label className="space-y-1 text-xs text-slate-300">Validade — mês
                <input type="number" min={1} max={12} placeholder="MM" value={cardForm.expiry_month}
                  onChange={e => { requestId.current = generateUUID(); setCardForm(v => ({ ...v, expiry_month: e.target.value })); }}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white" />
              </label>
              <label className="space-y-1 text-xs text-slate-300">Validade — ano
                <input type="number" min={2000} max={2200} placeholder="AAAA" value={cardForm.expiry_year}
                  onChange={e => { requestId.current = generateUUID(); setCardForm(v => ({ ...v, expiry_year: e.target.value })); }}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white" />
              </label>
            </div>
          </details>
          <label className="flex items-center gap-2 text-xs text-slate-200 sm:col-span-2">
            <input type="checkbox" checked={addProtectedAfterCreate}
              onChange={e => setAddProtectedAfterCreate(e.target.checked)}
              className="h-4 w-4 accent-blue-600" />
            Depois de salvar, adicionar o número completo para acesso rápido (opcional)
          </label>
          {createError && <p role="alert" className="text-sm text-rose-300 sm:col-span-2">{createError}</p>}
          <div className="sm:col-span-2">
            <CardOpeningFields collapsible value={opening} creditLimit={(() => { try { return parseWalletMoney(cardForm.credit_limit || '0'); } catch { return 0; } })()}
              onChange={value => { requestId.current = generateUUID(); setOpening(value); }} />
          </div>
        </form>
      </Modal>}
      {mayInitializeExisting && !creating && selected && <section className="rounded-2xl border border-amber-700/25 bg-slate-900 p-4">
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
          <CardOpeningFields creditLimit={Number(selected.credit_limit)} value={existingOpening} onChange={setExistingOpening} />
          <button type="submit" disabled={saving}
            className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">
            {saving ? 'Salvando...' : 'Registrar situação inicial'}
          </button>
        </form>}
      </section>}
      {clearInvoiceConfirm && <Modal title="Excluir fatura não paga?" subtitle={clearInvoiceConfirm.nickname + ' · ' + clearInvoiceConfirm.month.slice(0, 7)} busy={clearingInvoice} onClose={() => !clearingInvoice && setClearInvoiceConfirm(null)}
        footer={<button type="button" disabled={clearingInvoice} onClick={() => { void clearUnpaidInvoice(); }} className={modalPrimaryActionClass}>Confirmar exclusão da fatura</button>}>
        <p className="text-xs leading-relaxed text-slate-300">Os lançamentos financeiros não pagos que pertencem exclusivamente a esta fatura serão cancelados e mantidos no histórico. A operação será bloqueada se houver pagamento ou parcelas de outros meses. Não há estorno automático.</p>
        {clearInvoiceError && <p role="alert" className="mt-3 text-xs text-rose-300">{clearInvoiceError}</p>}
      </Modal>}
      {editing && <CardEditModal card={editing} accounts={data.accounts} onClose={() => setEditing(null)} onSaved={async () => { await refresh(); }} />}
      {vaultCard && <CardVaultModal card={vaultCard} onClose={() => setVaultCard(null)} onSaved={async () => { await refresh(); }} />}
      {importing && selected && <WalletStatementImport kind="CARD" targetId={selected.id}
        initialDueMonth={statementMonth || suggestedNewInvoiceMonth} hasOpening={Boolean(selected.initial_balance_occurred_at)}
        targetName={selected.nickname} targetIssuer={selected.issuer} targetLastFour={selected.last_four}
        targetCreditLimit={Number(selected.credit_limit || 0) || null}
        targetEstimatedUsedLimit={creditPosition?.committedLimit ?? null}
        targetEstimatedFutureCommitments={creditPosition?.futureCommitments ?? null}
        targetEstimatedAvailableLimit={creditPosition?.freeLimit ?? null}
        targetEstimateDueMonth={creditPosition?.dueMonth}
        existingRows={importedStatementRows} onSummarySaved={async month => {
          await Promise.all([refreshInvoiceFacts(), refresh()]);
          setStatementMonth(month);
        }} onClose={() => setImporting(false)}
        onImported={async () => { await refresh(); }} />}
      {paying && <PayInvoiceModal card={paying} accounts={data.accounts}
        invoiceAmount={paying.id === selected?.id ? selectedCycle?.amount || 0 : 0}
        minimumPayment={savedInvoiceFacts?.minimum_payment ?? null}
        dueMonth={statementMonth || undefined} dueDate={statementMonth && selected ? getInvoiceCycleDates(statementMonth, selected.closing_day, selected.due_day, savedInvoiceFacts?.due_date).dueDate : null} onClose={() => setPaying(null)}
        onPay={async (cardId, month, accountId, amount, requestId) => {
          await personalWalletService.payInvoicePartial(cardId, month, accountId, amount, requestId);
          await refresh();
        }}
        onHandleRemainder={handleInvoiceRemainder} />}
      {(overriding || creatingInvoice) && selected && <InvoiceOverrideModal card={selected}
        isNew={creatingInvoice}
        invoiceFactsSummaryForMonth={invoiceFactsSummaryForMonth}
        onSaveInvoiceFacts={saveInvoiceFactsForMonth}
        existingDueMonths={invoiceCycles.map(cycle => cycle.dueMonth)}
        initialDueMonth={creatingInvoice ? suggestedNewInvoiceMonth : (statementMonth || creditPosition?.dueMonth || suggestedNewInvoiceMonth)}
        initialDueDate={creatingInvoice ? null : savedInvoiceFacts?.due_date}
        initialAmount={creatingInvoice ? 0 : (invoiceCycles.find(cycle => cycle.dueMonth === statementMonth)?.amount || 0)}
        hasExistingConsolidation={!creatingInvoice && Boolean(selectedCycle?.hasOverride)}
        onClose={() => { setOverriding(false); setCreatingInvoice(false); }}
        onRecordAdjustmentExpense={creatingInvoice ? undefined : async (dueMonth, deltaAmount, notes) => {
          await personalWalletService.createExpense({
            card_id: selected.id,
            description: 'Despesa de ajuste de fatura',
            amount: deltaAmount,
            category: 'Outros',
            expense_date: businessDateInManaus(),
            due_date: dueMonth,
            status: 'PENDING',
            installment_count: 1,
            notes,
          });
          await refresh();
          setStatementMonth(dueMonth);
        }}
        onRecordAdjustmentCredit={creatingInvoice ? undefined : async (dueMonth, deltaAmount, notes) => {
          await personalWalletService.createInvoiceCredit({
            cardId: selected.id,
            dueMonth,
            amount: deltaAmount,
            description: 'Crédito de ajuste de fatura',
            expenseDate: businessDateInManaus(),
            notes,
          });
          await refresh();
          setStatementMonth(dueMonth);
        }}
        onSave={async (dueMonth, amount, dueDate, overrideRequestId) => {
          await personalWalletService.correctInvoiceOverride({
            cardId: selected.id,
            previousDueMonth: selectedCycle?.hasOverride && !creatingInvoice ? statementMonth : null,
            dueMonth, dueDate, amount, requestId: overrideRequestId,
          });
          await refresh();
          await refreshInvoiceFacts();
          setStatementMonth(dueMonth);
        }} />}
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
        onSaved={async () => { await refresh(); }} />
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
        defaultCardId={quickExpenseCardId || selected?.id || null}
        lockCardSelection={Boolean(quickExpenseCardId)}
        initialDueMonth={quickExpenseDueMonth || statementMonth}
        onClose={() => { setQuickExpenseOpen(false); setQuickExpenseCardId(null); setQuickExpenseDueMonth(null); }}
        onSaved={async () => { await refresh(); }} />}
    </>}
  </WalletPageFrame>;
};
