import React, { useMemo, useRef, useState } from 'react';
import { AlertTriangle, CalendarDays, Pencil, ReceiptText, ShoppingBag, Tag, Trash2 } from 'lucide-react';
import type { PersonalWalletExpense, PersonalWalletExpenseInstallment, UpdatePersonalWalletExpense } from '../../services/personalWallet.service';
import { formatMoney } from '../../utils/formatters';
import { generateUUID } from '../../utils/generators';
import { ExpenseEditModal } from './ExpenseEditModal';
import { getCardInvoiceEntries, type InvoiceCycleDates, type InvoiceCycleState } from './invoiceStatementDomain';
import { Modal, modalPrimaryActionClass, modalSecondaryActionClass } from '../ui/Modal';

type CardInvoiceStatementProps = {
  cardId: string;
  dueMonth?: string | null;
  expenses: PersonalWalletExpense[];
  installments: PersonalWalletExpenseInstallment[];
  onEdit: (input: UpdatePersonalWalletExpense, requestId: string) => Promise<void>;
  onDelete: (expenseId: string, requestId: string) => Promise<void>;
  onCancelConsolidation?: (dueMonth: string, requestId: string) => Promise<void>;
  headerAction?: React.ReactNode;
  invoiceState?: InvoiceCycleState;
  cycleDates?: InvoiceCycleDates;
  className?: string;
  openingBalance?: number;
};

