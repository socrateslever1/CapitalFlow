import React, { useRef, useState } from 'react';
import { X, Receipt, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { PersonalWalletCard, PersonalWalletAccount } from '../../services/personalWallet.service';
import { formatMoney } from '../../utils/formatters';
import { generateUUID } from '../../utils/generators';

export interface PayInvoiceModalProps {
  card: PersonalWalletCard;
  accounts: PersonalWalletAccount[];
  invoiceAmount?: number;
  dueMonth?: string;
  onClose: () => void;
  onPay: (cardId: string, dueMonth: string, accountId: string | null, amount: number, requestId: string) => Promise<void>;
}

export const PayInvoiceModal: React.FC<PayInvoiceModalProps> = ({
  card, accounts, invoiceAmount = 0, dueMonth, onClose, onPay,
}) => {
  const remaining = Math.max(0, Math.round(Number(invoiceAmount ?? card.current_bill ?? 0) * 100) / 100);
  const [accountId, setAccountId] = useState<string>(accounts[0]?.id || 'MANUAL');
  const [paymentText, setPaymentText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Reuse request ID after a network failure; changing the payment creates a new operation.
  const operation = useRef({ signature: '', id: generateUUID() });
  const amount = Number(paymentText.trim().replace(',', '.'));
  const isValid = paymentText.trim() !== '' && Number.isFinite(amount)
    && amount > 0 && Math.abs(amount * 100 - Math.round(amount * 100)) < 0.000001
    && amount <= remaining;

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isValid) {
      setError('Informe um valor maior que zero e menor ou igual ao saldo da fatura.');
      return;
    }
    const account = accountId === 'MANUAL' ? null : accountId;
    const month = dueMonth || `${new Date().toISOString().slice(0, 7)}-01`;
    const signature = [card.id, month, account || 'MANUAL', amount.toFixed(2)].join(':');
    if (operation.current.signature !== signature) operation.current = { signature, id: generateUUID() };
    setError('');
    setLoading(true);
    try {
      await onPay(card.id, month, account, amount, operation.current.id);
      onClose();
    } catch (cause: any) {
      setError(cause?.message || 'Não foi possível registrar o pagamento.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" data-modal-open="true"
      className="fixed inset-0 z-[2000] flex flex-col justify-end sm:justify-center sm:items-center bg-slate-950/85 sm:p-4 backdrop-blur-sm overflow-hidden">
      <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl overflow-y-auto max-h-[100dvh] sm:max-h-[92dvh]">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex gap-2 items-center">
            <Receipt className="text-emerald-400" size={20} />
            <div>
              <h2 className="text-sm font-bold text-white">Pagamento de fatura</h2>
              <p className="text-xs text-slate-400">{card.nickname} •••• {card.last_four || '----'}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" disabled={loading} className="p-2 text-slate-400"><X size={18} /></button>
        </div>
        <form onSubmit={onSubmit} className="p-4 sm:p-5 space-y-4">
          {error && <div role="alert" className="flex gap-2 rounded-lg border border-rose-700/40 bg-rose-950/30 p-3 text-xs text-rose-200">
            <AlertCircle size={16} className="shrink-0" />{error}
          </div>}
          <div className="text-center rounded-xl border border-slate-800 bg-slate-950 p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Saldo da fatura ainda em aberto</p>
            <strong className="block text-2xl font-black text-emerald-400">{formatMoney(remaining)}</strong>
            <p className="text-xs text-slate-500 mt-1">Ciclo de vencimento: dia {card.due_day || '05'}</p>
          </div>
          <label className="block space-y-1.5">
            <span className="block text-[11px] font-bold uppercase text-slate-300">Quanto foi pago?</span>
            <div className="flex gap-2">
              <input required inputMode="decimal" autoComplete="off" value={paymentText}
                onChange={(event) => { setPaymentText(event.target.value); setError(''); }}
                placeholder="0,00" aria-label="Valor do pagamento parcial"
                className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-base text-white outline-none focus:border-emerald-500" />
              <button type="button" onClick={() => setPaymentText(remaining.toFixed(2).replace('.', ','))}
                className="rounded-lg border border-slate-700 px-3 text-xs text-slate-200">Total</button>
            </div>
          </label>
          <label className="block space-y-1.5">
            <span className="block text-[11px] font-bold uppercase text-slate-300">Origem do pagamento</span>
            <select value={accountId} onChange={(event) => setAccountId(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-xs text-white">
              <option value="MANUAL">Pagamento já realizado (registro manual)</option>
              {accounts.map((account) => <option key={account.id} value={account.id}>
                {account.nickname} · Saldo: {formatMoney(account.balance)}
              </option>)}
            </select>
          </label>
          {accountId === 'MANUAL'
            ? <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                Use somente para registrar um pagamento realmente realizado. Nenhuma conta bancária será debitada no CapitalFlow.
              </p>
            : <p className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs text-slate-400">
                O pagamento será abatido da conta selecionada e liberará o mesmo valor do limite utilizado do cartão.
              </p>}
          <div className="flex items-center justify-between text-xs border-t border-slate-800 pt-3">
            <span className="text-slate-400">Restante após registrar</span>
            <strong className="text-white">{formatMoney(isValid ? remaining - amount : remaining)}</strong>
          </div>
          <div className="flex items-center justify-end gap-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <button type="button" onClick={onClose} disabled={loading} className="rounded-lg bg-slate-800 px-3 py-3 text-xs text-slate-200">Cancelar</button>
            <button type="submit" disabled={!isValid || loading}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-3 text-xs font-bold text-white disabled:opacity-40">
              {loading ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
              Registrar pagamento
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
