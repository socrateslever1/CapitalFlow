import { PrivateMoney } from '../../contexts/FinancialPrivacyContext';
import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Archive, ArrowLeftRight, CheckCircle2, Clock3, Copy, QrCode, ReceiptText, ImagePlus, Landmark, Link2, Pencil, Plus, Save, Trash2, MoreHorizontal } from 'lucide-react';
import {
  PersonalWalletAccount,
  PersonalWalletExpense,
  PersonalWalletExpenseInstallment,
  PersonalWalletInvoicePayment,
  PersonalWalletCard,
  WalletAccountOperation,
  WalletStatementRow,
  personalWalletService,
  WalletRecurringIncome,
  WalletRecurringObligation,
  WalletPendingOperation,
} from '../../services/personalWallet.service';
import type { CapitalSource } from '../../types';
import { formatMoney } from '../../utils/formatters';
import { AccountActivityPanel } from './AccountActivityPanel';
import { AccountPendingOperations } from './AccountPendingOperations';
import { CategoryBreakdownPanel } from './CategoryBreakdownPanel';
import { elapsedDaysInPeriod, getAccountCategoryBreakdown } from '../../features/wallet/domain/walletCategoryBreakdown';
import { WalletPixCharge } from './WalletPixCharge';
import { BankLogo } from './BankLogo';
import { BANK_CATALOG } from '../../utils/bankLogoRegistry';
import { pixKeyTypeLabel } from './walletPresentation';
import { AccountMovementModal } from './AccountMovementModal';
import QuickExpenseModal from '../../features/wallet/components/QuickExpenseModal';
import { BankAccountDetailsFields } from './BankAccountDetailsFields';
import { bankDetailsDraft, normalizeBankDetails } from '../../features/wallet/domain/bankAccountDetails';
import { getCapitalLinkState, getEligibleAccountCapitalSources } from '../../features/wallet/domain/capitalLink';
import { calculateBalanceAdjustment, resolveQuickDateShortcuts } from '../../features/wallet/utils/minhasFinancasWalletTools';
import { formatWalletMoneyInput, parseWalletMoney } from '../../features/wallet/utils/parseWalletMoney';
import { resolveLiveBrazilianCentsChange } from '../../features/wallet/utils/liveBrazilianMoneyInput';
import { generateUUID } from '../../utils/generators';
import { Modal, modalPrimaryActionClass } from '../ui/Modal';
import { describeWalletBalanceFact, buildWalletBalanceFacts } from './walletBalanceDomain';
import { RecurringIncomePanel } from './RecurringIncomePanel';
import { RecurringObligationsPanel } from './RecurringObligationsPanel';
import { businessDateInManaus } from '../../utils/businessDate';
import { CapitalSourceTransferModal } from '../../features/wallet/components/CapitalSourceTransferModal';
import { getMovableCapitalTotal } from '../../features/wallet/domain/capitalSourceTransfer';

type Props = {
  account: PersonalWalletAccount;
  expenses: PersonalWalletExpense[];
  installments: PersonalWalletExpenseInstallment[];
  cards: PersonalWalletCard[];
  invoicePayments: PersonalWalletInvoicePayment[];
  accounts: PersonalWalletAccount[];
  accountOperations: WalletAccountOperation[];
  statementRows: WalletStatementRow[];
  cardFundedLoanIds?: readonly string[];
  recurringIncomes: WalletRecurringIncome[];
  recurringReceipts: { income_id: string; reference_month: string }[];
  recurringObligations: WalletRecurringObligation[];
  pendingOperations?: WalletPendingOperation[];
  onBack: () => void;
  onSaved: () => Promise<void>;
  ownerName?: string;
  ownerCity?: string;
  capitalSources: CapitalSource[];
  canTransferCapital?: boolean;
  profileId?: string;
  onCreateAccount?: () => void;
};

