import { addDaysUTC, toISODateOnlyUTC } from '../../utils/dateHelpers';
import React, { useMemo } from 'react';
import { Wallet, CalendarX, Clock, CreditCard, AlertTriangle, CalendarDays, ChevronDown, ArrowDownRight, ArrowUpRight, Plus, Trash2 } from 'lucide-react';
import { CapitalSource, LoanBillingModality } from '../../types';
import { formatMoney, cleanNumberStr } from '../../utils/formatters';
import { LoanTotalPreview } from './LoanFormFinancialSection.preview';

const MULTI_SOURCE_CREATION_ENABLED = false;

interface LoanFormFinancialSectionProps {
  sources: CapitalSource[];
  formData: any;
  setFormData: any;
  isDailyModality: boolean;
  fixedDuration: string;
  setFixedDuration: (v: string) => void;
  manualFirstDueDate: string;
  setManualFirstDueDate: (v: string) => void;
  skipWeekends?: boolean;
  setSkipWeekends?: (v: boolean) => void;
  isEditing?: boolean;
}

export const LoanFormFinancialSection: React.FC<LoanFormFinancialSectionProps> = ({
  sources, formData, setFormData, isDailyModality, fixedDuration, setFixedDuration, manualFirstDueDate, setManualFirstDueDate, skipWeekends, setSkipWeekends, isEditing
}) => {
  const inputClass = "block w-full min-w-0 h-14 bg-slate-950/50 border border-slate-800/80 rounded-lg px-4 sm:px-5 text-white text-sm leading-none outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 transition-all";
  const strongInputClass = `${inputClass} font-bold`;
  const dateInputClass = `${inputClass} px-4 font-black text-base tabular-nums [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:opacity-70 [&::-webkit-calendar-picker-indicator]:ml-auto [&::-webkit-calendar-picker-indicator]:cursor-pointer`;

  const selectedSource = sources.find(s => s.id === formData.sourceId);
  const isCardSource = selectedSource?.type === 'MISTO';
  const isInstallmentFixed = formData.billingCycle === 'INSTALLMENT_FIXED';
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
      const margin = parseFloat(formData.customerMarginPercent) || 0;
      const mode = formData.fundingCalculationMode || 'TOTAL';
      const monthlyRate = bankMonthlyRate / 100;
      const bankInstallment = mode === 'RATE'
          ? (monthlyRate > 0 ? principal * (monthlyRate / (1 - Math.pow(1 + monthlyRate, -count))) : principal / count)
          : bankTotalInput / count;
      const bankTotal = bankInstallment * count;
      
      const absorbsInterest = formData.fundingOperatorAbsorbsInterest === true;
      const baseForClient = absorbsInterest ? (principal / count) : bankInstallment;

      const customerInstallment = baseForClient * (1 + margin / 100);
      const customerTotal = customerInstallment * count;
      return { count, bankInstallment, bankTotal, customerInstallment, customerTotal, profit: customerTotal - bankTotal };
  }, [formData.principal, formData.fundingInstallmentsCount, formData.fundingTotalPayable, formData.fundingMonthlyRate, formData.customerMarginPercent, formData.fundingCalculationMode, formData.fundingOperatorAbsorbsInterest]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <h3 className="text-[10px] font-black uppercase tracking-widest text-purple-500 flex items-center gap-2"><Wallet className="w-4 h-4" /> Condições</h3>
      <div className="space-y-4">

        <div className="flex bg-slate-950/50 p-1 rounded-lg border border-slate-800/80">
            <button type="button" onClick={() => setFormData({...formData, billingCycle: 'MONTHLY'})} className={`flex-1 py-3 rounded-lg text-[10px] font-black uppercase transition-all flex items-center justify-center gap-1.5 ${formData.billingCycle === 'MONTHLY' ? 'bg-purple-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}><CalendarDays size={13}/> Mensal</button>
            <button type="button" onClick={() => setFormData({...formData, billingCycle: 'INSTALLMENT_FIXED', fundingInstallmentsCount: formData.fundingInstallmentsCount || '10', customerMarginPercent: formData.customerMarginPercent || '30'})} className={`flex-1 py-3 rounded-lg text-[10px] font-black uppercase transition-all flex items-center justify-center gap-1.5 ${isInstallmentFixed ? 'bg-purple-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}><CreditCard size={13}/> Parcelado</button>
            <button type="button" onClick={() => setFormData({...formData, billingCycle: 'DAILY_FREE'})} className={`flex-1 py-3 rounded-lg text-[10px] font-black uppercase transition-all flex items-center justify-center gap-1.5 ${isDailyModality ? 'bg-purple-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}><Clock size={13}/> Diário</button>
        </div>

        {isDailyModality && (
            <div className="space-y-4 animate-in slide-in-from-top-2">
                <div className="space-y-2">
                    <label className="text-[9px] text-purple-400 font-black uppercase ml-2">Tipo de Diária</label>
                    <div className="relative group">
                        <select
                            value={formData.billingCycle || ''}
                            onChange={(e) => setFormData({...formData, billingCycle: e.target.value as LoanBillingModality})}
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

                <div className="bg-slate-950/50 p-4 rounded-lg border border-slate-800/80 flex items-center justify-between group hover:border-purple-500/30 transition-all">
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg transition-colors ${skipWeekends ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-500'}`}>
                            <CalendarX size={18}/>
                        </div>
                        <div>
                            <p className="text-xs font-bold text-white">Pular Fins de Semana</p>
                            <p className="text-[9px] text-slate-500 font-bold uppercase">Apenas Dias Úteis</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setSkipWeekends?.(!skipWeekends)}
                        className={`w-12 h-6 rounded-full transition-all relative ${skipWeekends ? 'bg-purple-600' : 'bg-slate-700'}`}
                    >
                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${skipWeekends ? 'left-7' : 'left-1'}`}></div>
                    </button>
                </div>
            </div>
        )}

        <div className={`grid ${isInstallmentFixed ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'} gap-4`}>
          <div className="space-y-1">
            <label className="text-[9px] text-slate-500 font-black uppercase ml-2">{isEditing ? 'Principal original' : 'Principal'}</label>
            <input required type="number" min="0.01" step="0.01" value={formData.principal || ''} onChange={e => setFormData({...formData,principal: cleanNumberStr(e.target.value)})} className="w-full border rounded-lg px-5 py-4 font-bold outline-none transition-all bg-slate-950/50 border-slate-800/80 text-white focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10" />
            {isEditing && <p className="text-[8px] text-slate-500 font-bold ml-2">A diferença acima do valor original será registrada como novo aporte na parcela atual, mantendo o vencimento.</p>}
          </div>
          {!isInstallmentFixed && <div className="space-y-1">
            <label className="text-[9px] text-slate-500 font-black uppercase ml-2">{formData.billingCycle === 'MONTHLY' ? 'Juros (%) Mensal' : 'Taxa (%) Mensal'}</label>
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
                      if (startDate) setManualFirstDueDate(toISODateOnlyUTC(addDaysUTC(startDate, 30)));
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
              <p className="ml-2 text-[10px] text-slate-500">Sugerido: 30 dias após o empréstimo. Você pode alterar livremente o vencimento.</p>
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

        {(isCardSource || isInstallmentFixed) && (
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-5 sm:p-6 space-y-6 shadow-2xl relative overflow-hidden transition-all duration-300 hover:border-slate-700/80 animate-in slide-in-from-right">
                <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/5 rounded-full blur-3xl pointer-events-none"></div>
                <div className="absolute bottom-0 left-0 w-32 h-32 bg-purple-500/5 rounded-full blur-3xl pointer-events-none"></div>

                <div className="flex items-center gap-2.5 text-rose-400 border-b border-slate-900 pb-3">
                    <CreditCard size={18} className="text-rose-500" />
                    <span className="text-xs font-black uppercase tracking-widest text-slate-200">Custo de Captação / Banco</span>
                </div>

                {isInstallmentFixed ? (
                    <div className="space-y-5">
                        <div className="flex bg-slate-900/80 p-1 rounded-lg border border-slate-800/60">
                            <button type="button" onClick={() => setFormData({...formData, fundingCalculationMode: 'TOTAL'})} className={`flex-1 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all duration-200 ${formData.fundingCalculationMode !== 'RATE' ? 'bg-gradient-to-r from-rose-600 to-pink-600 text-white shadow-md shadow-rose-950/50' : 'text-slate-400 hover:text-slate-200'}`}>Valor final</button>
                            <button type="button" onClick={() => setFormData({...formData, fundingCalculationMode: 'RATE'})} className={`flex-1 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all duration-200 ${formData.fundingCalculationMode === 'RATE' ? 'bg-gradient-to-r from-rose-600 to-pink-600 text-white shadow-md shadow-rose-950/50' : 'text-slate-400 hover:text-slate-200'}`}>Taxa mensal</button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div><label className="text-[9px] text-slate-500 font-black uppercase ml-2">Parcelas Banco</label><input type="number" min="1" value={formData.fundingInstallmentsCount || ''} onChange={e => setFormData({...formData, fundingInstallmentsCount: e.target.value})} className={strongInputClass}/></div>
                            {formData.fundingCalculationMode === 'RATE' ? <div><label className="text-[9px] text-slate-500 font-black uppercase ml-2">Taxa Banco (% a.m.)</label><input type="number" step="0.01" value={formData.fundingMonthlyRate || ''} onChange={e => setFormData({...formData, fundingMonthlyRate: cleanNumberStr(e.target.value)})} className={strongInputClass}/></div> : <div><label className="text-[9px] text-slate-500 font-black uppercase ml-2">Total Banco</label><input type="number" step="0.01" value={formData.fundingTotalPayable || ''} onChange={e => setFormData({...formData, fundingTotalPayable: cleanNumberStr(e.target.value)})} className={strongInputClass}/></div>}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                            <div className="rounded-lg bg-slate-900/70 border border-slate-800 p-3"><p className="text-[9px] uppercase font-black text-slate-500">Parcela banco</p><p className="font-black text-white mt-1">{formatMoney(fixedInstallmentDisplay.bankInstallment)}</p></div>
                            <div className="rounded-lg bg-slate-900/70 border border-slate-800 p-3"><p className="text-[9px] uppercase font-black text-slate-500">Parcela cliente</p><p className="font-black text-emerald-400 mt-1">{formatMoney(fixedInstallmentDisplay.customerInstallment)}</p></div>
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
