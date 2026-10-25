import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CreditCard,
  ImagePlus,
  Landmark,
  Plus,
  ShieldCheck,
  WalletCards,
  X,
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
  PersonalWalletPayable,
  PersonalWalletPayablePayment,
  WalletRecurringIncome,
  WalletRecurringReceipt,
  WalletRecurringObligation,
  WalletAccountOperation,
  WalletStatementRow,
} from '../services/personalWallet.service';
import { formatMoney } from '../utils/formatters';
import { generateUUID } from '../utils/generators';
import { usePageBack } from '../contexts/PageBackContext';
import { CardDetailModal } from '../components/wallet/CardDetailModal';
import { AccountDetailsPage } from '../components/wallet/AccountDetailsPage';
import { BankLogo } from '../components/wallet/BankLogo';
import { BANK_CATALOG } from '../utils/bankLogoRegistry';
import { PayInvoiceModal } from '../components/wallet/PayInvoiceModal';
import { BankStack } from '../components/wallet/BankStack';
import { CardEditModal } from '../components/wallet/CardEditModal';
import { RecurringIncomePanel } from '../components/wallet/RecurringIncomePanel';
import { RecurringObligationsPanel } from '../components/wallet/RecurringObligationsPanel';
import { UserProfile } from '../types';
import { WalletPayablesPanel } from '../components/wallet/WalletPayablesPanel';
import { getBankVisual } from '../components/wallet/walletPresentation';
import { WalletBalanceOverview } from '../components/wallet/WalletBalanceOverview';
import { CardInvoiceStatement } from '../components/wallet/CardInvoiceStatement';
import { WalletStatementImport } from '../components/wallet/WalletStatementImport';
import { AccountCardStack } from '../components/wallet/AccountCardStack';

type WalletData = {
  accounts: PersonalWalletAccount[];
  cards: PersonalWalletCard[];
  expenses: PersonalWalletExpense[];
  installments: PersonalWalletExpenseInstallment[];
  invoicePayments: PersonalWalletInvoicePayment[];
  accountOperations: WalletAccountOperation[];
  statementRows: WalletStatementRow[];
  payables: PersonalWalletPayable[];
  payablePayments: PersonalWalletPayablePayment[];
  recurringIncomes: WalletRecurringIncome[];
  recurringReceipts: WalletRecurringReceipt[];
  recurringObligations: WalletRecurringObligation[];
};

type FormMode = 'ACCOUNT' | 'CARD' | 'EXPENSE' | 'PAYABLE' | null;
export type ActiveTab = 'extrato' | 'contas' | 'dividas' | 'receitas';

export type InvoiceSummary = {
  key: string;
  cardId: string;
  cardName: string;
  dueMonth: string;
  amount: number;
  installmentCount: number;
};

const emptyWallet: WalletData = { accounts: [], cards: [], expenses: [], installments: [], invoicePayments: [], accountOperations: [], statementRows: [], payables: [], payablePayments: [], recurringIncomes: [], recurringReceipts: [], recurringObligations: [] };
const fieldClass = 'w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white outline-none transition-colors focus:border-blue-500';
const labelClass = 'mb-1 block text-[9px] font-bold uppercase tracking-wider text-slate-400';
const today = () => new Date().toISOString().slice(0, 10);
const currentMonth = () => today().slice(0, 7);

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

type PersonalWalletPageProps = {
  activeUser?: UserProfile | null;
  initialTab?: ActiveTab;
  onTabChange?: (tab: ActiveTab) => void;
  moduleView?: 'overview' | 'cards' | 'accounts' | 'payables' | 'income';
};

