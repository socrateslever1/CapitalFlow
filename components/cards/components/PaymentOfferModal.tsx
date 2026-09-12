import React from 'react';
import { ArrowLeft, ArrowRight, Calendar, CalendarClock, Check, ChevronLeft, ChevronRight, Percent, RefreshCcw, Tag, X } from 'lucide-react';
import type { Installment, Loan } from '../../../types';
import { formatMoney } from '../../../utils/formatters';
import {
  calculatePaymentOfferPreview,
  isPaymentOfferActive,
  paymentOffersService,
  type PaymentOfferHistoryItem,
  type PaymentOfferInput,
} from '../../../services/paymentOffers.service';

interface PaymentOfferModalProps {
  loan: Loan;
  installment: Installment;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

const dateKey = (value?: string) => value ? String(value).slice(0, 10) : '';
const STEPS = [
  { id: 1, label: 'Condição' },
  { id: 2, label: 'Ajustes' },
  { id: 3, label: 'Período' },
  { id: 4, label: 'Revisão' },
] as const;

export const PaymentOfferModal: React.FC<PaymentOfferModalProps> = ({ loan, installment, onClose, onSaved }) => {
  const active = isPaymentOfferActive(installment);
  const currentMode: PaymentOfferInput['discountMode'] =
    Number(installment.paymentOfferDiscountPercent || 0) > 0
      ? 'PERCENT'
      : Number(installment.paymentOfferDiscountValue || 0) > 0 ? 'VALUE' : 'NONE';
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = React.useState<PaymentOfferInput>({
    offerType: installment.paymentOfferType === 'INTEREST_RENEWAL' ? 'INTEREST_RENEWAL' : 'SETTLEMENT',
    agreedDate: dateKey(installment.paymentOfferAgreedDate) || today,
    validUntil: dateKey(installment.paymentOfferValidUntil) || today,
    discountMode: currentMode,
    discount: currentMode === 'PERCENT'
      ? Number(installment.paymentOfferDiscountPercent || 0)
      : Number(installment.paymentOfferDiscountValue || 0),
    waiveFine: installment.paymentOfferWaiveFine ?? installment.paymentOfferWaiveLateFee ?? false,
    waiveDailyInterest: installment.paymentOfferWaiveDailyInterest ?? installment.paymentOfferWaiveLateFee ?? false,
    note: installment.paymentOfferNote || '',
  });
  const [discountInput, setDiscountInput] = React.useState(() => {
    const currentDiscount = currentMode === 'PERCENT'
      ? Number(installment.paymentOfferDiscountPercent || 0)
      : Number(installment.paymentOfferDiscountValue || 0);
    return currentDiscount > 0 ? String(currentDiscount) : '';
  });
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const [history, setHistory] = React.useState<PaymentOfferHistoryItem[]>([]);
  const [historyError, setHistoryError] = React.useState('');
  const [step, setStep] = React.useState(1);
  const closingFromUi = React.useRef(false);
  const preview = React.useMemo(
    () => calculatePaymentOfferPreview(loan, installment, form),
    [loan, installment, form]
  );
  const canRenewInterest = ['MONTHLY', 'GIRO', 'REVOLVING'].includes(String(loan.billingCycle || '').toUpperCase());
  const update = <K extends keyof PaymentOfferInput>(key: K, value: PaymentOfferInput[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  React.useEffect(() => {
    let alive = true;
    paymentOffersService.history(installment.id)
      .then((items) => {
        if (alive) setHistory(items);
      })
      .catch((reason: any) => {
        if (alive) setHistoryError(reason?.message || 'Nao foi possivel carregar o historico.');
      });
    return () => {
      alive = false;
    };
  }, [installment.id]);

  React.useEffect(() => {
    const state = { ...(window.history.state || {}), paymentOfferModal: true, installmentId: installment.id };
    window.history.pushState(state, '', window.location.href);

    const handlePopState = () => {
      if (closingFromUi.current) return;
      onClose();
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [installment.id, onClose]);

  const closeModal = React.useCallback(() => {
    const modalStateActive = Boolean(window.history.state?.paymentOfferModal);
    if (modalStateActive) {
      closingFromUi.current = true;
      window.history.back();
      window.setTimeout(() => {
        closingFromUi.current = false;
        onClose();
      }, 0);
      return;
    }
    onClose();
  }, [onClose]);

  const actionLabel = (action: string) => {
    const normalized = action.toUpperCase();
    if (normalized === 'CREATED') return 'Criada';
    if (normalized === 'REPLACED') return 'Alterada';
    if (normalized === 'CANCELLED') return 'Cancelada';
    if (normalized === 'USED') return 'Usada';
    if (normalized === 'EXPIRED') return 'Vencida';
    return action;
  };

  const validateDates = () => {
    if (!form.agreedDate || !form.validUntil || form.agreedDate > form.validUntil || form.validUntil < today) {
      setError('Confira a data combinada e a validade.');
      return false;
    }
    return true;
  };

  const goNext = () => {
    setError('');
    if (step === 2 && (form.discount < 0 || (form.discountMode === 'PERCENT' && form.discount > 100))) {
      setError('Informe um desconto válido.');
      return;
    }
    if (step === 3 && !validateDates()) return;
    setStep((current) => Math.min(4, current + 1));
  };

  const submit = async () => {
    setError('');
    if (!validateDates()) return;
    if (form.discount < 0 || (form.discountMode === 'PERCENT' && form.discount > 100)) {
      setError('Informe um desconto válido.');
      return;
    }
    if (preview.finalAmount <= 0.05) {
      setError('O valor final precisa ser maior que zero.');
      return;
    }
    if (form.offerType === 'INTEREST_RENEWAL' && !canRenewInterest) {
      setError('A renovação por juros está disponível somente para contratos mensais ou de giro.');
      return;
    }
    setIsSaving(true);
    try {
      await paymentOffersService.save(loan, installment, form);
      await onSaved();
      closeModal();
    } catch (reason: any) {
      setError(reason?.message || 'Falha ao enviar condição.');
    } finally {
      setIsSaving(false);
    }
  };

  const cancelOffer = async () => {
    setIsSaving(true);
    setError('');
    try {
      await paymentOffersService.cancel(loan, installment, 'Cancelada pelo operador');
      await onSaved();
      closeModal();
    } catch (reason: any) {
      setError(reason?.message || 'Falha ao cancelar condição.');
    } finally {
      setIsSaving(false);
    }
  };

  const ChargeToggle = ({ checked, onChange, title, amount }: {
    checked: boolean;
    onChange: (checked: boolean) => void;
    title: string;
    amount: number;
  }) => (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`flex min-h-14 items-center gap-3 rounded-md border px-3 text-left transition-colors ${
        checked ? 'border-emerald-500/60 bg-emerald-500/10' : 'border-slate-700 bg-slate-950 hover:border-slate-600'
      }`}
    >
      <span className={`grid h-5 w-5 shrink-0 place-items-center rounded border ${
        checked ? 'border-emerald-500 bg-emerald-500 text-slate-950' : 'border-slate-600'
      }`}>
        {checked && <Check size={13} strokeWidth={3} />}
      </span>
      <span className="min-w-0">
        <span className="block text-[10px] font-black text-white">{title}</span>
        <span className={`block truncate text-[9px] font-bold ${checked ? 'text-emerald-400' : 'text-slate-400'}`}>
          {checked ? 'Será retirado' : 'Manter cobrança'} · {formatMoney(amount)}
        </span>
      </span>
    </button>
  );

  const summaryRows = [
    ['Tipo', form.offerType === 'INTEREST_RENEWAL' ? 'Renovar com juros' : 'Quitar ou abater'],
    ['Valor final', formatMoney(preview.finalAmount)],
    ['Data combinada', new Date(`${form.agreedDate}T12:00:00`).toLocaleDateString('pt-BR')],
    ['Válida até', new Date(`${form.validUntil}T12:00:00`).toLocaleDateString('pt-BR')],
  ];

  return (
    <div className="fixed inset-0 z-[500] flex items-stretch justify-center bg-slate-950/90 p-0 sm:items-center sm:p-3 backdrop-blur-sm" onClick={(event) => event.stopPropagation()}>
      <div className="flex h-[100dvh] w-full max-w-md flex-col overflow-hidden border-slate-700 bg-slate-900 shadow-2xl sm:h-auto sm:max-h-[calc(100dvh-1.5rem)] sm:rounded-lg sm:border">
        <header className="shrink-0 border-b border-slate-800 bg-slate-900 px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <button type="button" onClick={step > 1 ? () => setStep((current) => current - 1) : closeModal} className="flex h-9 items-center gap-1 rounded-md px-2 text-slate-300 hover:bg-slate-800 hover:text-white" aria-label={step > 1 ? 'Voltar etapa' : 'Voltar'}>
              <ArrowLeft size={17} />
              <span className="text-[9px] font-black uppercase">Voltar</span>
            </button>
            <div className="min-w-0 flex-1 text-center">
              <h3 className="truncate text-xs font-black uppercase text-white">Condição de pagamento</h3>
              <p className="text-[9px] text-slate-500">Etapa {step} de 4 · {STEPS[step - 1].label}</p>
            </div>
            <button type="button" onClick={closeModal} className="grid h-9 w-9 place-items-center rounded-md text-slate-500 hover:bg-slate-800 hover:text-white" aria-label="Fechar">
              <X size={17} />
            </button>
          </div>
          <div className="mt-2 grid grid-cols-4 gap-1" aria-label="Progresso da condição">
            {STEPS.map((item) => (
              <button key={item.id} type="button" onClick={() => item.id <= step && setStep(item.id)} className={`h-1.5 rounded-full transition-colors ${item.id <= step ? 'bg-blue-500' : 'bg-slate-800'}`} aria-label={`Ir para etapa ${item.id}: ${item.label}`} />
            ))}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [touch-action:pan-y]">
          <div className="space-y-3 p-4 pb-6">
            {step === 1 && <>
              <section>
                <p className="mb-2 text-[9px] font-black uppercase tracking-wider text-slate-400">Tipo da condição</p>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => update('offerType', 'SETTLEMENT')} className={`min-h-14 rounded-md border px-3 text-left ${form.offerType === 'SETTLEMENT' ? 'border-blue-500 bg-blue-500/10' : 'border-slate-700 bg-slate-950'}`}>
                    <span className="block text-[10px] font-black text-white">Quitar ou abater</span>
                    <span className="block text-[8px] text-slate-500">Reduz o saldo da parcela</span>
                  </button>
                  <button type="button" disabled={!canRenewInterest} onClick={() => { update('offerType', 'INTEREST_RENEWAL'); update('discountMode', 'NONE'); update('discount', 0); setDiscountInput(''); }} className={`min-h-14 rounded-md border px-3 text-left disabled:cursor-not-allowed disabled:opacity-40 ${form.offerType === 'INTEREST_RENEWAL' ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-700 bg-slate-950'}`}>
                    <span className="flex items-center gap-1 text-[10px] font-black text-white"><RefreshCcw size={11} /> Renovar com juros</span>
                    <span className="block text-[8px] text-slate-500">Mantém o capital e avança 1 mês</span>
                  </button>
                </div>
              </section>
              <section className="grid grid-cols-[1fr_auto_1fr] items-center rounded-md border border-blue-500/30 bg-blue-500/5 p-3">
                <div>
                  <p className="text-[9px] font-black uppercase text-slate-500">Valor atual</p>
                  <p className="mt-1 text-sm font-bold text-slate-400 line-through">{formatMoney(preview.originalAmount)}</p>
                </div>
                <ArrowRight size={16} className="mx-3 text-blue-400" />
                <div className="text-right">
                  <p className="text-[9px] font-black uppercase text-blue-400">{form.offerType === 'INTEREST_RENEWAL' ? 'Juros e encargos' : 'Valor oferecido'}</p>
                  <p className="text-xl font-black text-white">{formatMoney(preview.finalAmount)}</p>
                </div>
              </section>
            </>}

            {step === 2 && <>
              {(form.offerType === 'SETTLEMENT' || preview.fine > 0.05 || preview.dailyInterest > 0.05) && <section>
                <p className="mb-2 text-[9px] font-black uppercase tracking-wider text-slate-400">Encargos do atraso</p>
                <div className="grid grid-cols-2 gap-2">
                  <ChargeToggle checked={form.waiveFine} onChange={(value) => update('waiveFine', value)} title="Retirar multa" amount={preview.fine} />
                  <ChargeToggle checked={form.waiveDailyInterest} onChange={(value) => update('waiveDailyInterest', value)} title="Retirar mora diária" amount={preview.dailyInterest} />
                </div>
              </section>}
              {form.offerType === 'SETTLEMENT' && <section>
                <p className="mb-2 text-[9px] font-black uppercase tracking-wider text-slate-400">Desconto adicional</p>
                <div className="grid grid-cols-3 gap-1 rounded-md bg-slate-950 p-1">
                  {([['NONE', 'Sem desconto'], ['PERCENT', 'Percentual'], ['VALUE', 'Valor em R$']] as const).map(([mode, label]) => (
                    <button key={mode} type="button" onClick={() => { update('discountMode', mode); if (mode === 'NONE') { setDiscountInput(''); update('discount', 0); } }} className={`min-h-9 rounded px-1 text-[8px] font-black uppercase transition-colors ${form.discountMode === mode ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}>{label}</button>
                  ))}
                </div>
                {form.discountMode !== 'NONE' && <label className="mt-2 flex h-11 w-full items-center gap-2 rounded-md border border-slate-700 bg-slate-950 px-3 focus-within:border-blue-500">
                  {form.discountMode === 'PERCENT' ? <Percent size={12} className="text-blue-400" /> : <Tag size={12} className="text-blue-400" />}
                  <input type="number" min="0" max={form.discountMode === 'PERCENT' ? 100 : undefined} step="0.01" value={discountInput} placeholder="0" onChange={(event) => { const rawValue = event.target.value; setDiscountInput(rawValue); update('discount', rawValue === '' ? 0 : Number(rawValue)); }} className="min-w-0 flex-1 bg-transparent text-sm font-bold text-white outline-none placeholder:text-slate-600" />
                  <span className="text-[9px] font-black uppercase text-slate-500">{form.discountMode === 'PERCENT' ? '%' : 'reais'}</span>
                </label>}
              </section>}
            </>}

            {step === 3 && <>
              <section>
                <p className="mb-2 text-[9px] font-black uppercase tracking-wider text-slate-400">Período da condição</p>
                <div className="grid grid-cols-1 gap-2">
                  <label>
                    <span className="mb-1 block text-[9px] font-bold text-slate-400">Data combinada</span>
                    <span className="relative block">
                      <input type="date" value={form.agreedDate} onChange={(event) => update('agreedDate', event.target.value)} className="h-11 w-full rounded-md border border-slate-700 bg-slate-950 px-3 pr-10 text-xs font-bold text-white outline-none [color-scheme:dark] focus:border-blue-500" />
                      <Calendar size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-blue-400" />
                    </span>
                  </label>
                  <label>
                    <span className="mb-1 block text-[9px] font-bold text-slate-400">Válida até</span>
                    <span className="relative block">
                      <input type="date" value={form.validUntil} onChange={(event) => update('validUntil', event.target.value)} className="h-11 w-full rounded-md border border-slate-700 bg-slate-950 px-3 pr-10 text-xs font-bold text-white outline-none [color-scheme:dark] focus:border-blue-500" />
                      <Calendar size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-blue-400" />
                    </span>
                  </label>
                </div>
              </section>
              <details className="rounded-md border border-slate-800 bg-slate-950">
                <summary className="cursor-pointer px-3 py-2 text-[9px] font-black uppercase text-slate-500">Adicionar observação</summary>
                <textarea value={form.note} onChange={(event) => update('note', event.target.value)} maxLength={500} rows={3} className="w-full resize-none border-t border-slate-800 bg-transparent p-3 text-xs text-white outline-none" />
              </details>
            </>}

            {step === 4 && <>
              <section className="rounded-md border border-blue-500/25 bg-blue-500/5 p-3">
                <div className="mb-2 flex items-center gap-2"><CalendarClock size={16} className="text-blue-400" /><p className="text-[9px] font-black uppercase text-slate-300">Revisão da condição</p></div>
                <div className="space-y-2">
                  {summaryRows.map(([label, value]) => <div key={label} className="flex items-center justify-between gap-3 border-b border-slate-800 pb-2 last:border-b-0 last:pb-0"><span className="text-[9px] font-bold text-slate-500">{label}</span><span className="text-[10px] font-black text-white text-right">{value}</span></div>)}
                </div>
              </section>
              <section className="rounded-md border border-slate-800 bg-slate-950/70">
                <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2"><p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Histórico da condição</p>{active && <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[8px] font-black uppercase text-emerald-400">Ativa</span>}</div>
                <div className="max-h-40 overflow-y-auto p-2">
                  {historyError ? <p className="px-1 py-2 text-[9px] font-bold text-rose-400">{historyError}</p> : history.length === 0 ? <p className="px-1 py-2 text-[9px] font-bold text-slate-500">Nenhum histórico registrado para esta parcela.</p> : history.map((item) => <div key={item.id} className="mb-1 rounded border border-slate-800 bg-slate-900/70 px-2 py-1.5 last:mb-0"><div className="flex items-center justify-between gap-2"><span className="text-[8px] font-black uppercase text-slate-300">{actionLabel(item.action)} · {item.offerType === 'INTEREST_RENEWAL' ? 'Renovação' : 'Condição'}</span><span className="text-[8px] font-bold text-slate-500">{new Date(item.createdAt).toLocaleDateString('pt-BR')}</span></div><p className="mt-0.5 text-[9px] font-bold text-white">{formatMoney(item.offeredAmount)}</p></div>)}
                </div>
              </section>
            </>}

            {error && <p className="rounded-md border border-rose-500/20 bg-rose-500/10 p-2 text-[10px] font-bold text-rose-400">{error}</p>}
          </div>
        </div>

        <div className="shrink-0 border-t border-slate-800 bg-slate-900/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
          <div className="flex gap-2">
            {step > 1 && <button type="button" onClick={() => setStep((current) => current - 1)} className="h-11 rounded-md border border-slate-700 px-3 text-[9px] font-black uppercase text-slate-300"><ChevronLeft size={14} className="inline" /> Voltar</button>}
            {active && step === 4 && <button type="button" onClick={cancelOffer} disabled={isSaving} className="h-11 rounded-md border border-rose-500/30 px-3 text-[9px] font-black uppercase text-rose-400 disabled:opacity-50">Cancelar condição</button>}
            {step < 4 ? <button type="button" onClick={goNext} className="h-11 flex-1 rounded-md bg-blue-600 px-4 text-[9px] font-black uppercase text-white hover:bg-blue-500">Próximo <ChevronRight size={14} className="inline" /></button> : <button type="button" onClick={submit} disabled={isSaving} className="h-11 flex-1 rounded-md bg-blue-600 px-4 text-[9px] font-black uppercase text-white hover:bg-blue-500 disabled:opacity-50">{isSaving ? 'Enviando...' : 'Enviar para o portal'}</button>}
          </div>
        </div>
      </div>
    </div>
  );
};
