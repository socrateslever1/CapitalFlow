import React, { useMemo, useRef, useState } from 'react';
import { localDiagnostics } from '../../../services/localDiagnostics';
import { ArrowDownToLine, Building2, HandCoins, Landmark, ShieldCheck } from 'lucide-react';
import { Modal, modalPrimaryActionClass } from '../../../components/ui/Modal';
import { useWalletSnapshot } from '../hooks/useWalletSnapshot';
import { personalWalletService } from '../../../services/personalWallet.service';
import { openContractInstallments, prepareManualIncome, resolveClientReceipt } from '../domain/quickReceipt';
import { generateUUID } from '../../../utils/generators';
import { calculateTotalDue } from '../../../domain/finance/calculations';
import { formatMoney } from '../../../utils/formatters';
import { useFinancialPrivacy } from '../../../contexts/FinancialPrivacyContext';
import { useModal } from '../../../contexts/ModalContext';
import { FinancialCalculatorInput } from '../../../components/forms/FinancialCalculatorInput';
import { SelectOptionList } from '../../../components/ui/SelectOptionList';
import { notifyFinancialDataChanged } from '../../../utils/appSyncEvents';
import { businessDateInManaus } from '../../../utils/businessDate';

type ReceiveMode = 'COMMON' | 'CLIENT';
type Props = { onClose: () => void };
const inputClass = 'mt-1 w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-blue-500';
const labelClass = 'block min-w-0 text-xs font-semibold text-slate-300';
const today = () => businessDateInManaus();

const OrdinaryReceipt: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const privacyHidden = useFinancialPrivacy();
  const { data, loading, error: loadError, refresh } = useWalletSnapshot();
  const [accountId, setAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Outras receitas');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(generateUUID());
  const accounts = data?.accounts ?? [];
  const selectedAccount = accounts.find(account => account.id === (accountId || accounts[0]?.id));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    try {
      const operation = prepareManualIncome({
        accountId: selectedAccount?.id || '',
        permittedAccountIds: accounts.map(account => account.id),
        amount, date, description, category,
        requestId: requestId.current,
      }, today());
      setError('');
      setSaving(true);
      await personalWalletService.recordAccountOperation(operation);
      notifyFinancialDataChanged({ wallet: true, capital: Boolean(selectedAccount?.capital_source_id) });
      try { await refresh(); } catch { /* The operation already committed; avoid retrying it. */ }
      onClose();
    } catch (cause) {
      localDiagnostics.record('interface', cause);
      setError(cause instanceof Error ? cause.message : 'Não foi possível registrar o recebimento.');
      // Preserve request ID on failure; retries must be idempotent.
    } finally { setSaving(false); }
  };
  if (loading && !data) return <p role="status" className="rounded-xl bg-slate-950 p-4 text-sm text-slate-300">Carregando contas...</p>;
  if (loadError && !data) return <div role="alert" className="rounded-xl border border-rose-800/50 p-4 text-sm text-rose-200">{loadError}
    <button type="button" onClick={() => void refresh()} className="ml-2 underline">Tentar novamente</button>
  </div>;
  if (!accounts.length) return <p role="status" className="rounded-xl border border-amber-800/40 p-4 text-sm text-amber-200">
    Cadastre uma conta ou carteira física antes de registrar uma entrada.
  </p>;
  return <form id="wallet-quick-income-form" onSubmit={submit} className="space-y-4">
    <p className="text-xs leading-relaxed text-slate-300">Registre dinheiro que já entrou em uma conta. Esta operação não cobra clientes nem movimenta o banco de verdade.</p>
    <div className={labelClass}>
      <span className="block">Conta que recebeu o valor</span>
      <SelectOptionList
        ariaLabel="Conta que recebeu o valor"
        value={selectedAccount?.id || ''}
        placeholder="Selecione a conta"
        disabled={saving}
        options={accounts.map((account) => ({
          value: account.id,
          label: account.nickname,
          rightValue: formatMoney(Number(account.balance || 0), privacyHidden),
        }))}
        onChange={setAccountId}
      />
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className={labelClass}>Valor recebido (R$)
        <FinancialCalculatorInput required autoComplete="off" placeholder="Ex.: 250,50"
          className={inputClass} value={amount} fieldLabel="valor recebido" onCommit={setAmount} disabled={saving}/>
      </label>
      <label className={labelClass}>Data do recebimento
        <input required type="date" max={today()} className={inputClass} value={date}
          onChange={e => setDate(e.target.value)} disabled={saving}/>
      </label>
    </div>
    <div className={labelClass}>
      <span className="block">Origem da receita</span>
      <SelectOptionList
        ariaLabel="Origem da receita"
        value={category}
        disabled={saving}
        options={['Outras receitas', 'Salário', 'Venda', 'Serviços', 'Presente', 'Reembolso', 'Rendimentos'].map((item) => ({
          value: item,
          label: item,
        }))}
        onChange={setCategory}
      />
    </div>
    <label className={labelClass}>Descrição
      <input required maxLength={240} className={inputClass} value={description}
        onChange={e => setDescription(e.target.value)} placeholder="Ex.: Pagamento de serviço" disabled={saving}/>
    </label>
    {selectedAccount?.capital_source_id && <p className="rounded-lg border border-blue-800/40 bg-blue-950/20 px-3 py-2 text-xs text-blue-200">
      Conta vinculada ao CapitalFlow. O espelhamento seguirá a integração financeira existente, sem lançar uma segunda entrada.
    </p>}
    {error && <p role="alert" className="rounded-lg border border-rose-800/40 bg-rose-950/30 p-3 text-xs text-rose-200">{error}</p>}
    <button type="submit" disabled={saving} className={modalPrimaryActionClass}>
      <ArrowDownToLine size={17}/>{saving ? 'Registrando...' : 'Confirmar entrada na conta'}
    </button>
  </form>;
};

