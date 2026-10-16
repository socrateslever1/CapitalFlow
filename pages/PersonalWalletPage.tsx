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
type WalletTab = 'CARDS' | 'ACCOUNTS' | 'INVOICES' | 'EXPENSES';

type InvoiceSummary = {
  key: string;
  cardId: string;
  cardName: string;
  dueMonth: string;
  amount: number;
  installmentCount: number;
};

const emptyWallet: WalletData = { accounts: [], cards: [], expenses: [], installments: [] };
const fieldClass = 'w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white outline-none transition-colors focus:border-blue-500';
const labelClass = 'mb-1 block text-[9px] font-bold uppercase tracking-wider text-slate-400';
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
  const [activeTab, setActiveTab] = useState<WalletTab>('CARDS');
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

  if (loading) {
    return <div className="p-8 text-xs font-bold text-slate-400">Carregando sua carteira...</div>;
  }

  return (
    <section className="space-y-3 pb-32 sm:pb-16 max-w-6xl mx-auto animate-in fade-in">
      {/* Cabeçalho Compacto e Integrado */}
      <PageHeader
        icon={<WalletCards size={20} />}
        title={<>Minha <span className="text-emerald-400">Carteira</span></>}
        subtitle="Contas, cartões, despesas e faturas pessoais"
        iconClassName="border-emerald-500/30 bg-gradient-to-br from-emerald-600 to-teal-700 text-white shadow-emerald-950/30"
        actions={(
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => openForm('ACCOUNT')}
              className="h-8 px-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-sm"
            >
              <Landmark size={13} className="text-emerald-400" />
              <span>Conta</span>
            </button>
            <button
              type="button"
              onClick={() => openForm('CARD')}
              className="h-8 px-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-sm"
            >
              <CreditCard size={13} className="text-blue-400" />
              <span>Cartão</span>
            </button>
            <button
              type="button"
              onClick={() => openForm('EXPENSE')}
              disabled={!data.accounts.length && !data.cards.length}
              className="h-8 px-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all shadow-md shadow-blue-600/20 flex items-center gap-1.5 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500 disabled:shadow-none"
            >
              <Plus size={14} />
              <span>Nova Despesa</span>
            </button>
          </div>
        )}
      />

      {/* Faixa Discreta de Proteção */}
      <div className="flex items-center gap-1.5 px-1 text-[11px] text-slate-400">
        <ShieldCheck size={13} className="text-emerald-400 shrink-0" />
        <span className="truncate">Área pessoal protegida e separada do capital dos contratos.</span>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-rose-500/30 bg-rose-950/20 px-3 py-2 text-xs text-rose-200">
          {error}
        </div>
      )}
      {success && (
        <div role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 px-3 py-2 text-xs text-emerald-200">
          {success}
        </div>
      )}

      {/* Formulário Modal/Drawer Compacto */}
      {formMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-sm animate-in fade-in">
          <form
            onSubmit={submit}
            className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-5 shadow-2xl max-h-[90vh] overflow-y-auto"
          >
            <div className="mb-4 flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-white">
                {formMode === 'ACCOUNT' ? 'Nova conta bancária' : formMode === 'CARD' ? 'Novo cartão de crédito' : 'Nova despesa'}
              </h2>
              <button
                type="button"
                onClick={() => setFormMode(null)}
                aria-label="Fechar formulário"
                className="rounded-full bg-slate-800 p-1.5 text-slate-400 hover:text-white"
              >
                <X size={15} />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {formMode === 'ACCOUNT' && (
                <>
                  <label><span className={labelClass}>Apelido</span><input required value={form.nickname || ''} onChange={(event) => setForm({ ...form, nickname: event.target.value })} className={fieldClass} placeholder="Ex: Nubank Principal" /></label>
                  <label><span className={labelClass}>Saldo atual</span><input required type="number" min="0" step="0.01" value={form.balance || ''} onChange={(event) => setForm({ ...form, balance: event.target.value })} className={fieldClass} placeholder="0,00" /></label>
                  <label><span className={labelClass}>Banco</span><input value={form.bank_name || ''} onChange={(event) => setForm({ ...form, bank_name: event.target.value })} className={fieldClass} placeholder="Ex: Itaú, Nubank, Bradesco" /></label>
                  <label><span className={labelClass}>Tipo</span><select value={form.account_type || 'CHECKING'} onChange={(event) => setForm({ ...form, account_type: event.target.value })} className={fieldClass}><option value="CHECKING">Conta corrente</option><option value="SAVINGS">Poupança</option><option value="CASH">Dinheiro</option><option value="INVESTMENT">Investimento</option></select></label>
                  <label><span className={labelClass}>Tipo da chave PIX</span><select value={form.pix_key_type || ''} onChange={(event) => setForm({ ...form, pix_key_type: event.target.value })} className={fieldClass}><option value="">Sem PIX</option><option value="CPF">CPF</option><option value="EMAIL">E-mail</option><option value="PHONE">Telefone</option><option value="RANDOM">Aleatória</option></select></label>
                  <label><span className={labelClass}>Chave PIX</span><input value={form.pix_key || ''} onChange={(event) => setForm({ ...form, pix_key: event.target.value })} className={fieldClass} placeholder="Chave para transferências" /></label>
                  <label className="sm:col-span-2">
                    <span className={labelClass}>Ícone ou logotipo do banco</span>
                    <span className="flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border border-dashed border-slate-700 bg-slate-950 p-2.5 transition-colors hover:border-emerald-500/60">
                      {accountImagePreview ? <img src={accountImagePreview} alt="Prévia do banco" className="h-10 w-10 rounded-lg object-cover" /> : <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-slate-500"><ImagePlus size={18} /></span>}
                      <span className="min-w-0"><strong className="block truncate text-xs text-slate-200">{accountImage?.name || 'Selecionar imagem'}</strong><small className="block text-[9px] text-slate-500">JPEG, PNG ou WebP</small></span>
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
                  <label><span className={labelClass}>Apelido do cartão</span><input required value={form.nickname || ''} onChange={(event) => setForm({ ...form, nickname: event.target.value })} className={fieldClass} placeholder="Ex: Nubank Ultravioleta" /></label>
                  <label><span className={labelClass}>Limite total</span><input required type="number" min="0" step="0.01" value={form.credit_limit || ''} onChange={(event) => setForm({ ...form, credit_limit: event.target.value })} className={fieldClass} placeholder="0,00" /></label>
                  <label><span className={labelClass}>Emissor / Banco</span><input value={form.issuer || ''} onChange={(event) => setForm({ ...form, issuer: event.target.value })} className={fieldClass} placeholder="Ex: Inter, C6, XP" /></label>
                  <label><span className={labelClass}>Bandeira</span><input value={form.brand || ''} onChange={(event) => setForm({ ...form, brand: event.target.value })} className={fieldClass} placeholder="Ex: Mastercard, Visa" /></label>
                  <label><span className={labelClass}>Últimos 4 dígitos</span><input maxLength={4} pattern="[0-9]{4}" value={form.last_four || ''} onChange={(event) => setForm({ ...form, last_four: event.target.value.replace(/\D/g, '') })} className={fieldClass} placeholder="1234" /></label>
                  <div className="grid grid-cols-2 gap-2">
                    <label><span className={labelClass}>Fecha dia</span><input type="number" min="1" max="31" value={form.closing_day || ''} onChange={(event) => setForm({ ...form, closing_day: event.target.value })} className={fieldClass} placeholder="Dia" /></label>
                    <label><span className={labelClass}>Vence dia</span><input type="number" min="1" max="31" value={form.due_day || ''} onChange={(event) => setForm({ ...form, due_day: event.target.value })} className={fieldClass} placeholder="Dia" /></label>
                  </div>
                  <label className="sm:col-span-2">
                    <span className={labelClass}>Imagem ou foto do cartão</span>
                    <span className="flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border border-dashed border-slate-700 bg-slate-950 p-2.5 transition-colors hover:border-blue-500/60">
                      {cardImagePreview ? <img src={cardImagePreview} alt="Prévia do cartão" className="h-10 w-16 rounded object-cover" /> : <span className="flex h-10 w-16 items-center justify-center rounded bg-slate-900 text-slate-500"><ImagePlus size={18} /></span>}
                      <span className="min-w-0"><strong className="block truncate text-xs text-slate-200">{cardImage?.name || 'Selecionar imagem'}</strong><small className="block text-[9px] text-slate-500">JPEG, PNG ou WebP</small></span>
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
                  <label className="sm:col-span-2"><span className={labelClass}>Descrição</span><input required value={form.description || ''} onChange={(event) => setForm({ ...form, description: event.target.value })} className={fieldClass} placeholder="Ex: Supermercado, Combustível" /></label>
                  <label><span className={labelClass}>Valor</span><input required type="number" min="0.01" step="0.01" value={form.amount || ''} onChange={(event) => setForm({ ...form, amount: event.target.value })} className={fieldClass} placeholder="0,00" /></label>
                  <label><span className={labelClass}>Categoria</span><input required value={form.category || ''} onChange={(event) => setForm({ ...form, category: event.target.value })} className={fieldClass} placeholder="Ex: Alimentação, Transporte" /></label>
                  <label className="sm:col-span-2"><span className={labelClass}>Conta ou cartão utilizado</span><select required value={form.payment_source || ''} onChange={(event) => setForm({ ...form, payment_source: event.target.value, status: 'PENDING' })} className={fieldClass}><option value="">Selecione a forma de pagamento</option>{data.accounts.map((account) => <option key={account.id} value={`account:${account.id}`}>{account.nickname} · Saldo: {formatMoney(account.balance)}</option>)}{data.cards.map((card) => <option key={card.id} value={`card:${card.id}`}>{card.nickname} •••• {card.last_four || '----'}</option>)}</select></label>
                  <label><span className={labelClass}>Data da despesa</span><input required type="date" value={form.expense_date || ''} onChange={(event) => setForm({ ...form, expense_date: event.target.value })} className={fieldClass} /></label>
                  <label><span className={labelClass}>Primeiro vencimento</span><input type="date" value={form.due_date || ''} onChange={(event) => setForm({ ...form, due_date: event.target.value })} className={fieldClass} /></label>
                  <label><span className={labelClass}>Nº de parcelas</span><input required type="number" min="1" max="120" value={form.installment_count || '1'} onChange={(event) => setForm({ ...form, installment_count: event.target.value })} className={fieldClass} /></label>
                  <label><span className={labelClass}>Recorrência</span><select value={form.recurrence || ''} onChange={(event) => setForm({ ...form, recurrence: event.target.value })} className={fieldClass}><option value="">Não recorrente</option><option value="MONTHLY">Mensal</option><option value="YEARLY">Anual</option></select></label>
                  {selectedPaymentType === 'account' && <label><span className={labelClass}>Situação</span><select value={form.status || 'PENDING'} onChange={(event) => setForm({ ...form, status: event.target.value })} className={fieldClass}><option value="PENDING">Pendente</option><option value="PAID">Pago agora</option></select></label>}
                  <label className={selectedPaymentType === 'account' ? '' : 'sm:col-span-2'}><span className={labelClass}>Observações</span><input value={form.notes || ''} onChange={(event) => setForm({ ...form, notes: event.target.value })} className={fieldClass} placeholder="Opcional" /></label>
                </>
              )}
            </div>

            <div className="mt-4 flex items-center justify-end gap-2 border-t border-slate-800 pt-3">
              <button
                type="button"
                onClick={() => setFormMode(null)}
                className="h-8 px-3 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 text-xs font-bold hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="h-8 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white shadow-md shadow-blue-600/20 disabled:opacity-50"
              >
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* KPI Strip Compacto (Reduzido em 60% sem perder dados) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {/* Card 1: Saldo */}
        <div className="rounded-lg border border-slate-800/80 bg-slate-900/80 p-2.5 transition-colors hover:border-slate-700">
          <div className="flex items-center justify-between gap-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">
            <span className="truncate">Saldo em Contas</span>
            <Landmark size={12} className="text-emerald-400 shrink-0" />
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="text-sm sm:text-base font-extrabold text-emerald-400 truncate">{formatMoney(totals.balance)}</span>
            <span className="text-[10px] text-slate-500 truncate">{data.accounts.length} conta(s)</span>
          </div>
        </div>

        {/* Card 2: Gastos */}
        <div className="rounded-lg border border-slate-800/80 bg-slate-900/80 p-2.5 transition-colors hover:border-slate-700">
          <div className="flex items-center justify-between gap-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">
            <span className="truncate">Gastos do Mês</span>
            <ReceiptText size={12} className="text-cyan-400 shrink-0" />
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="text-sm sm:text-base font-extrabold text-cyan-300 truncate">{formatMoney(totals.month)}</span>
            <span className="text-[10px] text-slate-500">Mês atual</span>
          </div>
        </div>

        {/* Card 3: Faturas */}
        <div className="rounded-lg border border-slate-800/80 bg-slate-900/80 p-2.5 transition-colors hover:border-slate-700">
          <div className="flex items-center justify-between gap-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">
            <span className="truncate">Faturas Abertas</span>
            <CalendarDays size={12} className="text-amber-400 shrink-0" />
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="text-sm sm:text-base font-extrabold text-amber-300 truncate">{formatMoney(totals.openInvoices)}</span>
            <span className="text-[10px] text-slate-500 truncate">{invoices.length} fatura(s)</span>
          </div>
        </div>

        {/* Card 4: Limite */}
        <div className="rounded-lg border border-slate-800/80 bg-slate-900/80 p-2.5 transition-colors hover:border-slate-700">
          <div className="flex items-center justify-between gap-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">
            <span className="truncate">Limite dos Cartões</span>
            <CreditCard size={12} className="text-blue-400 shrink-0" />
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="text-sm sm:text-base font-extrabold text-blue-300 truncate">{formatMoney(totals.available)}</span>
            <span className="text-[10px] font-semibold text-rose-300 truncate">Uso: {formatMoney(totals.used)}</span>
          </div>
        </div>
      </div>

      {/* Navegação por Abas (Padrão Central de Tarefas) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 rounded-xl border border-slate-800 bg-slate-950/80 p-1">
        <button
          type="button"
          onClick={() => setActiveTab('CARDS')}
          className={`flex min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-bold transition-all ${
            activeTab === 'CARDS'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <CreditCard size={13} className="shrink-0" />
          <span className="truncate">Cartões</span>
          {data.cards.length > 0 && (
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${activeTab === 'CARDS' ? 'bg-blue-800 text-white' : 'bg-slate-800 text-slate-300'}`}>
              {data.cards.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('ACCOUNTS')}
          className={`flex min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-bold transition-all ${
            activeTab === 'ACCOUNTS'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Landmark size={13} className="shrink-0" />
          <span className="truncate">Contas & PIX</span>
          {data.accounts.length > 0 && (
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${activeTab === 'ACCOUNTS' ? 'bg-blue-800 text-white' : 'bg-slate-800 text-slate-300'}`}>
              {data.accounts.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('INVOICES')}
          className={`flex min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-bold transition-all ${
            activeTab === 'INVOICES'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <CalendarDays size={13} className="shrink-0" />
          <span className="truncate">Faturas</span>
          {invoices.length > 0 && (
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${activeTab === 'INVOICES' ? 'bg-amber-400 text-slate-950' : 'bg-amber-500/20 text-amber-300'}`}>
              {invoices.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('EXPENSES')}
          className={`flex min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-bold transition-all ${
            activeTab === 'EXPENSES'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <ReceiptText size={13} className="shrink-0" />
          <span className="truncate">Despesas</span>
          {data.expenses.length > 0 && (
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${activeTab === 'EXPENSES' ? 'bg-blue-800 text-white' : 'bg-slate-800 text-slate-300'}`}>
              {data.expenses.length}
            </span>
          )}
        </button>
      </div>

      {/* Conteúdo da Aba Ativa */}
      <div className="pt-1">
        {/* Aba 1: Cartões */}
        {activeTab === 'CARDS' && (
          <div className="space-y-2.5 animate-in fade-in">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <CreditCard size={14} className="text-blue-400" /> Cartões de Crédito
              </h2>
              <button
                type="button"
                onClick={() => openForm('CARD')}
                className="text-[10px] font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1"
              >
                <Plus size={12} /> Cadastrar cartão
              </button>
            </div>
            {!data.cards.length ? (
              <EmptyState
                text="Nenhum cartão cadastrado."
                actionLabel="Cadastrar cartão"
                onAction={() => openForm('CARD')}
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {data.cards.map((card) => {
                  const available = Math.max(0, Number(card.credit_limit) - Number(card.used_limit));
                  const percentage = Number(card.credit_limit) > 0 ? Math.min(100, (Number(card.used_limit) / Number(card.credit_limit)) * 100) : 0;
                  return (
                    <article key={card.id} className="rounded-xl border border-slate-800/90 bg-slate-900/80 p-3 hover:border-slate-700 transition-all">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {card.image_url ? (
                            <img src={card.image_url} alt={`Cartão ${card.nickname}`} className="h-8 w-13 shrink-0 rounded object-cover border border-slate-800" />
                          ) : (
                            <span className="flex h-8 w-13 shrink-0 items-center justify-center rounded bg-slate-800/80 text-blue-400">
                              <CreditCard size={16} />
                            </span>
                          )}
                          <div className="min-w-0">
                            <p className="truncate text-xs font-bold text-white">{card.nickname}</p>
                            <p className="truncate text-[10px] text-slate-400">{card.issuer || 'Emissor'} · •••• {card.last_four || '----'}</p>
                          </div>
                        </div>
                        <span className="shrink-0 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[9px] font-bold text-emerald-400">Ativo</span>
                      </div>
                      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-slate-800">
                        <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all" style={{ width: `${percentage}%` }} />
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-1 text-[11px]">
                        <div><span className="text-[9px] uppercase text-slate-500 block">Limite</span><strong className="text-slate-200 font-bold">{formatMoney(card.credit_limit)}</strong></div>
                        <div><span className="text-[9px] uppercase text-slate-500 block">Usado</span><strong className="text-rose-300 font-bold">{formatMoney(card.used_limit)}</strong></div>
                        <div><span className="text-[9px] uppercase text-slate-500 block">Disponível</span><strong className="text-emerald-300 font-bold">{formatMoney(available)}</strong></div>
                      </div>
                      <div className="mt-2 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px] text-slate-400">
                        <span>Fecha dia {card.closing_day || '—'} · Vence dia {card.due_day || '—'}</span>
                        <span>Fatura: <strong className="text-slate-200">{formatMoney(card.current_bill)}</strong></span>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Aba 2: Contas & PIX */}
        {activeTab === 'ACCOUNTS' && (
          <div className="space-y-2.5 animate-in fade-in">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Landmark size={14} className="text-emerald-400" /> Contas Bancárias e Chaves PIX
              </h2>
              <button
                type="button"
                onClick={() => openForm('ACCOUNT')}
                className="text-[10px] font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
              >
                <Plus size={12} /> Cadastrar conta
              </button>
            </div>
            {!data.accounts.length ? (
              <EmptyState
                text="Nenhuma conta cadastrada."
                actionLabel="Cadastrar conta"
                onAction={() => openForm('ACCOUNT')}
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {data.accounts.map((account) => (
                  <article key={account.id} className="flex items-center justify-between gap-2.5 rounded-xl border border-slate-800/90 bg-slate-900/80 p-3 hover:border-slate-700 transition-all">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {account.image_url ? (
                        <img src={account.image_url} alt={`Banco ${account.bank_name || account.nickname}`} className="h-8 w-8 shrink-0 rounded-lg object-cover border border-slate-800" />
                      ) : (
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                          <Landmark size={15} />
                        </span>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-white">{account.nickname}</p>
                        <p className="truncate text-[10px] text-slate-400">
                          {account.bank_name || 'Conta pessoal'}
                          {account.pix_key_type ? ` · PIX: ${account.pix_key || account.pix_key_type}` : ''}
                        </p>
                      </div>
                    </div>
                    <strong className="shrink-0 text-xs sm:text-sm font-bold text-emerald-300">{formatMoney(account.balance)}</strong>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Aba 3: Faturas */}
        {activeTab === 'INVOICES' && (
          <div className="space-y-2.5 animate-in fade-in">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <CalendarDays size={14} className="text-amber-400" /> Faturas e Próximos Vencimentos
              </h2>
            </div>
            {!invoices.length ? (
              <EmptyState text="Nenhuma fatura pendente no momento." />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {invoices.map((invoice) => (
                  <article key={invoice.key} className="rounded-xl border border-slate-800/90 bg-slate-900/80 p-3 hover:border-slate-700 transition-all">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white truncate">{invoice.cardName}</p>
                        <p className="text-[10px] text-slate-400 capitalize">{formatMonth(invoice.dueMonth)} · {invoice.installmentCount} lançamento(s)</p>
                      </div>
                      <strong className="text-xs sm:text-sm font-extrabold text-amber-300 shrink-0">{formatMoney(invoice.amount)}</strong>
                    </div>
                    <div className="mt-2.5 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <select
                        aria-label={`Conta para pagar fatura ${invoice.cardName}`}
                        value={invoiceAccounts[invoice.key] || ''}
                        onChange={(event) => setInvoiceAccounts((current) => ({ ...current, [invoice.key]: event.target.value }))}
                        className="flex-1 rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs text-white outline-none focus:border-blue-500"
                      >
                        <option value="">Selecione a conta para pagamento</option>
                        {data.accounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.nickname} · {formatMoney(account.balance)}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={saving || !invoiceAccounts[invoice.key]}
                        onClick={() => runAction(() => personalWalletService.payInvoice(invoice.cardId, invoice.dueMonth, invoiceAccounts[invoice.key]), 'Fatura paga e saldo atualizado.')}
                        className="h-8 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-[10px] font-bold uppercase tracking-wider text-white transition-all disabled:opacity-40 shrink-0 shadow-sm"
                      >
                        Pagar fatura
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Aba 4: Despesas Recentes */}
        {activeTab === 'EXPENSES' && (
          <div className="space-y-2.5 animate-in fade-in">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <ReceiptText size={14} className="text-cyan-400" /> Despesas recentes
              </h2>
              <button
                type="button"
                onClick={() => openForm('EXPENSE')}
                disabled={!data.accounts.length && !data.cards.length}
                className="text-[10px] font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1 disabled:opacity-40"
              >
                <Plus size={12} /> Nova despesa
              </button>
            </div>
            {!data.expenses.length ? (
              <EmptyState
                text="Nenhuma despesa registrada."
                actionLabel="Registrar despesa"
                onAction={() => openForm('EXPENSE')}
              />
            ) : (
              <div className="space-y-2">
                {data.expenses.slice(0, 25).map((expense) => {
                  const sourceName = expense.account_id
                    ? data.accounts.find((account) => account.id === expense.account_id)?.nickname
                    : data.cards.find((card) => card.id === expense.card_id)?.nickname;
                  return (
                    <article key={expense.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-slate-800/80 bg-slate-900/70 p-3 hover:border-slate-700 transition-all">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-xs font-bold text-white truncate">{expense.description}</p>
                          <StatusBadge status={expense.status} />
                        </div>
                        <p className="mt-0.5 text-[10px] text-slate-400 truncate">
                          {expense.category} · {sourceName || 'Origem'} · {expense.installment_count}x · {expense.expense_date}
                        </p>
                      </div>
                      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                        <strong className="text-xs sm:text-sm font-bold text-cyan-300">{formatMoney(expense.amount)}</strong>
                        <div className="flex items-center gap-1">
                          {expense.status === 'PENDING' && expense.account_id && (
                            <button
                              type="button"
                              disabled={saving}
                              title="Marcar como paga"
                              aria-label={`Marcar ${expense.description} como paga`}
                              onClick={() => runAction(() => personalWalletService.setExpenseStatus(expense.id, 'PAID'), 'Despesa paga e saldo atualizado.')}
                              className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-1.5 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                            >
                              <CheckCircle2 size={14} />
                            </button>
                          )}
                          {expense.status !== 'CANCELED' && (
                            <button
                              type="button"
                              disabled={saving}
                              title="Cancelar despesa"
                              aria-label={`Cancelar ${expense.description}`}
                              onClick={() => runAction(() => personalWalletService.setExpenseStatus(expense.id, 'CANCELED'), 'Despesa cancelada.')}
                              className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-1.5 text-rose-400 hover:bg-rose-500/20 transition-colors"
                            >
                              <XCircle size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};

const EmptyState = ({ text, onAction, actionLabel }: { text: string; onAction?: () => void; actionLabel?: string }) => (
  <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-800/80 bg-slate-900/30 py-6 px-4 text-center">
    <p className="text-xs text-slate-400">{text}</p>
    {onAction && actionLabel && (
      <button
        type="button"
        onClick={onAction}
        className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/90 px-3 py-1 text-[10px] font-bold text-slate-200 hover:border-blue-500 hover:text-white transition-all"
      >
        <Plus size={12} className="text-blue-400" />
        <span>{actionLabel}</span>
      </button>
    )}
  </div>
);

const StatusBadge = ({ status }: { status: string }) => {
  const style = status === 'PAID'
    ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
    : status === 'CANCELED'
    ? 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
    : 'bg-amber-500/10 text-amber-300 border border-amber-500/20';
  const label = status === 'PAID' ? 'Pago' : status === 'CANCELED' ? 'Cancelado' : 'Pendente';
  return <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${style}`}>{label}</span>;
};

export default PersonalWalletPage;
