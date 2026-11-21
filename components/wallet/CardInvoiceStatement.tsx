import { PrivateMoney } from '../../contexts/FinancialPrivacyContext';
import React, { useMemo, useRef, useState } from 'react';
import { AlertTriangle, CalendarDays, FastForward, Pencil, ReceiptText, Search, Tag, Trash2, X } from 'lucide-react';
import type { PersonalWalletExpense, PersonalWalletExpenseInstallment, UpdatePersonalWalletExpense } from '../../services/personalWallet.service';
import { formatMoney } from '../../utils/formatters';
import { generateUUID } from '../../utils/generators';
import { ExpenseEditModal } from './ExpenseEditModal';
import { getCardInvoiceEntries, getInvoiceOpeningBreakdown, type InvoiceCycleDates, type InvoiceCycleState } from './invoiceStatementDomain';
import { Modal, modalPrimaryActionClass, modalSecondaryActionClass } from '../ui/Modal';
import { formatInstallmentBadgeLabel } from '../../features/wallet/utils/cardInstallmentPlan';
import { formatWalletMoneyInput, parseWalletMoney } from '../../features/wallet/utils/parseWalletMoney';
import { resolveLiveBrazilianCentsChange } from '../../features/wallet/utils/liveBrazilianMoneyInput';
import { calculateInstallmentAdvancement } from '../../features/wallet/utils/minhasFinancasWalletTools';
import { createFinancialSearchMatcher } from '../../features/wallet/utils/financialSearch';

export type InstallmentDeleteScope = 'ALL' | 'CURRENT_AND_NEXT' | 'ONLY_CURRENT';

type CardInvoiceStatementProps = {
  cardId: string;
  dueMonth?: string | null;
  expenses: PersonalWalletExpense[];
  installments: PersonalWalletExpenseInstallment[];
  onEdit: (input: UpdatePersonalWalletExpense, requestId: string) => Promise<void>;
  onDelete: (expenseId: string, requestId: string) => Promise<void>;
  onScopedInstallmentDelete?: (
    expense: PersonalWalletExpense,
    installment: PersonalWalletExpenseInstallment,
    scope: InstallmentDeleteScope,
    requestId: string,
  ) => Promise<void>;
  onAdvanceInstallments?: (
    expense: PersonalWalletExpense,
    currentDueMonth: string,
    countToAdvance: number,
    discountAmount: number,
    requestId: string,
  ) => Promise<void>;
  onCancelConsolidation?: (dueMonth: string, requestId: string) => Promise<void>;
  headerAction?: React.ReactNode;
  invoiceState?: InvoiceCycleState;
  cycleDates?: InvoiceCycleDates;
  className?: string;
  openingBalance?: number;
};