export const CardInvoiceStatement: React.FC<CardInvoiceStatementProps> = ({ cardId, dueMonth, expenses, installments, onEdit, onDelete, onCancelConsolidation, headerAction, invoiceState, cycleDates, openingBalance = 0, className = '' }) => {
  const [editing, setEditing] = useState<PersonalWalletExpense | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<PersonalWalletExpense | null>(null);
  const [confirmingConsolidation, setConfirmingConsolidation] = useState<PersonalWalletExpense | null>(null);
  const [cancelingConsolidation, setCancelingConsolidation] = useState(false);
  const consolidationRequests = useRef(new Map<string, string>());
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const deleteRequestIds = useRef(new Map<string, string>());
  const entries = useMemo(() => getCardInvoiceEntries(cardId, dueMonth, expenses, installments), [cardId, dueMonth, expenses, installments]);
  const hasOverride = entries.some(entry => entry.expense.entry_type === 'INVOICE_OVERRIDE');

  const remove = async (expense: PersonalWalletExpense) => {
    setDeletingId(expense.id);
    setConfirmingDelete(null);
    setError('');
    const requestId = deleteRequestIds.current.get(expense.id) || generateUUID();
    deleteRequestIds.current.set(expense.id, requestId);
    try {
      await onDelete(expense.id, requestId);
      deleteRequestIds.current.delete(expense.id);
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível excluir o lançamento.'); }
    finally { setDeletingId(null); }
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
      setError(cause instanceof Error ? cause.message : 'Não foi possível remover o saldo inicial.');
      setConfirmingConsolidation(null);
    } finally { setCancelingConsolidation(false); }
  };

  return (
    <section aria-labelledby="invoice-statement-title" className={`mx-4 mb-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4 ${className}`}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id="invoice-statement-title" className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-slate-200"><ReceiptText size={15} className="text-cyan-400"/> Lançamentos</h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
            {dueMonth ? <span>{cycleDates ? `Fecha em ${cycleDates.closingDate.split('-').reverse().join('/')} • Vence em ${cycleDates.dueDate.split('-').reverse().join('/')}` : `Ciclo ${dueMonth.slice(0, 7).split('-').reverse().join('/')}`}</span> : <span>Nenhuma fatura em aberto</span>}
            {invoiceState && <span className={`rounded-full border px-2 py-0.5 font-bold ${invoiceState === 'OPEN' ? 'border-sky-500/20 bg-sky-500/10 text-sky-400' : invoiceState === 'CLOSED' ? 'border-amber-500/20 bg-amber-500/10 text-amber-400' : invoiceState === 'OVERDUE' ? 'border-rose-500/20 bg-rose-500/10 text-rose-400' : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'}`}>{invoiceState === 'OPEN' ? 'Aberta' : invoiceState === 'CLOSED' ? 'Fechada' : invoiceState === 'OVERDUE' ? 'Vencida' : 'Paga'}</span>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">{headerAction}<span className="rounded-full bg-slate-800 px-2 py-1 text-[10px] font-bold text-slate-300">{entries.length}</span></div>
      </header>

      
      {openingBalance > 0 && <article className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-slate-900 p-3 text-xs"><div><p className="font-semibold text-slate-200">Outros gastos do cartão</p><p className="mt-1 text-[10px] text-slate-400">Sem detalhamento</p></div><strong className="shrink-0 text-amber-200">{formatMoney(openingBalance)}</strong></article>}

      {!entries.length ? <p className="mt-3 rounded-lg border border-dashed border-slate-800 px-3 py-4 text-center text-xs text-slate-500">Nenhum lançamento ativo nesta fatura.</p> : (
        <div className="mt-3 max-h-56 divide-y divide-slate-800 overflow-y-auto pr-1 overscroll-contain lg:max-h-none">
          {entries.map(({ expense, installment }) => (
            <article key={installment.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-3">
              <span className={`grid h-9 w-9 place-items-center rounded-xl ${expense.entry_type === 'INVOICE_OVERRIDE' ? 'bg-amber-500/10 text-amber-300' : 'bg-cyan-500/10 text-cyan-300'}`}><ShoppingBag size={16}/></span>
              <div className="min-w-0">
                <p className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs font-bold text-slate-100"><span className="truncate">{expense.description}</span>{expense.entry_type === 'INVOICE_OVERRIDE' && <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[9px] uppercase tracking-wide text-amber-200">Saldo inicial</span>}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500"><CalendarDays size={11}/>{expense.expense_date.split('-').reverse().join('/')}<span>·</span><Tag size={11}/>{expense.category}</p>
              </div>
              <div className="text-right">
                <strong className="block text-xs font-extrabold text-rose-300">{formatMoney(Number(installment.amount) - Number(installment.paid_amount || 0))}</strong>
                {expense.entry_type === 'INVOICE_OVERRIDE' && onCancelConsolidation && <button type="button" onClick={() => setConfirmingConsolidation(expense)} disabled={cancelingConsolidation} className="mt-1 rounded-md border border-rose-500/30 px-2 py-1 text-[10px] text-rose-300 disabled:opacity-40">Remover saldo inicial</button>}
                {expense.entry_type !== 'INVOICE_OVERRIDE' && <div className="mt-1 flex justify-end gap-1">
                  <button type="button" onClick={() => setEditing(expense)} aria-label={`Editar ${expense.description}`} className="inline-flex min-h-10 min-w-10 items-center justify-center gap-1 rounded-md px-2 text-[11px] text-blue-300 transition hover:bg-blue-500/10"><Pencil size={14}/> Editar</button>
                  <button type="button" disabled={deletingId === expense.id} onClick={() => setConfirmingDelete(expense)} aria-label={`Excluir ${expense.description}`} className="inline-flex min-h-10 min-w-10 items-center justify-center gap-1 rounded-md px-2 text-[11px] text-rose-300 transition hover:bg-rose-500/10 disabled:opacity-40"><Trash2 size={14}/> Excluir</button>
                </div>}
              </div>
            </article>
          ))}
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-rose-300">{error}</p>}
      {editing && <ExpenseEditModal compact expense={editing} onClose={() => setEditing(null)} onSave={onEdit}/>} 
      {confirmingConsolidation && <Modal compact title="Remover saldo inicial?" subtitle="Preserva compras e histórico." onClose={() => !cancelingConsolidation && setConfirmingConsolidation(null)} busy={cancelingConsolidation}
        footer={<button type="button" disabled={cancelingConsolidation} onClick={() => {void cancelConsolidation(confirmingConsolidation);}} className={modalPrimaryActionClass}>Confirmar cancelamento</button>}>
        <p className="text-xs leading-relaxed text-slate-300">Remove apenas o saldo inicial ainda não pago. As compras e pagamentos existentes são preservados.</p>
      </Modal>}
      {confirmingDelete && <Modal compact title="Excluir lançamento?" subtitle="A fatura e o limite serão recalculados." icon={<AlertTriangle size={17}/>} onClose={() => setConfirmingDelete(null)}>
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-slate-300">Excluir <strong className="text-white">{confirmingDelete.description}</strong> deste extrato?</p>
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <button type="button" onClick={() => { void remove(confirmingDelete); }} disabled={deletingId === confirmingDelete.id} className={modalPrimaryActionClass}><Trash2 size={14}/> Excluir lançamento</button>
            <button type="button" onClick={() => setConfirmingDelete(null)} disabled={deletingId === confirmingDelete.id} className={modalSecondaryActionClass}>Manter lançamento</button>
          </div>
        </div>
      </Modal>}
    </section>
  );
};