export const PersonalWalletPage: React.FC<PersonalWalletPageProps> = ({ activeUser, initialTab = 'extrato', onTabChange, moduleView }) => {
  const [data, setData] = useState<WalletData>(emptyWallet);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [formMode, setFormMode] = useState<FormMode>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>(initialTab);
  const [statementImportOpen, setStatementImportOpen] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const tabContentRef = useRef<HTMLDivElement | null>(null);
  const goToTab = (tab: ActiveTab) => {
    setSelectedAccountId(null);
    setActiveTab(tab);
    onTabChange?.(tab);
    window.requestAnimationFrame(() => tabContentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  useEffect(() => { setActiveTab(initialTab); }, [initialTab]);
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
  const [selectedCardForEdit, setSelectedCardForEdit] = useState<PersonalWalletCard | null>(null);
  const [activeStackCard, setActiveStackCard] = useState<PersonalWalletCard | null>(null);
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

  const isAnyModalActive = Boolean(formMode || statementImportOpen || selectedCardForDetail || selectedCardForEdit || selectedCardForInvoice || selectedAccountId);

  // Armazena a ação de voltar em ref para desacoplar a função de retorno dos hooks de efeito
  const handleBackRef = useRef<() => void>(() => {});
  handleBackRef.current = () => {
    if (formMode) {
      setFormMode(null);
      setIsDraftRestored(false);
    }
    if (selectedCardForDetail) setSelectedCardForDetail(null);
    if (selectedCardForEdit) setSelectedCardForEdit(null);
    if (selectedCardForInvoice) setSelectedCardForInvoice(null);
    if (selectedAccountId) setSelectedAccountId(null);
    if (statementImportOpen) setStatementImportOpen(false);
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
          : mode === 'PAYABLE'
            ? { creditor_type: 'PERSON', due_date: today(), ...(initialOverrides || {}) }
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
        if(form.link_credit==='yes'){
          if(accountImage||cardImage)throw new Error('Ao criar conta e cartão juntos, utilize os logos automáticos. Personalize depois.');
          await personalWalletService.createHybridAssets({
            account:{nickname:form.nickname||'Conta',bank_name:form.bank_name||'',
              account_type:form.account_type||'CHECKING',balance:Number(form.balance||0),
              pix_key:form.pix_key||null,pix_key_type:form.pix_key_type||null},
            card:{nickname:form.linked_card_nickname||'Cartão',issuer:form.bank_name||'',
              brand:form.linked_card_brand||null,last_four:form.linked_card_last_four||null,
              credit_limit:Number(form.linked_card_limit||0),primary_color:form.linked_card_primary_color||null,
              closing_day:form.linked_card_closing?Number(form.linked_card_closing):null,
              due_day:form.linked_card_due?Number(form.linked_card_due):null}
          });
        }else{
          await personalWalletService.createAccount({
            nickname:form.nickname||'Conta',bank_name:form.bank_name||null,
            institution_key:getBankVisual(form.bank_name||form.nickname||'Conta').key,
            account_type:form.account_type||'CHECKING',balance:Number(form.balance||0),
            pix_key:form.pix_key||null,pix_key_type:form.pix_key_type||null,notes:form.notes||null
          },accountImage);
        }
      }
      if (currentMode === 'CARD') {
        const lastFour=String(form.last_four||'').replace(/\D/g,'');
        if(lastFour&&lastFour.length!==4)throw new Error('Informe quatro dígitos finais.');
        if(form.link_mode==='new'){
          if(cardImage)throw new Error('Ao criar conta e cartão juntos, use o logo automático; personalize depois.');
          await personalWalletService.createHybridAssets({
            account:{nickname:form.new_account_name||form.issuer||'Conta',bank_name:form.issuer||'',
              account_type:'CHECKING',balance:Number(form.new_account_balance||0),
              pix_key:form.new_account_pix||null,pix_key_type:form.new_account_pix_type||null},
            card:{nickname:form.nickname||'Cartão',issuer:form.issuer||'',brand:form.brand||null,
              last_four:lastFour||null,credit_limit:Number(form.credit_limit||0),primary_color:form.primary_color||null,
              closing_day:form.closing_day?Number(form.closing_day):null,
              due_day:form.due_day?Number(form.due_day):null}
          });
        }else{
          const accountId=form.link_mode==='existing'?form.account_id||null:null;
          if(form.link_mode==='existing'&&!accountId)throw new Error('Selecione a conta vinculada.');
          await personalWalletService.createCard({
            nickname:form.nickname||'Cartão',issuer:form.issuer||null,
            institution_key:getBankVisual(form.issuer||'Cartão').key,
            brand:form.brand||null,last_four:lastFour||null,
            credit_limit:Number(form.credit_limit||0),primary_color:form.primary_color||null,
            closing_day:form.closing_day?Number(form.closing_day):null,
            due_day:form.due_day?Number(form.due_day):null,
            notes:JSON.stringify({holder_name:form.holder_name?.trim()||null,user_notes:form.notes||null}),
            account_id:accountId
          },cardImage);
        }
      }
      if (currentMode === 'PAYABLE') {
        await personalWalletService.createPayable({
          creditor_name: form.creditor_name || '',
          creditor_type: (form.creditor_type || 'PERSON') as 'PERSON' | 'COMPANY',
          description: form.description || '',
          creditor_document: form.creditor_document || null,
          total_amount: Number(form.amount || 0),
          category:form.category||'Outros',
          origin_type:String(form.payment_source||'').startsWith('account:')?'ACCOUNT':'CARD',
          origin_account_id:String(form.payment_source||'').startsWith('account:')?form.payment_source.split(':')[1]:null,
          origin_card_id:String(form.payment_source||'').startsWith('card:')?form.payment_source.split(':')[1]:null,
          due_date: form.due_date || null,
          interest_rate: Number(form.interest_rate || 0),
          fine_percent: Number(form.fine_percent || 0),
          notes: form.notes || null,
        });
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
      .reduce((sum, expense) => sum + Number(expense.amount || 0), 0)
      + data.accountOperations.filter(op => op.operation_type === 'EXPENSE' && String(op.operation_date).slice(0,7) === currentMonth())
        .reduce((sum, op) => sum + Number(op.amount || 0), 0),
    openInvoices: invoices.reduce((sum, invoice) => sum + invoice.amount, 0),
  }), [data, invoices]);
  const receivedIncomeIdsThisMonth = useMemo(
    () => new Set(data.recurringReceipts.filter(receipt => receipt.reference_month === `${currentMonth()}-01`).map(receipt => receipt.income_id)),
    [data.recurringReceipts],
  );

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
      accounts={data.accounts}
      accountOperations={data.accountOperations}
      statementRows={data.statementRows}
      ownerName={activeUser?.fullName || activeUser?.name}
      ownerCity={activeUser?.city}
      onBack={() => setSelectedAccountId(null)}
      onSaved={refresh}
    />;
  }

  return (
    <section className="space-y-3 pb-32 sm:pb-16 w-full max-w-7xl mx-auto px-4 sm:px-6 animate-in fade-in">
      <datalist id="wallet-bank-options">{BANK_CATALOG.map(bank => <option key={bank.id} value={bank.name}/>)}</datalist>
      {/* Cabeçalho Compacto e Integrado */}
      {!moduleView && <PageHeader
        icon={<WalletCards size={20} />}
        title={<>Minha <span className="text-emerald-400">Carteira</span></>}
        subtitle="Seus cartões e finanças em um único lugar"
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
      />}

      {/* Faixa Discreta de Proteção */}
      {!moduleView && <div className="flex items-center gap-1.5 px-1 text-[11px] text-slate-400">
        <ShieldCheck size={13} className="text-emerald-400 shrink-0" />
        <span className="truncate">Área pessoal protegida e separada do capital dos contratos.</span>
      </div>}

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

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
        {(!moduleView || moduleView === 'overview' || moduleView === 'cards') && <div className={`min-w-0 space-y-6 lg:self-start lg:sticky lg:top-6 ${moduleView === 'overview' ? 'lg:col-span-12 lg:grid lg:grid-cols-2 lg:gap-8' : 'lg:col-span-5'}`}>
          <BankStack
            accounts={data.accounts}
            cards={data.cards}
            onAccount={openAccountDetails}
            onCard={setSelectedCardForDetail}
            onEditCard={setSelectedCardForEdit}
            onSelectionChange={setActiveStackCard}
            onCreateCard={() => openForm('CARD')}
            onNewExpense={(card) => openForm('EXPENSE', { payment_source: `card:${card.id}` })}
            onPayInvoice={(card) => { setSelectedInvoiceDueMonth(null); setSelectedCardForInvoice(card); }}
          />
          {moduleView !== 'cards' && <WalletBalanceOverview accounts={data.accounts} recurringIncomes={data.recurringIncomes}
            receivedIncomeIds={receivedIncomeIdsThisMonth} openCardInvoices={totals.openInvoices}
            payables={data.payables} month={currentMonth()} />}
        </div>}

        {moduleView !== 'overview' && <section ref={tabContentRef} aria-label="Base operacional da carteira" className={`min-w-0 ${moduleView && moduleView !== 'cards' ? 'lg:col-span-12' : 'lg:col-span-7'}`}>
          {!moduleView && <nav aria-label="Áreas da carteira" className="sticky top-0 z-30 grid grid-cols-2 gap-1 rounded-2xl border border-slate-800 bg-slate-950/90 p-1.5 backdrop-blur-md sm:grid-cols-4 lg:top-6">
            {([
              ['extrato', 'Extrato do Cartão'],
              ['contas', 'Contas Bancárias & PIX'],
              ['dividas', 'Dívidas & A Pagar'],
              ['receitas', 'Receitas Fixas'],
            ] as const).map(([tab, label]) => (
              <button key={tab} type="button" onClick={() => goToTab(tab)} aria-current={activeTab === tab ? 'page' : undefined}
                className={`min-h-10 rounded-xl px-2 py-2 text-[10px] font-bold transition-all sm:text-xs ${activeTab === tab ? 'bg-blue-600 text-white shadow-lg shadow-blue-950/40' : 'text-slate-400 hover:bg-slate-900 hover:text-white'}`}>
                {label}
              </button>
            ))}
          </nav>}

          <div className={`${moduleView ? '' : 'mt-4'} min-h-[28rem] rounded-2xl border border-slate-800 bg-slate-900/55 p-3 sm:p-4`}>
            {activeTab === 'extrato' && (activeStackCard ? (
              <CardInvoiceStatement cardId={activeStackCard.id}
                dueMonth={invoices.find(invoice => invoice.cardId === activeStackCard.id)?.dueMonth || null}
                expenses={data.expenses} installments={data.installments}
                onEdit={async input => { await personalWalletService.updateExpense(input); await refresh(); setSuccess('Lançamento atualizado. Fatura e limite recalculados.'); }}
                onDelete={async expenseId => { await personalWalletService.setExpenseStatus(expenseId, 'CANCELED'); await refresh(); setSuccess('Lançamento excluído. Fatura e limite recalculados.'); }}
                className="m-0 border-0 bg-transparent p-0"
                headerAction={<button type="button" onClick={() => setStatementImportOpen(true)} className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-[10px] font-bold text-cyan-300">Importar PDF da fatura</button>}
              />
            ) : <EmptyState text="Cadastre um cartão para visualizar o extrato." actionLabel="Cadastrar cartão" onAction={() => openForm('CARD')} />)}

            {activeTab === 'contas' && <div className="space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between gap-3"><h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-300"><Landmark size={14} className="text-emerald-400"/> Contas Bancárias e Chaves PIX</h2><button type="button" onClick={() => openForm('ACCOUNT')} className="shrink-0 text-[10px] font-bold text-emerald-400"><Plus size={12} className="inline"/> Cadastrar conta</button></div>
              {!data.accounts.length ? <EmptyState text="Nenhuma conta cadastrada." actionLabel="Cadastrar conta" onAction={() => openForm('ACCOUNT')}/> : <AccountCardStack accounts={data.accounts} onOpen={account => openAccountDetails(account.id)}/>}
            </div>}

            {activeTab === 'dividas' && <div className="space-y-4 animate-in fade-in"><RecurringObligationsPanel accounts={data.accounts} cards={data.cards} items={data.recurringObligations} onSaved={refresh}/><WalletPayablesPanel payables={data.payables} accounts={data.accounts} cards={data.cards} saving={saving} onCreate={() => openForm('PAYABLE')} onPay={async input => { setSaving(true); setError(''); try { await personalWalletService.payPayable(input); await refresh(); setSuccess('Pagamento registrado e passivo atualizado.'); } catch (reason) { const message = reason instanceof Error ? reason.message : 'Pagamento não realizado'; setError(message); throw new Error(message); } finally { setSaving(false); } }}/></div>}

            {activeTab === 'receitas' && (
              <RecurringIncomePanel accounts={data.accounts} incomes={data.recurringIncomes}
                receivedIds={receivedIncomeIdsThisMonth} onSaved={refresh} />
            )}
          </div>
        </section>}
      </div>

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
                  {formMode === 'ACCOUNT' ? 'Nova conta bancária' : formMode === 'CARD' ? 'Novo cartão de crédito' : formMode === 'PAYABLE' ? 'Nova dívida a pagar' : 'Nova despesa'}
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
                    <label><span className={labelClass}>Banco</span><input required={form.link_credit==='yes'} value={form.bank_name || ''} onChange={(e) => updateField('bank_name', e.target.value)} className={fieldClass} placeholder="Ex: Itaú, Nubank, Bradesco" /></label>
                    <label><span className={labelClass}>Tipo</span><select value={form.account_type || 'CHECKING'} onChange={(e) => updateField('account_type', e.target.value)} className={fieldClass}><option value="CHECKING">Conta corrente</option><option value="SAVINGS">Poupança</option><option value="CASH">Dinheiro</option><option value="INVESTMENT">Investimento</option></select></label>
                    <label><span className={labelClass}>Tipo da chave PIX</span><select value={form.pix_key_type || ''} onChange={(e) => updateField('pix_key_type', e.target.value)} className={fieldClass}><option value="">Sem PIX</option><option value="CPF">CPF</option><option value="EMAIL">E-mail</option><option value="PHONE">Telefone</option><option value="RANDOM">Aleatória</option></select></label>
                    <label><span className={labelClass}>Chave PIX</span><input value={form.pix_key || ''} onChange={(e) => updateField('pix_key', e.target.value)} className={fieldClass} placeholder="Chave para transferências" /></label>
                    <label className="sm:col-span-2 flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 p-3 text-xs text-slate-200"><input type="checkbox" checked={form.link_credit==='yes'} onChange={e=>updateField('link_credit',e.target.checked?'yes':'')}/>Esta conta possui cartão de crédito vinculado?</label>
                    {form.link_credit==='yes'&&<>
                      <label><span className={labelClass}>Apelido do cartão</span><input required className={fieldClass} value={form.linked_card_nickname||''} onChange={e=>updateField('linked_card_nickname',e.target.value)}/></label>
                      <label><span className={labelClass}>Limite do cartão</span><input required type="number" min="0" step="0.01" className={fieldClass} value={form.linked_card_limit||''} onChange={e=>updateField('linked_card_limit',e.target.value)}/></label>
                      <label><span className={labelClass}>Bandeira</span><select className={fieldClass} value={form.linked_card_brand||''} onChange={e=>updateField('linked_card_brand',e.target.value)}><option value="">Não informada</option><option>Mastercard</option><option>Visa</option><option>Elo</option></select></label>
                      <label><span className={labelClass}>Cor do cartão</span><input type="color" className="h-10 w-full cursor-pointer rounded-lg border border-slate-700 bg-slate-950 p-1" value={form.linked_card_primary_color||getBankVisual(form.bank_name||'Nubank').accent} onChange={e=>updateField('linked_card_primary_color',e.target.value)}/></label>
                      <label><span className={labelClass}>Últimos quatro dígitos</span><input maxLength={4} pattern="[0-9]{4}" className={fieldClass} value={form.linked_card_last_four||''} onChange={e=>updateField('linked_card_last_four',e.target.value.replace(/\D/g,'').slice(0,4))}/></label>
                      <label><span className={labelClass}>Fechamento</span><input type="number" min="1" max="31" className={fieldClass} value={form.linked_card_closing||''} onChange={e=>updateField('linked_card_closing',e.target.value)}/></label>
                      <label><span className={labelClass}>Vencimento</span><input type="number" min="1" max="31" className={fieldClass} value={form.linked_card_due||''} onChange={e=>updateField('linked_card_due',e.target.value)}/></label>
                    </>}

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
                    <label><span className={labelClass}>Cor principal</span><input type="color" className="h-10 w-full cursor-pointer rounded-lg border border-slate-700 bg-slate-950 p-1" value={form.primary_color||getBankVisual(form.issuer||'Nubank').accent} onChange={e=>updateField('primary_color',e.target.value)}/></label>
                    <label><span className={labelClass}>Limite disponível</span><input readOnly value={formatMoney(Number(form.credit_limit||0))} className={fieldClass+' opacity-70'}/></label>
                    <label><span className={labelClass}>Emissor / Banco</span><input required value={form.issuer || ''} onChange={(e) => updateField('issuer', e.target.value)} className={fieldClass} placeholder="Ex: Nubank, Inter, Itaú, XP" /></label>
                    <label><span className={labelClass}>Bandeira</span><input value={form.brand || ''} onChange={(e) => updateField('brand', e.target.value)} className={fieldClass} placeholder="Ex: Mastercard, Visa, Elo" /></label>
                    <label className="sm:col-span-2"><span className={labelClass}>Tipo de cartão</span><select className={fieldClass} value={form.link_mode||'none'} onChange={e=>updateField('link_mode',e.target.value)}><option value="none">Avulso — apenas crédito</option><option value="existing">Associar a conta existente</option><option value="new">Criar conta corrente junto com cartão</option></select></label>
                    {form.link_mode==='existing'&&<label className="sm:col-span-2"><span className={labelClass}>Conta vinculada</span><select required className={fieldClass} value={form.account_id||''} onChange={e=>updateField('account_id',e.target.value)}><option value="">Selecione a conta</option>{data.accounts.map(a=><option key={a.id} value={a.id}>{a.nickname}</option>)}</select></label>}
                    {form.link_mode==='new'&&<>
                      <label><span className={labelClass}>Apelido da conta</span><input required className={fieldClass} value={form.new_account_name||''} onChange={e=>updateField('new_account_name',e.target.value)}/></label>
                      <label><span className={labelClass}>Saldo inicial</span><input required type="number" min="0" step="0.01" className={fieldClass} value={form.new_account_balance||''} onChange={e=>updateField('new_account_balance',e.target.value)}/></label>
                      <label><span className={labelClass}>Tipo PIX</span><select className={fieldClass} value={form.new_account_pix_type||''} onChange={e=>updateField('new_account_pix_type',e.target.value)}><option value="">Sem PIX</option><option value="CPF">CPF</option><option value="EMAIL">E-mail</option><option value="PHONE">Telefone</option><option value="RANDOM">Aleatória</option></select></label>
                      <label><span className={labelClass}>Chave PIX</span><input className={fieldClass} value={form.new_account_pix||''} onChange={e=>updateField('new_account_pix',e.target.value)}/></label>
                    </>}
                    <label><span className={labelClass}>Últimos quatro dígitos</span><input maxLength={4} pattern="[0-9]{4}" className={fieldClass} value={form.last_four||''} onChange={e=>updateField('last_four',e.target.value.replace(/\D/g,'').slice(0,4))}/></label>
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

                {formMode === 'PAYABLE' && (<>
                  <label><span className={labelClass}>Credor</span><input required value={form.creditor_name || ''} onChange={e => updateField('creditor_name', e.target.value)} className={fieldClass} placeholder="Pessoa ou empresa" /></label>
                  <label><span className={labelClass}>Tipo</span><select value={form.creditor_type || 'PERSON'} onChange={e => updateField('creditor_type', e.target.value)} className={fieldClass}><option value="PERSON">Pessoa</option><option value="COMPANY">Empresa</option></select></label>
                  <label className="sm:col-span-2"><span className={labelClass}>CPF/CNPJ (opcional)</span><input inputMode="numeric" value={form.creditor_document || ''} onChange={e => updateField('creditor_document', e.target.value.replace(/\D/g, '').slice(0, 14))} className={fieldClass} placeholder="Somente números" /></label>
                  <label className="sm:col-span-2"><span className={labelClass}>Descrição</span><input required value={form.description || ''} onChange={e => updateField('description', e.target.value)} className={fieldClass} placeholder="Ex: empréstimo, fornecedor, serviço" /></label>
                  <label><span className={labelClass}>Valor</span><input required type="number" min="0.01" step="0.01" value={form.amount || ''} onChange={e => updateField('amount', e.target.value)} className={fieldClass} /></label>
                  <label><span className={labelClass}>Vencimento</span><input required type="date" value={form.due_date || ''} onChange={e => updateField('due_date', e.target.value)} className={fieldClass} /></label>
                  <label><span className={labelClass}>Juros (% ao mês)</span><input type="number" min="0" max="100" step="0.01" value={form.interest_rate || ''} onChange={e => updateField('interest_rate', e.target.value)} className={fieldClass} /></label>
                  <label><span className={labelClass}>Multa (%)</span><input type="number" min="0" max="100" step="0.01" value={form.fine_percent || ''} onChange={e => updateField('fine_percent', e.target.value)} className={fieldClass} /></label>
                  <label><span className={labelClass}>Categoria</span><input required value={form.category||'Outros'} onChange={e=>updateField('category',e.target.value)} className={fieldClass}/></label>
                  <label className="sm:col-span-2"><span className={labelClass}>Origem do pagamento</span><select required className={fieldClass} value={form.payment_source||''} onChange={e=>updateField('payment_source',e.target.value)}><option value="">Selecione uma conta ou cartão</option><optgroup label="Contas bancárias">{data.accounts.map(a=><option key={a.id} value={'account:'+a.id}>{a.nickname}</option>)}</optgroup><optgroup label="Cartões de crédito">{data.cards.filter(c=>c.status==='ACTIVE').map(c=><option key={c.id} value={'card:'+c.id}>{c.nickname}</option>)}</optgroup></select></label>
                  <label className="sm:col-span-2"><span className={labelClass}>Observações</span><input value={form.notes || ''} onChange={e => updateField('notes', e.target.value)} className={fieldClass} /></label>
                </>)}
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

      {selectedCardForEdit && <CardEditModal key={selectedCardForEdit.id} card={selectedCardForEdit} accounts={data.accounts}
        onClose={() => setSelectedCardForEdit(null)} onSaved={refresh} />}
      {statementImportOpen && activeStackCard && (
        <WalletStatementImport kind="CARD" targetId={activeStackCard.id} targetName={activeStackCard.nickname}
          onClose={() => setStatementImportOpen(false)} onImported={async () => { await refresh(); setStatementImportOpen(false); }} />
      )}
      {/* Modal de Detalhes e Visualização do Cartão */}
      {selectedCardForDetail && (
        <CardDetailModal
          card={selectedCardForDetail}
          accounts={data.accounts}
          expenses={data.expenses}
          installments={data.installments}
          invoiceDueMonth={invoices.find(invoice => invoice.cardId === selectedCardForDetail.id)?.dueMonth || null}
          statementRows={data.statementRows.filter(row=>row.target_kind==='CARD'&&row.target_id===selectedCardForDetail.id)}
          onImported={refresh}
          onEditExpense={async (input) => {
            await personalWalletService.updateExpense(input);
            const wallet = await personalWalletService.load();
            setData(wallet);
            setSelectedCardForDetail(wallet.cards.find(card => card.id === selectedCardForDetail.id) || null);
            setSuccess('Lançamento atualizado. Fatura e limite recalculados.');
          }}
          onDeleteExpense={async (expenseId) => {
            await personalWalletService.setExpenseStatus(expenseId, 'CANCELED');
            const wallet = await personalWalletService.load();
            setData(wallet);
            setSelectedCardForDetail(wallet.cards.find(card => card.id === selectedCardForDetail.id) || null);
            setSuccess('Lançamento excluído. Fatura e limite recalculados.');
          }}
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
