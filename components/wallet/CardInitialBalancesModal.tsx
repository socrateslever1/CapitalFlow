import React, { useMemo, useRef, useState } from 'react';
import { Calculator, CalendarDays, CheckCircle2, CreditCard, Loader2, SlidersHorizontal, X } from 'lucide-react';
import { PersonalWalletCard, personalWalletService } from '../../services/personalWallet.service';
import { formatMoney } from '../../utils/formatters';
import { generateUUID } from '../../utils/generators';

export interface CardInitialBalancesModalProps {
  card: PersonalWalletCard;
  initialDueMonth?: string | null;
  currentInvoiceAmount?: number;
  nativeFutureCommitments?: number;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

const currentYearMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const roundCents = (val: number) => Math.round((Number(val) || 0) * 100) / 100;

export const CardInitialBalancesModal: React.FC<CardInitialBalancesModalProps> = ({
  card,
  initialDueMonth,
  currentInvoiceAmount = 0,
  nativeFutureCommitments = 0,
  onClose,
  onSaved,
}) => {
  const existingInitialFuture = Math.max(
    Number(card.initial_future_installments_balance || 0),
    Number(card.opening_unallocated_amount || 0),
  );
  const initialInvoice = currentInvoiceAmount > 0 ? currentInvoiceAmount : Number(card.current_bill || 0);

  const [creditLimit, setCreditLimit] = useState<string>(String(Number(card.credit_limit || 0)));
  const [currentInvoice, setCurrentInvoice] = useState<string>(String(initialInvoice));
  const [futureCommitments, setFutureCommitments] = useState<string>(String(existingInitialFuture));
  const [freeLimitInput, setFreeLimitInput] = useState<string>(() => {
    const free = Math.max(
      0,
      roundCents(Number(card.credit_limit || 0) - initialInvoice - existingInitialFuture - nativeFutureCommitments),
    );
    return String(free);
  });
  const [calcMode, setCalcMode] = useState<'BY_FUTURE' | 'BY_FREE_LIMIT'>('BY_FUTURE');
  const [dueMonth, setDueMonth] = useState<string>(
    initialDueMonth ? initialDueMonth.slice(0, 7) : currentYearMonth(),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const requestIdRef = useRef<string>(generateUUID());

  const resetRequestId = () => {
    requestIdRef.current = generateUUID();
  };

  const computed = useMemo(() => {
    const limit = roundCents(Number(creditLimit || 0));
    const invoice = roundCents(Number(currentInvoice || 0));
    const nativeFuture = roundCents(nativeFutureCommitments);

    let futurePreexisting = roundCents(Number(futureCommitments || 0));
    if (calcMode === 'BY_FREE_LIMIT') {
      const targetFree = roundCents(Number(freeLimitInput || 0));
      futurePreexisting = Math.max(0, roundCents(limit - invoice - nativeFuture - targetFree));
    }

    const totalCommitted = roundCents(invoice + futurePreexisting + nativeFuture);
    const availableLimit = Math.max(0, roundCents(limit - totalCommitted));
    const isInvalid =
      limit < 0 ||
      invoice < 0 ||
      futurePreexisting < 0 ||
      roundCents(invoice + futurePreexisting + nativeFuture) > limit;

    return {
      limit,
      invoice,
      futurePreexisting,
      nativeFuture,
      totalCommitted,
      availableLimit,
      isInvalid,
    };
  }, [creditLimit, currentInvoice, futureCommitments, freeLimitInput, calcMode, nativeFutureCommitments]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (computed.isInvalid) {
      setError('A soma da fatura atual com os compromissos futuros não pode ultrapassar o limite total.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await personalWalletService.setCardInitialBalances({
        cardId: card.id,
        creditLimit: computed.limit,
        currentInvoice: computed.invoice,
        futureCommitments: computed.futurePreexisting,
        dueMonth: `${dueMonth}-01`,
        requestId: requestIdRef.current,
      });
      window.dispatchEvent(new Event('capitalflow:wallet-updated'));
      await onSaved();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível aplicar a carga inicial do cartão.');
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    'mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm font-semibold text-white outline-none transition-colors focus:border-blue-500';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="card-initial-balances-title"
      className="fixed inset-0 z-[2400] flex items-end justify-center bg-slate-950/85 backdrop-blur-sm sm:items-center sm:p-4 animate-in fade-in"
    >
      <form
        onSubmit={handleSubmit}
        className="flex max-h-[94dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-slate-700 bg-slate-900 shadow-2xl sm:rounded-3xl"
      >
        <header className="flex shrink-0 items-center justify-between border-b border-slate-800 p-4 sm:px-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/15 text-blue-400">
              <SlidersHorizontal size={18} />
            </span>
            <div>
              <h2 id="card-initial-balances-title" className="text-sm font-black uppercase tracking-wider text-white">
                Carga Inicial · Cartão em Uso
              </h2>
              <p className="text-[11px] text-slate-400">
                {card.nickname} · Ajuste limite total, fatura atual e parcelamentos antigos
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-full bg-slate-800 p-2 text-slate-400 hover:text-white"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 min-h-0 space-y-4 overflow-y-auto p-4 sm:p-5 overscroll-contain touch-pan-y [-webkit-overflow-scrolling:touch]">
          <div className="rounded-2xl border border-blue-500/20 bg-blue-950/20 p-3 text-xs text-slate-300">
            Use esta tela quando o cartão já estava em uso antes de cadastrar. Os compromissos futuros bloqueiam o{' '}
            <strong className="text-white">Limite Livre</strong>, mas não entram como dívida exigível neste mês.
          </div>

          <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-slate-800 bg-slate-950 p-1">
            <button
              type="button"
              onClick={() => setCalcMode('BY_FUTURE')}
              className={`rounded-lg px-3 py-2 text-xs font-bold transition-all ${
                calcMode === 'BY_FUTURE'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Informar Parcelas Antigas
            </button>
            <button
              type="button"
              onClick={() => {
                setFreeLimitInput(String(computed.availableLimit));
                setCalcMode('BY_FREE_LIMIT');
              }}
              className={`rounded-lg px-3 py-2 text-xs font-bold transition-all ${
                calcMode === 'BY_FREE_LIMIT'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Calcular pelo Crédito Livre
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-slate-300">
              Limite Total do Cartão (R$)
              <input
                type="number"
                required
                min="0"
                step="0.01"
                inputMode="decimal"
                value={creditLimit}
                onChange={(e) => {
                  resetRequestId();
                  setCreditLimit(e.target.value);
                }}
                className={inputClass}
                placeholder="10000.00"
              />
            </label>

            <label className="text-xs font-bold text-slate-300">
              Fatura Fechada / Atual (R$)
              <input
                type="number"
                required
                min="0"
                step="0.01"
                inputMode="decimal"
                value={currentInvoice}
                onChange={(e) => {
                  resetRequestId();
                  setCurrentInvoice(e.target.value);
                }}
                className={inputClass}
                placeholder="1000.00"
              />
            </label>

            {calcMode === 'BY_FUTURE' ? (
              <label className="text-xs font-bold text-slate-300">
                Parcelas Futuras Antigas (R$)
                <input
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={futureCommitments}
                  onChange={(e) => {
                    resetRequestId();
                    setFutureCommitments(e.target.value);
                  }}
                  className={inputClass}
                  placeholder="7500.00"
                />
                <span className="mt-1 block text-[10px] font-normal text-slate-400">
                  Saldo de compras parceladas de meses anteriores
                </span>
              </label>
            ) : (
              <label className="text-xs font-bold text-emerald-300">
                Limite Livre Hoje no Banco (R$)
                <input
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={freeLimitInput}
                  onChange={(e) => {
                    resetRequestId();
                    setFreeLimitInput(e.target.value);
                  }}
                  className={`${inputClass} border-emerald-500/40 focus:border-emerald-400`}
                  placeholder="500.00"
                />
                <span className="mt-1 block text-[10px] font-normal text-emerald-300/80">
                  Calcula automaticamente {formatMoney(computed.futurePreexisting)} em parcelas antigas
                </span>
              </label>
            )}

            <label className="text-xs font-bold text-slate-300">
              Mês da Fatura Atual
              <span className="relative block">
                <CalendarDays className="pointer-events-none absolute left-3 top-4 text-slate-500" size={15} />
                <input
                  type="month"
                  required
                  min="2000-01"
                  max="2100-12"
                  value={dueMonth}
                  onChange={(e) => {
                    resetRequestId();
                    setDueMonth(e.target.value);
                  }}
                  className={`${inputClass} pl-9`}
                />
              </span>
            </label>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950/90 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between text-xs font-bold text-slate-400">
              <span className="flex items-center gap-1.5">
                <Calculator size={14} className="text-blue-400" />
                Resumo Contábil do Limite
              </span>
              <span className="text-[11px] text-slate-500">Fórmula Canônica</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-2.5">
                <span className="block text-[10px] text-slate-400">Limite Total</span>
                <strong className="text-white">{formatMoney(computed.limit)}</strong>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-2.5">
                <span className="block text-[10px] text-rose-300">Fatura do Mês</span>
                <strong className="text-rose-200">{formatMoney(computed.invoice)}</strong>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-2.5">
                <span className="block text-[10px] text-amber-300">Futuro Comprometido</span>
                <strong className="text-amber-200">
                  {formatMoney(computed.futurePreexisting + computed.nativeFuture)}
                </strong>
              </div>
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-2.5">
                <span className="block text-[10px] text-emerald-300">Limite Livre</span>
                <strong className="text-emerald-300">{formatMoney(computed.availableLimit)}</strong>
              </div>
            </div>
          </div>

          {error && (
            <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-xs text-rose-200">
              {error}
            </p>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-800 bg-slate-900 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="rounded-xl border border-slate-700 px-4 py-2.5 text-xs font-bold text-slate-300 hover:text-white"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving || computed.isInvalid}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
            {saving ? 'Aplicando...' : 'Salvar Carga Inicial'}
          </button>
        </footer>
      </form>
    </div>
  );
};

export default CardInitialBalancesModal;