export const CardInvoiceStatement: React.FC<CardInvoiceStatementProps> = ({
  cardId,
  dueMonth,
  expenses,
  installments,
  onEdit,
  onDelete,
  onScopedInstallmentDelete,
  onAdvanceInstallments,
  onCancelConsolidation,
  headerAction,
  invoiceState,
  cycleDates,
  openingBalance = 0,
  className = '',
}) => {
  const [editing, setEditing] = useState<PersonalWalletExpense | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<PersonalWalletExpense | null>(null);
  const [confirmingDeleteInstallment, setConfirmingDeleteInstallment] = useState<PersonalWalletExpenseInstallment | null>(null);
  const [deleteScope, setDeleteScope] = useState<InstallmentDeleteScope>('ALL');
  const [advancingExpense, setAdvancingExpense] = useState<PersonalWalletExpense | null>(null);
  const [advanceCount, setAdvanceCount] = useState<string>('1');
  const [advanceDiscount, setAdvanceDiscount] = useState<string>('');
  const [advancingBusy, setAdvancingBusy] = useState(false);
  const [confirmingConsolidation, setConfirmingConsolidation] = useState<PersonalWalletExpense | null>(null);
  const [cancelingConsolidation, setCancelingConsolidation] = useState(false);
  const consolidationRequests = useRef(new Map<string, string>());
  const advanceRequestIds = useRef(new Map<string, string>());
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState('');
  const deleteRequestIds = useRef(new Map<string, string>());
  const entries = useMemo(() => getCardInvoiceEntries(cardId, dueMonth, expenses, installments), [cardId, dueMonth, expenses, installments]);
  const hasOverride = entries.some(entry => entry.expense.entry_type === 'INVOICE_OVERRIDE');
  const openingBreakdown = useMemo(
    () => getInvoiceOpeningBreakdown(cardId, dueMonth, expenses, installments),
    [cardId, dueMonth, expenses, installments],
  );

  const normalizedQuery = searchQuery.trim();
  const searchMatches = useMemo(() => createFinancialSearchMatcher(searchQuery), [searchQuery]);

  const visibleEntries = useMemo(() => entries.filter(({ expense, installment }) => {
    const remaining = Number(installment.amount) - Number(installment.paid_amount || 0);
    return searchMatches({
      texts: [
        expense.entry_type === 'INVOICE_OVERRIDE' ? 'Fatura consolidada' : expense.description,
        expense.category,
        expense.notes,
        formatInstallmentBadgeLabel(expense, installment),
        expense.is_invoice_credit ? 'Crédito Estorno' : 'Compra',
        String(installment.installment_number),
        String(expense.installment_count),
      ],
      amounts: [
        expense.is_invoice_credit ? -remaining : remaining,
        Number(expense.amount),
        Number(installment.amount),
        Number(installment.paid_amount || 0),
      ],
      dates: [expense.expense_date, installment.due_month],
    });
  }), [entries, searchMatches]);

  const filteredTotal = useMemo(
    () =>
      visibleEntries.reduce(
        (sum, { expense, installment }) => {
          const remaining = Math.max(0, Number(installment.amount) - Number(installment.paid_amount || 0));
          return sum + (expense.is_invoice_credit ? -remaining : remaining);
        },
        0,
      ),
    [visibleEntries],
  );

  const futureInstallmentsByExpenseId = useMemo(() => {
    const map = new Map<string, PersonalWalletExpenseInstallment[]>();
    if (!dueMonth) return map;
    const normalizedMonth = dueMonth.slice(0, 10);
    for (const inst of installments) {
      if (inst.status === 'PENDING' && inst.due_month.slice(0, 10) > normalizedMonth && Number(inst.amount) - Number(inst.paid_amount || 0) > 0) {
        const list = map.get(inst.expense_id) || [];
        list.push(inst);
        map.set(inst.expense_id, list);
      }
    }
    return map;
  }, [installments, dueMonth]);

  const advancePreview = useMemo(() => {
    if (!advancingExpense || !dueMonth) return null;
    let parsedDiscount = 0;
    try {
      parsedDiscount = advanceDiscount.trim() ? parseWalletMoney(advanceDiscount) : 0;
    } catch {
      parsedDiscount = 0;
    }
    return calculateInstallmentAdvancement({
      expense: advancingExpense,
      allInstallments: installments,
      currentDueMonth: dueMonth,
      countToAdvance: Number(advanceCount) || 1,
      discountAmount: parsedDiscount,
    });
  }, [advancingExpense, installments, dueMonth, advanceCount, advanceDiscount]);

  const remove = async (expense: PersonalWalletExpense) => {
    setDeletingId(expense.id);
    const targetInstallment = confirmingDeleteInstallment;
    const chosenScope = deleteScope;
    setConfirmingDelete(null);
    setConfirmingDeleteInstallment(null);
    setError('');
    const requestId = deleteRequestIds.current.get(expense.id) || generateUUID();
    deleteRequestIds.current.set(expense.id, requestId);
    try {
      if (
        onScopedInstallmentDelete &&
        targetInstallment &&
        Number(expense.installment_count || 1) > 1 &&
        chosenScope !== 'ALL'
      ) {
        await onScopedInstallmentDelete(expense, targetInstallment, chosenScope, requestId);
      } else {
        await onDelete(expense.id, requestId);
      }
      deleteRequestIds.current.delete(expense.id);
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível excluir o lançamento.'); }
    finally { setDeletingId(null); }
  };

  const confirmAdvance = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!advancingExpense || !dueMonth || !onAdvanceInstallments || advancingBusy || !advancePreview) return;
    setAdvancingBusy(true);
    setError('');
    const key = `${advancingExpense.id}:${dueMonth}:${advancePreview.selectedInstallments.length}:${advancePreview.discountAmount.toFixed(2)}`;
    const requestId = advanceRequestIds.current.get(key) || generateUUID();
    advanceRequestIds.current.set(key, requestId);
    try {
      await onAdvanceInstallments(
        advancingExpense,
        dueMonth,
        advancePreview.selectedInstallments.length,
        advancePreview.discountAmount,
        requestId,
      );
      advanceRequestIds.current.delete(key);
      setAdvancingExpense(null);
      setAdvanceDiscount('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível antecipar as parcelas.');
    } finally {
      setAdvancingBusy(false);
    }
  };

  const cancelConsolidation = async (expense: PersonalWalletExpense) => {
    if (!onCancelConsolidation || !expense.invoice_due_month || cancelingConsolidation) return;
    setCancelingConsolidation(true);
    setError('');
    const month = expense.invoice_due_month.slice(0, 7) + '-01';
    const requestId = consolidationRequests.current.get(month) || generateUUID();
    consolidationRequests.current.set(month, requestId);
    try {
      await onCancelConsolidation(month, requestId);
      consolidationRequests.current.delete(month);
      setConfirmingConsolidation(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível cancelar a consolidação.');
      setConfirmingConsolidation(null);
    } finally { setCancelingConsolidation(false); }
  };

  return (
    <section aria-labelledby="invoice-statement-title" className={`mx-2 mb-2 rounded-xl border border-slate-800 bg-slate-950/60 p-2.5 sm:p-3 ${className}`}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 id="invoice-statement-title" className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-slate-200"><ReceiptText size={15} className="text-cyan-400" /> Extrato da Fatura</h3>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400">
            {dueMonth ? <span>{cycleDates ? `Fecha em ${cycleDates.closingDate.split('-').reverse().join('/')} • Vence em ${cycleDates.dueDate.split('-').reverse().join('/')}` : `Ciclo ${dueMonth.slice(0, 7).split('-').reverse().join('/')}`}</span> : <span>Nenhuma fatura em aberto</span>}
            {invoiceState && <span className={`rounded-full border px-2 py-0.5 font-bold ${invoiceState === 'OPEN' ? 'border-sky-500/20 bg-sky-500/10 text-sky-400' : invoiceState === 'CLOSED' ? 'border-amber-500/20 bg-amber-500/10 text-amber-400' : invoiceState === 'OVERDUE' ? 'border-rose-500/20 bg-rose-500/10 text-rose-400' : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'}`}>{invoiceState === 'OPEN' ? 'Aberta' : invoiceState === 'CLOSED' ? 'Fechada' : invoiceState === 'OVERDUE' ? 'Vencida' : 'Paga'}</span>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">{headerAction}<span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-300">{entries.length}</span></div>
      </header>

      {openingBreakdown && (
        <div className="mt-2 space-y-1.5 rounded-xl border border-amber-500/25 bg-amber-950/15 p-3 text-xs">
          <p className="font-semibold text-amber-100">Composição atual da fatura</p>
          <div className="flex items-center justify-between gap-2 text-slate-300">
            <span>Saldo registrado na abertura</span>
            <strong className="tabular-nums text-amber-200"><PrivateMoney value={formatMoney(openingBreakdown.opening)} /></strong>
          </div>
          <div className="flex items-center justify-between gap-2 text-slate-300">
            <span>Movimentações adicionais (líquido)</span>
            <strong className="tabular-nums text-slate-100"><PrivateMoney value={`${openingBreakdown.subsequent < 0 ? '− ' : '+ '}${formatMoney(Math.abs(openingBreakdown.subsequent))}`} /></strong>
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-amber-500/20 pt-2 text-sm font-bold text-white">
            <span>Total pendente no ciclo</span>
            <strong className="tabular-nums text-emerald-300"><PrivateMoney value={formatMoney(openingBreakdown.current)} /></strong>
          </div>
          <p className="text-[11px] leading-relaxed text-slate-400">O valor da abertura é histórico e não muda. O total do ciclo considera os lançamentos posteriores, sem duplicar os já consolidados.</p>
        </div>
      )}
      {hasOverride && !openingBreakdown && <p className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-2.5 py-1.5 text-[10px] text-amber-100">Ajuste consolidado: valor fixado para este ciclo. Consulte o saldo da fatura acima para o total reconhecido.</p>}
      {openingBalance > 0 && <article className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-slate-900 p-2.5 text-xs"><div><p className="font-semibold text-slate-200">Demais gastos da carga inicial</p><p className="mt-0.5 text-[10px] text-slate-400">Ainda sem detalhamento · fora da fatura deste ciclo</p></div><strong className="shrink-0 text-amber-200"><PrivateMoney value={formatMoney(openingBalance)} /></strong></article>}

      {!entries.length ? <p className="mt-2 rounded-lg border border-dashed border-slate-800 px-3 py-3 text-center text-xs text-slate-400">Nenhum lançamento ativo nesta fatura.</p> : (
        <>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <label className="relative flex min-h-9 min-w-0 flex-1 items-center rounded-lg border border-slate-800 bg-slate-900/90 px-2.5 text-slate-400 focus-within:border-cyan-500/60">
              <Search size={14} className="shrink-0" aria-hidden="true" />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                aria-label="Buscar no extrato da fatura por nome, data, valor, categoria ou parcela"
                placeholder="Buscar compra, valor, data, categoria ou parcela…"
                className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-xs text-white outline-none placeholder:text-slate-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Limpar busca"
                  className="rounded p-0.5 text-slate-400 hover:bg-slate-800 hover:text-white"
                >
                  <X size={13} />
                </button>
              )}
            </label>
            {normalizedQuery && (
              <span className="shrink-0 text-[11px] font-semibold tabular-nums text-cyan-300">
                {visibleEntries.length} de {entries.length} · <PrivateMoney value={formatMoney(filteredTotal)} />
              </span>
            )}
          </div>

          {!visibleEntries.length ? (
            <p className="mt-2 rounded-lg border border-dashed border-slate-800 px-3 py-4 text-center text-xs text-slate-400">
              Nenhum lançamento encontrado para "{searchQuery.trim()}".
            </p>
          ) : (
            <div className="mt-2 divide-y divide-slate-800/70">
              {visibleEntries.map(({ expense, installment }) => {
            const installmentBadge = formatInstallmentBadgeLabel(expense, installment);
            const futurePending = futureInstallmentsByExpenseId.get(expense.id) || [];
            const isCredit = Boolean(expense.is_invoice_credit);
            const canAdvance = Boolean(onAdvanceInstallments && futurePending.length > 0 && expense.entry_type !== 'INVOICE_OVERRIDE' && !isCredit);
            const isOverride = expense.entry_type === 'INVOICE_OVERRIDE';
            const remainingAmount = Number(installment.amount) - Number(installment.paid_amount || 0);
            return (
              <article key={installment.id} className={`min-w-0 ${isOverride ? 'my-1 rounded-lg border border-amber-500/30 bg-amber-950/20 px-2.5 py-2' : 'py-2.5'}`}>
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className={`flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm font-semibold ${isOverride ? 'text-amber-200' : isCredit ? 'text-emerald-200' : 'text-slate-100'}`}>
                      <span className="min-w-0 break-words">{isOverride && expense.is_opening_summary ? 'Saldo inicial registrado' : isOverride ? 'Ajuste consolidado da fatura' : expense.description}</span>
                      {isCredit && <span className="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">Crédito / Estorno</span>}
                      {installmentBadge && <span className="shrink-0 text-[11px] font-medium text-cyan-300">Parcela {installmentBadge}</span>}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-slate-400">
                      <CalendarDays size={12} aria-hidden="true" />{expense.expense_date.split('-').reverse().join('/')}
                      <span aria-hidden="true">·</span><Tag size={12} aria-hidden="true" />{expense.category}
                      {isOverride && expense.is_opening_summary && <span className="text-amber-300">· Saldo de abertura, não o total atual</span>}
                    </p>
                  </div>
                  <strong className={`shrink-0 whitespace-nowrap text-sm font-bold tabular-nums ${isOverride ? 'text-amber-200' : isCredit ? 'text-emerald-300' : 'text-rose-300'}`}>
                    <PrivateMoney value={isCredit ? `− ${formatMoney(remainingAmount)}` : formatMoney(remainingAmount)} />
                  </strong>
                </div>
                {isOverride && onCancelConsolidation && <div className="mt-1.5 flex justify-end">
                  <button type="button" onClick={() => setConfirmingConsolidation(expense)} disabled={cancelingConsolidation}
                    className="min-h-9 rounded-md px-2 py-1 text-xs font-semibold text-amber-200 hover:bg-amber-900/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 disabled:opacity-40">Cancelar consolidação</button>
                </div>}
                {!isOverride && <div className="mt-1 flex flex-wrap items-center justify-end gap-x-2 gap-y-0.5">
                  {canAdvance && (
                    <button type="button" onClick={() => {
                      setAdvancingExpense(expense);
                      setAdvanceCount(String(futurePending.length));
                      setAdvanceDiscount('');
                    }}
                      aria-label={`Antecipar parcelas de ${expense.description}`}
                      className="inline-flex min-h-9 items-center justify-center gap-1 rounded-md px-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">
                      <FastForward size={14} aria-hidden="true" /> Antecipar ({futurePending.length})
                    </button>
                  )}
                  <button type="button" onClick={() => setEditing(expense)} aria-label={`Editar ${expense.description}`}
                    className="inline-flex min-h-9 items-center justify-center gap-1 rounded-md px-2 text-xs text-blue-300 hover:bg-blue-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
                    <Pencil size={14} aria-hidden="true" /> Editar
                  </button>
                  <button type="button" disabled={deletingId === expense.id}
                    onClick={() => { setConfirmingDelete(expense); setConfirmingDeleteInstallment(installment); setDeleteScope('ALL'); }}
                    aria-label={`Excluir ${expense.description}`}
                    className="inline-flex min-h-9 items-center justify-center gap-1 rounded-md px-2 text-xs text-rose-300 hover:bg-rose-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 disabled:opacity-40">
                    <Trash2 size={14} aria-hidden="true" /> Excluir
                  </button>
                </div>}
              </article>
            );
          })}
            </div>
          )}
        </>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-rose-300">{error}</p>}
      {editing && <ExpenseEditModal compact expense={editing} onClose={() => setEditing(null)} onSave={onEdit} />}
      {confirmingConsolidation && <Modal compact title="Cancelar valor consolidado?" subtitle="Preserva compras e histórico." onClose={() => !cancelingConsolidation && setConfirmingConsolidation(null)} busy={cancelingConsolidation}
        footer={<button type="button" disabled={cancelingConsolidation} onClick={() => { void cancelConsolidation(confirmingConsolidation); }} className={modalPrimaryActionClass}>Confirmar cancelamento</button>}>
        <p className="text-xs leading-relaxed text-slate-300">O valor consolidado será cancelado, sem excluir as compras individuais. Se existirem pagamentos registrados, a operação será bloqueada. Nenhum pagamento bancário será estornado.</p>
      </Modal>}
      {advancingExpense && advancePreview && (
        <Modal
          compact
          title="Antecipar parcelas"
          subtitle={`${advancingExpense.description} · ${advancePreview.futureInstallments.length} futura(s)`}
          icon={<FastForward size={17} />}
          onClose={() => !advancingBusy && setAdvancingExpense(null)}
          busy={advancingBusy}
        >
          <form onSubmit={confirmAdvance} className="space-y-3 text-xs">
            <p className="text-slate-300 leading-relaxed">
              Puxe parcelas das próximas faturas para esta fatura e informe o desconto de antecipação (caso o banco conceda).
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              <label className="space-y-1 text-slate-300">
                <span className="font-bold">Qtd. de parcelas a antecipar</span>
                <input
                  type="number"
                  min={1}
                  max={advancePreview.futureInstallments.length}
                  required
                  value={advanceCount}
                  onChange={(e) => setAdvanceCount(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="space-y-1 text-slate-300">
                <span className="font-bold">Desconto obtido (R$)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={advanceDiscount}
                  onChange={e => {const next=resolveLiveBrazilianCentsChange(e.currentTarget.value,advanceDiscount,(e.nativeEvent as InputEvent).inputType);if(next)setAdvanceDiscount(next.value);}}
                  onBlur={(e) => {
                    try { setAdvanceDiscount(formatWalletMoneyInput(e.target.value)); } catch { }
                  }}
                  placeholder="0,00"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                />
              </label>
            </div>
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-950/20 p-3 space-y-1 text-slate-200">
              <div className="flex justify-between">
                <span>Selecionadas ({advancePreview.advancedBadgesLabel}):</span>
                <strong><PrivateMoney value={formatMoney(advancePreview.advancedSum)} /></strong>
              </div>
              {advancePreview.discountAmount > 0 && (
                <div className="flex justify-between text-emerald-300">
                  <span>Desconto de antecipação:</span>
                  <strong>- <PrivateMoney value={formatMoney(advancePreview.discountAmount)} /></strong>
                </div>
              )}
              <div className="flex justify-between border-t border-emerald-500/20 pt-1.5 text-sm font-bold text-white">
                <span>Valor lançado nesta fatura:</span>
                <strong className="text-emerald-300"><PrivateMoney value={formatMoney(advancePreview.netAdvancedAmount)} /></strong>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row-reverse pt-1">
              <button type="submit" disabled={advancingBusy} className={modalPrimaryActionClass}>
                <FastForward size={14} /> {advancingBusy ? 'Antecipando...' : 'Confirmar antecipação'}
              </button>
              <button type="button" disabled={advancingBusy} onClick={() => setAdvancingExpense(null)} className={modalSecondaryActionClass}>
                Cancelar
              </button>
            </div>
          </form>
        </Modal>
      )}
      {confirmingDelete && <Modal compact title="Excluir lançamento?" subtitle="A fatura e o limite serão recalculados." icon={<AlertTriangle size={17} />} onClose={() => { setConfirmingDelete(null); setConfirmingDeleteInstallment(null); }}>
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-slate-300">Excluir <strong className="text-white">{confirmingDelete.description}</strong> deste extrato?</p>
          {onScopedInstallmentDelete && Number(confirmingDelete.installment_count || 1) > 1 && confirmingDeleteInstallment && (
            <div className="space-y-1.5 rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs">
              <span className="block font-bold text-slate-300">Como deseja excluir este parcelamento?</span>
              <label className="flex cursor-pointer items-center gap-2 py-1 text-slate-200">
                <input
                  type="radio"
                  name="delete-installment-scope"
                  checked={deleteScope === 'ONLY_CURRENT'}
                  onChange={() => setDeleteScope('ONLY_CURRENT')}
                  className="accent-rose-500"
                />
                <span>Apenas esta parcela ({formatInstallmentBadgeLabel(confirmingDelete, confirmingDeleteInstallment)})</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 py-1 text-slate-200">
                <input
                  type="radio"
                  name="delete-installment-scope"
                  checked={deleteScope === 'CURRENT_AND_NEXT'}
                  onChange={() => setDeleteScope('CURRENT_AND_NEXT')}
                  className="accent-rose-500"
                />
                <span>Esta e as próximas parcelas</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 py-1 text-slate-200">
                <input
                  type="radio"
                  name="delete-installment-scope"
                  checked={deleteScope === 'ALL'}
                  onChange={() => setDeleteScope('ALL')}
                  className="accent-rose-500"
                />
                <span>Todas as parcelas da compra</span>
              </label>
            </div>
          )}
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <button type="button" onClick={() => { void remove(confirmingDelete); }} disabled={deletingId === confirmingDelete.id} className={modalPrimaryActionClass}><Trash2 size={14} /> Excluir lançamento</button>
            <button type="button" onClick={() => { setConfirmingDelete(null); setConfirmingDeleteInstallment(null); }} disabled={deletingId === confirmingDelete.id} className={modalSecondaryActionClass}>Manter lançamento</button>
          </div>
        </div>
      </Modal>}
    </section>
  );
};
