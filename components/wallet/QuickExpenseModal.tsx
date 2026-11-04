import React, { useMemo, useRef, useState } from 'react';
import { Calendar, CheckCircle2, CreditCard, Landmark, Loader2, Receipt, Tag, X } from 'lucide-react';
import {
  PersonalWalletAccount,
  PersonalWalletCard,
  personalWalletService,
} from '../../services/personalWallet.service';
import { formatMoney } from '../../utils/formatters';
import { generateUUID } from '../../utils/generators';
import { formatWalletMoneyInput, parseWalletMoney } from '../../features/wallet/utils/parseWalletMoney';
import {
  buildCardExpenseNotes,
  resolveCardInstallmentPlan,
  type CardExpenseAmountMode,
} from '../../features/wallet/utils/cardInstallmentPlan';

export interface QuickExpenseModalProps {
  accounts: PersonalWalletAccount[];
  cards: PersonalWalletCard[];
  initialMode?: 'CARD' | 'ACCOUNT';
  defaultMethod?: 'CARD' | 'ACCOUNT';
  initialCardId?: string | null;
  defaultCardId?: string | null;
  initialAccountId?: string | null;
  defaultAccountId?: string | null;
  initialDueMonth?: string | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

const EXPENSE_CATEGORIES = [
  'Alimentação',
  'Transporte',
  'Moradia',
  'Serviços',
  'Compras',
  'Saúde',
  'Lazer',
  'Outros',
] as const;

const todayIso = () => new Date().toLocaleDateString('en-CA');

const parseSafeMoney = (raw: string): number => {
  if (!raw || !raw.trim()) return 0;
  try {
    return parseWalletMoney(raw);
  } catch {
    const normalized = raw.replace(/\./g, '').replace(',', '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : 0;
  }
};

const formatMonthLabel = (dueDateIso: string): string => {
  const [yyyy, mm] = dueDateIso.slice(0, 7).split('-').map(Number);
  if (!yyyy || !mm) return dueDateIso;
  const target = new Date(yyyy, mm - 1, 1);
  return new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric' })
    .format(target)
    .replace('.', '');
};

const resolveFirstInstallmentMonthLabel = (
  expenseDate: string,
  closingDay?: number | null,
  explicitMonth?: string | null,
): { dueDateIso: string; monthInputValue: string; label: string } => {
  if (explicitMonth && /^\d{4}-\d{2}/.test(explicitMonth)) {
    const ym = explicitMonth.slice(0, 7);
    const dueDateIso = `${ym}-01`;
    return {
      dueDateIso,
      monthInputValue: ym,
      label: formatMonthLabel(dueDateIso),
    };
  }
  const base = expenseDate ? new Date(`${expenseDate}T12:00:00`) : new Date();
  const day = base.getDate();
  const target = new Date(base.getFullYear(), base.getMonth(), 1);
  if (closingDay && day > closingDay) {
    target.setMonth(target.getMonth() + 1);
  }
  const yyyy = target.getFullYear();
  const mm = String(target.getMonth() + 1).padStart(2, '0');
  const ym = `${yyyy}-${mm}`;
  const dueDateIso = `${ym}-01`;
  return {
    dueDateIso,
    monthInputValue: ym,
    label: formatMonthLabel(dueDateIso),
  };
};

export const QuickExpenseModal: React.FC<QuickExpenseModalProps> = ({
  accounts,
  cards,
  initialMode,
  defaultMethod,
  initialCardId,
  defaultCardId,
  initialAccountId,
  defaultAccountId,
  initialDueMonth,
  onClose,
  onSaved,
}) => {
  const activeCards = useMemo(() => cards.filter((c) => c.status === 'ACTIVE'), [cards]);
  const resolvedCardId = initialCardId ?? defaultCardId ?? null;
  const resolvedAccountId = initialAccountId ?? defaultAccountId ?? null;
  const defaultMode: 'CARD' | 'ACCOUNT' =
    initialMode || defaultMethod || (resolvedAccountId ? 'ACCOUNT' : activeCards.length > 0 ? 'CARD' : 'ACCOUNT');

  const [paymentMode, setPaymentMode] = useState<'CARD' | 'ACCOUNT'>(defaultMode);
  const [amountFormatted, setAmountFormatted] = useState<string>('');
  const [amountMode, setAmountMode] = useState<CardExpenseAmountMode>('INSTALLMENT');
  const [description, setDescription] = useState<string>('');
  const [expenseDate, setExpenseDate] = useState<string>(todayIso);
  const [category, setCategory] = useState<string>('Alimentação');
  const [selectedCardId, setSelectedCardId] = useState<string>(
    resolvedCardId || activeCards[0]?.id || '',
  );
  const [selectedAccountId, setSelectedAccountId] = useState<string>(
    resolvedAccountId || accounts[0]?.id || '',
  );
  const [conditionMode, setConditionMode] = useState<'CASH' | 'INSTALLMENTS'>('CASH');
  const [startInstallment, setStartInstallment] = useState<string>('1');
  const [installmentCount, setInstallmentCount] = useState<string>('2');
  const [firstInvoiceMonth, setFirstInvoiceMonth] = useState<string>(
    initialDueMonth ? initialDueMonth.slice(0, 7) : '',
  );
  const [notes, setNotes] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const requestIdRef = useRef<string>(generateUUID());

  const resetIdempotencyKey = () => {
    requestIdRef.current = generateUUID();
  };

  const amountValue = useMemo(() => parseSafeMoney(amountFormatted), [amountFormatted]);
  const selectedCard = useMemo(
    () => activeCards.find((card) => card.id === selectedCardId) || null,
    [activeCards, selectedCardId],
  );
  const selectedAccount = useMemo(
    () => accounts.find((acc) => acc.id === selectedAccountId) || null,
    [accounts, selectedAccountId],
  );

  const resolvedCycle = useMemo(
    () =>
      resolveFirstInstallmentMonthLabel(
        expenseDate,
        selectedCard?.closing_day,
        firstInvoiceMonth || initialDueMonth || null,
      ),
    [expenseDate, selectedCard?.closing_day, firstInvoiceMonth, initialDueMonth],
  );

  const installmentPlan = useMemo(() => {
    const total = paymentMode === 'CARD' && conditionMode === 'INSTALLMENTS'
      ? Math.min(48, Math.max(2, Math.trunc(Number(installmentCount) || 2)))
      : 1;
    const start = paymentMode === 'CARD' && conditionMode === 'INSTALLMENTS'
      ? Math.min(total, Math.max(1, Math.trunc(Number(startInstallment) || 1)))
      : 1;
    const mode: CardExpenseAmountMode =
      paymentMode === 'CARD' && conditionMode === 'INSTALLMENTS' ? amountMode : 'TOTAL';

    return resolveCardInstallmentPlan({
      inputAmount: amountValue,
      amountMode: mode,
      startInstallment: start,
      totalInstallments: total,
    });
  }, [paymentMode, conditionMode, installmentCount, startInstallment, amountValue, amountMode]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;

    const cleanDescription = description.trim();
    if (!cleanDescription) {
      setError('Informe a descrição da despesa.');
      return;
    }
    if (amountValue <= 0 || installmentPlan.remainingTotalAmount <= 0) {
      setError('Informe um valor válido maior que R$ 0,00.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      if (paymentMode === 'ACCOUNT') {
        if (!selectedAccountId) {
          throw new Error('Selecione a conta bancária ou carteira de origem.');
        }
        await personalWalletService.recordAccountOperation({
          type: 'EXPENSE',
          fromAccountId: selectedAccountId,
          toAccountId: null,
          amount: amountValue,
          description: cleanDescription,
          category,
          date: expenseDate || todayIso(),
          requestId: requestIdRef.current,
        });
      } else {
        if (!selectedCardId) {
          throw new Error('Selecione o cartão de crédito utilizado.');
        }
        await personalWalletService.createExpense({
          description: cleanDescription,
          amount: installmentPlan.remainingTotalAmount,
          category,
          expense_date: expenseDate || todayIso(),
          due_date: resolvedCycle.dueDateIso,
          account_id: null,
          card_id: selectedCardId,
          status: 'PENDING',
          installment_count: installmentPlan.remainingInstallments,
          notes: buildCardExpenseNotes(notes, installmentPlan),
        });
      }

      window.dispatchEvent(new Event('capitalflow:wallet-updated'));
      await onSaved();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível registrar a despesa.');
    } finally {
      setSaving(false);
    }
  };

  const fieldClass =
    'mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-blue-500';
  const labelClass = 'block text-[11px] font-bold uppercase tracking-wider text-slate-400';

  const isCardInstallments = paymentMode === 'CARD' && conditionMode === 'INSTALLMENTS';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-expense-modal-title"
      className="fixed inset-0 z-[2400] flex items-end justify-center bg-slate-950/85 backdrop-blur-sm sm:items-center sm:p-4 animate-in fade-in"
    >
      <form
        onSubmit={handleSubmit}
        className="flex max-h-[94dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-slate-700 bg-slate-900 shadow-2xl sm:rounded-3xl"
      >
        {/* Header */}
        <header className="flex shrink-0 items-center justify-between border-b border-slate-800 p-4 sm:px-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/15 text-blue-400">
              <Receipt size={18} />
            </span>
            <div>
              <h2 id="quick-expense-modal-title" className="text-sm font-black uppercase tracking-wider text-white">
                Lançamento Rápido de Despesa
              </h2>
              <p className="text-[11px] text-slate-400">
                Débito imediato em conta ou compra à vista/parcelada no cartão
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

        {/* Body */}
        <div className="flex-1 min-h-0 space-y-4 overflow-y-auto p-4 sm:p-5 overscroll-contain touch-pan-y [-webkit-overflow-scrolling:touch]">
          {/* Segmented Control */}
          <div
            role="tablist"
            aria-label="Forma de pagamento"
            className="grid grid-cols-2 gap-1.5 rounded-2xl border border-slate-800 bg-slate-950 p-1.5"
          >
            <button
              type="button"
              role="tab"
              aria-selected={paymentMode === 'CARD'}
              onClick={() => {
                resetIdempotencyKey();
                setPaymentMode('CARD');
              }}
              className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold transition-all ${
                paymentMode === 'CARD'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-950/50'
                  : 'text-slate-400 hover:bg-slate-900 hover:text-white'
              }`}
            >
              <CreditCard size={15} />
              <span>💳 Cartão de Crédito</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={paymentMode === 'ACCOUNT'}
              onClick={() => {
                resetIdempotencyKey();
                setPaymentMode('ACCOUNT');
              }}
              className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold transition-all ${
                paymentMode === 'ACCOUNT'
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/50'
                  : 'text-slate-400 hover:bg-slate-900 hover:text-white'
              }`}
            >
              <Landmark size={15} />
              <span>🏦 Conta Bancária / PIX</span>
            </button>
          </div>

          {/* Valor Monetário Destacado */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
            {isCardInstallments && (
              <div className="mb-2.5 flex items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Como informar o valor?
                </span>
                <div className="flex rounded-lg border border-slate-800 bg-slate-900 p-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      resetIdempotencyKey();
                      setAmountMode('INSTALLMENT');
                    }}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-bold transition ${
                      amountMode === 'INSTALLMENT'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Valor da parcela
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      resetIdempotencyKey();
                      setAmountMode('TOTAL');
                    }}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-bold transition ${
                      amountMode === 'TOTAL'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Valor total
                  </button>
                </div>
              </div>
            )}
            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                {isCardInstallments
                  ? amountMode === 'INSTALLMENT'
                    ? 'Valor de cada parcela (R$)'
                    : 'Valor total da compra (R$)'
                  : 'Valor da Despesa (R$)'}
              </span>
              <div className="mt-1.5 flex items-baseline gap-2">
                <span className="text-xl font-black text-slate-400">R$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  required
                  autoFocus
                  value={amountFormatted}
                  onChange={(e) => {
                    resetIdempotencyKey();
                    setAmountFormatted(e.target.value);
                  }}
                  onBlur={() => {
                    try {
                      setAmountFormatted(formatWalletMoneyInput(amountFormatted));
                    } catch {
                      /* mantém entrada para correção */
                    }
                  }}
                  placeholder="0,00"
                  className="w-full bg-transparent text-3xl font-bold tracking-tight text-white outline-none placeholder:text-slate-700"
                />
              </div>
            </label>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Descrição */}
            <label className="sm:col-span-2">
              <span className={labelClass}>Descrição da Despesa</span>
              <input
                type="text"
                required
                maxLength={180}
                value={description}
                onChange={(e) => {
                  resetIdempotencyKey();
                  setDescription(e.target.value);
                }}
                placeholder="Ex: Supermercado, Posto de Combustível, Farmácia"
                className={fieldClass}
              />
            </label>

            {/* Categoria */}
            <label>
              <span className={labelClass}>
                <Tag size={11} className="mr-1 inline text-blue-400" />
                Categoria
              </span>
              <select
                value={category}
                onChange={(e) => {
                  resetIdempotencyKey();
                  setCategory(e.target.value);
                }}
                className={fieldClass}
              >
                {EXPENSE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </label>

            {/* Data */}
            <label>
              <span className={labelClass}>
                <Calendar size={11} className="mr-1 inline text-emerald-400" />
                Data da Compra
              </span>
              <input
                type="date"
                required
                value={expenseDate}
                onChange={(e) => {
                  resetIdempotencyKey();
                  setExpenseDate(e.target.value);
                }}
                className={fieldClass}
              />
            </label>

            {/* Fluxo Condicional: Cartão vs Conta */}
            {paymentMode === 'CARD' ? (
              <>
                <label className="sm:col-span-2">
                  <span className={labelClass}>Cartão de Crédito</span>
                  <select
                    required
                    value={selectedCardId}
                    onChange={(e) => {
                      resetIdempotencyKey();
                      setSelectedCardId(e.target.value);
                    }}
                    className={fieldClass}
                  >
                    <option value="">Selecione o cartão ativo</option>
                    {activeCards.map((card) => {
                      const available = Math.max(
                        0,
                        Number(card.credit_limit || 0) - Number(card.used_limit || 0),
                      );
                      return (
                        <option key={card.id} value={card.id}>
                          💳 {card.nickname} {card.last_four ? `•••• ${card.last_four}` : ''} · Livre:{' '}
                          {formatMoney(available)}
                        </option>
                      );
                    })}
                  </select>
                </label>

                <div className="sm:col-span-2 space-y-3 rounded-2xl border border-slate-800 bg-slate-950/70 p-3.5">
                  <span className={labelClass}>Condição de Pagamento</span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        resetIdempotencyKey();
                        setConditionMode('CASH');
                        setStartInstallment('1');
                      }}
                      className={`rounded-xl border px-3 py-2 text-xs font-bold transition-all ${
                        conditionMode === 'CASH'
                          ? 'border-blue-500 bg-blue-600/20 text-blue-200'
                          : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-white'
                      }`}
                    >
                      À vista (1x)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        resetIdempotencyKey();
                        setConditionMode('INSTALLMENTS');
                      }}
                      className={`rounded-xl border px-3 py-2 text-xs font-bold transition-all ${
                        conditionMode === 'INSTALLMENTS'
                          ? 'border-blue-500 bg-blue-600/20 text-blue-200'
                          : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-white'
                      }`}
                    >
                      Parcelado (2x a 48x)
                    </button>
                  </div>

                  {conditionMode === 'INSTALLMENTS' && (
                    <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-3">
                      <label className="block">
                        <span className="text-[11px] font-bold text-slate-300">
                          Iniciar na parcela
                        </span>
                        <input
                          type="number"
                          min={1}
                          max={Math.max(2, Number(installmentCount) || 2)}
                          required
                          value={startInstallment}
                          onChange={(e) => {
                            resetIdempotencyKey();
                            const nextStart = e.target.value;
                            setStartInstallment(nextStart);
                            const parsedStart = Number(nextStart);
                            const parsedTotal = Number(installmentCount) || 2;
                            if (parsedStart > parsedTotal) {
                              setInstallmentCount(String(Math.min(48, parsedStart)));
                            }
                          }}
                          className={fieldClass}
                        />
                        <span className="mt-1 block text-[10px] text-slate-500">
                          Ex.: 3 (se já pagou a 1 e 2)
                        </span>
                      </label>

                      <label className="block">
                        <span className="text-[11px] font-bold text-slate-300">
                          De (Total de parcelas)
                        </span>
                        <input
                          type="number"
                          min={2}
                          max={48}
                          required
                          value={installmentCount}
                          onChange={(e) => {
                            resetIdempotencyKey();
                            setInstallmentCount(e.target.value);
                          }}
                          className={fieldClass}
                        />
                        <span className="mt-1 block text-[10px] text-slate-500">
                          Total da compra (2x a 48x)
                        </span>
                      </label>

                      <label className="block">
                        <span className="text-[11px] font-bold text-slate-300">
                          Fatura desta parcela
                        </span>
                        <input
                          type="month"
                          value={resolvedCycle.monthInputValue}
                          onChange={(e) => {
                            resetIdempotencyKey();
                            setFirstInvoiceMonth(e.target.value);
                          }}
                          className={fieldClass}
                        />
                        <span className="mt-1 block text-[10px] text-slate-500">
                          Mês em que entra a {installmentPlan.startInstallment}ª
                        </span>
                      </label>
                    </div>
                  )}

                  {amountValue > 0 && (
                    <div className="rounded-xl border border-blue-500/20 bg-blue-950/20 px-3 py-2.5 text-xs text-blue-200 space-y-1">
                      <div>
                        <strong>{installmentPlan.installmentRangeLabel}</strong>{' '}
                        de <strong>{formatMoney(installmentPlan.perInstallmentAmount)}</strong>{' '}
                        a partir de <span className="capitalize font-semibold">{resolvedCycle.label}</span>
                      </div>
                      {installmentPlan.totalInstallments > 1 && (
                        <div className="text-[11px] text-slate-300">
                          {installmentPlan.isMidStream ? (
                            <>
                              Saldo restante lançado no cartão:{' '}
                              <strong className="text-emerald-300">
                                {formatMoney(installmentPlan.remainingTotalAmount)}
                              </strong>{' '}
                              <span className="text-slate-400">
                                (parcelas anteriores 1 a {installmentPlan.startInstallment - 1} ignoradas · total original{' '}
                                {formatMoney(installmentPlan.originalTotalAmount)})
                              </span>
                            </>
                          ) : (
                            <>
                              Total comprometido no cartão:{' '}
                              <strong className="text-white">
                                {formatMoney(installmentPlan.remainingTotalAmount)}
                              </strong>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <label className="sm:col-span-2">
                <span className={labelClass}>Conta Bancária / Carteira de Origem</span>
                <select
                  required
                  value={selectedAccountId}
                  onChange={(e) => {
                    resetIdempotencyKey();
                    setSelectedAccountId(e.target.value);
                  }}
                  className={fieldClass}
                >
                  <option value="">Selecione a conta para débito</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      🏦 {acc.nickname} · Saldo: {formatMoney(Number(acc.balance || 0))}
                    </option>
                  ))}
                </select>
                {selectedAccount && amountValue > Number(selectedAccount.balance || 0) && (
                  <span className="mt-1.5 block text-[11px] font-semibold text-amber-300">
                    Atenção: o valor excede o saldo disponível na conta ({formatMoney(Number(selectedAccount.balance || 0))}).
                  </span>
                )}
              </label>
            )}

            <label className="sm:col-span-2">
              <span className={labelClass}>Observações (opcional)</span>
              <input
                type="text"
                maxLength={240}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Detalhes adicionais do lançamento"
                className={fieldClass}
              />
            </label>
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-xl border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-xs text-rose-200"
            >
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
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
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-blue-950/40 hover:bg-blue-500 disabled:opacity-50"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
            {saving ? 'Lançando...' : 'Confirmar Despesa'}
          </button>
        </footer>
      </form>
    </div>
  );
};

export default QuickExpenseModal;