const typeLabels: Record<string, string> = {
  CHECKING: 'Conta corrente',
  PAYMENT: 'Conta de pagamento',
  SAVINGS: 'Poupança',
  CASH: 'Carteira física',
  INVESTMENT: 'Investimento',
};
const inputClass = 'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500';
const labelClass = 'block space-y-1 text-xs font-semibold text-slate-300';

export const AccountDetailsPage: React.FC<Props> = ({ account, accounts, cards, expenses, installments, invoicePayments, accountOperations, statementRows, cardFundedLoanIds, recurringIncomes, recurringReceipts, recurringObligations, pendingOperations = [], onBack, onSaved, ownerName, ownerCity, capitalSources, canTransferCapital = false, profileId, onCreateAccount }) => {
  const [editing, setEditing] = useState(false);
  const [showMoreActions, setShowMoreActions] = useState(false);
  const [capitalTransferOpen, setCapitalTransferOpen] = useState(false);
  const [bankDetails,setBankDetails]=useState(()=>bankDetailsDraft(account.bank_details));
  // Cartões já cadastrados desta conta (vínculo direto ou mesmo banco sem conta definida):
  // o limite real é o do cartão, então a edição não pergunta de novo se a conta tem cartão.
  const linkedCards = cards.filter(card => card.account_id === account.id
    || (!card.account_id && !!account.institution_key && card.institution_key === account.institution_key));
  const [pixChargeOpen, setPixChargeOpen] = useState(false);
  const [pixCopied, setPixCopied] = useState(false);
  const [movementOpen, setMovementOpen] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [adjustBalanceOpen, setAdjustBalanceOpen] = useState(false);
  const [realBalanceInput, setRealBalanceInput] = useState(() => formatWalletMoneyInput(String(Number(account.balance || 0))));
  const [adjustDescription, setAdjustDescription] = useState('Reajuste de saldo bancário');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [form, setForm] = useState({
    nickname: account.nickname,
    bank_name: account.bank_name || '',
    account_type: account.account_type,
    pix_key_type: account.pix_key_type || '',
    pix_key: account.pix_key || '',
    notes: account.notes || '',
    capital_source_id: account.capital_source_id || '',
  });

  const capitalLinkState = useMemo(
    () => getCapitalLinkState(account, capitalSources),
    [account, capitalSources],
  );
  const eligibleSources = useMemo(
    () => getEligibleAccountCapitalSources(account, accounts, capitalSources),
    [account, accounts, capitalSources],
  );
  const capitalMovable = useMemo(
    () => getMovableCapitalTotal(capitalSources, accounts),
    [capitalSources, accounts],
  );
  const loanLimitAvailable = account.bank_details?.has_loans && account.bank_details?.loan_balance !== undefined
    ? Number(account.bank_details.loan_balance)
    : null;

  const accountBalanceFacts = useMemo(
    () => buildWalletBalanceFacts({
      effectiveBalance: Number(account.balance || 0),
      reconciledBalance: Number(account.balance || 0),
    }),
    [account.balance],
  );

  useEffect(() => () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
  }, [imagePreview]);

  const reset = () => {
    setBankDetails(bankDetailsDraft(account.bank_details));
    setForm({
      nickname: account.nickname,
      bank_name: account.bank_name || '',
      account_type: account.account_type,
      pix_key_type: account.pix_key_type || '',
      pix_key: account.pix_key || '',
      notes: account.notes || '',
      capital_source_id: account.capital_source_id || '',
    });
    setImage(null);
    setImagePreview('');
    setError('');
    setEditing(false);
  };

  const update = (field: keyof typeof form, value: string) => setForm(current => ({ ...current, [field]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await personalWalletService.updateAccount(account.id, {
        nickname: form.nickname,
        bank_name: form.bank_name || null,
        account_type: form.account_type,
        pix_key_type: form.pix_key_type || null,
        pix_key: form.pix_key || null,
        notes: form.notes || null,
        capital_source_id: form.capital_source_id || null,
        bank_details:normalizeBankDetails(linkedCards.length ? {...bankDetails,has_credit_card:false,credit_card_limit:''} : bankDetails),
      }, image);
      setImage(null);
      setImagePreview('');
      await onSaved();
      setEditing(false);
      setSuccess('Dados da conta atualizados. O saldo permaneceu inalterado.');
    } catch (err: any) {
      setError(err?.message || 'Não foi possível atualizar a conta.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (deleting) return;
    setDeleting(true);
    setError('');
    try {
      await personalWalletService.deleteAccount(account.id);
      setDeleteConfirm(false);
      await onSaved();
      onBack();
    } catch (err: any) {
      setError(err?.message || 'Não foi possível excluir a conta.');
    } finally {
      setDeleting(false);
    }
  };

  const archive = async () => {
    if (archiving) return;
    setArchiving(true);
    setError('');
    try {
      await personalWalletService.archiveAccount(account.id);
      setArchiveConfirm(false);
      await onSaved();
      onBack();
    } catch (err: any) {
      setError(err?.message || 'Não foi possível arquivar a conta.');
    } finally {
      setArchiving(false);
    }
  };

  const parsedRealBalance = useMemo(() => {
    try {
      return parseWalletMoney(realBalanceInput);
    } catch {
      return Number.NaN;
    }
  }, [realBalanceInput]);

  const balanceAdjustmentPreview = useMemo(
    () => calculateBalanceAdjustment(Number(account.balance || 0), Number.isFinite(parsedRealBalance) ? parsedRealBalance : Number(account.balance || 0)),
    [account.balance, parsedRealBalance],
  );

  const submitBalanceAdjustment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (!Number.isFinite(parsedRealBalance) || parsedRealBalance < 0) {
      setError('Informe um saldo real válido (zero ou positivo).');
      return;
    }
    if (balanceAdjustmentPreview.kind === 'NONE' || !balanceAdjustmentPreview.accountOperationType) {
      setAdjustBalanceOpen(false);
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await personalWalletService.recordAccountOperation({
        type: balanceAdjustmentPreview.accountOperationType,
        fromAccountId: balanceAdjustmentPreview.kind === 'DECREASE' ? account.id : null,
        toAccountId: balanceAdjustmentPreview.kind === 'INCREASE' ? account.id : null,
        amount: balanceAdjustmentPreview.absDelta,
        description: adjustDescription.trim() || 'Reajuste de saldo bancário',
        category: 'Ajuste de Saldo',
        date: resolveQuickDateShortcuts().today,
        requestId: generateUUID(),
      });
      await onSaved();
      setAdjustBalanceOpen(false);
      setSuccess(`Saldo reajustado com sucesso (${balanceAdjustmentPreview.accountEntryLabel}: ${formatMoney(balanceAdjustmentPreview.absDelta)}).`);
    } catch (err: any) {
      setError(err?.message || 'Não foi possível reajustar o saldo da conta.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mx-auto max-w-4xl space-y-4 pb-32 sm:pb-16 animate-in fade-in">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={() => setExpenseOpen(true)}
            className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-rose-600 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-rose-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300">
            <ReceiptText size={14}/> <span><span className="sr-only sm:not-sr-only">Registrar </span><span className="capitalize sm:normal-case">despesa</span></span>
          </button>
          <button type="button" onClick={() => setMovementOpen(true)}
            className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-500">
            <ArrowLeftRight size={14}/> Movimentar
          </button>
          <button type="button" onClick={() => setPendingOpen(true)}
            className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-950/20 px-2.5 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-900/30">
            <Clock3 size={14}/> Pendente
          </button>
          <button type="button" aria-label={showMoreActions ? 'Ocultar opções' : 'Mais opções'} aria-expanded={showMoreActions} onClick={() => setShowMoreActions(value => !value)}
            className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-slate-300 sm:hidden">
            <MoreHorizontal size={16} aria-hidden="true"/>
          </button>
          <div className={`${showMoreActions ? 'flex w-full flex-wrap' : 'hidden'} gap-1.5 sm:flex sm:w-auto sm:flex-wrap`}>
          <button type="button" onClick={() => {
            setRealBalanceInput(formatWalletMoneyInput(String(Number(account.balance || 0))));
            setAdjustDescription('Reajuste de saldo bancário');
            setAdjustBalanceOpen(true);
          }}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-950/25 px-2.5 py-1.5 text-xs font-bold text-cyan-200 hover:bg-cyan-900/35">
            Reajustar saldo
          </button>
          <button type="button" onClick={() => { setEditing(true); setError(''); setSuccess(''); }}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-800">
            <Pencil size={14} /> Editar conta
          </button>
          <button type="button" onClick={() => { setArchiveConfirm(true); setDeleteConfirm(false); setError(''); }}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-950/20 px-2.5 py-1.5 text-xs font-bold text-amber-200 hover:bg-amber-900/30">
            <Archive size={14} /> Arquivar conta
          </button>
          <button type="button" onClick={() => { setDeleteConfirm(true); setArchiveConfirm(false); setError(''); }}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-950/20 px-2.5 py-1.5 text-xs font-bold text-rose-300 hover:bg-rose-900/30">
            <Trash2 size={14} /> Excluir conta
          </button>
          {canTransferCapital && profileId && (
            <button type="button" onClick={() => setCapitalTransferOpen(true)}
              title={capitalMovable <= 0 ? 'Nenhuma fonte do Capital com saldo disponível no momento' : 'Transferir saldo do Capital para esta conta'}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-950/25 px-2.5 py-1.5 text-xs font-bold text-blue-200 hover:bg-blue-900/35">
              <ArrowLeftRight size={14} /> Transferir do Capital
            </button>
          )}
          {onCreateAccount && (
            <button type="button" onClick={onCreateAccount}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-950/25 px-2.5 py-1.5 text-xs font-bold text-blue-200 hover:bg-blue-900/35">
              <Plus size={14} /> Nova conta
            </button>
          )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-3 sm:p-4">
        <div className="flex items-center gap-3">
          <BankLogo name={account.bank_name} alternateName={account.nickname} customImage={account.image_url} />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-400">{account.account_type === 'CASH' ? 'Carteira física' : 'Conta bancária'}</p>
            <h1 className="truncate text-lg font-bold text-white">{account.nickname}</h1>
            <p className="truncate text-xs text-slate-400">{account.bank_name || (account.account_type === 'CASH' ? 'Dinheiro em espécie' : 'Banco não informado')} · {typeLabels[account.account_type] || account.account_type}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[10px] uppercase tracking-wide text-slate-400">Saldo</p>
            <p className="whitespace-nowrap text-lg font-extrabold tabular-nums text-emerald-400"><PrivateMoney value={formatMoney(Number(account.balance))} /></p>
          </div>
        </div>
        {(capitalLinkState.status !== 'unlinked' || loanLimitAvailable !== null) && (
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {capitalLinkState.status === 'linked' && capitalLinkState.source && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-950/30 px-2.5 py-0.5 text-[11px] font-semibold text-blue-200">
                <Link2 size={12} /> Fonte Capital: {capitalLinkState.source.name} · Sincronizada
              </span>
            )}
            {(capitalLinkState.status === 'divergent' || capitalLinkState.status === 'unavailable') && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-950/30 px-2.5 py-0.5 text-[11px] font-semibold text-rose-200">
                <AlertCircle size={12} /> {capitalLinkState.status === 'unavailable' ? 'Fonte Capital indisponível' : `Fonte Capital (${capitalLinkState.source?.name}) com saldo divergente`}
              </span>
            )}
            {loanLimitAvailable !== null && loanLimitAvailable > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-950/25 px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-cyan-200">
                Limite de empréstimo disponível: <PrivateMoney value={formatMoney(loanLimitAvailable)} />
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-950 px-2.5 py-0.5 text-[11px] font-semibold text-slate-300">
              Saldo: {describeWalletBalanceFact(accountBalanceFacts.effective)}
            </span>
          </div>
        )}
        <div className="mt-3 flex flex-col gap-2 border-t border-slate-800 pt-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 text-[10px] font-bold text-slate-400">PIX {pixKeyTypeLabel(account.pix_key_type)}</span>
            <span className="min-w-0 flex-1 truncate text-xs text-slate-200">{account.pix_key || 'Chave não cadastrada'}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={!account.pix_key} onClick={async()=>{
              try {await navigator.clipboard.writeText(account.pix_key || '');setPixCopied(true);setError('');}
              catch {setError('Não foi possível copiar a chave PIX neste navegador.');}
            }} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-xs font-semibold text-slate-200 disabled:opacity-40">
              {pixCopied?<CheckCircle2 size={15}/>:<Copy size={15}/>} {pixCopied?'PIX copiado':'Copiar PIX'}
            </button>
            <button type="button" disabled={!account.pix_key} onClick={()=>setPixChargeOpen(true)}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-40">
              <QrCode size={16}/> Gerar cobrança
            </button>
          </div>
          {account.notes && <p className="truncate text-[11px] text-slate-400" title={account.notes}>{account.notes}</p>}
        </div>
      </div>
      {pixChargeOpen && account.pix_key && <WalletPixCharge accounts={accounts} initialAccountId={account.id} recipient={ownerName || account.nickname} city={ownerCity} onClose={()=>setPixChargeOpen(false)} onSaved={onSaved} />}
      {movementOpen && <AccountMovementModal accounts={accounts} cards={cards} expenses={expenses} installments={installments}
        initialAccountId={account.id} onClose={()=>setMovementOpen(false)} onSaved={onSaved}/>}
      {expenseOpen && <QuickExpenseModal accounts={accounts} cards={cards} initialMode="ACCOUNT" initialAccountId={account.id}
        onClose={() => setExpenseOpen(false)} onSaved={onSaved}/>}
      {capitalTransferOpen && profileId && <CapitalSourceTransferModal
        profileId={profileId}
        sources={capitalSources}
        accounts={accounts}
        onClose={() => setCapitalTransferOpen(false)}
        onSaved={onSaved}
      />}
      {adjustBalanceOpen && (
        <Modal
          variant="wallet"
          compact
          title="Reajustar saldo da conta"
          subtitle={account.nickname}
          icon={<Landmark size={17} />}
          busy={saving}
          onClose={() => !saving && setAdjustBalanceOpen(false)}
          footer={
            <button
              type="submit"
              form="adjust-account-balance-form"
              disabled={saving || balanceAdjustmentPreview.kind === 'NONE'}
              className={modalPrimaryActionClass}
            >
              {saving ? 'Ajustando...' : 'Aplicar reajuste no extrato'}
            </button>
          }
        >
          <form id="adjust-account-balance-form" onSubmit={submitBalanceAdjustment} className="space-y-3">
            <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-800 bg-slate-950/80 p-3 text-xs">
              <div>
                <span className="block text-[10px] uppercase text-slate-400">Saldo atual no app</span>
                <strong className="text-sm text-white"><PrivateMoney value={formatMoney(Number(account.balance || 0))} /></strong>
              </div>
              <div>
                <span className="block text-[10px] uppercase text-slate-400">Ajuste calculado</span>
                <strong
                  className={`text-sm ${
                    balanceAdjustmentPreview.kind === 'INCREASE'
                      ? 'text-emerald-300'
                      : balanceAdjustmentPreview.kind === 'DECREASE'
                        ? 'text-rose-300'
                        : 'text-slate-400'
                  }`}
                >
                  {balanceAdjustmentPreview.kind === 'NONE'
                    ? 'Sem diferença'
                    : `${balanceAdjustmentPreview.kind === 'INCREASE' ? '+' : '-'} ${formatMoney(balanceAdjustmentPreview.absDelta)}`}
                </strong>
              </div>
            </div>
            <label className={labelClass}>
              Saldo real no banco (R$)
              <input
                required
                inputMode="decimal"
                className={inputClass}
                value={realBalanceInput}
                onChange={e => {const next=resolveLiveBrazilianCentsChange(e.currentTarget.value,realBalanceInput,(e.nativeEvent as InputEvent).inputType);if(next)setRealBalanceInput(next.value);}}
                onBlur={e => {
                  try {
                    setRealBalanceInput(formatWalletMoneyInput(e.target.value));
                  } catch {
                    // ignore invalid format
                  }
                }}
                placeholder="0,00"
              />
            </label>
            <label className={labelClass}>
              Descrição do lançamento de ajuste
              <input
                maxLength={160}
                className={inputClass}
                value={adjustDescription}
                onChange={e => setAdjustDescription(e.target.value)}
                placeholder="Reajuste de saldo bancário"
              />
            </label>
            <p className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-[11px] leading-relaxed text-slate-400">
              O ajuste cria uma movimentação rastreável ({balanceAdjustmentPreview.accountEntryLabel.toLowerCase()}) pela diferença exata entre o saldo atual e o saldo real informado, sem apagar o histórico da conta.
            </p>
          </form>
        </Modal>
      )}

      {success && <div role="status" className="flex items-center gap-2 rounded-lg border border-emerald-800 bg-emerald-950/30 p-3 text-xs text-emerald-200"><CheckCircle2 size={16} />{success}</div>}
      {error && !editing && !archiveConfirm && !deleteConfirm && !adjustBalanceOpen && <div role="alert" className="rounded-lg border border-rose-700 bg-rose-950/30 p-3 text-xs text-rose-200">{error}</div>}
      {archiveConfirm && (
        <Modal
          variant="wallet"
          compact
          title={`Arquivar ${account.nickname}?`}
          subtitle="Histórico preservado"
          icon={<Archive size={17} />}
          busy={archiving}
          onClose={() => { if (!archiving) { setArchiveConfirm(false); setError(''); } }}
          footer={
            <button
              type="button"
              onClick={() => { void archive(); }}
              disabled={archiving}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-xs font-black uppercase text-white hover:bg-amber-500 focus-visible:outline-2 focus-visible:outline-amber-400 disabled:opacity-50"
            >
              {archiving ? 'Arquivando...' : 'Arquivar conta'}
            </button>
          }
        >
          <div role="alertdialog" aria-label="Confirmar arquivamento da conta" className="space-y-3 text-xs text-amber-100">
            <p className="leading-relaxed text-amber-200/90">A conta sairá da carteira ativa, mas seu histórico será preservado. O saldo precisa estar zerado.</p>
            {error && <div role="alert" className="rounded-lg border border-rose-700 bg-rose-950/30 p-3 text-xs text-rose-200">{error}</div>}
          </div>
        </Modal>
      )}

      {deleteConfirm && (
        <Modal
          variant="wallet"
          compact
          title="Excluir esta conta?"
          subtitle={account.nickname}
          icon={<Trash2 size={17} />}
          busy={deleting}
          onClose={() => { if (!deleting) { setDeleteConfirm(false); setError(''); } }}
          footer={
            <button
              type="button"
              onClick={() => { void remove(); }}
              disabled={deleting}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-xs font-black uppercase text-white hover:bg-rose-500 focus-visible:outline-2 focus-visible:outline-rose-400 disabled:opacity-50"
            >
              {deleting ? 'Excluindo...' : 'Excluir definitivamente'}
            </button>
          }
        >
          <div role="alertdialog" aria-label="Confirmar exclusão da conta" className="space-y-3 text-xs text-rose-100">
            <p className="leading-relaxed text-rose-200/90">A exclusão é permanente e só será permitida se a conta estiver zerada e sem movimentações ou vínculos.</p>
            {error && <div role="alert" className="rounded-lg border border-rose-700 bg-rose-950/30 p-3 text-xs text-rose-200">{error}</div>}
          </div>
        </Modal>
      )}

      {/* Titular, documento e dados bancários ficam em Editar conta: a área de trabalho mostra só o que é usado no dia a dia. */}
      {editing && (
        <Modal
          variant="wallet"
          size="lg"
          title="Editar dados da conta"
          subtitle={account.nickname}
          icon={<Pencil size={17} />}
          busy={saving}
          onClose={reset}
          footer={
            <button
              type="submit"
              form="account-edit-form"
              disabled={saving}
              className={modalPrimaryActionClass}
            >
              <Save size={14} /> {saving ? 'Salvando...' : 'Salvar alterações'}
            </button>
          }
        >
        <form id="account-edit-form" onSubmit={submit} className="space-y-4">
          {error && <div role="alert" className="rounded-lg border border-rose-700 bg-rose-950/30 p-3 text-xs text-rose-200">{error}</div>}
          <datalist id="account-bank-catalog">{BANK_CATALOG.map(bank => <option key={bank.id} value={bank.name}/>)}</datalist>
          <div className="flex items-center gap-2 rounded-lg border border-slate-800 p-2 text-xs text-slate-400">
            <BankLogo name={form.bank_name} alternateName={form.nickname} size="sm"/>
            Logo local automático quando disponível; a imagem personalizada tem prioridade.
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={labelClass}>Apelido
              <input required maxLength={120} className={inputClass} value={form.nickname} onChange={e => update('nickname', e.target.value)} />
            </label>
            <label className={labelClass}>Banco
              <input list="account-bank-catalog" maxLength={120} className={inputClass} value={form.bank_name} onChange={e => update('bank_name', e.target.value)} />
            </label>
            <label className={labelClass}>Tipo de conta
              <select className={inputClass} value={form.account_type} onChange={e => update('account_type', e.target.value)}>
                <option value="CHECKING">Conta corrente</option>
                <option value="PAYMENT">Conta de pagamento</option>
                <option value="SAVINGS">Poupança</option>
                <option value="CASH">Carteira física</option>
                <option value="INVESTMENT">Investimento</option>
              </select>
            </label>
            <label className={labelClass}>Tipo da chave PIX
              <select className={inputClass} value={form.pix_key_type} onChange={e => {
                update('pix_key_type', e.target.value);
              }}>
                <option value="">Sem PIX</option>
                <option value="CPF">CPF</option>
                <option value="CNPJ">CNPJ</option>
                <option value="EMAIL">E-mail</option>
                <option value="PHONE">Telefone</option>
                <option value="RANDOM">Aleatória</option>
              </select>
            </label>
            <label className={labelClass}>Chave PIX
              <input className={inputClass} maxLength={255} value={form.pix_key} onChange={e => update('pix_key', e.target.value)} />
            </label>
            <label className={labelClass}>Logotipo ou imagem
              <span className="flex items-center gap-2 rounded-lg border border-dashed border-slate-700 p-2">
                <ImagePlus size={18} className="text-slate-400" />
                <span className="truncate text-xs text-slate-400">{image?.name || 'Escolher imagem (JPEG/PNG/WebP)'}</span>
                <input className="max-w-[5rem] text-xs" type="file" accept="image/jpeg,image/png,image/webp" onChange={e => {
                  const file = e.target.files?.[0] || null;
                  setImage(file);
                  setImagePreview(file ? URL.createObjectURL(file) : '');
                }} />
              </span>
              {imagePreview && <img src={imagePreview} alt="Prévia da nova imagem" className="mt-2 h-14 w-14 rounded-lg object-cover" />}
            </label>
            <label className={`${labelClass} sm:col-span-2`}>Observações
              <textarea className={inputClass} rows={3} maxLength={2000} value={form.notes} onChange={e => update('notes', e.target.value)} />
            </label>
            <label className={`${labelClass} sm:col-span-2`}>Fonte de capital vinculada (opcional)
              <select className={inputClass} value={form.capital_source_id} onChange={e => update('capital_source_id', e.target.value)}>
                <option value="">Nenhuma conta de origem vinculada</option>
                {eligibleSources.map(source => (
                  <option key={source.id} value={source.id}>
                    {source.name} · <PrivateMoney value={formatMoney(Number(source.balance || 0))} />
                    {Math.round(Number(source.balance || 0) * 100) !== Math.round(Number(account.balance || 0) * 100) ? ' (saldos divergentes)' : ''}
                  </option>
                ))}
              </select>
              <span className="text-[11px] font-normal text-slate-400">
                Apenas fontes disponíveis e com o mesmo saldo (<PrivateMoney value={formatMoney(Number(account.balance || 0))} />) podem ser vinculadas.
              </span>
            </label>
          </div>
          {form.account_type!=='CASH'&&linkedCards.length>0&&<div className="rounded-xl border border-slate-800 bg-slate-800/30 p-3">
            <p className="text-sm font-semibold text-slate-200">{linkedCards.length>1?'Cartões vinculados a esta conta':'Cartão vinculado a esta conta'}</p>
            <ul className="mt-2 space-y-1.5">{linkedCards.map(card=><li key={card.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-slate-300">{card.nickname}{card.last_four?` · final ${card.last_four}`:''}</span>
              <span className="shrink-0 tabular-nums text-slate-200">Limite <PrivateMoney value={formatMoney(Number(card.credit_limit||0))}/></span>
            </li>)}</ul>
            <p className="mt-2 text-xs text-slate-400">O limite usado nas contas é o do cartão. Para mudar, edite o cartão em Cartões.</p>
          </div>}
          {form.account_type!=='CASH'&&<BankAccountDetailsFields value={bankDetails} onChange={setBankDetails} showCreditCard={!linkedCards.length}/>}
        </form>
        </Modal>
      )}

      {(() => {
        // Despesas do mês que saíram desta conta, por categoria (anel = participação no total).
        const today = businessDateInManaus();
        const month = today.slice(0, 7);
        const breakdown = getAccountCategoryBreakdown(account.id, month, accountOperations);
        return breakdown.slices.length ? <CategoryBreakdownPanel title="Despesas do mês por categoria" breakdown={breakdown} layout="list"
          elapsedDays={elapsedDaysInPeriod(month + '-01', month + '-31', today)}
          note="O anel mostra a fatia de cada categoria nas despesas do mês desta conta. Transferências e pagamentos de fatura não entram." /> : null;
      })()}

      <AccountPendingOperations accountId={account.id} pending={pendingOperations} onSaved={onSaved}
        createOpen={pendingOpen} onCloseCreate={() => setPendingOpen(false)} />

      <AccountActivityPanel account={account} accounts={accounts}
        operations={accountOperations} statementRows={statementRows}
        expenses={expenses} invoicePayments={invoicePayments} cardFundedLoanIds={cardFundedLoanIds} onSaved={onSaved} />

      <section className="grid gap-4 lg:grid-cols-2" aria-label="Lançamentos fixos desta conta">
        <RecurringIncomePanel
          accounts={[account]}
          incomes={recurringIncomes.filter(item => item.destination_account_id === account.id)}
          receivedIds={new Set(recurringReceipts
            .filter(receipt => String(receipt.reference_month).slice(0, 7) === businessDateInManaus().slice(0, 7))
            .map(receipt => receipt.income_id))}
          onSaved={onSaved}
        />
        <RecurringObligationsPanel
          accounts={[account]}
          cards={[]}
          items={recurringObligations.filter(item => item.origin_type === 'ACCOUNT' && item.origin_account_id === account.id)}
          showCreateButton
          onSaved={onSaved}
        />
      </section>
    </section>
  );
};
