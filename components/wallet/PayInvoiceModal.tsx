import React, { useMemo, useRef, useState } from 'react';
import { X, Receipt, CheckCircle2, AlertCircle, Loader2, ArrowRight, Layers } from 'lucide-react';
import { PersonalWalletCard, PersonalWalletAccount } from '../../services/personalWallet.service';
import { formatMoney } from '../../utils/formatters';
import { generateUUID } from '../../utils/generators';
import { formatWalletMoneyInput, parseWalletMoney } from '../../features/wallet/utils/parseWalletMoney';
import { resolveLiveBrazilianCentsChange } from '../../features/wallet/utils/liveBrazilianMoneyInput';
import { stepInvoiceMonth } from '../../features/wallet/utils/minhasFinancasWalletTools';
import { businessMonthInManaus } from '../../utils/businessDate';

export type InvoiceRemainderAction =
  | { mode: 'KEEP_IN_CURRENT' }
  | { mode: 'ROLL_TO_NEXT'; nextDueMonth: string; remainderAmount: number }
  | {
      mode: 'INSTALLMENT_PLAN';
      nextDueMonth: string;
      installmentCount: number;
      installmentAmount: number;
      totalFinancedAmount: number;
      remainderPrincipal: number;
    };

export interface PayInvoiceModalProps {
  card: PersonalWalletCard;
  accounts: PersonalWalletAccount[];
  invoiceAmount?: number;
  minimumPayment?: number | null;
  dueMonth?: string;
  dueDate?: string | null;
  onClose: () => void;
  onPay: (cardId: string, dueMonth: string, accountId: string | null, amount: number, requestId: string) => Promise<void>;
  onHandleRemainder?: (action: InvoiceRemainderAction, requestId: string) => Promise<void>;
}

