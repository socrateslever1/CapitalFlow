import React, { useEffect, useRef, useState } from 'react';
import { CalendarDays, Loader2, Save, X } from 'lucide-react';
import type { PersonalWalletExpense, UpdatePersonalWalletExpense } from '../../services/personalWallet.service';
import { generateUUID } from '../../utils/generators';
import { parseWalletMoney } from '../../features/wallet/utils/parseWalletMoney';

type ExpenseEditModalProps = {
  expense: PersonalWalletExpense;
  compact?: boolean;
  onClose: () => void;
  onSave: (input: UpdatePersonalWalletExpense, requestId: string) => Promise<void>;
};

export const ExpenseEditModal: React.FC<ExpenseEditModalProps> = ({ expense, compact = false, onClose, onSave }) => {
  const requestId = useRef(generateUUID());
  const [description, setDescription] = useState(expense.description);
  const [amount, setAmount] = useState(String(Number(expense.amount).toFixed(2)).replace('.', ','));
  const [category, setCategory] = useState(expense.category || 'Outros');
  const [expenseDate, setExpenseDate] = useState(expense.expense_date);
  const [dueDate, setDueDate] = useState(expense.due_date || '');
  const [notes, setNotes] = useState(expense.notes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const listener = (event: KeyboardEvent) => event.key === 'Escape' && !saving && onClose();
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [onClose, saving]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!description.trim()) return setError('Informe a descrição do lançamento.');
    let parsedAmount: number;
    try { parsedAmount = parseWalletMoney(amount, 'valor do lançamento'); }
    catch (reason) { return setError(reason instanceof Error ? reason.message : 'Valor inválido.'); }
    if (parsedAmount <= 0) return setError('Informe um valor maior que zero.');
    setSaving(true);
    setError('');
    try {
      await onSave({
        expenseId: expense.id,
        description: description.trim(),
        amount: parsedAmount,
        category: category.trim() || 'Outros',
        expenseDate,
        dueDate: dueDate || null,
        notes: notes.trim() || null,
      }, requestId.current);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o lançamento.');
    } finally {
      setSaving(false);
    }
  };

  const fieldClass = 'w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20';

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="edit-expense-title" className="fixed inset-0 z-[2200] flex items-end justify-center bg-slate-950/80 backdrop-blur-sm sm:items-center sm:p-4">
      <button type="button" aria-label="Fechar edição" className="absolute inset-0 cursor-default" onClick={() => !saving && onClose()} />
      <form onSubmit={submit} className="relative w-full rounded-t-3xl border border-slate-700 bg-slate-900 p-5 shadow-2xl sm:max-w-md sm:rounded-2xl">
        <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-slate-600 sm:hidden" />
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h3 id="edit-expense-title" className="text-lg font-black text-white">Editar lançamento</h3>
            <p className="mt-1 text-xs text-slate-400">A fatura e o limite serão recalculados ao salvar.</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Fechar" className="rounded-full bg-slate-800 p-2 text-slate-400 hover:text-white"><X size={17} /></button>
        </div>

        <div className="space-y-3">
          <label className="block text-xs font-bold text-slate-300">Descrição
            <input autoFocus maxLength={240} required value={description} onChange={(e) => setDescription(e.target.value)} className={`${fieldClass} mt-1.5`} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-bold text-slate-300">Valor
              <input inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} className={`${fieldClass} mt-1.5`} />
            </label>
            <label className="block text-xs font-bold text-slate-300">Categoria
              <input maxLength={100} value={category} onChange={(e) => setCategory(e.target.value)} className={`${fieldClass} mt-1.5`} />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-bold text-slate-300">Data da compra
              <span className="relative mt-1.5 block"><CalendarDays className="pointer-events-none absolute left-3 top-3 text-slate-500" size={15} /><input type="date" required value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} className={`${fieldClass} pl-9`} /></span>
            </label>
            {compact ? <label className="block text-xs font-bold text-slate-300">Mês da fatura
              <input type="month" required value={dueDate.slice(0, 7)} onChange={(e) => setDueDate(e.target.value ? e.target.value + '-01' : '')} className={`${fieldClass} mt-1.5`} />
            </label> : <label className="block text-xs font-bold text-slate-300">Primeiro vencimento
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={`${fieldClass} mt-1.5`} />
            </label>}
          </div>
          <label className="block text-xs font-bold text-slate-300">Observações
            <textarea maxLength={2000} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={`${fieldClass} mt-1.5 resize-none`} />
          </label>
        </div>

        {error && <p role="alert" className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{error}</p>}
        <button type="submit" disabled={saving} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-extrabold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60">
          {saving ? <Loader2 className="animate-spin" size={17} /> : <Save size={17} />}
          {saving ? 'Salvando…' : 'Salvar alterações'}
        </button>
      </form>
    </div>
  );
};
