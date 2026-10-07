import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  CreditCard,
  ImagePlus,
  Landmark,
  Plus,
  ReceiptText,
  ShieldCheck,
  WalletCards,
  X,
  XCircle,
} from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import {
  personalWalletService,
  PersonalWalletAccount,
  PersonalWalletCard,
  PersonalWalletExpense,
  PersonalWalletExpenseInstallment,
} from '../services/personalWallet.service';
import { formatMoney } from '../utils/formatters';

type WalletData = {
  accounts: PersonalWalletAccount[];
  cards: PersonalWalletCard[];
  expenses: PersonalWalletExpense[];
  installments: PersonalWalletExpenseInstallment[];
};

type FormMode = 'ACCOUNT' | 'CARD' | 'EXPENSE' | null;

type InvoiceSummary = {
  key: string;
  cardId: string;
  cardName: string;
  dueMonth: string;
  amount: number;
  installmentCount: number;
};

const emptyWallet: WalletData = { accounts: [], cards: [], expenses: [], installments: [] };
const fieldClass = 'w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-3 text-sm text-white outline-none transition-colors focus:border-fuchsia-500';
const labelClass = 'mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-500';
const today = () => new Date().toISOString().slice(0, 10);
const currentMonth = () => today().slice(0, 7);

const formatMonth = (value: string) => {
  const normalized = String(value || '').slice(0, 7);
  if (!normalized) return 'Sem vencimento';
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${normalized}-01T12:00:00Z`));
};

export const PersonalWalletPage: React.FC = () => {
  const [data, setData] = useState<WalletData>(emptyWallet);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [formMode, setFormMode] = useState<FormMode>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [accountImage, setAccountImage] = useState<File | null>(null);
  const [accountImagePreview, setAccountImagePreview] = useState('');
  const [cardImage, setCardImage] = useState<File | null>(null);
  const [cardImagePreview, setCardImagePreview] = useState('');
  const [invoiceAccounts, setInvoiceAccounts] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    const wallet = await personalWalletService.load();
    setData(wallet);
  }, []);

  useEffect(() => {
    refresh()
      .catch(() => setError('Não foi possível carregar sua carteira.'))
      .finally(() => setLoading(false));
  }, [refresh]);

  useEffect(() => () => {
    if (cardImagePreview) URL.revokeObjectURL(cardImagePreview);
  }, [cardImagePreview]);

  useEffect(() => () => {
    if (accountImagePreview) URL.revokeObjectURL(accountImagePreview);
  }, [accountImagePreview]);

  const openForm = (mode: Exclude<FormMode, null>) => {
    setError('');
    setSuccess('');
    setAccountImage(null);
    setAccountImagePreview('');
    setCardImage(null);
    setCardImagePreview('');
    setForm(mode === 'EXPENSE' ? { expense_date: today(), status: 'PENDING', installment_count: '1' } : {});
    setFormMode(mode);
  };

  const runAction = async (action: () => Promise<unknown>, message: string) => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await action();
      await refresh();
      setSuccess(message);
    } catch (reason: any) {
      setError(reason?.message || 'Não foi possível concluir a operação.');
    } finally {
      setSaving(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    await runAction(async () => {
      if (formMode === 'ACCOUNT') {
        await personalWalletService.createAccount({
          nickname: form.nickname || 'Conta',
          bank_name: form.bank_name || null,
          account_type: form.account_type || 'CHECKING',
          balance: Number(form.balance || 0),
          pix_key: form.pix_key || null,
          pix_key_type: form.pix_key_type || null,
          notes: form.notes || null,
        }, accountImage);
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
          notes: form.notes || null,
        }, cardImage);
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
          expense_date: form.expense_date || today(),
          due_date: form.due_date || null,
          account_id: paymentType === 'account' ? paymentId : null,
          card_id: paymentType === 'card' ? paymentId : null,
          status: paymentType === 'account' && form.status === 'PAID' ? 'PAID' : 'PENDING',
          installment_count: Math.max(1, Number(form.installment_count || 1)),
          recurrence: form.recurrence || null,
          notes: form.notes || null,
        });
      }
      setFormMode(null);
      setForm({});
      setAccountImage(null);
      setAccountImagePreview('');
      setCardImage(null);
      setCardImagePreview('');
    }, formMode === 'EXPENSE' ? 'Despesa registrada.' : 'Cadastro salvo.');
  };

  const expensesById = useMemo(
    () => new Map(data.expenses.map((expense) => [expense.id, expense])),
    [data.expenses],
  );
  const cardsById = useMemo(() => new Map(data.cards.map((card) => [card.id, card])), [data.cards]);

  const invoices = useMemo(() => {
    const grouped = new Map<string, InvoiceSummary>();
    data.installments.forEach((installment) => {
      if (installment.status !== 'PENDING') return;
      const expense = expensesById.get(installment.expense_id);
      if (!expense?.card_id) return;
      const card = cardsById.get(expense.card_id);
      if (!card) return;
      const dueMonth = String(installment.due_month).slice(0, 10);
      const key = `${card.id}:${dueMonth}`;
      const current = grouped.get(key) || {
        key,
        cardId: card.id,
        cardName: card.nickname,
        dueMonth,
        amount: 0,
        installmentCount: 0,
      };
      current.amount += Number(installment.amount || 0);
      current.installmentCount += 1;
      grouped.set(key, current);
    });
    return [...grouped.values()].sort((first, second) => first.dueMonth.localeCompare(second.dueMonth));
  }, [cardsById, data.installments, expensesById]);

  const totals = useMemo(() => ({
    balance: data.accounts.reduce((sum, account) => sum + Number(account.balance || 0), 0),
    used: data.cards.reduce((sum, card) => sum + Number(card.used_limit || 0), 0),
    available: data.cards.reduce((sum, card) => sum + Math.max(0, Number(card.credit_limit || 0) - Number(card.used_limit || 0)), 0),
    month: data.expenses
      .filter((expense) => expense.status !== 'CANCELED' && String(expense.expense_date).slice(0, 7) === currentMonth())
      .reduce((sum, expense) => sum + Number(expense.amount || 0), 0),
    openInvoices: invoices.reduce((sum, invoice) => sum + invoice.amount, 0),
  }), [data, invoices]);

  const selectedPaymentType = String(form.payment_source || '').split(':')[0];

  if (loading) return <div className="p-8 text-sm font-bold text-slate-400">Carregando sua carteira...</div>;

  return (
    <section className="space-y-5">
      <PageHeader
        icon={<WalletCards size={21} />}
        title="Minha carteira"
        subtitle="Contas, cartões, despesas e faturas pessoais"
        iconClassName="!rounded-lg border-fuchsia-500/25 bg-slate-900 text-fuchsia-300 shadow-none"
        stackActionsUntilLg
        actions={(
          <div className="grid grid-cols-3 gap-2 lg:flex lg:justify-end">
            <button type="button" onClick={() => openForm('ACCOUNT')} className="flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 text-[10px] font-black uppercase text-slate-200 transition-colors hover:border-emerald-500/50 hover:text-emerald-300 lg:min-w-28"><Landmark size={14} />Conta</button>
            <button type="button" onClick={() => openForm('CARD')} className="flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 text-[10px] font-black uppercase text-slate-200 transition-colors hover:border-cyan-500/50 hover:text-cyan-300 lg:min-w-28"><CreditCard size={14} />Cartão</button>
            <button type="button" onClick={() => openForm('EXPENSE')} disabled={!data.accounts.length && !data.cards.length} className="flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-fuchsia-600 px-3 text-[10px] font-black uppercase text-white transition-colors hover:bg-fuchsia-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500 lg:min-w-28"><Plus size={14} />Despesa</button>
          </div>
        )}
      />

      <div className="flex items-center gap-2.5 rounded-lg border border-slate-800 bg-slate-900/60 px-3.5 py-2.5 text-xs text-slate-400">
        <ShieldCheck size={16} className="shrink-0 text-emerald-400" />
        <span>Área pessoal protegida e separada do capital usado nos contratos.</span>
      </div>

      {error && <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-4 text-sm text-rose-200">{error}</div>}
      {success && <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 text-sm text-emerald-200">{success}</div>}

      {formMode && (
        <form onSubmit={submit} className="rounded-2xl border border-fuchsia-500/30 bg-slate-900 p-5 shadow-xl">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-sm font-black uppercase text-white">{formMode === 'ACCOUNT' ? 'Nova conta' : formMode === 'CARD' ? 'Novo cartão' : 'Nova despesa'}</h2>
            <button type="button" onClick={() => setFormMode(null)} aria-label="Fechar formulário" className="rounded-full bg-slate-800 p-2 text-slate-400"><X size={17} /></button>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {formMode === 'ACCOUNT' && (
              <>
                <label><span className={labelClass}>Apelido</span><input required value={form.nickname || ''} onChange={(event) => setForm({ ...form, nickname: event.target.value })} className={fieldClass} /></label>
                <label><span className={labelClass}>Saldo atual</span><input required type="number" min="0" step="0.01" value={form.balance || ''} onChange={(event) => setForm({ ...form, balance: event.target.value })} className={fieldClass} /></label>
                <label><span className={labelClass}>Banco</span><input value={form.bank_name || ''} onChange={(event) => setForm({ ...form, bank_name: event.target.value })} className={fieldClass} /></label>
                <label><span className={labelClass}>Tipo</span><select value={form.account_type || 'CHECKING'} onChange={(event) => setForm({ ...form, account_type: event.target.value })} className={fieldClass}><option value="CHECKING">Conta corrente</option><option value="SAVINGS">Poupança</option><option value="CASH">Dinheiro</option><option value="INVESTMENT">Investimento</option></select></label>
                <label><span className={labelClass}>Tipo da chave PIX</span><select value={form.pix_key_type || ''} onChange={(event) => setForm({ ...form, pix_key_type: event.target.value })} className={fieldClass}><option value="">Sem PIX</option><option value="CPF">CPF</option><option value="EMAIL">E-mail</option><option value="PHONE">Telefone</option><option value="RANDOM">Aleatória</option></select></label>
                <label><span className={labelClass}>Chave PIX</span><input value={form.pix_key || ''} onChange={(event) => setForm({ ...form, pix_key: event.target.value })} className={fieldClass} /></label>
                <label className="sm:col-span-2">
                  <span className={labelClass}>Ícone ou imagem do banco</span>
                  <span className="flex min-h-20 cursor-pointer items-center gap-3 rounded-lg border border-dashed border-slate-700 bg-slate-950 p-3 transition-colors hover:border-emerald-500/60">
                    {accountImagePreview ? <img src={accountImagePreview} alt="Prévia do banco" className="h-14 w-14 rounded-lg object-cover" /> : <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-slate-900 text-slate-500"><ImagePlus size={22} /></span>}
                    <span className="min-w-0"><strong className="block truncate text-xs text-slate-200">{accountImage?.name || 'Selecionar imagem'}</strong><small className="mt-1 block text-[10px] text-slate-500">JPEG, PNG ou WebP · até 5 MB</small></span>
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => {
                      const file = event.target.files?.[0] || null;
                      setAccountImage(file);
                      setAccountImagePreview(file ? URL.createObjectURL(file) : '');
                    }} />
                  </span>
                </label>
              </>
            )}
            {formMode === 'CARD' && (
              <>
                <label><span className={labelClass}>Apelido</span><input required value={form.nickname || ''} onChange={(event) => setForm({ ...form, nickname: event.target.value })} className={fieldClass} /></label>
                <label><span className={labelClass}>Limite</span><input required type="number" min="0" step="0.01" value={form.credit_limit || ''} onChange={(event) => setForm({ ...form, credit_limit: event.target.value })} className={fieldClass} /></label>
                <label><span className={labelClass}>Banco ou emissor</span><input value={form.issuer || ''} onChange={(event) => setForm({ ...form, issuer: event.target.value })} className={fieldClass} /></label>
                <label><span className={labelClass}>Bandeira</span><input value={form.brand || ''} onChange={(event) => setForm({ ...form, brand: event.target.value })} className={fieldClass} /></label>
                <label><span className={labelClass}>Últimos 4 dígitos</span><input maxLength={4} pattern="[0-9]{4}" value={form.last_four || ''} onChange={(event) => setForm({ ...form, last_four: event.target.value.replace(/\D/g, '') })} className={fieldClass} /></label>
                <div className="grid grid-cols-2 gap-3"><label><span className={labelClass}>Fecha dia</span><input type="number" min="1" max="31" value={form.closing_day || ''} onChange={(event) => setForm({ ...form, closing_day: event.target.value })} className={fieldClass} /></label><label><span className={labelClass}>Vence dia</span><input type="number" min="1" max="31" value={form.due_day || ''} onChange={(event) => setForm({ ...form, due_day: event.target.value })} className={fieldClass} /></label></div>
                <label className="sm:col-span-2">
                  <span className={labelClass}>Imagem do cartão</span>
                  <span className="flex min-h-20 cursor-pointer items-center gap-3 rounded-lg border border-dashed border-slate-700 bg-slate-950 p-3 transition-colors hover:border-fuchsia-500/60">
                    {cardImagePreview ? <img src={cardImagePreview} alt="Prévia do cartão" className="h-14 w-24 rounded-md object-cover" /> : <span className="flex h-14 w-24 items-center justify-center rounded-md bg-slate-900 text-slate-500"><ImagePlus size={22} /></span>}
                    <span className="min-w-0"><strong className="block truncate text-xs text-slate-200">{cardImage?.name || 'Selecionar imagem'}</strong><small className="mt-1 block text-[10px] text-slate-500">JPEG, PNG ou WebP · até 5 MB</small></span>
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => {
                      const file = event.target.files?.[0] || null;
                      setCardImage(file);
                      setCardImagePreview(file ? URL.createObjectURL(file) : '');
                    }} />
                  </span>
                </label>
              </>
            )}
            {formMode === 'EXPENSE' && (
              <>
                <label><span className={labelClass}>Descrição</span><input required value={form.description || ''} onChange={(event) => setForm({ ...form, description: event.target.value })} className={fieldClass} /></label>
                <label><span className={labelClass}>Valor total</span><input required type="number" min="0.01" step="0.01" value={form.amount || ''} onChange={(event) => setForm({ ...form, amount: event.target.value })} className={fieldClass} /></label>
                <label><span className={labelClass}>Categoria</span><input required value={form.category || ''} onChange={(event) => setForm({ ...form, category: event.target.value })} className={fieldClass} /></label>
                <label><span className={labelClass}>Conta ou cartão utilizado</span><select required value={form.payment_source || ''} onChange={(event) => setForm({ ...form, payment_source: event.target.value, status: 'PENDING' })} className={fieldClass}><option value="">Selecione</option>{data.accounts.map((account) => <option key={account.id} value={`account:${account.id}`}>{account.nickname} · {formatMoney(account.balance)}</option>)}{data.cards.map((card) => <option key={card.id} value={`card:${card.id}`}>{card.nickname} •••• {card.last_four || '----'}</option>)}</select></label>
                <label><span className={labelClass}>Data da compra</span><input required type="date" value={form.expense_date || ''} onChange={(event) => setForm({ ...form, expense_date: event.target.value })} className={fieldClass} /></label>
                <label><span className={labelClass}>Primeiro vencimento</span><input type="date" value={form.due_date || ''} onChange={(event) => setForm({ ...form, due_date: event.target.value })} className={fieldClass} /></label>
                <label><span className={labelClass}>Parcelas</span><input required type="number" min="1" max="120" value={form.installment_count || '1'} onChange={(event) => setForm({ ...form, installment_count: event.target.value })} className={fieldClass} /></label>
                <label><span className={labelClass}>Recorrência</span><select value={form.recurrence || ''} onChange={(event) => setForm({ ...form, recurrence: event.target.value })} className={fieldClass}><option value="">Não recorrente</option><option value="MONTHLY">Mensal</option><option value="YEARLY">Anual</option></select></label>
                {selectedPaymentType === 'account' && <label><span className={labelClass}>Situação</span><select value={form.status || 'PENDING'} onChange={(event) => setForm({ ...form, status: event.target.value })} className={fieldClass}><option value="PENDING">Pendente</option><option value="PAID">Pago agora</option></select></label>}
                <label className={selectedPaymentType === 'account' ? '' : 'sm:col-span-2'}><span className={labelClass}>Observação</span><input value={form.notes || ''} onChange={(event) => setForm({ ...form, notes: event.target.value })} className={fieldClass} /></label>
              </>
            )}
          </div>
          <button type="submit" disabled={saving} className="mt-5 w-full rounded-xl bg-fuchsia-600 px-4 py-3 text-xs font-black uppercase text-white disabled:opacity-50">{saving ? 'Salvando...' : 'Salvar'}</button>
        </form>
      )}

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-5">
        <SummaryCard label="Saldo em contas" value={totals.balance} color="text-emerald-400" />
        <SummaryCard label="Gastos do mês" value={totals.month} color="text-cyan-300" />
        <SummaryCard label="Faturas abertas" value={totals.openInvoices} color="text-amber-300" />
        <SummaryCard label="Limite utilizado" value={totals.used} color="text-rose-300" />
        <SummaryCard label="Limite disponível" value={totals.available} color="text-blue-300" className="col-span-2 lg:col-span-1" />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-black uppercase text-white"><CreditCard size={17} className="text-fuchsia-300" /> Cartões</h2>
          {!data.cards.length ? <EmptyState text="Nenhum cartão cadastrado." /> : data.cards.map((card) => {
            const available = Math.max(0, Number(card.credit_limit) - Number(card.used_limit));
            const percentage = Number(card.credit_limit) > 0 ? Math.min(100, (Number(card.used_limit) / Number(card.credit_limit)) * 100) : 0;
            return <article key={card.id} className="mb-3 rounded-xl border border-slate-800 bg-slate-950 p-4">
              <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3">{card.image_url ? <img src={card.image_url} alt={`Cartão ${card.nickname}`} className="h-12 w-20 shrink-0 rounded-md object-cover" /> : <span className="flex h-12 w-20 shrink-0 items-center justify-center rounded-md bg-slate-900 text-slate-600"><CreditCard size={20} /></span>}<div className="min-w-0"><p className="truncate font-black text-white">{card.nickname}</p><p className="truncate text-xs text-slate-500">{card.issuer || 'Emissor não informado'} · •••• {card.last_four || '----'}</p></div></div><span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-1 text-[9px] font-black uppercase text-emerald-300">Ativo</span></div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 to-rose-500" style={{ width: `${percentage}%` }} /></div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs"><div><p className="text-slate-600">Limite</p><strong className="text-slate-200">{formatMoney(card.credit_limit)}</strong></div><div><p className="text-slate-600">Utilizado</p><strong className="text-rose-300">{formatMoney(card.used_limit)}</strong></div><div><p className="text-slate-600">Disponível</p><strong className="text-emerald-300">{formatMoney(available)}</strong></div></div>
              <p className="mt-3 text-[10px] font-bold uppercase text-slate-500">Fecha dia {card.closing_day || '—'} · vence dia {card.due_day || '—'} · próxima fatura {formatMoney(card.current_bill)}</p>
            </article>;
          })}
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-black uppercase text-white"><Landmark size={17} className="text-emerald-300" /> Contas e PIX</h2>
          {!data.accounts.length ? <EmptyState text="Nenhuma conta cadastrada." /> : data.accounts.map((account) => <article key={account.id} className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950 p-4"><div className="flex min-w-0 items-center gap-3">{account.image_url ? <img src={account.image_url} alt={`Banco ${account.bank_name || account.nickname}`} className="h-11 w-11 shrink-0 rounded-lg object-cover" /> : <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-emerald-400"><Landmark size={19} /></span>}<div className="min-w-0"><p className="truncate font-black text-white">{account.nickname}</p><p className="truncate text-xs text-slate-500">{account.bank_name || 'Conta pessoal'}{account.pix_key_type ? ` · PIX ${account.pix_key_type}` : ''}</p></div></div><strong className="shrink-0 text-emerald-300">{formatMoney(account.balance)}</strong></article>)}
        </section>
      </div>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-black uppercase text-white"><CalendarDays size={17} className="text-amber-300" /> Faturas e próximos vencimentos</h2>
        {!invoices.length ? <EmptyState text="Nenhuma fatura pendente." /> : <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">{invoices.map((invoice) => <article key={invoice.key} className="rounded-xl border border-amber-500/20 bg-slate-950 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-black text-white">{invoice.cardName}</p><p className="text-xs capitalize text-slate-500">{formatMonth(invoice.dueMonth)} · {invoice.installmentCount} lançamento(s)</p></div><strong className="text-amber-300">{formatMoney(invoice.amount)}</strong></div><div className="mt-4 flex flex-col gap-2 sm:flex-row"><select aria-label={`Conta para pagar fatura ${invoice.cardName}`} value={invoiceAccounts[invoice.key] || ''} onChange={(event) => setInvoiceAccounts((current) => ({ ...current, [invoice.key]: event.target.value }))} className={`${fieldClass} flex-1`}><option value="">Conta para pagamento</option>{data.accounts.map((account) => <option key={account.id} value={account.id}>{account.nickname} · {formatMoney(account.balance)}</option>)}</select><button type="button" disabled={saving || !invoiceAccounts[invoice.key]} onClick={() => runAction(() => personalWalletService.payInvoice(invoice.cardId, invoice.dueMonth, invoiceAccounts[invoice.key]), 'Fatura paga e saldo atualizado.')} className="rounded-xl bg-emerald-600 px-4 py-3 text-[10px] font-black uppercase text-white disabled:opacity-40">Pagar fatura</button></div></article>)}</div>}
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-black uppercase text-white"><ReceiptText size={17} className="text-cyan-300" /> Despesas recentes</h2>
        {!data.expenses.length ? <EmptyState text="Nenhuma despesa registrada." /> : <div className="space-y-3">{data.expenses.slice(0, 20).map((expense) => {
          const sourceName = expense.account_id
            ? data.accounts.find((account) => account.id === expense.account_id)?.nickname
            : data.cards.find((card) => card.id === expense.card_id)?.nickname;
          return <article key={expense.id} className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950 p-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="font-black text-white">{expense.description}</p><StatusBadge status={expense.status} /></div><p className="mt-1 text-xs text-slate-500">{expense.category} · {sourceName || 'Origem removida'} · {expense.installment_count}x</p></div><div className="flex items-center justify-between gap-3 sm:justify-end"><strong className="text-cyan-300">{formatMoney(expense.amount)}</strong><div className="flex gap-2">{expense.status === 'PENDING' && expense.account_id && <button type="button" disabled={saving} aria-label={`Marcar ${expense.description} como paga`} onClick={() => runAction(() => personalWalletService.setExpenseStatus(expense.id, 'PAID'), 'Despesa paga e saldo atualizado.')} className="rounded-lg bg-emerald-500/10 p-2 text-emerald-300"><CheckCircle2 size={16} /></button>}{expense.status !== 'CANCELED' && <button type="button" disabled={saving} aria-label={`Cancelar ${expense.description}`} onClick={() => runAction(() => personalWalletService.setExpenseStatus(expense.id, 'CANCELED'), 'Despesa cancelada.')} className="rounded-lg bg-rose-500/10 p-2 text-rose-300"><XCircle size={16} /></button>}</div></div></article>;
        })}</div>}
      </section>
    </section>
  );
};

const SummaryCard = ({ label, value, color, className = '' }: { label: string; value: number; color: string; className?: string }) => <div className={`min-w-0 rounded-lg border border-slate-800 bg-slate-900/80 p-3.5 ${className}`}><p className="text-[9px] font-black uppercase tracking-wider text-slate-500">{label}</p><p className={`mt-1.5 truncate text-base font-black sm:text-lg ${color}`}>{formatMoney(value)}</p></div>;
const EmptyState = ({ text }: { text: string }) => <p className="rounded-xl border border-dashed border-slate-800 p-5 text-center text-sm text-slate-500">{text}</p>;
const StatusBadge = ({ status }: { status: string }) => {
  const style = status === 'PAID' ? 'bg-emerald-500/10 text-emerald-300' : status === 'CANCELED' ? 'bg-rose-500/10 text-rose-300' : 'bg-amber-500/10 text-amber-300';
  const label = status === 'PAID' ? 'Pago' : status === 'CANCELED' ? 'Cancelado' : 'Pendente';
  return <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${style}`}>{label}</span>;
};

export default PersonalWalletPage;