const ClientReceipt: React.FC<{ onOpenPayment: () => void }> = ({ onOpenPayment }) => {
  const privacyHidden = useFinancialPrivacy();
  const { clients, loans, ui, openModal, isLoadingData } = useModal();
  const [clientId, setClientId] = useState('');
  const [loanId, setLoanId] = useState('');
  const [installmentId, setInstallmentId] = useState('');
  const [error, setError] = useState('');
  const availableClients = useMemo(() => clients
    .filter(client => loans.some(loan => loan.clientId === client.id && !loan.isArchived))
    .sort((a,b) => a.name.localeCompare(b.name,'pt-BR')), [clients,loans]);
  const selectedLoans = useMemo(() => loans
    .filter(loan => loan.clientId === clientId && !loan.isArchived), [loans,clientId]);
  const selectedLoan = selectedLoans.find(loan => loan.id === loanId);
  const hasAgreement = Boolean(selectedLoan?.activeAgreement &&
    ['ACTIVE','ATIVO'].includes(String(selectedLoan.activeAgreement.status).toUpperCase()));
  const installments = selectedLoan && !hasAgreement ? openContractInstallments(selectedLoan) : [];
  const selected = resolveClientReceipt(clients, loans, clientId, loanId, installmentId);
  const open = () => {
    if (!selected) { setError('Escolha um cliente, um contrato e uma parcela pendente.'); return; }
    if (isLoadingData) { setError('A atualização dos contratos ainda não terminou.'); return; }
    let calculations: ReturnType<typeof calculateTotalDue>;
    try { calculations = calculateTotalDue(selected.loan, selected.inst); }
    catch { setError('Não foi possível calcular esta parcela. Confira no painel de contratos.'); return; }
    if (!Number.isFinite(calculations.total) || calculations.total <= 0) {
      setError('Não há saldo positivo a receber nesta parcela. Confira o contrato.'); return;
    }
    // Only the established PaymentManagerModal/PaymentEngine handles loan settlement.
    ui.setPaymentType('FULL');
    ui.setAvAmount(calculations.total.toFixed(2));
    ui.setPaymentModal({ loan: selected.loan, inst: selected.inst, calculations });
    onOpenPayment();
    openModal('PAYMENT');
  };
  return <div className="space-y-4">
    <p className="text-xs leading-relaxed text-slate-300">O pagamento do contrato será processado pelo motor financeiro do CapitalFlow, com as opções originais de pagamento integral, parcial e encargos.</p>
    <div className={labelClass}>
      <span className="block">Cliente</span>
      <SelectOptionList
        ariaLabel="Cliente"
        value={clientId}
        placeholder="Selecione um cliente"
        options={availableClients.map((client) => ({ value: client.id, label: client.name }))}
        onChange={(next) => { setClientId(next); setLoanId(''); setInstallmentId(''); setError(''); }}
      />
    </div>
    <div className={labelClass}>
      <span className="block">Contrato</span>
      <SelectOptionList
        ariaLabel="Contrato"
        value={loanId}
        disabled={!clientId}
        placeholder="Selecione o contrato"
        options={selectedLoans.map((loan) => ({
          value: loan.id,
          label: loan.debtorName,
          subtitle: `Principal · ${loan.billingCycle}`,
          rightValue: formatMoney(loan.principal, privacyHidden),
        }))}
        onChange={(next) => { setLoanId(next); setInstallmentId(''); setError(''); }}
      />
    </div>
    {hasAgreement ? <p role="status" className="rounded-lg border border-amber-800/60 bg-amber-950/20 p-3 text-xs leading-relaxed text-amber-200">
      Contrato com acordo ativo. Registre o pagamento na tela do contrato, pelo procedimento próprio do acordo; este atalho não faz uma baixa genérica.
    </p> : <div className={labelClass}>
      <span className="block">Parcela em aberto</span>
      <SelectOptionList
        ariaLabel="Parcela em aberto"
        value={installmentId}
        disabled={!loanId || !installments.length}
        placeholder="Selecione uma parcela"
        options={installments.map((inst) => ({
          value: inst.id,
          label: inst.number ? `Parcela ${inst.number}` : 'Parcela em aberto',
          subtitle: `Vencimento ${inst.dueDate}`,
          rightValue: formatMoney(Number(inst.amount || 0), privacyHidden),
        }))}
        onChange={(next) => { setInstallmentId(next); setError(''); }}
      />
    </div>}
    {!availableClients.length && !isLoadingData && <p role="status" className="text-sm text-slate-300">Nenhum cliente com contrato disponível.</p>}
    {error && <p role="alert" className="rounded-lg border border-rose-800/60 bg-rose-950/30 p-3 text-xs text-rose-200">{error}</p>}
    <button type="button" onClick={open} disabled={!selected || isLoadingData}
      className={modalPrimaryActionClass}>
      <ShieldCheck size={17}/>Abrir opções de recebimento do contrato
    </button>
    <p className="text-xs leading-relaxed text-slate-400">
      Não registra uma segunda entrada na Carteira. O vínculo entre Capital e conta segue a fonte de recursos autorizada no backend.
    </p>
  </div>;
};

