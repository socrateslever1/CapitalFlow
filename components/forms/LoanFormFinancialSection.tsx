import { addCollectionDaysUTC, addDaysUTC, adjustToCollectionDayUTC, normalizeCollectionDaysMode, parseDateOnlyUTC, toISODateOnlyUTC } from '../../utils/dateHelpers';
import React, { useMemo } from 'react';
import { Wallet, CalendarX, Clock, CreditCard, Landmark, AlertTriangle, CalendarDays, ChevronDown, ArrowDownRight, ArrowUpRight, Plus, Trash2 } from 'lucide-react';
import { CapitalSource, LoanBillingModality } from '../../types';
import { formatMoney, cleanNumberStr } from '../../utils/formatters';
import { LoanTotalPreview } from './LoanFormFinancialSection.preview';
import { deriveFundingValues, FundingCalculationMode } from '../../domain/finance/installmentFunding';

const MULTI_SOURCE_CREATION_ENABLED = false;

const parseFundingInput = (value: unknown) => parseFloat(String(value || '').replace(',', '.')) || 0;
const formatMoneyInput = (value: number) => value.toFixed(2);
const formatRateInput = (value: number) => value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');

const getFundingSourceValue = (data: any, mode: FundingCalculationMode) => {
  if (mode === 'RATE') return String(data.fundingMonthlyRate || '');
  if (mode === 'INSTALLMENT') return String(data.fundingInstallmentValue || '');
  return String(data.fundingTotalPayable || '');
};

const synchronizeFundingValues = (
  current: any,
  mode: FundingCalculationMode,
  sourceValue: string,
  changes: Record<string, unknown> = {}
) => {
  const sourceField = mode === 'RATE'
    ? 'fundingMonthlyRate'
    : mode === 'INSTALLMENT'
      ? 'fundingInstallmentValue'
      : 'fundingTotalPayable';
  const next = { ...current, ...changes, fundingCalculationMode: mode, [sourceField]: sourceValue };
  if (sourceValue === '') return next;

  const values = deriveFundingValues(
    parseFundingInput(next.principal),
    parseFundingInput(next.fundingInstallmentsCount),
    mode,
    parseFundingInput(sourceValue)
  );

  return {
    ...next,
    fundingTotalPayable: mode === 'TOTAL' ? sourceValue : formatMoneyInput(values.total),
    fundingInstallmentValue: mode === 'INSTALLMENT' ? sourceValue : formatMoneyInput(values.installment),
    fundingMonthlyRate: mode === 'RATE' ? sourceValue : formatRateInput(values.monthlyRate),
  };
};

interface LoanFormFinancialSectionProps {
  sources: CapitalSource[];
  formData: any;
  setFormData: any;
  isDailyModality: boolean;
  fixedDuration: string;
  setFixedDuration: (v: string) => void;
  manualFirstDueDate: string;
  setManualFirstDueDate: (v: string) => void;
  isEditing?: boolean;
}

