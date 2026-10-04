import React, { useEffect, useMemo, useState } from 'react';
import { CreditCard, Plus, WalletCards, X } from 'lucide-react';
import {
  personalWalletService,
  PersonalWalletAccount,
  PersonalWalletCard,
  PersonalWalletExpense,
} from '../services/personalWallet.service';
import { formatMoney } from '../utils/formatters';

type WalletData = {
  accounts: PersonalWalletAccount[];
  cards: PersonalWalletCard[];
  expenses: PersonalWalletExpense[];
};

type FormMode = 'ACCOUNT' | 'CARD' | 'EXPENSE' | null;

const fieldClass = 'rounded-lg border border-slate-800 bg-slate-950 px-3 py-3 text-sm text-white';

export const PersonalWalletPage: React.FC = () => {
  const [data, setData] = useState<WalletData>({ accounts: [], cards: [], expenses: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [formMode, setFormMode] = useState<FormMode>(null);
  const [form, setForm] = useState<Record<string, string>>({});

  const refresh = async () => {
    const wallet = await personalWalletService.load();
    setData(wallet);
  };

  useEffect(() => {
    refresh().catch(() => setError('Não foi possível carregar sua carteira.')).finally(() => setLoading(false));
  }, []);

  const openForm = (mode: Exclude<FormMode, null>) => {
    setError('');
    setForm({});
    setFormMode(mode);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (formMode === 'ACCOUNT') {
        await personalWalletService.createAccount({
          nickname: form.nickname || 'Conta',
          bank_name: form.bank_name || null,
          account_type: form.account_type || 'CHECKING',
          balance: Number(form.balance || 0),
          notes: form.notes || null,
        });
      }
      if (formMode === 'CARD') {
        await personalWalletService.createCard({
          nickname: form.nickname || 'Cartão',
          issuer: form.issuer || null,
          brand: form.brand || null,
          last_four: form.last_four || null,
          credit_limit: Number(form.credit_limit || 0),
          closing_day: form.closing_day ? Number(form.closing_day) : null,
          due_day: form.due_day ? Number(form.due_day) : null,
        });
      }
      if (formMode === 'EXPENSE') {
        const [paymentType, paymentId] = String(form.payment_source || '').split(':');
        if (!paymentId || !['account', 'card'].includes(paymentType)) {
          throw new Error('Escolha a conta ou o cartão utilizado.');
        }
        await personalWalletService.createExpense({
          description: form.description || 'Despesa',
          amount: Number(form.amount || 0),
          category: form.category || 'Outros',
          expense_date: form.expense_date || new Date().toISOString().slice(0, 10),
          due_date: form.due_date || null,
          account_id: paymentType === 'account' ? paymentId : null,
          card_id: paymentType === 'card' ? paymentId : null,
          notes: form.notes || null,
        });
      }
      setFormMode(null);
      setForm({});
      await refresh();
    } catch (reason: any) {
      setError(reason?.message || 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  };

  const totals = useMemo(() => ({
    balance: data.accounts.reduce((sum, account) => sum + Number(account.balance || 0), 0),
    used: data.cards.reduce((sum, card) => sum + Number(card.used_limit || 0), 0),
    month: data.expenses.filter((expense) => expense.status !== 'CANCELED').reduce((sum, expense) => sum + Number(expense.amount || 0), 0),
  }), [data]);

  if (loading) return <div className="p-8 text-sm font-bold text-slate-400">Carregando sua carteira...</div>;

  return <section className="space-y-6">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3"><div className="rounded-xl bg-fuchsia-600/20 p-3 text-fuchsia-300"><WalletCards size={24} /></div><div><h1 className="text-xl font-black text-white">Minha Carteira</h1><p className="text-xs text-slate-500">Organização financeira pessoal</p></div></div>
      <div className="flex flex-wrap gap-2"><button type="button" onClick={() => openForm('ACCOUNT')} className="flex items-center gap-2 rounded-lg border border-fuchsia-500/30 px-3 py-3 text-[10px] font-black uppercase text-fuchsia-200"><Plus size={15} /> Conta</button><button type="button" onClick={() => openForm('CARD')} className="flex items-center gap-2 rounded-lg bg-fuchsia-600 px-3 py-3 text-[10px] font-black uppercase text-white"><Plus size={15} /> Cartão</button><button type="button" onClick={() => openForm('EXPENSE')} disabled={data.accounts.length === 0 && data.cards.length === 0} className="flex items-center gap-2 rounded-lg bg-cyan-600 px-3 py-3 text-[10px] font-black uppercase text-white disabled:cursor-not-allowed disabled:opacity-40"><Plus size={15} /> Despesa</button></div>
    </header>

    {error && <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-4 text-sm text-rose-200">{error}</div>}

    {formMode && <form onSubmit={submit} className="rounded-xl border border-fuchsia-500/30 bg-slate-900 p-5">
      <div className="mb-4 flex items-center justify-between"><h2 className="text-sm font-black uppercase text-white">{formMode === 'ACCOUNT' ? 'Nova conta' : formMode === 'CARD' ? 'Novo cartão' : 'Nova despesa'}</h2><button type="button" onClick={() => setFormMode(null)} aria-label="Fechar"><X size={17} className="text-slate-400" /></button></div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input required placeholder={formMode === 'EXPENSE' ? 'Descrição' : 'Apelido'} value={form.description || form.nickname || ''} onChange={(event) => setForm({ ...form, ...(formMode === 'EXPENSE' ? { description: event.target.value } : { nickname: event.target.value }) })} className={fieldClass} />
        <input required type="number" min="0" step="0.01" placeholder="Valor" value={form.amount || form.balance || form.credit_limit || ''} onChange={(event) => setForm({ ...form, ...(formMode === 'ACCOUNT' ? { balance: event.target.value } : formMode === 'CARD' ? { credit_limit: event.target.value } : { amount: event.target.value }) })} className={fieldClass} />
        {formMode === 'ACCOUNT' && <><input placeholder="Banco" value={form.bank_name || ''} onChange={(event) => setForm({ ...form, bank_name: event.target.value })} className={fieldClass} /><select value={form.account_type || 'CHECKING'} onChange={(event) => setForm({ ...form, account_type: event.target.value })} className={fieldClass}><option value="CHECKING">Conta corrente</option><option value="SAVINGS">Poupança</option><option value="CASH">Dinheiro</option><option value="INVESTMENT">Investimento</option></select></>}
        {formMode === 'CARD' && <><input placeholder="Banco/emissor" value={form.issuer || ''} onChange={(event) => setForm({ ...form, issuer: event.target.value })} className={fieldClass} /><input maxLength={4} pattern="[0-9]{4}" placeholder="Últimos 4 dígitos" value={form.last_four || ''} onChange={(event) => setForm({ ...form, last_four: event.target.value.replace(/\D/g, '') })} className={fieldClass} /></>}
        {formMode === 'EXPENSE' && <><input placeholder="Categoria" value={form.category || ''} onChange={(event) => setForm({ ...form, category: event.target.value })} className={fieldClass} /><select required value={form.payment_source || ''} onChange={(event) => setForm({ ...form, payment_source: event.target.value })} className={fieldClass}><option value="">Conta ou cartão utilizado</option>{data.accounts.map((account) => <option key={account.id} value={`account:${account.id}`}>{account.nickname}</option>)}{data.cards.map((card) => <option key={card.id} value={`card:${card.id}`}>{card.nickname} •••• {card.last_four || '----'}</option>)}</select><input required type="date" value={form.expense_date || ''} onChange={(event) => setForm({ ...form, expense_date: event.target.value })} className={fieldClass} /><input type="date" value={form.due_date || ''} onChange={(event) => setForm({ ...form, due_date: event.target.value })} className={fieldClass} /></>}
      </div>
      <button type="submit" disabled={saving} className="mt-4 rounded-lg bg-fuchsia-600 px-4 py-3 text-xs font-black uppercase text-white disabled:opacity-50">{saving ? 'Salvando...' : 'Salvar'}</button>
    </form>}

    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3"><div className="rounded-xl border border-slate-800 bg-slate-900 p-5"><p className="text-[10px] font-black uppercase text-slate-500">Saldo em contas</p><p className="mt-2 text-2xl font-black text-emerald-400">{formatMoney(totals.balance)}</p></div><div className="rounded-xl border border-slate-800 bg-slate-900 p-5"><p className="text-[10px] font-black uppercase text-slate-500">Limite utilizado</p><p className="mt-2 text-2xl font-black text-amber-300">{formatMoney(totals.used)}</p></div><div className="rounded-xl border border-slate-800 bg-slate-900 p-5"><p className="text-[10px] font-black uppercase text-slate-500">Despesas registradas</p><p className="mt-2 text-2xl font-black text-cyan-300">{formatMoney(totals.month)}</p></div></div>
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2"><div className="rounded-xl border border-slate-800 bg-slate-900 p-5"><h2 className="mb-4 flex items-center gap-2 text-sm font-black uppercase text-white"><CreditCard size={17} className="text-fuchsia-300" /> Cartões</h2>{data.cards.length === 0 ? <p className="text-sm text-slate-500">Nenhum cartão cadastrado.</p> : data.cards.map((card) => <div key={card.id} className="mb-3 rounded-lg border border-slate-800 bg-slate-950 p-4"><p className="font-black text-white">{card.nickname}</p><p className="text-xs text-slate-500">•••• {card.last_four || '----'} · disponível {formatMoney(Number(card.credit_limit) - Number(card.used_limit))}</p></div>)}</div><div className="rounded-xl border border-slate-800 bg-slate-900 p-5"><h2 className="mb-4 text-sm font-black uppercase text-white">Contas</h2>{data.accounts.length === 0 ? <p className="text-sm text-slate-500">Nenhuma conta cadastrada.</p> : data.accounts.map((account) => <div key={account.id} className="mb-3 rounded-lg border border-slate-800 bg-slate-950 p-4"><p className="font-black text-white">{account.nickname}</p><p className="text-sm text-emerald-300">{formatMoney(account.balance)}</p></div>)}</div></div>
  </section>;
};

export default PersonalWalletPage;