export const QuickIncomeModal: React.FC<Props> = ({ onClose }) => {
  const [mode, setMode] = useState<ReceiveMode>('COMMON');
  return <Modal onClose={onClose} title="Receber valor" subtitle="Entrada na conta ou pagamento de cliente"
    icon={<HandCoins size={18}/>} size="md">
    <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-slate-950 p-1" role="tablist" aria-label="Origem do recebimento">
      <button type="button" role="tab" aria-selected={mode==='COMMON'} onClick={() => setMode('COMMON')}
        className={'min-h-11 rounded-lg px-2 text-xs font-semibold ' + (mode==='COMMON'?'bg-blue-600 text-white':'text-slate-300 hover:bg-slate-800')}>
        <Landmark className="mx-auto mb-1" size={17}/>Entrada comum
      </button>
      <button type="button" role="tab" aria-selected={mode==='CLIENT'} onClick={() => setMode('CLIENT')}
        className={'min-h-11 rounded-lg px-2 text-xs font-semibold ' + (mode==='CLIENT'?'bg-blue-600 text-white':'text-slate-300 hover:bg-slate-800')}>
        <Building2 className="mx-auto mb-1" size={17}/>Cliente CapitalFlow
      </button>
    </div>
    {mode==='COMMON' ? <OrdinaryReceipt onClose={onClose}/> : <ClientReceipt onOpenPayment={onClose}/>}
  </Modal>;
};
