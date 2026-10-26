import React, { useMemo, useState } from 'react';
import type { UserProfile } from '../../../types';
import type { PersonalWalletCard } from '../../../services/personalWallet.service';
import { personalWalletService } from '../../../services/personalWallet.service';
import { BankStack } from '../../../components/wallet/BankStack';
import { CardInvoiceStatement } from '../../../components/wallet/CardInvoiceStatement';
import { CardEditModal } from '../../../components/wallet/CardEditModal';
import { PayInvoiceModal } from '../../../components/wallet/PayInvoiceModal';
import { WalletStatementImport } from '../../../components/wallet/WalletStatementImport';
import { getCreditSummary } from '../../../components/wallet/walletPresentation';
import { formatMoney } from '../../../utils/formatters';
import { useWalletSnapshot } from '../hooks/useWalletSnapshot';
import { WalletPageFrame } from '../components/WalletPageFrame';

export const WalletCardsPage: React.FC<{ activeUser?: UserProfile | null; onNavigate: (path: string) => void }> = () => {
  const { data, loading, error, refresh } = useWalletSnapshot();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<PersonalWalletCard | null>(null);
  const [paying, setPaying] = useState<PersonalWalletCard | null>(null);
  const [importing, setImporting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newExpense, setNewExpense] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [cardForm, setCardForm] = useState({
    nickname: '', issuer: '', brand: 'Mastercard', last_four: '', credit_limit: '', due_day: '10',
    closing_day: '1', account_id: '',
  });
  const [expenseForm, setExpenseForm] = useState({
    description: '', amount: '', category: 'Compras', installment_count: '1',
  });
  const availableCards = useMemo(() => (data?.cards || []).filter(card => card.status !== 'CANCELED'), [data]);
  const selected = availableCards.find(card => card.id === selectedId) || availableCards[0] || null;
  const invoice = useMemo(() => {
    if (!data || !selected) return null;
    const expenses = new Map(data.expenses.map(expense => [expense.id, expense]));
    const sums = new Map<string, number>();
    data.installments.forEach(installment => {
      if (installment.status !== 'PENDING') return;
      if (expenses.get(installment.expense_id)?.card_id !== selected.id) return;
      const outstanding = Math.max(0, Number(installment.amount || 0) - Number(installment.paid_amount || 0));
      const month = String(installment.due_month).slice(0, 7) + '-01';
      sums.set(month, (sums.get(month) || 0) + outstanding);
    });
    const months = [...sums.keys()].sort();
    return months.length ? { month: months[0], amount: sums.get(months[0]) || 0 } : null;
  }, [data, selected]);
  const createCard = async (event: React.FormEvent) => {
    event.preventDefault(); if (saving) return; setSaving(true); setNotice('');
    try {
      await personalWalletService.createHybridAssets({
        card: {
          nickname: cardForm.nickname.trim(), issuer: cardForm.issuer.trim(),
          brand: cardForm.brand || null, last_four: cardForm.last_four || null,
          credit_limit: Number(cardForm.credit_limit),
          due_day: Number(cardForm.due_day), closing_day: Number(cardForm.closing_day),
        },
        existingAccountId: cardForm.account_id || null,
      });
      await refresh(); setCreating(false); setCardForm({
        nickname: '', issuer: '', brand: 'Mastercard', last_four: '', credit_limit: '',
        due_day: '10', closing_day: '1', account_id: '',
      });
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Falha ao cadastrar cartão.'); }
    finally { setSaving(false); }
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
  const credit = getCreditSummary(availableCards);
  return <WalletPageFrame title="Cartões e faturas" description="Cartões físicos, extrato editável e pagamentos autorizados."
    error={error || notice} loading={loading} onRefresh={() => { void refresh().catch(() => {}); }}>
    {data && <>
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900 p-4 lg:col-span-5">
          <BankStack accounts={data.accounts} cards={availableCards}
            onAccount={() => {}} onCard={card => setSelectedId(card.id)}
            onEditCard={card => setEditing(card)}
            onSelectionChange={card => setSelectedId(current => current === card?.id ? current : card?.id || null)}
            onCreateCard={() => setCreating(true)}
            onNewExpense={card => { setSelectedId(card.id); setNewExpense(true); }}
            onPayInvoice={card => { setSelectedId(card.id); setPaying(card); }}/>
        </div>
        <div className="min-w-0 space-y-4 lg:col-span-7">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <p className="text-xs text-slate-400">Crédito utilizado</p>
              <strong className="block text-xl font-black text-white">{formatMoney(credit.used)}</strong>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <p className="text-xs text-slate-400">Limite disponível</p>
              <strong className="block text-xl font-black text-emerald-300">{formatMoney(credit.available)}</strong>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-white">Fatura {selected?.nickname || ''}</h3>
              {selected && <button type="button" onClick={() => setImporting(true)}
                className="rounded-xl border border-cyan-700 px-3 py-2 text-xs text-cyan-200">Importar PDF</button>}
            </div>
            {selected ? <CardInvoiceStatement cardId={selected.id} dueMonth={invoice?.month}
              expenses={data.expenses} installments={data.installments}
              onEdit={async input => { await personalWalletService.updateExpense(input); await refresh(); }}
              onDelete={async id => { await personalWalletService.setExpenseStatus(id, 'CANCELED'); await refresh(); }}
              className="m-0 border-0 bg-transparent p-0"/> :
              <p className="text-xs text-slate-400">Cadastre um cartão para visualizar o extrato.</p>}
          </div>
        </div>
      </div>
      {creating && <form onSubmit={event => { void createCard(event); }}
        className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:grid-cols-2">
        <h3 className="sm:col-span-2 text-sm font-bold text-white">Novo cartão</h3>
        {(['nickname', 'issuer', 'brand', 'last_four', 'credit_limit', 'closing_day', 'due_day'] as const).map(field =>
          <label key={field} className="space-y-1 text-xs text-slate-300">
            {({nickname:'Apelido',issuer:'Instituição',brand:'Bandeira',last_four:'Últimos 4 dígitos',
              credit_limit:'Limite de crédito',closing_day:'Dia de fechamento',due_day:'Dia do vencimento'} as const)[field]}
            <input required={field !== 'last_four'} type={['credit_limit','closing_day','due_day'].includes(field) ? 'number':'text'}
              min={field === 'credit_limit' ? 0 : field === 'closing_day' || field === 'due_day' ? 1 : undefined}
              max={field === 'closing_day' || field === 'due_day' ? 31 : undefined}
              value={cardForm[field]} onChange={e => setCardForm(v => ({ ...v, [field]: e.target.value }))}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white"/></label>)}
        <label className="space-y-1 text-xs text-slate-300">Conta vinculada (opcional)
          <select value={cardForm.account_id} onChange={e => setCardForm(v => ({ ...v, account_id: e.target.value }))}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white">
            <option value="">Cartão independente</option>
            {data.accounts.map(account => <option key={account.id} value={account.id}>{account.nickname}</option>)}
          </select>
        </label>
        <div className="flex gap-2 sm:col-span-2">
          <button type="button" onClick={() => setCreating(false)} className="rounded-xl border border-slate-700 px-4 py-3 text-xs text-white">Cancelar</button>
          <button type="submit" disabled={saving} className="rounded-xl bg-blue-600 px-4 py-3 text-xs font-bold text-white disabled:opacity-50">Salvar cartão</button>
        </div>
      </form>}
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
        <div className="flex gap-2 sm:col-span-2">
          <button type="button" onClick={() => setNewExpense(false)} className="rounded-xl border border-slate-700 px-4 py-3 text-xs text-white">Cancelar</button>
          <button type="submit" disabled={saving} className="rounded-xl bg-blue-600 px-4 py-3 text-xs font-bold text-white disabled:opacity-50">Registrar despesa</button>
        </div>
      </form>}
      {editing && <CardEditModal card={editing} accounts={data.accounts} onClose={() => setEditing(null)} onSaved={async () => { await refresh(); }}/>}
      {importing && selected && <WalletStatementImport kind="CARD" targetId={selected.id}
        targetName={selected.nickname} onClose={() => setImporting(false)}
        onImported={async () => { await refresh(); setImporting(false); }}/>}
      {paying && <PayInvoiceModal card={paying} accounts={data.accounts}
        invoiceAmount={paying.id === selected?.id ? invoice?.amount || 0 : 0}
        dueMonth={invoice?.month} onClose={() => setPaying(null)}
        onPay={async (cardId, month, accountId, amount, requestId) => {
          await personalWalletService.payInvoicePartial(cardId, month, accountId, amount, requestId);
          await refresh();
        }}/>}
    </>}
  </WalletPageFrame>;
};