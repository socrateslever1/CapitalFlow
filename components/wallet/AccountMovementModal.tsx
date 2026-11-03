import React, { useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, Building2, CreditCard, Send } from 'lucide-react';
import {
  PersonalWalletAccount,
  PersonalWalletCard,
  PersonalWalletExpense,
  PersonalWalletExpenseInstallment,
  personalWalletService,
} from '../../services/personalWallet.service';
import { formatMoney } from '../../utils/formatters';
import { generateUUID } from '../../utils/generators';
import { tryParseWalletMoney } from '../../features/wallet/utils/parseWalletMoney';
import { Modal } from '../ui/Modal';
import { buildOpenInvoiceOptions } from './accountStatementDomain';

type Tab = 'INTERNAL' | 'EXTERNAL' | 'INVOICE';
type Props = {
  accounts: PersonalWalletAccount[];
  cards: PersonalWalletCard[];
  expenses: PersonalWalletExpense[];
  installments: PersonalWalletExpenseInstallment[];
  initialAccountId?: string | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
};

const inputClass = 'w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-white outline-none focus:border-emerald-500';
const labelClass = 'block space-y-1 text-xs font-semibold text-slate-300';
const localDateTime = () => {
  const value = new Date();
  value.setMinutes(value.getMinutes() - value.getTimezoneOffset());
  return value.toISOString().slice(0, 16);
};
const today = () => localDateTime().slice(0, 10);
const parseAmount = (value: string) => tryParseWalletMoney(value) ?? NaN;
const validAmount = (value: number) => Number.isFinite(value) && value > 0
  && Math.abs(value * 100 - Math.round(value * 100)) < 0.000001;

