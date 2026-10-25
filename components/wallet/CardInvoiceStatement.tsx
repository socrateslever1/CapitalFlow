import React, { useMemo, useState } from 'react';
import { CalendarDays, Pencil, ReceiptText, ShoppingBag, Tag, Trash2 } from 'lucide-react';
import type { PersonalWalletExpense, PersonalWalletExpenseInstallment, UpdatePersonalWalletExpense } from '../../services/personalWallet.service';
import { formatMoney } from '../../utils/formatters';
import { ExpenseEditModal } from './ExpenseEditModal';
import { getCardInvoiceEntries } from './invoiceStatementDomain';

type CardInvoiceStatementProps = {
  cardId: string;
  dueMonth?: string | null;
  expenses: PersonalWalletExpense[];
  installments: PersonalWalletExpenseInstallment[];
  onEdit: (input: UpdatePersonalWalletExpense) => Promise<void>;
  onDelete: (expenseId: string) => Promise<void>;
};

export const CardInvoiceStatement: React.FC<CardInvoiceStatementProps> = ({ cardId, dueMonth, expenses, installments, onEdit, onDelete }) => {
  const [editing, setEditing] = useState<PersonalWalletExpense | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const entries = useMemo(() => getCardInvoiceEntries(cardId, dueMonth, expenses, installments), [cardId, dueMonth, expenses, installments]);

  const remove = async (expense: PersonalWalletExpense) => {
    if (!window.confirm(`Excluir o lançamento “${expense.description}”? O limite e a fatura serão recalculados.`)) return;
    setDeletingId(expense.id);
    setError('');
    try { await onDelete(expense.id); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível excluir o lançamento.'); }
    finally { setDeletingId(null); }
  };

  return (
    <section aria-labelledby="invoice-statement-title" className="mx-4 mb-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h3 id="invoice-statement-title" className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-slate-200"><ReceiptText size={15} className="text-cyan-400"/> Extrato da Fatura</h3>
          <p className="mt-1 text-[10px] text-slate-500">{dueMonth ? `Vencimento ${dueMonth.split('-').reverse().join('/')}` : 'Nenhuma fatura em aberto'}</p>
        </div>
        <span className="rounded-full bg-slate-800 px-2 py-1 text-[10px] font-bold text-slate-300">{entries.length}</span>
      </header>

      {!entries.length ? <p className="mt-3 rounded-lg border border-dashed border-slate-800 px-3 py-4 text-center text-xs text-slate-500">Nenhum lançamento ativo nesta fatura.</p> : (
        <div className="mt-3 max-h-56 divide-y divide-slate-800 overflow-y-auto pr-1 overscroll-contain">
          {entries.map(({ expense, installment }) => (
            <article key={installment.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-500/10 text-cyan-300"><ShoppingBag size={16}/></span>
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-slate-100">{expense.description}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500"><CalendarDays size={11}/>{expense.expense_date.split('-').reverse().join('/')}<span>·</span><Tag size={11}/>{expense.category}</p>
              </div>
              <div className="text-right">
                <strong className="block text-xs font-extrabold text-rose-300">{formatMoney(Number(installment.amount) - Number(installment.paid_amount || 0))}</strong>
                <div className="mt-1 flex justify-end gap-1">
                  <button type="button" onClick={() => setEditing(expense)} aria-label={`Editar ${expense.description}`} className="rounded-md p-1.5 text-blue-400 transition hover:bg-blue-500/10 hover:text-blue-300"><Pencil size={13}/></button>
                  <button type="button" disabled={deletingId === expense.id} onClick={() => remove(expense)} aria-label={`Excluir ${expense.description}`} className="rounded-md p-1.5 text-slate-500 transition hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-40"><Trash2 size={13}/></button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-rose-300">{error}</p>}
      {editing && <ExpenseEditModal compact expense={editing} onClose={() => setEditing(null)} onSave={onEdit}/>} 
    </section>
  );
};
