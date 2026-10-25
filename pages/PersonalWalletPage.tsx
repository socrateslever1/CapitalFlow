import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  CreditCard,
  Eye,
  ImagePlus,
  Landmark,
  Plus,
  Receipt,
  ReceiptText,
  ShieldCheck,
  WalletCards,
  X,
  XCircle,
  ChevronRight,
} from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import {
  personalWalletService,
  PersonalWalletAccount,
  PersonalWalletCard,
  PersonalWalletExpense,
  PersonalWalletExpenseInstallment,
  PersonalWalletInvoicePayment,
} from '../services/personalWallet.service';
import { formatMoney } from '../utils/formatters';
import { usePageBack } from '../contexts/PageBackContext';
import { CardDetailModal } from '../components/wallet/CardDetailModal';
import { AccountDetailsPage } from '../components/wallet/AccountDetailsPage';
import { PayInvoiceModal } from '../components/wallet/PayInvoiceModal';
import { getCardTheme } from '../components/wallet/VirtualCreditCard';

type WalletData = {
  accounts: PersonalWalletAccount[];
  cards: PersonalWalletCard[];
  expenses: PersonalWalletExpense[];
  installments: PersonalWalletExpenseInstallment[];
  invoicePayments: PersonalWalletInvoicePayment[];
};

type FormMode = 'ACCOUNT' | 'CARD' | 'EXPENSE' | null;
type WalletTab = 'CARDS' | 'ACCOUNTS' | 'INVOICES' | 'EXPENSES';

export type InvoiceSummary = {
  key: string;
  cardId: string;
  cardName: string;
  dueMonth: string;
  amount: number;
  installmentCount: number;
};

const emptyWallet: WalletData = { accounts: [], cards: [], expenses: [], installments: [], invoicePayments: [] };
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

const DRAFT_PREFIX = 'capitalflow_wallet_draft_';