export const AccountMovementModal: React.FC<Props> = ({
  accounts, cards, expenses, installments, initialAccountId, onClose, onSaved,
}) => {
  const firstAccount = initialAccountId && accounts.some(account => account.id === initialAccountId)
    ? initialAccountId : accounts[0]?.id || '';
  const [tab, setTab] = useState<Tab>('INTERNAL');
  const [sourceId, setSourceId] = useState(firstAccount);
  const [destinationId, setDestinationId] = useState(accounts.find(account => account.id !== firstAccount)?.id || '');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [occurredAt, setOccurredAt] = useState(localDateTime());
  const [description, setDescription] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [pixKey, setPixKey] = useState('');
  const [externalIdentifier, setExternalIdentifier] = useState('');
  const invoiceOptions = useMemo(
    () => buildOpenInvoiceOptions(cards, expenses, installments),
    [cards, expenses, installments],
  );
  const [invoiceKey, setInvoiceKey] = useState(() => {
    const option = invoiceOptions[0];
    return option ? `${option.cardId}|${option.dueMonth}` : '';
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const requestRef = useRef({ signature: '', id: generateUUID() });

  const selectedInvoice = invoiceOptions.find(option => `${option.cardId}|${option.dueMonth}` === invoiceKey);
  const numericAmount = parseAmount(amount);
  const requestIdFor = (signature: string) => {
    if (requestRef.current.signature !== signature) requestRef.current = { signature, id: generateUUID() };
    return requestRef.current.id;
  };
  const resetRequest = () => { requestRef.current = { signature: '', id: generateUUID() }; };
  const changeTab = (next: Tab) => {
    if (saving) return;
    setTab(next); setError(''); setSuccess(''); setAmount(''); setDescription(''); resetRequest();
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (!validAmount(numericAmount)) { setError('Informe um valor positivo com até duas casas decimais.'); return; }
    setSaving(true); setError(''); setSuccess('');
    try {
      if (tab === 'INTERNAL') {
        if (!sourceId || !destinationId || sourceId === destinationId) throw new Error('Selecione duas contas diferentes.');
        const signature = [tab, sourceId, destinationId, numericAmount.toFixed(2), date, description.trim()].join(':');
        await personalWalletService.recordAccountOperation({
          type: 'TRANSFER', fromAccountId: sourceId, toAccountId: destinationId,
          amount: numericAmount, description: description.trim(), category: 'Transferência interna',
          date, requestId: requestIdFor(signature),
        });
        setSuccess('Transferência interna registrada nas duas contas.');
      } else if (tab === 'EXTERNAL') {
        if (!sourceId || !recipientName.trim() || (!pixKey.trim() && !externalIdentifier.trim())) {
          throw new Error('Informe a conta, o favorecido e a chave PIX ou o identificador externo.');
        }
        const timestamp = new Date(occurredAt).toISOString();
        const signature = [tab, sourceId, numericAmount.toFixed(2), timestamp, recipientName.trim(), pixKey.trim(), externalIdentifier.trim(), description.trim()].join(':');
        await personalWalletService.recordExternalTransfer({
          accountId: sourceId, amount: numericAmount, occurredAt: timestamp,
          recipientName, pixKey, externalIdentifier, description,
          requestId: requestIdFor(signature),
        });
        setSuccess('Saída externa registrada contabilmente.');
      } else {
        if (!sourceId || !selectedInvoice) throw new Error('Selecione a conta e a fatura em aberto.');
        if (numericAmount > selectedInvoice.openAmount) throw new Error('O valor excede o saldo em aberto da fatura.');
        const signature = [tab, sourceId, selectedInvoice.cardId, selectedInvoice.dueMonth, numericAmount.toFixed(2)].join(':');
        await personalWalletService.payInvoicePartial(
          selectedInvoice.cardId, selectedInvoice.dueMonth, sourceId, numericAmount, requestIdFor(signature),
        );
        setSuccess('Pagamento da fatura registrado e limite atualizado.');
      }
      await onSaved();
      resetRequest();
      setAmount(''); setDescription('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível concluir a movimentação.');
    } finally {
      setSaving(false);
    }
  };

  const accountSelect = (label: string, value: string, onChange: (value: string) => void, exclude?: string) => (
    <label className={labelClass}>{label}
      <select required className={inputClass} value={value} onChange={event => onChange(event.target.value)}>
        <option value="">Selecione uma conta</option>
        {accounts.filter(account => account.id !== exclude).map(account => (
          <option key={account.id} value={account.id}>{account.nickname} — saldo {formatMoney(Number(account.balance))}</option>
        ))}
      </select>
    </label>
  );

  return <Modal onClose={onClose} title="Transferir / Movimentar" subtitle="Operações atômicas e rastreáveis" icon={<ArrowLeftRight size={18}/>} size="lg" busy={saving}>
    <div role="tablist" aria-label="Tipo de movimentação" className="grid grid-cols-3 gap-1 rounded-xl bg-slate-950 p-1">
      {([
        ['INTERNAL', 'Minhas contas', ArrowLeftRight],
        ['EXTERNAL', 'Para fora', Send],
        ['INVOICE', 'Pagar fatura', CreditCard],
      ] as const).map(([value, label, Icon]) => <button key={value} type="button" role="tab" aria-selected={tab === value}
        onClick={() => changeTab(value)} className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[10px] font-bold sm:flex-row sm:text-xs ${tab === value ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>
        <Icon size={15}/>{label}
      </button>)}
    </div>

    <form onSubmit={submit} className="space-y-4">
      {tab === 'INTERNAL' && <>
        <p className="rounded-lg border border-cyan-800/50 bg-cyan-950/20 p-3 text-xs text-cyan-200">Uma única operação liga a conta de origem à conta de destino e atualiza ambos os saldos atomicamente.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {accountSelect('De qual conta sai?', sourceId, value => { setSourceId(value); if (value === destinationId) setDestinationId(''); }, destinationId)}
          {accountSelect('Para qual conta vai?', destinationId, setDestinationId, sourceId)}
          <label className={labelClass}>Valor
            <input required inputMode="decimal" className={inputClass} value={amount} onChange={event => setAmount(event.target.value)} placeholder="0,00"/>
          </label>
          <label className={labelClass}>Data
            <input required type="date" max={today()} className={inputClass} value={date} onChange={event => setDate(event.target.value)}/>
          </label>
          <label className={`${labelClass} sm:col-span-2`}>Descrição
            <input required maxLength={240} className={inputClass} value={description} onChange={event => setDescription(event.target.value)} placeholder="Ex.: Reserva para outra conta"/>
          </label>
        </div>
      </>}

      {tab === 'EXTERNAL' && <>
        <p className="rounded-lg border border-amber-700/50 bg-amber-950/20 p-3 text-xs text-amber-200"><strong>Registro contábil de saída:</strong> esta ação não envia PIX/TED nem realiza liquidação bancária automática via Bacen ou Open Finance.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">{accountSelect('Conta de origem', sourceId, setSourceId)}</div>
          <label className={labelClass}>Valor
            <input required inputMode="decimal" className={inputClass} value={amount} onChange={event => setAmount(event.target.value)} placeholder="0,00"/>
          </label>
          <label className={labelClass}>Data e hora
            <input required type="datetime-local" max={localDateTime()} className={inputClass} value={occurredAt} onChange={event => setOccurredAt(event.target.value)}/>
          </label>
          <label className={labelClass}>Favorecido
            <input required maxLength={160} className={inputClass} value={recipientName} onChange={event => setRecipientName(event.target.value)} />
          </label>
          <label className={labelClass}>Chave PIX (se aplicável)
            <input maxLength={255} className={inputClass} value={pixKey} onChange={event => setPixKey(event.target.value)} />
          </label>
          <label className={labelClass}>Identificador externo / TED
            <input maxLength={160} className={inputClass} value={externalIdentifier} onChange={event => setExternalIdentifier(event.target.value)} />
          </label>
          <label className={labelClass}>Descrição
            <input required maxLength={240} className={inputClass} value={description} onChange={event => setDescription(event.target.value)} />
          </label>
        </div>
      </>}

      {tab === 'INVOICE' && <>
        <p className="rounded-lg border border-emerald-800/50 bg-emerald-950/20 p-3 text-xs text-emerald-200">O saldo da conta, a fatura, o limite utilizado e o extrato são atualizados na mesma transação.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {accountSelect('Debitar da conta', sourceId, setSourceId)}
          <label className={labelClass}>Cartão e fatura em aberto
            <select required className={inputClass} value={invoiceKey} onChange={event => setInvoiceKey(event.target.value)}>
              <option value="">Selecione uma fatura</option>
              {invoiceOptions.map(option => <option key={`${option.cardId}:${option.dueMonth}`} value={`${option.cardId}|${option.dueMonth}`}>
                {option.cardName} — {new Date(`${option.dueMonth}T12:00:00`).toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' })} — {formatMoney(option.openAmount)}
              </option>)}
            </select>
          </label>
          <label className={`${labelClass} sm:col-span-2`}>Valor a abater
            <input required inputMode="decimal" className={inputClass} value={amount} onChange={event => setAmount(event.target.value)} placeholder="0,00"/>
          </label>
        </div>
        {!invoiceOptions.length && <p role="status" className="text-xs text-slate-400">Nenhuma fatura pendente foi encontrada.</p>}
      </>}

      {error && <p role="alert" className="rounded-lg border border-rose-700/50 bg-rose-950/20 p-3 text-xs text-rose-200">{error}</p>}
      {success && <p role="status" className="rounded-lg border border-emerald-700/50 bg-emerald-950/20 p-3 text-xs text-emerald-200">{success}</p>}
      <button type="submit" disabled={saving || !accounts.length || (tab === 'INVOICE' && !invoiceOptions.length)}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-50">
        <Building2 size={17}/>{saving ? 'Processando...' : tab === 'INTERNAL' ? 'Efetuar Transferência Interna' : tab === 'EXTERNAL' ? 'Registrar Saída PIX/TED' : 'Liquidar com Saldo em Conta'}
      </button>
    </form>
  </Modal>;
};