export const PayInvoiceModal: React.FC<PayInvoiceModalProps> = ({
  card,
  accounts,
  invoiceAmount = 0,
  minimumPayment = null,
  dueMonth,
  dueDate,
  onClose,
  onPay,
  onHandleRemainder,
}) => {
  const remaining = Math.max(0, Math.round(Number(invoiceAmount ?? card.current_bill ?? 0) * 100) / 100);
  const [accountId, setAccountId] = useState<string>(card.account_id || accounts[0]?.id || 'MANUAL');
  const [paymentText, setPaymentText] = useState('');
  const [remainderMode, setRemainderMode] = useState<'KEEP_IN_CURRENT' | 'ROLL_TO_NEXT' | 'INSTALLMENT_PLAN'>('KEEP_IN_CURRENT');
  const [planInstallments, setPlanInstallments] = useState<string>('3');
  const [planInstallmentValue, setPlanInstallmentValue] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Reuse request ID after a network failure; changing the payment creates a new operation.
  const operation = useRef({ signature: '', id: generateUUID() });
  const amount = (() => { try { return parseWalletMoney(paymentText); } catch { return Number.NaN; } })();
  const isValid = paymentText.trim() !== '' && Number.isFinite(amount)
    && amount > 0 && Math.abs(amount * 100 - Math.round(amount * 100)) < 0.000001
    && amount <= remaining;

  const remainderAmount = isValid ? Math.max(0, Math.round((remaining - amount) * 100) / 100) : 0;
  const isPartialPayment = isValid && remainderAmount > 0;
  const activeMonth = dueMonth || `${businessMonthInManaus()}-01`;
  const nextCycle = useMemo(() => stepInvoiceMonth(activeMonth, 1), [activeMonth]);

  const parsedPlanCount = Math.min(24, Math.max(2, Math.trunc(Number(planInstallments) || 2)));
  const defaultPerInstallment = remainderAmount > 0
    ? Math.round((remainderAmount / parsedPlanCount) * 100) / 100
    : 0;
  const effectivePlanInstallmentAmount = useMemo(() => {
    if (!planInstallmentValue.trim()) return defaultPerInstallment;
    try {
      const parsed = parseWalletMoney(planInstallmentValue);
      return parsed > 0 ? parsed : defaultPerInstallment;
    } catch {
      return defaultPerInstallment;
    }
  }, [planInstallmentValue, defaultPerInstallment]);
  const totalFinancedAmount = Math.round(effectivePlanInstallmentAmount * parsedPlanCount * 100) / 100;

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isValid) {
      setError('Informe um valor maior que zero e menor ou igual ao saldo da fatura.');
      return;
    }
    if (isPartialPayment && remainderMode === 'INSTALLMENT_PLAN' && totalFinancedAmount < remainderAmount) {
      setError(`O total parcelado (${formatMoney(totalFinancedAmount)}) não pode ser menor que o saldo restante (${formatMoney(remainderAmount)}).`);
      return;
    }
    const account = accountId === 'MANUAL' ? null : accountId;
    const signature = [card.id, activeMonth, account || 'MANUAL', amount.toFixed(2), remainderMode, parsedPlanCount, totalFinancedAmount.toFixed(2)].join(':');
    if (operation.current.signature !== signature) operation.current = { signature, id: generateUUID() };
    setError('');
    setLoading(true);
    try {
      await onPay(card.id, activeMonth, account, amount, operation.current.id);
      if (isPartialPayment && onHandleRemainder && remainderMode !== 'KEEP_IN_CURRENT') {
        if (remainderMode === 'ROLL_TO_NEXT') {
          await onHandleRemainder(
            {
              mode: 'ROLL_TO_NEXT',
              nextDueMonth: nextCycle.dueMonthIso,
              remainderAmount,
            },
            operation.current.id,
          );
        } else if (remainderMode === 'INSTALLMENT_PLAN') {
          await onHandleRemainder(
            {
              mode: 'INSTALLMENT_PLAN',
              nextDueMonth: nextCycle.dueMonthIso,
              installmentCount: parsedPlanCount,
              installmentAmount: effectivePlanInstallmentAmount,
              totalFinancedAmount,
              remainderPrincipal: remainderAmount,
            },
            operation.current.id,
          );
        }
      }
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
            <p className="text-xs text-slate-500 mt-1">
              Vencimento: {dueDate ? dueDate.split('-').reverse().join('/') : 'Não informado'}
              {minimumPayment != null && Number(minimumPayment) > 0 && ` · Mínimo: ${formatMoney(Number(minimumPayment))}`}
            </p>
          </div>
          <label className="block space-y-1.5">
            <span className="block text-[11px] font-bold uppercase text-slate-300">Quanto foi pago?</span>
            <div className="flex gap-2">
              <input required inputMode="decimal" autoComplete="off" value={paymentText}
                onChange={event => {
                  const input = event.currentTarget;
                  const next = resolveLiveBrazilianCentsChange(input.value, paymentText, (event.nativeEvent as InputEvent).inputType);
                  if (!next) return;
                  setPaymentText(next.value); setError('');
                  requestAnimationFrame(() => {
                    if (document.activeElement === input) input.setSelectionRange(next.caret, next.caret);
                  });
                }}
                onBlur={(event) => { try { setPaymentText(formatWalletMoneyInput(event.target.value)); } catch {} }}
                placeholder="0,00" aria-label="Valor do pagamento parcial"
                className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-base text-white outline-none focus:border-emerald-500" />
              {minimumPayment != null && Number(minimumPayment) > 0 && Number(minimumPayment) < remaining && (
                <button
                  type="button"
                  onClick={() => setPaymentText(Number(minimumPayment).toFixed(2).replace('.', ','))}
                  className="rounded-lg border border-slate-700 px-2.5 text-xs text-slate-300 hover:bg-slate-800"
                >
                  Mínimo
                </button>
              )}
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

          {/* Destino do saldo restante (pagamento parcial / parcelamento de fatura — estilo Minhas Finanças) */}
          {isPartialPayment && onHandleRemainder && (
            <div className="space-y-2.5 rounded-xl border border-slate-800 bg-slate-950 p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-300">Saldo restante: {formatMoney(remainderAmount)}</span>
                <span className="text-[11px] text-slate-400">O que fazer com o restante?</span>
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                <label className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs transition ${
                  remainderMode === 'KEEP_IN_CURRENT'
                    ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-100'
                    : 'border-slate-800 bg-slate-900 text-slate-300'
                }`}>
                  <input
                    type="radio"
                    name="invoice-remainder-mode"
                    checked={remainderMode === 'KEEP_IN_CURRENT'}
                    onChange={() => setRemainderMode('KEEP_IN_CURRENT')}
                    className="accent-emerald-500"
                  />
                  <span>Manter restante em aberto nesta fatura</span>
                </label>
                <label className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs transition ${
                  remainderMode === 'ROLL_TO_NEXT'
                    ? 'border-blue-500/50 bg-blue-500/10 text-blue-100'
                    : 'border-slate-800 bg-slate-900 text-slate-300'
                }`}>
                  <input
                    type="radio"
                    name="invoice-remainder-mode"
                    checked={remainderMode === 'ROLL_TO_NEXT'}
                    onChange={() => setRemainderMode('ROLL_TO_NEXT')}
                    className="accent-blue-500"
                  />
                  <ArrowRight size={13} className="shrink-0 text-blue-400" />
                  <span>Mover restante para a próxima fatura ({nextCycle.label})</span>
                </label>
                <label className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs transition ${
                  remainderMode === 'INSTALLMENT_PLAN'
                    ? 'border-amber-500/50 bg-amber-500/10 text-amber-100'
                    : 'border-slate-800 bg-slate-900 text-slate-300'
                }`}>
                  <input
                    type="radio"
                    name="invoice-remainder-mode"
                    checked={remainderMode === 'INSTALLMENT_PLAN'}
                    onChange={() => setRemainderMode('INSTALLMENT_PLAN')}
                    className="accent-amber-500"
                  />
                  <Layers size={13} className="shrink-0 text-amber-400" />
                  <span>Parcelar fatura restante a partir de {nextCycle.label}</span>
                </label>
              </div>

              {remainderMode === 'INSTALLMENT_PLAN' && (
                <div className="grid grid-cols-2 gap-2 border-t border-slate-800 pt-2.5 text-xs">
                  <label className="space-y-1 text-slate-300">
                    <span className="block text-[11px] font-semibold">Nº de parcelas</span>
                    <input
                      type="number"
                      min={2}
                      max={24}
                      value={planInstallments}
                      onChange={(e) => setPlanInstallments(e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-2 text-white"
                    />
                  </label>
                  <label className="space-y-1 text-slate-300">
                    <span className="block text-[11px] font-semibold">Valor de cada parcela (R$)</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={planInstallmentValue}
                      onChange={event => {
                         const input = event.currentTarget;
                         const next = resolveLiveBrazilianCentsChange(input.value, planInstallmentValue, (event.nativeEvent as InputEvent).inputType);
                         if (!next) return;
                         setPlanInstallmentValue(next.value);
                         requestAnimationFrame(() => {
                           if (document.activeElement === input) input.setSelectionRange(next.caret, next.caret);
                         });
                       }}
                      onBlur={(e) => {
                        try { setPlanInstallmentValue(formatWalletMoneyInput(e.target.value)); } catch {}
                      }}
                      placeholder={defaultPerInstallment.toFixed(2).replace('.', ',')}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-2 text-white"
                    />
                  </label>
                  <p className="col-span-2 text-[11px] text-amber-200/90">
                    Serão lançadas <strong>{parsedPlanCount}x de {formatMoney(effectivePlanInstallmentAmount)}</strong> (total {formatMoney(totalFinancedAmount)}) a partir de <span className="capitalize">{nextCycle.label}</span>.
                  </p>
                </div>
              )}
            </div>
          )}

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