const getDraft = (mode: FormMode): Record<string, string> | null => {
  if (!mode) return null;
  try {
    const raw = localStorage.getItem(`${DRAFT_PREFIX}${mode}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const saveDraft = (mode: FormMode, formData: Record<string, string>) => {
  if (!mode) return;
  try {
    localStorage.setItem(`${DRAFT_PREFIX}${mode}`, JSON.stringify(formData));
  } catch {}
};

const clearDraft = (mode: FormMode) => {
  if (!mode) return;
  try {
    localStorage.removeItem(`${DRAFT_PREFIX}${mode}`);
  } catch {}
};

export const PersonalWalletPage: React.FC = () => {
  const [data, setData] = useState<WalletData>(emptyWallet);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [formMode, setFormMode] = useState<FormMode>(null);
  const [activeTab, setActiveTab] = useState<WalletTab>('CARDS');
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const tabContentRef = useRef<HTMLDivElement | null>(null);
  const goToTab = (tab: WalletTab) => {
    setSelectedAccountId(null);
    setActiveTab(tab);
    window.requestAnimationFrame(() => tabContentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const openAccountDetails = (accountId: string) => {
    setSelectedAccountId(accountId);
    try { window.history.pushState({ walletAccountOpen: true, accountId }, ''); } catch {}
  };
  const [form, setForm] = useState<Record<string, string>>({});
  const [isDraftRestored, setIsDraftRestored] = useState<boolean>(false);
  const [accountImage, setAccountImage] = useState<File | null>(null);
  const [accountImagePreview, setAccountImagePreview] = useState('');
  const [cardImage, setCardImage] = useState<File | null>(null);
  const [cardImagePreview, setCardImagePreview] = useState('');
  const [selectedInvoiceDueMonth, setSelectedInvoiceDueMonth] = useState<string | null>(null);

  // Modais de detalhes e pagamento de fatura
  const [selectedCardForDetail, setSelectedCardForDetail] = useState<PersonalWalletCard | null>(null);
  const [selectedCardForInvoice, setSelectedCardForInvoice] = useState<PersonalWalletCard | null>(null);

  const pageBack = usePageBack();

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

  const isAnyModalActive = Boolean(formMode || selectedCardForDetail || selectedCardForInvoice || selectedAccountId);

  // Armazena a ação de voltar em ref para desacoplar a função de retorno dos hooks de efeito
  const handleBackRef = useRef<() => void>(() => {});
  handleBackRef.current = () => {
    if (formMode) {
      setFormMode(null);
      setIsDraftRestored(false);
    }
    if (selectedCardForDetail) setSelectedCardForDetail(null);
    if (selectedCardForInvoice) setSelectedCardForInvoice(null);
    if (selectedAccountId) setSelectedAccountId(null);
  };

  // Ocultação de botões flutuantes (FABs) ao abrir formulário ou modal
  useEffect(() => {
    if (isAnyModalActive) {
      document.body.setAttribute('data-hide-fab', 'true');
    } else {
      document.body.removeAttribute('data-hide-fab');
    }
    return () => {
      document.body.removeAttribute('data-hide-fab');
    };
  }, [isAnyModalActive]);

  // Registra no botão de voltar do sistema (ApplePageBackBar / popstate) de forma estável
  const registerBack = pageBack?.register;
  useEffect(() => {
    if (!isAnyModalActive || !registerBack) return;

    const onPop = () => handleBackRef.current();
    window.addEventListener('popstate', onPop);

    const unregister = registerBack({
      onClick: (e) => {
        e?.preventDefault?.();
        handleBackRef.current();
      },
    });

    return () => {
      window.removeEventListener('popstate', onPop);
      unregister?.();
    };
  }, [isAnyModalActive, registerBack]);

  const openForm = (mode: Exclude<FormMode, null>, initialOverrides?: Record<string, string>) => {
    setError('');
    setSuccess('');
    setAccountImage(null);
    setAccountImagePreview('');
    setCardImage(null);
    setCardImagePreview('');

    const savedDraft = getDraft(mode);
    if (savedDraft && Object.keys(savedDraft).length > 0) {
      setForm({ ...savedDraft, ...(initialOverrides || {}) });
      setIsDraftRestored(true);
    } else {
      setForm(
        mode === 'EXPENSE'
          ? { expense_date: today(), status: 'PENDING', installment_count: '1', ...(initialOverrides || {}) }
          : { ...(initialOverrides || {}) }
      );
      setIsDraftRestored(false);
    }
    setFormMode(mode);

    try {
      window.history.pushState({ walletFormOpen: true }, '');
    } catch {}
  };

  const closeForm = () => {
    setFormMode(null);
    setIsDraftRestored(false);
  };

  const updateField = (key: string, value: string) => {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (formMode) saveDraft(formMode, next);
      return next;
    });
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
    const currentMode = formMode;
    await runAction(async () => {
      if (currentMode === 'ACCOUNT') {
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
      if (currentMode === 'CARD') {
        const rawDigits = String(form.card_number || form.last_four || '').replace(/\D/g, '');
        const lastFour = rawDigits.length >= 4 ? rawDigits.slice(-4) : (form.last_four || null);

        const cardMeta = {
          holder_name: form.holder_name?.trim() || null,
          card_number: rawDigits || null,
          expiration: form.expiration?.trim() || null,
          cvv: form.cvv?.trim() || null,
          user_notes: form.notes || null,
        };

        await personalWalletService.createCard({
          nickname: form.nickname || 'Cartão',
          issuer: form.issuer || null,
          brand: form.brand || null,
          last_four: lastFour,
          credit_limit: Number(form.credit_limit || 0),
          closing_day: form.closing_day ? Number(form.closing_day) : null,
          due_day: form.due_day ? Number(form.due_day) : null,
          notes: JSON.stringify(cardMeta),
        }, cardImage);
      }
      if (currentMode === 'EXPENSE') {
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

      if (currentMode) {
        clearDraft(currentMode);
      }

      setFormMode(null);
      setIsDraftRestored(false);
      setForm({});
      setAccountImage(null);
      setAccountImagePreview('');
      setCardImage(null);
      setCardImagePreview('');
    }, currentMode === 'EXPENSE' ? 'Despesa registrada com sucesso.' : 'Cadastro salvo com sucesso.');
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
      current.amount += Math.max(0, Number(installment.amount || 0) - Number(installment.paid_amount || 0));
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

  const selectedAccount = data.accounts.find((account) => account.id === selectedAccountId);
  if (selectedAccount) {
    return <AccountDetailsPage
      key={selectedAccount.id}
      account={selectedAccount}
      expenses={data.expenses}
      invoicePayments={data.invoicePayments}
      onBack={() => setSelectedAccountId(null)}
      onSaved={refresh}
    />;
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

      {/* Formulário Modal/Drawer Mobile-First com Rodapé Fixo */}
      {formMode && (
        <div
          role="dialog"
          aria-modal="true"
          data-modal-open="true"
          className="fixed inset-0 z-[2000] flex flex-col justify-end sm:justify-center sm:items-center bg-slate-950/85 p-0 sm:p-4 backdrop-blur-sm animate-in fade-in overflow-hidden"
        >
          <form
            onSubmit={submit}
            className="w-full sm:max-w-xl rounded-t-2xl sm:rounded-2xl border-0 sm:border border-slate-800 bg-slate-900 shadow-2xl h-full sm:h-auto max-h-[100dvh] sm:max-h-[90vh] flex flex-col overflow-hidden"
          >
            {/* Header Fixo */}
            <div className="shrink-0 p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900">
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-black uppercase tracking-wider text-white">
                  {formMode === 'ACCOUNT' ? 'Nova conta bancária' : formMode === 'CARD' ? 'Novo cartão de crédito' : 'Nova despesa'}
                </h2>
                {isDraftRestored && (
                  <span className="text-[9px] font-bold text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                    Rascunho recuperado
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={closeForm}
                aria-label="Fechar formulário"
                className="rounded-full bg-slate-800 p-1.5 text-slate-400 hover:text-white transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Corpo Rolável (com scroll suave e seguro no celular) */}
            <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-3.5 overscroll-contain touch-pan-y [-webkit-overflow-scrolling:touch]">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {formMode === 'ACCOUNT' && (
                  <>
                    <label><span className={labelClass}>Apelido</span><input required value={form.nickname || ''} onChange={(e) => updateField('nickname', e.target.value)} className={fieldClass} placeholder="Ex: Nubank Principal" /></label>
                    <label><span className={labelClass}>Saldo atual</span><input required type="number" min="0" step="0.01" value={form.balance || ''} onChange={(e) => updateField('balance', e.target.value)} className={fieldClass} placeholder="0,00" /></label>
                    <label><span className={labelClass}>Banco</span><input value={form.bank_name || ''} onChange={(e) => updateField('bank_name', e.target.value)} className={fieldClass} placeholder="Ex: Itaú, Nubank, Bradesco" /></label>
                    <label><span className={labelClass}>Tipo</span><select value={form.account_type || 'CHECKING'} onChange={(e) => updateField('account_type', e.target.value)} className={fieldClass}><option value="CHECKING">Conta corrente</option><option value="SAVINGS">Poupança</option><option value="CASH">Dinheiro</option><option value="INVESTMENT">Investimento</option></select></label>
                    <label><span className={labelClass}>Tipo da chave PIX</span><select value={form.pix_key_type || ''} onChange={(e) => updateField('pix_key_type', e.target.value)} className={fieldClass}><option value="">Sem PIX</option><option value="CPF">CPF</option><option value="EMAIL">E-mail</option><option value="PHONE">Telefone</option><option value="RANDOM">Aleatória</option></select></label>
                    <label><span className={labelClass}>Chave PIX</span><input value={form.pix_key || ''} onChange={(e) => updateField('pix_key', e.target.value)} className={fieldClass} placeholder="Chave para transferências" /></label>
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
                    <label><span className={labelClass}>Apelido do cartão</span><input required value={form.nickname || ''} onChange={(e) => updateField('nickname', e.target.value)} className={fieldClass} placeholder="Ex: Nubank Ultravioleta" /></label>
                    <label><span className={labelClass}>Nome impresso no cartão</span><input value={form.holder_name || ''} onChange={(e) => updateField('holder_name', e.target.value.toUpperCase())} className={fieldClass} placeholder="Ex: MANOEL S C LEVER" /></label>
                    <label><span className={labelClass}>Limite total</span><input required type="number" min="0" step="0.01" value={form.credit_limit || ''} onChange={(e) => updateField('credit_limit', e.target.value)} className={fieldClass} placeholder="0,00" /></label>
                    <label><span className={labelClass}>Emissor / Banco</span><input value={form.issuer || ''} onChange={(e) => updateField('issuer', e.target.value)} className={fieldClass} placeholder="Ex: Nubank, Inter, Itaú, XP" /></label>
                    <label><span className={labelClass}>Bandeira</span><input value={form.brand || ''} onChange={(e) => updateField('brand', e.target.value)} className={fieldClass} placeholder="Ex: Mastercard, Visa, Elo" /></label>
                    <label><span className={labelClass}>Número do cartão</span><input value={form.card_number || ''} maxLength={19} onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, '').slice(0, 16);
                      const formatted = v.match(/.{1,4}/g)?.join(' ') || v;
                      updateField('card_number', formatted);
                      if (v.length >= 4) updateField('last_four', v.slice(-4));
                    }} className={fieldClass} placeholder="•••• •••• •••• 8696" /></label>
                    <div className="grid grid-cols-2 gap-2">
                      <label><span className={labelClass}>Validade (MM/AA)</span><input value={form.expiration || ''} maxLength={5} onChange={(e) => {
                        let v = e.target.value.replace(/\D/g, '').slice(0, 4);
                        if (v.length >= 3) v = `${v.slice(0, 2)}/${v.slice(2, 4)}`;
                        updateField('expiration', v);
                      }} className={fieldClass} placeholder="08/34" /></label>
                      <label><span className={labelClass}>Código CVC / CVV</span><input value={form.cvv || ''} maxLength={4} onChange={(e) => updateField('cvv', e.target.value.replace(/\D/g, ''))} className={fieldClass} placeholder="267" /></label>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <label><span className={labelClass}>Fecha dia</span><input type="number" min="1" max="31" value={form.closing_day || ''} onChange={(e) => updateField('closing_day', e.target.value)} className={fieldClass} placeholder="Dia" /></label>
                      <label><span className={labelClass}>Vence dia</span><input type="number" min="1" max="31" value={form.due_day || ''} onChange={(e) => updateField('due_day', e.target.value)} className={fieldClass} placeholder="Dia" /></label>
                    </div>
                    <label className="sm:col-span-2">
                      <span className={labelClass}>Foto ou imagem real do cartão (opcional)</span>
                      <span className="flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border border-dashed border-slate-700 bg-slate-950 p-2.5 transition-colors hover:border-blue-500/60">
                        {cardImagePreview ? <img src={cardImagePreview} alt="Prévia do cartão" className="h-10 w-16 rounded object-cover" /> : <span className="flex h-10 w-16 items-center justify-center rounded bg-slate-900 text-slate-500"><ImagePlus size={18} /></span>}
                        <span className="min-w-0"><strong className="block truncate text-xs text-slate-200">{cardImage?.name || 'Selecionar foto do cartão'}</strong><small className="block text-[9px] text-slate-500">O sistema já gera um cartão virtual ultra-realista completo</small></span>
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
                    <label className="sm:col-span-2"><span className={labelClass}>Descrição</span><input required value={form.description || ''} onChange={(e) => updateField('description', e.target.value)} className={fieldClass} placeholder="Ex: Supermercado, Combustível, Fatura" /></label>
                    <label><span className={labelClass}>Valor</span><input required type="number" min="0.01" step="0.01" value={form.amount || ''} onChange={(e) => updateField('amount', e.target.value)} className={fieldClass} placeholder="0,00" /></label>
                    <label><span className={labelClass}>Categoria</span><input required value={form.category || ''} onChange={(e) => updateField('category', e.target.value)} className={fieldClass} placeholder="Ex: Alimentação, Transporte, Lazer" /></label>
                    <label className="sm:col-span-2">
                      <span className={labelClass}>Conta ou cartão utilizado</span>
                      <select required value={form.payment_source || ''} onChange={(e) => updateField('payment_source', e.target.value)} className={fieldClass}>
                        <option value="">Selecione a forma de pagamento</option>
                        {data.cards.map((card) => (
                          <option key={card.id} value={`card:${card.id}`}>
                            💳 Cartão {card.nickname} •••• {card.last_four || '----'} (Disp: {formatMoney(Math.max(0, Number(card.credit_limit) - Number(card.used_limit)))})
                          </option>
                        ))}
                        {data.accounts.map((account) => (
                          <option key={account.id} value={`account:${account.id}`}>
                            🏦 Conta {account.nickname} · Saldo: {formatMoney(account.balance)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label><span className={labelClass}>Data da despesa</span><input required type="date" value={form.expense_date || ''} onChange={(e) => updateField('expense_date', e.target.value)} className={fieldClass} /></label>
                    <label><span className={labelClass}>Primeiro vencimento</span><input type="date" value={form.due_date || ''} onChange={(e) => updateField('due_date', e.target.value)} className={fieldClass} /></label>
                    <label><span className={labelClass}>Nº de parcelas</span><input required type="number" min="1" max="120" value={form.installment_count || '1'} onChange={(e) => updateField('installment_count', e.target.value)} className={fieldClass} /></label>
                    <label><span className={labelClass}>Recorrência</span><select value={form.recurrence || ''} onChange={(e) => updateField('recurrence', e.target.value)} className={fieldClass}><option value="">Não recorrente</option><option value="MONTHLY">Mensal</option><option value="YEARLY">Anual</option></select></label>
                    {selectedPaymentType === 'account' && <label><span className={labelClass}>Situação</span><select value={form.status || 'PENDING'} onChange={(e) => updateField('status', e.target.value)} className={fieldClass}><option value="PENDING">Pendente</option><option value="PAID">Pago agora</option></select></label>}
                    <label className={selectedPaymentType === 'account' ? '' : 'sm:col-span-2'}><span className={labelClass}>Observações</span><input value={form.notes || ''} onChange={(e) => updateField('notes', e.target.value)} className={fieldClass} placeholder="Opcional" /></label>
                  </>
                )}
              </div>
            </div>

            {/* Rodapé Fixo e Acessível no Celular (Salvar sempre visível) */}
            <div className="shrink-0 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-slate-900/95 border-t border-slate-800 flex items-center justify-between gap-2 shadow-2xl">
              {isDraftRestored ? (
                <button
                  type="button"
                  onClick={() => {
                    clearDraft(formMode);
                    setForm(formMode === 'EXPENSE' ? { expense_date: today(), status: 'PENDING', installment_count: '1' } : {});
                    setIsDraftRestored(false);
                  }}
                  className="text-[10px] text-slate-400 hover:text-rose-300 underline"
                >
                  Descartar rascunho
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={closeForm}
                  className="h-9 px-4 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 text-xs font-bold hover:text-white transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="h-9 px-5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-blue-600/30 disabled:opacity-50 transition-all flex items-center gap-1.5"
                >
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* KPI Strip Compacto */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {/* Card 1: Saldo */}
        <button type="button" aria-label="Abrir contas bancárias" onClick={() => goToTab('ACCOUNTS')}
          className="w-full cursor-pointer rounded-lg border border-slate-800/80 bg-slate-900/80 p-2.5 text-left transition-colors hover:border-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500">
          <div className="flex items-center justify-between gap-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">
            <span className="truncate">Saldo em Contas</span>
            <Landmark size={12} className="text-emerald-400 shrink-0" />
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="text-sm sm:text-base font-extrabold text-emerald-400 truncate">{formatMoney(totals.balance)}</span>
            <span className="text-[10px] text-slate-500 truncate">{data.accounts.length} conta(s)</span>
          </div>
        </button>

        {/* Card 2: Gastos */}
        <button type="button" aria-label="Abrir despesas do mês" onClick={() => goToTab('EXPENSES')}
          className="w-full cursor-pointer rounded-lg border border-slate-800/80 bg-slate-900/80 p-2.5 text-left transition-colors hover:border-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500">
          <div className="flex items-center justify-between gap-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">
            <span className="truncate">Gastos do Mês</span>
            <ReceiptText size={12} className="text-cyan-400 shrink-0" />
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="text-sm sm:text-base font-extrabold text-cyan-300 truncate">{formatMoney(totals.month)}</span>
            <span className="text-[10px] text-slate-500">Mês atual</span>
          </div>
        </button>

        {/* Card 3: Faturas */}
        <button type="button" aria-label="Abrir faturas abertas" onClick={() => goToTab('INVOICES')}
          className="w-full cursor-pointer rounded-lg border border-slate-800/80 bg-slate-900/80 p-2.5 text-left transition-colors hover:border-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500">
          <div className="flex items-center justify-between gap-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">
            <span className="truncate">Faturas Abertas</span>
            <CalendarDays size={12} className="text-amber-400 shrink-0" />
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="text-sm sm:text-base font-extrabold text-amber-300 truncate">{formatMoney(totals.openInvoices)}</span>
            <span className="text-[10px] text-slate-500 truncate">{invoices.length} fatura(s)</span>
          </div>
        </button>

        {/* Card 4: Limite */}
        <button type="button" aria-label="Abrir cartões e limites" onClick={() => goToTab('CARDS')}
          className="w-full cursor-pointer rounded-lg border border-slate-800/80 bg-slate-900/80 p-2.5 text-left transition-colors hover:border-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500">
          <div className="flex items-center justify-between gap-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">
            <span className="truncate">Limite dos Cartões</span>
            <CreditCard size={12} className="text-blue-400 shrink-0" />
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="text-sm sm:text-base font-extrabold text-blue-300 truncate">{formatMoney(totals.available)}</span>
            <span className="text-[10px] font-semibold text-rose-300 truncate">Uso: {formatMoney(totals.used)}</span>
          </div>
        </button>
      </div>

      {/* Navegação por Abas */}
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
      <div ref={tabContentRef} className="pt-1 scroll-mt-4">
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {data.cards.map((card) => {
                  const available = Math.max(0, Number(card.credit_limit) - Number(card.used_limit));
                  const percentage = Number(card.credit_limit) > 0 ? Math.min(100, (Number(card.used_limit) / Number(card.credit_limit)) * 100) : 0;
                  const cardInvoices = invoices.filter((inv) => inv.cardId === card.id);
                  const openInvoiceTotal = cardInvoices.reduce((acc, cur) => acc + cur.amount, 0);

                  return (
                    <article key={card.id} className="rounded-xl border border-slate-800/90 bg-slate-900/80 p-3.5 hover:border-slate-700 transition-all flex flex-col justify-between shadow-lg">
                      <div>
                        {/* Topo do cartão - Clicável para abrir o detalhe realista */}
                        <div
                          onClick={() => setSelectedCardForDetail(card)}
                          className="flex items-center justify-between gap-2 cursor-pointer group"
                          title="Toque para abrir a imagem real e detalhes do cartão"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {card.image_url ? (
                              <div className="relative group/thumb shrink-0">
                                <img
                                  src={card.image_url}
                                  alt={`Cartão ${card.nickname}`}
                                  className="h-9 w-14 shrink-0 rounded-lg object-cover border border-slate-700 group-hover/thumb:border-blue-400 transition-all shadow"
                                />
                                <span className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover/thumb:opacity-100 flex items-center justify-center text-white text-[9px] font-bold rounded-lg transition-opacity">
                                  <Eye size={13} />
                                </span>
                              </div>
                            ) : (
                              <div
                                className={`h-9 w-14 shrink-0 rounded-lg bg-gradient-to-br ${getCardTheme(card.nickname, card.issuer).gradient} border border-white/20 shadow p-1 flex flex-col justify-between group-hover:scale-105 transition-all text-white`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-[7px] font-black uppercase tracking-tight text-white/90 truncate">
                                    {getCardTheme(card.nickname, card.issuer).logoText}
                                  </span>
                                  <div className="w-2 h-1.5 rounded-sm bg-amber-400/80" />
                                </div>
                                <div className="text-[7px] font-mono tracking-wider text-white/80">
                                  •••• {card.last_four || '8696'}
                                </div>
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="truncate text-xs font-extrabold text-white group-hover:text-blue-300 transition-colors flex items-center gap-1.5">
                                {card.nickname}
                                <Eye size={12} className="text-slate-500 group-hover:text-blue-400 shrink-0" />
                              </p>
                              <p className="truncate text-[10px] text-slate-400">{card.issuer || 'Emissor'} · •••• {card.last_four || '----'}</p>
                            </div>
                          </div>
                          <span className="shrink-0 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[9px] font-bold text-emerald-400">Ativo</span>
                        </div>

                        {/* Barra de Limite */}
                        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800">
                          <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all" style={{ width: `${percentage}%` }} />
                        </div>

                        {/* Informações Numéricas */}
                        <div className="mt-2.5 grid grid-cols-3 gap-1 text-[11px]">
                          <div><span className="text-[9px] uppercase font-bold text-slate-500 block">Limite</span><strong className="text-slate-200 font-bold">{formatMoney(card.credit_limit)}</strong></div>
                          <div><span className="text-[9px] uppercase font-bold text-rose-400 block">Usado</span><strong className="text-rose-300 font-bold">{formatMoney(card.used_limit)}</strong></div>
                          <div><span className="text-[9px] uppercase font-bold text-emerald-400 block">Disponível</span><strong className="text-emerald-300 font-bold">{formatMoney(available)}</strong></div>
                        </div>

                        {/* Detalhes do Ciclo e Fatura */}
                        <div className="mt-2.5 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px] text-slate-400">
                          <span>Fecha dia {card.closing_day || '—'} · Vence dia {card.due_day || '—'}</span>
                          <span>Fatura: <strong className="text-amber-300 font-bold">{formatMoney(openInvoiceTotal > 0 ? openInvoiceTotal : Number(card.current_bill || 0))}</strong></span>
                        </div>
                      </div>

                      {/* Botões de Ação Direta no Cartão Salvo */}
                      <div className="mt-3 pt-2.5 border-t border-slate-800/80 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => openForm('EXPENSE', { payment_source: `card:${card.id}` })}
                          className="py-2 px-2 rounded-lg bg-blue-600/90 hover:bg-blue-600 text-white text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-sm"
                        >
                          <Plus size={13} />
                          <span>+ Despesa</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => { setSelectedInvoiceDueMonth(null); setSelectedCardForInvoice(card); }}
                          className="py-2 px-2 rounded-lg bg-slate-800 hover:bg-slate-750 border border-slate-700/80 hover:border-emerald-500/40 text-slate-200 hover:text-emerald-300 text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all"
                        >
                          <Receipt size={13} className="text-amber-400" />
                          <span>Pagar Fatura</span>
                        </button>
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
                  <button type="button" key={account.id} onClick={() => openAccountDetails(account.id)}
                    aria-label={`Abrir detalhes da conta ${account.nickname}`}
                    className="flex w-full items-center justify-between gap-2.5 rounded-xl border border-slate-800/90 bg-slate-900/80 p-3 text-left hover:border-emerald-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500 transition-all">
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
                    <span className="flex items-center gap-2 shrink-0"><strong className="text-xs sm:text-sm font-bold text-emerald-300">{formatMoney(account.balance)}</strong><ChevronRight size={15} className="text-slate-400" /></span>
                  </button>
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
                    <div className="mt-2.5 flex items-center justify-end">
                      <button type="button" disabled={saving || invoice.amount <= 0}
                        onClick={() => {
                          setSelectedInvoiceDueMonth(invoice.dueMonth);
                          const card = data.cards.find((item) => item.id === invoice.cardId);
                          if (card) setSelectedCardForInvoice(card);
                        }}
                        className="h-9 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white disabled:opacity-40">
                        Pagar parte ou total
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
            {data.invoicePayments.length > 0 && (
              <div className="space-y-2 pt-3 border-t border-slate-800">
                <h3 className="text-xs font-bold uppercase text-slate-400">Histórico de pagamentos registrados</h3>
                {data.invoicePayments.map((payment) => (
                  <div key={payment.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-xs text-white font-semibold truncate">
                        {cardsById.get(payment.card_id)?.nickname || 'Cartão'} · {formatMonth(payment.due_month)}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {payment.source === 'MANUAL' ? 'Registro manual · sem débito em conta' : 'Debitado de conta cadastrada'}
                        {' · '}{new Date(payment.created_at).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    <strong className="text-xs text-emerald-400 shrink-0">{formatMoney(Number(payment.amount))}</strong>
                  </div>
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

      {/* Modal de Detalhes e Visualização do Cartão */}
      {selectedCardForDetail && (
        <CardDetailModal
          card={selectedCardForDetail}
          accounts={data.accounts}
          openInvoiceAmount={
            invoices
              .filter((inv) => inv.cardId === selectedCardForDetail.id)
              .reduce((acc, cur) => acc + cur.amount, 0)
          }
          onClose={() => setSelectedCardForDetail(null)}
          onNewExpense={(cardId) => {
            setSelectedCardForDetail(null);
            openForm('EXPENSE', { payment_source: `card:${cardId}` });
          }}
          onPayInvoice={(cardId) => {
            setSelectedCardForDetail(null);
            const foundCard = data.cards.find((c) => c.id === cardId);
            if (foundCard) { setSelectedInvoiceDueMonth(null); setSelectedCardForInvoice(foundCard); }
          }}
        />
      )}

      {/* Modal de Pagamento de Fatura */}
      {selectedCardForInvoice && (
        <PayInvoiceModal
          card={selectedCardForInvoice}
          accounts={data.accounts}
          invoiceAmount={invoices.find((inv) => inv.cardId === selectedCardForInvoice.id
            && (!selectedInvoiceDueMonth || inv.dueMonth === selectedInvoiceDueMonth))?.amount || 0}
          dueMonth={selectedInvoiceDueMonth || invoices.find((inv) => inv.cardId === selectedCardForInvoice.id)?.dueMonth}
          onClose={() => { setSelectedCardForInvoice(null); setSelectedInvoiceDueMonth(null); }}
          onPay={async (cardId, dueMonth, accountId, amount, requestId) => {
            // Do not use runAction here: it swallows errors and would close the modal after a failed RPC.
            await personalWalletService.payInvoicePartial(cardId, dueMonth, accountId, amount, requestId);
            await refresh();
            setSuccess(`Pagamento de ${formatMoney(amount)} registrado. Saldo da fatura atualizado.`);
          }}
        />
      )}
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