export const LoanFormFinancialSection: React.FC<LoanFormFinancialSectionProps> = ({
  sources, formData, setFormData, isDailyModality, fixedDuration, setFixedDuration, manualFirstDueDate, setManualFirstDueDate, isEditing
}) => {
  const inputClass = "block w-full min-w-0 h-14 bg-slate-950/50 border border-slate-800/80 rounded-lg px-4 sm:px-5 text-white text-sm leading-none outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 transition-all";
  const strongInputClass = `${inputClass} font-bold`;
  const dateInputClass = `${inputClass} px-4 font-black text-base tabular-nums [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:opacity-70 [&::-webkit-calendar-picker-indicator]:ml-auto [&::-webkit-calendar-picker-indicator]:cursor-pointer`;

  const selectedSource = sources.find(s => s.id === formData.sourceId);
  const isCardSource = selectedSource?.type === 'MISTO';
  const isInstallmentFixed = formData.billingCycle === 'INSTALLMENT_FIXED';
  const fundingPaymentMethod = formData.fundingPaymentMethod || 'CREDIT_CARD';
  const interestFreeInstallment = isInstallmentFixed && formData.interestFreeInstallment === true;
  const supportsCollectionDays = isDailyModality || formData.billingCycle === 'WEEKLY';
  const collectionDaysMode = normalizeCollectionDaysMode(formData.collectionDaysMode, !!formData.skipWeekends);
  const periodicRateLabel = formData.billingCycle === 'WEEKLY'
    ? 'Juros (%) semanal'
    : formData.billingCycle === 'BIWEEKLY'
      ? 'Juros (%) quinzenal'
      : formData.billingCycle === 'MONTHLY'
        ? 'Juros (%) mensal'
        : 'Taxa (%) mensal';
  const selectBillingCycle = (billingCycle: LoanBillingModality) => {
    const intervalDays = billingCycle === 'WEEKLY' ? 7 : billingCycle === 'BIWEEKLY' ? 15 : 30;
    setFormData({
      ...formData,
      billingCycle,
      ...(billingCycle === 'INSTALLMENT_FIXED' ? {
        fundingInstallmentsCount: formData.fundingInstallmentsCount || '10',
        customerMarginPercent: formData.customerMarginPercent || '30',
        interestFreeInstallment: formData.billingCycle === 'INSTALLMENT_FIXED' ? formData.interestFreeInstallment === true : false,
      } : {
        interestFreeInstallment: false,
      }),
    });
    if (formData.startDate) {
      if (billingCycle === 'DAILY_FREE') {
        setManualFirstDueDate(toISODateOnlyUTC(addCollectionDaysUTC(formData.startDate, 1, collectionDaysMode)));
      } else if (['MONTHLY', 'BIWEEKLY', 'WEEKLY'].includes(billingCycle)) {
        const rawDue = addDaysUTC(formData.startDate, intervalDays);
        const suggestedDue = billingCycle === 'WEEKLY'
          ? adjustToCollectionDayUTC(rawDue, collectionDaysMode)
          : rawDue;
        setManualFirstDueDate(toISODateOnlyUTC(suggestedDue));
      }
    }
  };
  const fundingAllocations = Array.isArray(formData.fundingAllocations) && formData.fundingAllocations.length > 0
    ? formData.fundingAllocations
    : [{ sourceId: formData.sourceId || sources[0]?.id || '', amount: '' }];
  const principalValue = parseFloat(String(formData.principal || '').replace(',', '.')) || 0;
  const distributedTotal = fundingAllocations.length === 1
    ? principalValue
    : fundingAllocations.reduce((sum: number, allocation: any) => sum + (parseFloat(String(allocation.amount || '').replace(',', '.')) || 0), 0);
  const hasMultipleSources = fundingAllocations.length > 1;

  const fundingCostDisplay = useMemo(() => {
      const principal = parseFloat(formData.principal) || 0;
      const totalPayable = parseFloat(formData.fundingTotalPayable) || 0;
      if (totalPayable > principal) {
          return {
              cost: totalPayable - principal,
              isValid: true
          };
      }
      return { cost: 0, isValid: totalPayable === 0 };
  }, [formData.principal, formData.fundingTotalPayable]);

  const fixedInstallmentDisplay = useMemo(() => {
      const principal = parseFloat(formData.principal) || 0;
      const count = Math.max(1, parseInt(formData.fundingInstallmentsCount || '1', 10) || 1);
      const bankTotalInput = parseFloat(formData.fundingTotalPayable) || 0;
      const bankMonthlyRate = parseFloat(formData.fundingMonthlyRate) || 0;
      const bankInstallmentInput = parseFloat(formData.fundingInstallmentValue) || 0;
      const margin = parseFloat(formData.customerMarginPercent) || 0;
      const mode = formData.fundingCalculationMode || 'TOTAL';
      const monthlyRate = bankMonthlyRate / 100;
      const bankInstallment = fundingPaymentMethod === 'BANK_ACCOUNT_DEBIT'
          ? principal / count
          : mode === 'INSTALLMENT'
          ? bankInstallmentInput
          : mode === 'RATE'
          ? (monthlyRate > 0 ? principal * (monthlyRate / (1 - Math.pow(1 + monthlyRate, -count))) : principal / count)
          : (bankTotalInput > 0 ? bankTotalInput / count : principal / count);
      const bankTotal = bankInstallment * count;
      
      const absorbsInterest = formData.fundingOperatorAbsorbsInterest === true;
      const baseForClient = absorbsInterest ? (principal / count) : bankInstallment;

      const customerInstallment = interestFreeInstallment ? principal / count : baseForClient * (1 + margin / 100);
      const customerTotal = interestFreeInstallment ? principal : customerInstallment * count;
      return { count, bankInstallment, bankTotal, customerInstallment, customerTotal, profit: customerTotal - bankTotal };
  }, [formData.principal, formData.fundingInstallmentsCount, formData.fundingTotalPayable, formData.fundingMonthlyRate, formData.fundingInstallmentValue, formData.customerMarginPercent, formData.fundingCalculationMode, formData.fundingOperatorAbsorbsInterest, interestFreeInstallment, fundingPaymentMethod]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <h3 className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.14em] text-purple-400"><Wallet className="h-3.5 w-3.5" /> Condições</h3>
      <div className="space-y-3">

        <div className="grid grid-cols-6 gap-1 rounded-lg border border-slate-800/80 bg-slate-950/45 p-1">
            {[
              { value: 'MONTHLY', label: 'Mensal', active: formData.billingCycle === 'MONTHLY', mobileSpan: 'col-span-2' },
              { value: 'BIWEEKLY', label: 'Quinzenal', active: formData.billingCycle === 'BIWEEKLY', mobileSpan: 'col-span-2' },
              { value: 'WEEKLY', label: 'Semanal', active: formData.billingCycle === 'WEEKLY', mobileSpan: 'col-span-2' },
              { value: 'INSTALLMENT_FIXED', label: 'Parcelado', active: isInstallmentFixed, mobileSpan: 'col-span-3' },
              { value: 'DAILY_FREE', label: 'Diário', active: isDailyModality, mobileSpan: 'col-span-3' },
            ].map(({ value, label, active, mobileSpan }) => (
              <button
                key={value}
                type="button"
                aria-pressed={active}
                onClick={() => selectBillingCycle(value as LoanBillingModality)}
                className={`${mobileSpan} flex h-9 min-h-0 min-w-0 items-center justify-center rounded-md border px-2 text-[9px] font-black uppercase tracking-wide whitespace-nowrap transition-all ${active ? 'border-purple-400/50 bg-purple-500/15 text-white ring-1 ring-purple-400/10' : 'border-transparent text-slate-500 hover:border-slate-800 hover:bg-slate-900/70 hover:text-slate-200'}`}
              >
                {label}
              </button>
            ))}
        </div>

        {isInstallmentFixed && (!isEditing || interestFreeInstallment) && (
            <button
              type="button"
              disabled={!!isEditing}
              aria-pressed={interestFreeInstallment}
              onClick={() => {
                if (isEditing) return;
                setFormData((current: any) => {
                  const enabled = current.interestFreeInstallment !== true;
                  return {
                    ...current,
                    interestFreeInstallment: enabled,
                    interestRate: enabled ? '0' : current.interestRate,
                    finePercent: current.finePercent,
                    dailyInterestPercent: current.dailyInterestPercent,
                    customerMarginPercent: enabled ? '0' : (current.customerMarginPercent === '0' ? '30' : current.customerMarginPercent),
                    fundingOperatorAbsorbsInterest: enabled ? true : current.fundingOperatorAbsorbsInterest,
                  };
                });
              }}
              className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-all ${interestFreeInstallment ? 'border-emerald-500/35 bg-emerald-500/10' : 'border-slate-800 bg-slate-950/35 hover:border-slate-700'} ${isEditing ? 'cursor-default' : ''}`}
            >
              <div className="min-w-0">
                <p className={`text-[10px] font-black ${interestFreeInstallment ? 'text-emerald-300' : 'text-slate-300'}`}>Sem juros no parcelamento</p>
                <p className="mt-0.5 text-[8px] leading-tight text-slate-500">As parcelas não têm juros. Se atrasar, aplica a multa e a mora diária configuradas abaixo.</p>
              </div>
              <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${interestFreeInstallment ? 'bg-emerald-500' : 'bg-slate-800'}`}>
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${interestFreeInstallment ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </span>
            </button>
        )}

        {isDailyModality && (
            <div className="space-y-4 animate-in slide-in-from-top-2">
                <div className="space-y-2">
                    <label className="text-[9px] text-purple-400 font-black uppercase ml-2">Tipo de Diária</label>
                    <div className="relative group">
                        <select
                            value={formData.billingCycle || ''}
                            onChange={(e) => {
                              const nextCycle = e.target.value as LoanBillingModality;
                              setFormData({...formData, billingCycle: nextCycle});
                              if (formData.startDate) {
                                const suggested = nextCycle === 'DAILY_FIXED_TERM'
                                  ? addCollectionDaysUTC(formData.startDate, Math.max(1, Number(fixedDuration) || 1), collectionDaysMode)
                                  : addCollectionDaysUTC(formData.startDate, 1, collectionDaysMode);
                                setManualFirstDueDate(toISODateOnlyUTC(suggested));
                              }
                            }}
                            className="w-full appearance-none bg-slate-950/50 border border-purple-500/30 rounded-lg px-4 py-3 pr-10 text-white text-xs outline-none focus:border-purple-500/50 focus:ring-4 focus:ring-purple-500/10 transition-all cursor-pointer"
                        >
                            <option value="DAILY_FREE">Diária Livre (Somente Juros)</option>
                            <option value="DAILY_FIXED_TERM">Prazo Fixo (Parcela Fixa)</option>
                        </select>
                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-purple-500 pointer-events-none" size={16}/>
                    </div>
                </div>

                {formData.billingCycle === 'DAILY_FIXED_TERM' && (
                    <div className="space-y-1 animate-in fade-in">
                        <label className="text-[9px] text-slate-500 font-black uppercase ml-2 flex items-center gap-1"><Clock size={10}/> Prazo Total (Dias)</label>
                        <input
                            type="number"
                            min="1"
                            value={fixedDuration || ''}
                            onChange={(e) => setFixedDuration(e.target.value)}
                            className="w-full bg-slate-950/50 border border-slate-800/80 rounded-lg px-5 py-4 text-white font-bold text-sm outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 transition-all"
                            placeholder="Ex: 30"
                        />
                    </div>
                )}
            </div>
        )}

        {supportsCollectionDays && (
            <div className="space-y-2 rounded-lg border border-slate-800/80 bg-slate-950/40 p-2.5">
                <div className="flex items-center gap-1.5 px-0.5">
                    <CalendarX size={13} className="text-purple-400" />
                    <p className="text-[9px] font-black tracking-wide text-slate-300">Receber em</p>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { value: 'ALL_DAYS', label: 'Todos os dias', detail: 'Seg–Dom' },
                      { value: 'SKIP_SUNDAY', label: 'Seg. a sábado', detail: 'Domingo livre' },
                      { value: 'SKIP_WEEKEND', label: 'Seg. a sexta', detail: 'Fim de semana livre' },
                    ].map(({ value, label, detail }) => {
                      const selected = collectionDaysMode === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => {
                            setFormData((current: any) => ({ ...current, collectionDaysMode: value }));
                            if (!isEditing && formData.startDate) {
                              let suggested = parseDateOnlyUTC(formData.startDate);
                              if (formData.billingCycle === 'DAILY_FREE') {
                                suggested = addCollectionDaysUTC(formData.startDate, 1, value as any);
                              } else if (formData.billingCycle === 'DAILY_FIXED_TERM') {
                                suggested = addCollectionDaysUTC(formData.startDate, Math.max(1, Number(fixedDuration) || 1), value as any);
                              } else if (formData.billingCycle === 'WEEKLY') {
                                suggested = adjustToCollectionDayUTC(addDaysUTC(formData.startDate, 7), value as any);
                              }
                              setManualFirstDueDate(toISODateOnlyUTC(suggested));
                            }
                          }}
                          className={`flex h-[52px] min-h-0 flex-col items-center justify-center rounded-md border px-1.5 text-center transition-all ${selected ? 'border-purple-400/60 bg-purple-500/15 text-white ring-1 ring-purple-400/10' : 'border-slate-800 bg-slate-900/45 text-slate-400 hover:border-slate-700 hover:bg-slate-900/70'}`}
                        >
                          <span className="text-[9px] font-black leading-tight">{label}</span>
                          <span className={`mt-0.5 text-[7px] font-bold leading-tight ${selected ? 'text-purple-200' : 'text-slate-600'}`}>{detail}</span>
                        </button>
                      );
                    })}
                </div>
            </div>
        )}

        <div className={`grid ${isInstallmentFixed ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'} gap-4`}>
          <div className="space-y-1">
            <label className="text-[9px] text-slate-500 font-black uppercase ml-2">{isEditing ? 'Capital atual' : 'Principal'}</label>
            <input required type="number" min="0.01" step="0.01" value={formData.principal || ''} onChange={e => {
              const principal = cleanNumberStr(e.target.value);
              setFormData((current: any) => {
                if (current.billingCycle !== 'INSTALLMENT_FIXED' || (current.fundingPaymentMethod || 'CREDIT_CARD') !== 'CREDIT_CARD') return { ...current, principal };
                const mode = (current.fundingCalculationMode || 'TOTAL') as FundingCalculationMode;
                return synchronizeFundingValues(current, mode, getFundingSourceValue(current, mode), { principal });
              });
            }} className="w-full border rounded-lg px-5 py-4 font-bold outline-none transition-all bg-slate-950/50 border-slate-800/80 text-white focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10" />
            {isEditing && <p className="text-[8px] text-slate-500 font-bold ml-2">Ao aumentar o capital, somente a diferença será registrada como aporte na parcela em aberto. Para corrigir um valor menor, é necessário preservar os recebimentos já registrados.</p>}
          </div>
          {!isInstallmentFixed && <div className="space-y-1">
            <label className="text-[9px] text-slate-500 font-black uppercase ml-2">{periodicRateLabel}</label>
            <input required type="number" step="0.01" value={formData.interestRate || ''} onChange={e => setFormData({...formData, interestRate: cleanNumberStr(e.target.value)})} className="w-full bg-slate-950/50 border border-slate-800/80 rounded-lg px-5 py-4 text-white font-bold outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 transition-all" />
          </div>}
        </div>

        {!isInstallmentFixed && <LoanTotalPreview formData={formData} setFormData={setFormData} />}

        <div className="grid grid-cols-1 gap-4">
          <div className="space-y-1">
              <label className="text-[9px] text-slate-500 font-black uppercase ml-2">Data Empréstimo</label>
              <input
                  required
                  type="date"
                  value={formData.startDate || ''}
                  onChange={e => {
                      const startDate = e.target.value;
                      setFormData((current: any) => ({ ...current, startDate }));
                      if (startDate) {
                        let suggested = addDaysUTC(startDate, formData.billingCycle === 'WEEKLY' ? 7 : formData.billingCycle === 'BIWEEKLY' ? 15 : 30);
                        if (formData.billingCycle === 'DAILY_FREE') {
                          suggested = addCollectionDaysUTC(startDate, 1, collectionDaysMode);
                        } else if (formData.billingCycle === 'DAILY_FIXED_TERM') {
                          suggested = addCollectionDaysUTC(startDate, Math.max(1, Number(fixedDuration) || 1), collectionDaysMode);
                        } else if (formData.billingCycle === 'WEEKLY') {
                          suggested = adjustToCollectionDayUTC(suggested, collectionDaysMode);
                        }
                        setManualFirstDueDate(toISODateOnlyUTC(suggested));
                      }
                  }}
                  className={dateInputClass}
              />
          </div>
          <div className="space-y-1">
              <label className="text-[9px] text-blue-400 font-black uppercase ml-2 flex items-center gap-1"><CalendarDays size={10}/> Vencimento (1º)</label>
              <input
                  required
                  type="date"
                  value={manualFirstDueDate || ''}
                  onChange={e => setManualFirstDueDate(e.target.value)}
                  className={`${dateInputClass} border-blue-500/30 focus:border-blue-500/50`}
              />
              <p className="ml-2 text-[10px] text-slate-500">Sugerido conforme a modalidade. Você pode alterar livremente o vencimento.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
                <label className="text-[9px] text-slate-500 font-black uppercase ml-2">Multa (%)</label>
                <input type="number" step="0.1" value={formData.finePercent || ''} onChange={e => setFormData({...formData, finePercent: cleanNumberStr(e.target.value)})} className="w-full bg-slate-950/50 border border-slate-800/80 rounded-lg px-5 py-4 text-white text-sm outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 transition-all" />
            </div>
            <div className="space-y-1">
                <label className="text-[9px] text-slate-500 font-black uppercase ml-2">Mora Diária (%)</label>
                <input type="number" step="0.1" value={formData.dailyInterestPercent || ''} onChange={e => setFormData({...formData, dailyInterestPercent: cleanNumberStr(e.target.value)})} className="w-full bg-slate-950/50 border border-slate-800/80 rounded-lg px-5 py-4 text-white text-sm outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 transition-all" />
            </div>
        </div>

        <div className="space-y-3">
            <div className="flex items-center justify-between gap-3"><label className="text-[9px] text-slate-500 font-black uppercase ml-2">Fonte de capital</label>{MULTI_SOURCE_CREATION_ENABLED && !isEditing && <button type="button" onClick={() => setFormData((current: any) => ({ ...current, fundingAllocations: [...(current.fundingAllocations || []), { sourceId: sources.find((source) => source.id !== current.sourceId)?.id || sources[0]?.id || '', amount: '' }] }))} className="flex items-center gap-1 rounded-md border border-purple-500/30 px-2 py-1.5 text-[9px] font-black uppercase text-purple-300"><Plus size={12} /> Adicionar fonte</button>}</div>
            <div className="space-y-2">
              {fundingAllocations.map((allocation: any, index: number) => <div key={`${allocation.sourceId}-${index}`} className="flex gap-2">
                <div className="relative group min-w-0 flex-1"><select value={allocation.sourceId || ''} onChange={(event) => setFormData((current: any) => { const next = [...(current.fundingAllocations || fundingAllocations)]; next[index] = { ...next[index], sourceId: event.target.value }; return { ...current, sourceId: index === 0 ? event.target.value : current.sourceId, fundingAllocations: next }; })} className="w-full appearance-none rounded-lg border border-slate-800/80 bg-slate-950/50 px-3 py-4 pr-8 text-xs text-white outline-none focus:border-purple-500/50"><option value="">Selecione</option>{sources.map((source) => <option key={source.id} value={source.id}>{source.name} · {source.type === 'MISTO' ? 'Misto' : `R$ ${Number(source.balance || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" size={15} /></div>
                {hasMultipleSources && <input type="number" min="0.01" step="0.01" value={allocation.amount || ''} onChange={(event) => setFormData((current: any) => { const next = [...(current.fundingAllocations || fundingAllocations)]; next[index] = { ...next[index], amount: event.target.value }; return { ...current, fundingAllocations: next }; })} placeholder="Valor" className="w-28 rounded-lg border border-slate-800/80 bg-slate-950/50 px-3 py-4 text-xs font-bold text-white outline-none focus:border-purple-500/50" />}
                {fundingAllocations.length > 1 && !isEditing && <button type="button" aria-label="Remover fonte" onClick={() => setFormData((current: any) => ({ ...current, fundingAllocations: (current.fundingAllocations || fundingAllocations).filter((_: any, itemIndex: number) => itemIndex !== index) }))} className="rounded-lg border border-rose-500/20 px-2 text-rose-300"><Trash2 size={15} /></button>}
              </div>)}
            </div>
            {!hasMultipleSources && <p className="ml-2 text-[10px] text-slate-500">O valor do contrato será retirado desta fonte, mesmo que o saldo fique negativo.</p>}
            {hasMultipleSources && <div className={`rounded-lg border p-3 text-[10px] font-black uppercase ${Math.abs(distributedTotal - principalValue) < 0.005 ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-300' : 'border-amber-500/30 bg-amber-950/20 text-amber-300'}`}>Distribuído: R$ {distributedTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} · Capital: R$ {principalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} · {Math.abs(distributedTotal - principalValue) < 0.005 ? 'Fechado' : 'Ajuste os valores'}</div>}
        </div>

        {isInstallmentFixed && (
            <div className="space-y-2 rounded-lg border border-slate-800/80 bg-slate-950/45 p-3">
                <p className="text-[9px] font-black uppercase text-slate-500">Forma de lançamento</p>
                <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-900/80 p-1">
                    {[
                      { value: 'CREDIT_CARD', label: 'Cartão de crédito', icon: CreditCard },
                      { value: 'BANK_ACCOUNT_DEBIT', label: 'Débito em conta', icon: Landmark },
                    ].map(({ value, label, icon: Icon }) => {
                      const selected = fundingPaymentMethod === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => setFormData((current: any) => ({
                            ...current,
                            fundingPaymentMethod: value,
                            ...(value === 'BANK_ACCOUNT_DEBIT' ? {
                              fundingCalculationMode: 'TOTAL',
                              fundingTotalPayable: current.principal || '',
                              fundingMonthlyRate: '0',
                              fundingOperatorAbsorbsInterest: true,
                            } : {}),
                          }))}
                          className={`flex min-h-10 items-center justify-center gap-2 rounded-md border px-2 text-[9px] font-black transition-colors ${selected ? 'border-blue-400/50 bg-blue-500/15 text-white' : 'border-transparent text-slate-500 hover:text-slate-200'}`}
                        >
                          <Icon size={14} /> {label}
                        </button>
                      );
                    })}
                </div>
                <p className="text-[9px] leading-relaxed text-slate-500">
                  {fundingPaymentMethod === 'CREDIT_CARD'
                    ? 'Registre abaixo o custo e as parcelas cobradas pelo cartão.'
                    : 'O capital será debitado da conta selecionada, sem custo de captação adicional.'}
                </p>
            </div>
        )}

        {interestFreeInstallment && (
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-950/10 p-3 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <label className="ml-1 text-[9px] font-black uppercase text-slate-500">Número de parcelas</label>
                        <input type="number" min="1" value={formData.fundingInstallmentsCount || ''} onChange={e => setFormData((current: any) => {
                          const mode = (current.fundingCalculationMode || 'TOTAL') as FundingCalculationMode;
                          return synchronizeFundingValues(current, mode, getFundingSourceValue(current, mode), { fundingInstallmentsCount: e.target.value });
                        })} className={strongInputClass} />
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                        <p className="text-[8px] font-black uppercase text-slate-500">Valor por parcela</p>
                        <p className="mt-1 text-sm font-black text-emerald-300">{formatMoney(fixedInstallmentDisplay.customerInstallment)}</p>
                    </div>
                </div>
                {fundingPaymentMethod === 'CREDIT_CARD' && (
                  <div className="grid grid-cols-1 gap-3 border-t border-slate-800/70 pt-3 sm:grid-cols-2">
                    <div className="grid grid-cols-3 rounded-lg border border-slate-800/60 bg-slate-900/80 p-1">
                      {(['TOTAL', 'INSTALLMENT', 'RATE'] as FundingCalculationMode[]).map((mode) => <button key={mode} type="button" onClick={() => setFormData((current: any) => {
                        const currentMode = (current.fundingCalculationMode || 'TOTAL') as FundingCalculationMode;
                        const synchronized = synchronizeFundingValues(current, currentMode, getFundingSourceValue(current, currentMode));
                        return { ...synchronized, fundingCalculationMode: mode };
                      })} className={`flex-1 rounded-md py-2 text-[9px] font-black ${formData.fundingCalculationMode === mode ? 'bg-slate-700 text-white' : 'text-slate-500'}`}>{mode === 'TOTAL' ? 'Valor final' : mode === 'INSTALLMENT' ? 'Parcela' : 'Taxa mensal'}</button>)}
                    </div>
                    {formData.fundingCalculationMode === 'RATE'
                      ? <div><label className="ml-1 text-[9px] font-black uppercase text-slate-500">Taxa do cartão (% a.m.)</label><input type="number" min="0" step="0.01" value={formData.fundingMonthlyRate || ''} onChange={e => { const value = cleanNumberStr(e.target.value); setFormData((current: any) => synchronizeFundingValues(current, 'RATE', value)); }} className={strongInputClass}/></div>
                      : formData.fundingCalculationMode === 'INSTALLMENT'
                        ? <div><label className="ml-1 text-[9px] font-black uppercase text-slate-500">Valor da parcela do cartão</label><input type="number" min="0.01" step="0.01" value={formData.fundingInstallmentValue || ''} onChange={e => { const value = cleanNumberStr(e.target.value); setFormData((current: any) => synchronizeFundingValues(current, 'INSTALLMENT', value)); }} className={strongInputClass}/></div>
                        : <div><label className="ml-1 text-[9px] font-black uppercase text-slate-500">Total cobrado pelo cartão</label><input type="number" min="0" step="0.01" value={formData.fundingTotalPayable || ''} onChange={e => { const value = cleanNumberStr(e.target.value); setFormData((current: any) => synchronizeFundingValues(current, 'TOTAL', value)); }} className={strongInputClass}/></div>}
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-slate-800/70 pt-2 text-[9px]">
                    <span className="font-bold text-slate-500">Total do contrato</span>
                    <span className="font-black text-white">{formatMoney(principalValue)}</span>
                </div>
            </div>
        )}

        {!interestFreeInstallment && (isCardSource || isInstallmentFixed) && (
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-5 sm:p-6 space-y-6 shadow-2xl relative overflow-hidden transition-all duration-300 hover:border-slate-700/80 animate-in slide-in-from-right">
                <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/5 rounded-full blur-3xl pointer-events-none"></div>
                <div className="absolute bottom-0 left-0 w-32 h-32 bg-purple-500/5 rounded-full blur-3xl pointer-events-none"></div>

                <div className="flex items-center gap-2.5 text-rose-400 border-b border-slate-900 pb-3">
                    {fundingPaymentMethod === 'BANK_ACCOUNT_DEBIT' ? <Landmark size={18} className="text-blue-400" /> : <CreditCard size={18} className="text-rose-500" />}
                    <span className="text-xs font-black uppercase tracking-widest text-slate-200">Condições do parcelamento</span>
                </div>

                {isInstallmentFixed ? (
                    <div className="space-y-5">
                        {fundingPaymentMethod === 'CREDIT_CARD' && <div className="grid grid-cols-3 bg-slate-900/80 p-1 rounded-lg border border-slate-800/60">
                            {(['TOTAL', 'INSTALLMENT', 'RATE'] as FundingCalculationMode[]).map((mode) => <button key={mode} type="button" onClick={() => setFormData((current: any) => {
                              const currentMode = (current.fundingCalculationMode || 'TOTAL') as FundingCalculationMode;
                              const synchronized = synchronizeFundingValues(current, currentMode, getFundingSourceValue(current, currentMode));
                              return { ...synchronized, fundingCalculationMode: mode };
                            })} className={`py-2.5 rounded-lg text-[9px] font-black uppercase tracking-wide transition-all duration-200 ${formData.fundingCalculationMode === mode ? 'bg-gradient-to-r from-rose-600 to-pink-600 text-white shadow-md shadow-rose-950/50' : 'text-slate-400 hover:text-slate-200'}`}>{mode === 'TOTAL' ? 'Valor final' : mode === 'INSTALLMENT' ? 'Parcela' : 'Taxa mensal'}</button>)}
                        </div>}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div><label className="text-[9px] text-slate-500 font-black uppercase ml-2">Quantidade de parcelas</label><input type="number" min="1" value={formData.fundingInstallmentsCount || ''} onChange={e => setFormData((current: any) => {
                              const mode = (current.fundingCalculationMode || 'TOTAL') as FundingCalculationMode;
                              return synchronizeFundingValues(current, mode, getFundingSourceValue(current, mode), { fundingInstallmentsCount: e.target.value });
                            })} className={strongInputClass}/></div>
                            {fundingPaymentMethod === 'CREDIT_CARD' && (formData.fundingCalculationMode === 'RATE' ? <div><label className="text-[9px] text-slate-500 font-black uppercase ml-2">Taxa do cartão (% a.m.)</label><input type="number" step="0.01" value={formData.fundingMonthlyRate || ''} onChange={e => { const value = cleanNumberStr(e.target.value); setFormData((current: any) => synchronizeFundingValues(current, 'RATE', value)); }} className={strongInputClass}/></div> : formData.fundingCalculationMode === 'INSTALLMENT' ? <div><label className="text-[9px] text-slate-500 font-black uppercase ml-2">Valor da parcela do cartão</label><input type="number" min="0.01" step="0.01" value={formData.fundingInstallmentValue || ''} onChange={e => { const value = cleanNumberStr(e.target.value); setFormData((current: any) => synchronizeFundingValues(current, 'INSTALLMENT', value)); }} className={strongInputClass}/></div> : <div><label className="text-[9px] text-slate-500 font-black uppercase ml-2">Total cobrado pelo cartão</label><input type="number" step="0.01" value={formData.fundingTotalPayable || ''} onChange={e => { const value = cleanNumberStr(e.target.value); setFormData((current: any) => synchronizeFundingValues(current, 'TOTAL', value)); }} className={strongInputClass}/></div>)}
                            <div><label className="text-[9px] text-slate-500 font-black uppercase ml-2">Juros do cliente (%)</label><input type="number" min="0" step="0.01" value={formData.customerMarginPercent || ''} onChange={e => setFormData({...formData, customerMarginPercent: cleanNumberStr(e.target.value)})} className={strongInputClass}/></div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                            <div className="rounded-lg bg-slate-900/70 border border-slate-800 p-3"><p className="text-[9px] uppercase font-black text-slate-500">{fundingPaymentMethod === 'CREDIT_CARD' ? 'Parcela do cartão' : 'Débito base'}</p><p className="font-black text-white mt-1">{formatMoney(fixedInstallmentDisplay.bankInstallment)}</p></div>
                            <div className="grid grid-cols-2 rounded-lg border border-slate-800 bg-slate-900/70 p-3">
                              <div className="min-w-0 pr-3">
                                <p className="text-[9px] font-black uppercase text-slate-500">Parcela cliente</p>
                                <p className="mt-1 font-black text-emerald-400">{formatMoney(fixedInstallmentDisplay.customerInstallment)}</p>
                              </div>
                              <div className="min-w-0 border-l border-slate-800 pl-3">
                                <p className="text-[9px] font-black uppercase text-slate-500">Total cliente</p>
                                <p className="mt-1 font-black text-white">{formatMoney(fixedInstallmentDisplay.customerTotal)}</p>
                              </div>
                            </div>
                            <div className="rounded-lg bg-slate-900/70 border border-slate-800 p-3"><p className="text-[9px] uppercase font-black text-slate-500">Lucro previsto</p><p className="font-black text-purple-400 mt-1">{formatMoney(fixedInstallmentDisplay.profit)}</p></div>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div><label className="text-[9px] text-slate-500 font-black uppercase ml-2">Total a pagar à fonte</label><input type="number" step="0.01" value={formData.fundingTotalPayable || ''} onChange={e => setFormData({...formData, fundingTotalPayable: cleanNumberStr(e.target.value)})} className={strongInputClass}/></div>
                      <div className="rounded-lg bg-slate-900/70 border border-slate-800 p-4"><p className="text-[9px] uppercase font-black text-slate-500">Custo da captação</p><p className={`mt-1 font-black ${fundingCostDisplay.isValid ? 'text-rose-400' : 'text-slate-400'}`}>{formatMoney(fundingCostDisplay.cost)}</p></div>
                    </div>
                )}
            </div>
        )}
      </div>
    </div>
  );
};
