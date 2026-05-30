import React, { useMemo } from 'react';
import { Wallet, CalendarX, Clock, CreditCard, AlertTriangle, CalendarDays, ChevronDown, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { CapitalSource, LoanBillingModality } from '../../types';
import { formatMoney, cleanNumberStr } from '../../utils/formatters';

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
}

export const LoanFormFinancialSection: React.FC<LoanFormFinancialSectionProps> = ({
  sources, formData, setFormData, isDailyModality, fixedDuration, setFixedDuration, manualFirstDueDate, setManualFirstDueDate, skipWeekends, setSkipWeekends
}) => {

  const selectedSource = sources.find(s => s.id === formData.sourceId);
  const isCardSource = selectedSource?.type === 'MISTO';
  const isInstallmentFixed = formData.billingCycle === 'INSTALLMENT_FIXED';

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
      const customerInstallment = bankInstallment * (1 + margin / 100);
      const customerTotal = customerInstallment * count;
      return { bankInstallment, bankTotal, customerInstallment, customerTotal, profit: customerTotal - bankTotal };
  }, [formData.principal, formData.fundingInstallmentsCount, formData.fundingTotalPayable, formData.fundingMonthlyRate, formData.customerMarginPercent, formData.fundingCalculationMode]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <h3 className="text-[10px] font-black uppercase tracking-widest text-purple-500 flex items-center gap-2"><Wallet className="w-4 h-4" /> Condições</h3>
      <div className="space-y-4">

        <div className="flex bg-slate-950/50 p-1 rounded-2xl border border-slate-800/80">
            <button type="button" onClick={() => setFormData({...formData, billingCycle: 'MONTHLY'})} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${formData.billingCycle === 'MONTHLY' ? 'bg-purple-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>Mensal</button>
            <button type="button" onClick={() => setFormData({...formData, billingCycle: 'INSTALLMENT_FIXED', fundingInstallmentsCount: formData.fundingInstallmentsCount || '10', customerMarginPercent: formData.customerMarginPercent || '30'})} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${isInstallmentFixed ? 'bg-purple-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>Parcelado</button>
            <button type="button" onClick={() => setFormData({...formData, billingCycle: 'DAILY_FREE'})} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${isDailyModality ? 'bg-purple-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>Diário</button>
        </div>

        {isDailyModality && (
            <div className="space-y-4 animate-in slide-in-from-top-2">
                <div className="space-y-2">
                    <label className="text-[9px] text-purple-400 font-black uppercase ml-2">Tipo de Diária</label>
                    <div className="relative group">
                        <select
                            value={formData.billingCycle || ''}
                            onChange={(e) => setFormData({...formData, billingCycle: e.target.value as LoanBillingModality})}
                            className="w-full appearance-none bg-slate-950/50 border border-purple-500/30 rounded-2xl px-4 py-3 pr-10 text-white text-xs outline-none focus:border-purple-500/50 focus:ring-4 focus:ring-purple-500/10 transition-all cursor-pointer"
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
                            className="w-full bg-slate-950/50 border border-slate-800/80 rounded-2xl px-5 py-4 text-white font-bold text-sm outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 transition-all"
                            placeholder="Ex: 30"
                        />
                    </div>
                )}

                <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800/80 flex items-center justify-between group hover:border-purple-500/30 transition-all">
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

        <div className={`grid ${isInstallmentFixed ? 'grid-cols-1' : 'grid-cols-2'} gap-4`}>
          <div className="space-y-1">
            <label className="text-[9px] text-slate-500 font-black uppercase ml-2">Principal</label>
            <input required type="number" step="0.01" value={formData.principal || ''} onChange={e => setFormData({...formData,principal: cleanNumberStr(e.target.value)})} className="w-full bg-slate-950/50 border border-slate-800/80 rounded-2xl px-5 py-4 text-white font-bold outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 transition-all" />
          </div>
          {!isInstallmentFixed && <div className="space-y-1">
            <label className="text-[9px] text-slate-500 font-black uppercase ml-2">{formData.billingCycle === 'MONTHLY' ? 'Juros (%) Mensal' : 'Taxa (%) Mensal'}</label>
            <input required type="number" step="0.01" value={formData.interestRate || ''} onChange={e => setFormData({...formData, interestRate: cleanNumberStr(e.target.value)})} className="w-full bg-slate-950/50 border border-slate-800/80 rounded-2xl px-5 py-4 text-white font-bold outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 transition-all" />
          </div>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
              <label className="text-[9px] text-slate-500 font-black uppercase ml-2">Data Empréstimo</label>
              <input required type="date" value={formData.startDate || ''} onChange={e => setFormData({...formData, startDate: e.target.value})} className="w-full bg-slate-950/50 border border-slate-800/80 rounded-2xl px-5 py-4 text-white text-sm outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 transition-all" />
          </div>
          <div className="space-y-1">
              <label className="text-[9px] text-blue-400 font-black uppercase ml-2 flex items-center gap-1"><CalendarDays size={10}/> Vencimento (1º)</label>
              <input
                  required
                  type="date"
                  value={manualFirstDueDate || ''}
                  onChange={e => setManualFirstDueDate(e.target.value)}
                  className="w-full bg-slate-950/50 border border-blue-500/30 rounded-2xl px-5 py-4 text-white font-bold text-sm focus:border-blue-500/50 outline-none focus:ring-4 focus:ring-blue-500/10 transition-all"
              />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
                <label className="text-[9px] text-slate-500 font-black uppercase ml-2">Multa (%)</label>
                <input type="number" step="0.1" value={formData.finePercent || ''} onChange={e => setFormData({...formData, finePercent: cleanNumberStr(e.target.value)})} className="w-full bg-slate-950/50 border border-slate-800/80 rounded-2xl px-5 py-4 text-white text-sm outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 transition-all" />
            </div>
            <div className="space-y-1">
                <label className="text-[9px] text-slate-500 font-black uppercase ml-2">Mora Diária (%)</label>
                <input type="number" step="0.1" value={formData.dailyInterestPercent || ''} onChange={e => setFormData({...formData, dailyInterestPercent: cleanNumberStr(e.target.value)})} className="w-full bg-slate-950/50 border border-slate-800/80 rounded-2xl px-5 py-4 text-white text-sm outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 transition-all" />
            </div>
        </div>

        <div className="space-y-2">
            <label className="text-[9px] text-slate-500 font-black uppercase ml-2">Fonte de Capital</label>
            <div className="relative group">
                <select
                    value={formData.sourceId || ''}
                    onChange={e => setFormData({...formData, sourceId: e.target.value})}
                    className="w-full appearance-none bg-slate-950/50 border border-slate-800/80 rounded-2xl px-5 py-4 pr-10 text-white text-sm outline-none focus:border-purple-500/50 focus:ring-4 focus:ring-purple-500/10 transition-all cursor-pointer"
                >
                  {sources.map(s => <option key={s.id} value={s.id}>{s.name} ({s.type === 'MISTO' ? 'Misto' : `R$ ${s.balance.toLocaleString()}`})</option>)}
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none group-hover:text-purple-500 transition-colors" size={18} />
            </div>
        </div>

        {(isCardSource || isInstallmentFixed) && (
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-3xl p-5 sm:p-6 space-y-6 shadow-2xl relative overflow-hidden transition-all duration-300 hover:border-slate-700/80 animate-in slide-in-from-right">
                {/* Decorative glows */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/5 rounded-full blur-3xl pointer-events-none"></div>
                <div className="absolute bottom-0 left-0 w-32 h-32 bg-purple-500/5 rounded-full blur-3xl pointer-events-none"></div>

                <div className="flex items-center gap-2.5 text-rose-400 border-b border-slate-900 pb-3">
                    <CreditCard size={18} className="text-rose-500" />
                    <span className="text-xs font-black uppercase tracking-widest text-slate-200">Custo de Captação / Banco</span>
                </div>

                {isInstallmentFixed ? (
                    /* Layout para Parcela Fixa */
                    <div className="space-y-5">
                        {/* Toggle Mode */}
                        <div className="flex bg-slate-900/80 p-1 rounded-2xl border border-slate-800/60">
                            <button
                                type="button"
                                onClick={() => setFormData({...formData, fundingCalculationMode: 'TOTAL'})}
                                className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all duration-200 ${formData.fundingCalculationMode !== 'RATE' ? 'bg-gradient-to-r from-rose-600 to-pink-600 text-white shadow-md shadow-rose-950/50' : 'text-slate-400 hover:text-slate-200'}`}
                            >
                                Valor final
                            </button>
                            <button
                                type="button"
                                onClick={() => setFormData({...formData, fundingCalculationMode: 'RATE'})}
                                className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all duration-200 ${formData.fundingCalculationMode === 'RATE' ? 'bg-gradient-to-r from-rose-600 to-pink-600 text-white shadow-md shadow-rose-950/50' : 'text-slate-400 hover:text-slate-200'}`}
                            >
                                Taxa mensal
                            </button>
                        </div>

                        {/* Inputs: Parcelas Banco & Margem Cliente */}
                        <div className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-[9px] text-rose-300/70 font-black uppercase tracking-wider ml-2">Parcelas do Banco</label>
                                <input
                                    type="number"
                                    min="1"
                                    step="1"
                                    value={formData.fundingInstallmentsCount || ''}
                                    onChange={e => setFormData({...formData, fundingInstallmentsCount: cleanNumberStr(e.target.value)})}
                                    className="w-full bg-slate-900/80 border border-rose-500/25 rounded-2xl px-5 py-4 text-white font-bold outline-none focus:border-rose-500/50 focus:ring-4 focus:ring-rose-500/10 transition-all duration-200"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[9px] text-emerald-300/70 font-black uppercase tracking-wider ml-2">Margem Cliente (%)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={formData.customerMarginPercent || ''}
                                    onChange={e => setFormData({...formData, customerMarginPercent: cleanNumberStr(e.target.value)})}
                                    className="w-full bg-slate-900/80 border border-emerald-500/25 rounded-2xl px-5 py-4 text-white font-bold outline-none focus:border-emerald-500/50 focus:ring-4 focus:ring-emerald-500/10 transition-all duration-200"
                                />
                            </div>

                            {formData.fundingCalculationMode === 'RATE' ? (
                                <div className="space-y-1">
                                    <label className="text-[9px] text-rose-300/70 font-black uppercase tracking-wider ml-2">Juros Banco (% ao mês)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        placeholder="Ex: 4.49"
                                        value={formData.fundingMonthlyRate || ''}
                                        onChange={e => setFormData({...formData, fundingMonthlyRate: cleanNumberStr(e.target.value)})}
                                        className="w-full bg-slate-900/80 border border-rose-500/25 rounded-2xl px-5 py-4 text-white font-bold outline-none focus:border-rose-500/50 focus:ring-4 focus:ring-rose-500/10 transition-all duration-200"
                                    />
                                </div>
                            ) : (
                                <div className="space-y-1">
                                    <label className="text-[9px] text-rose-300/70 font-black uppercase tracking-wider ml-2">Total a Pagar na Fatura</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        placeholder="Ex: 1200.00"
                                        value={formData.fundingTotalPayable || ''}
                                        onChange={e => setFormData({...formData, fundingTotalPayable: cleanNumberStr(e.target.value)})}
                                        className="w-full bg-slate-900/80 border border-rose-500/25 rounded-2xl px-5 py-4 text-white font-bold outline-none focus:border-rose-500/50 focus:ring-4 focus:ring-rose-500/10 transition-all duration-200"
                                    />
                                </div>
                            )}

                            {/* Custo Calculado Display */}
                            <div className="space-y-1">
                                <label className="text-[9px] text-rose-300/70 font-black uppercase tracking-wider ml-2">Custo do Crédito (Banco)</label>
                                <div className="w-full bg-slate-900/40 border border-rose-500/15 rounded-2xl px-5 py-4 text-rose-400 font-extrabold flex items-center justify-between h-[54px] sm:h-[58px]">
                                    <span className="text-sm font-black tracking-wide">{formatMoney(fundingCostDisplay.cost)}</span>
                                    {fundingCostDisplay.cost > 0 && (
                                        <span className="text-[8px] bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-full font-black uppercase tracking-wider text-rose-400">
                                            Custo
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Resumo da Operação */}
                        <div className="bg-slate-950/80 border border-slate-900 rounded-2xl p-4.5 space-y-4 shadow-inner">
                            <div className="flex items-center justify-between border-b border-slate-900 pb-2.5">
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Resumo da Operação</span>
                                <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 px-2 py-0.5 rounded-full font-black uppercase tracking-wider">
                                    {formData.customerMarginPercent || '0'}% Margem
                                </span>
                            </div>

                            <div className="space-y-3.5">
                                {/* Linha Banco */}
                                <div className="flex items-center justify-between text-xs">
                                    <div className="flex items-center gap-2">
                                        <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400">
                                            <ArrowDownRight size={14} />
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Banco (Custo)</p>
                                            <p className="text-[11px] font-semibold text-slate-200">
                                                {formData.fundingInstallmentsCount || '0'}x {formatMoney(fixedInstallmentDisplay.bankInstallment)}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Total Banco</p>
                                        <p className="text-xs font-bold text-slate-200">{formatMoney(fixedInstallmentDisplay.bankTotal)}</p>
                                    </div>
                                </div>

                                {/* Linha Cliente */}
                                <div className="flex items-center justify-between text-xs">
                                    <div className="flex items-center gap-2">
                                        <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
                                            <ArrowUpRight size={14} />
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cliente (Cobrança)</p>
                                            <p className="text-[11px] font-bold text-emerald-400">
                                                {formData.fundingInstallmentsCount || '0'}x {formatMoney(fixedInstallmentDisplay.customerInstallment)}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Total Recebível</p>
                                        <p className="text-xs font-extrabold text-emerald-400">{formatMoney(fixedInstallmentDisplay.customerTotal)}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Lucro Bruto Pill/Row */}
                            <div className="bg-gradient-to-r from-emerald-950/20 via-emerald-900/10 to-transparent border border-emerald-500/20 rounded-xl p-3 flex items-center justify-between mt-2 transition-all">
                                <div className="flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                                    <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">Lucro Bruto Estimado</span>
                                </div>
                                <span className="text-sm font-black text-emerald-400">{formatMoney(fixedInstallmentDisplay.profit)}</span>
                            </div>
                        </div>
                    </div>
                ) : (
                    /* Layout para Fonte Misto padrão (sem Parcela Fixa) */
                    <div className="space-y-4">
                        <div className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-[9px] text-rose-300/70 font-black uppercase tracking-wider ml-2">Total a Pagar na Fatura</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    placeholder="Ex: 1200.00"
                                    value={formData.fundingTotalPayable || ''}
                                    onChange={e => setFormData({...formData, fundingTotalPayable: cleanNumberStr(e.target.value)})}
                                    className="w-full bg-slate-900/80 border border-rose-500/25 rounded-2xl px-5 py-4 text-white font-bold outline-none focus:border-rose-500/50 focus:ring-4 focus:ring-rose-500/10 transition-all duration-200"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[9px] text-rose-300/70 font-black uppercase tracking-wider ml-2">Custo Calculado</label>
                                <div className="w-full bg-slate-900/40 border border-rose-500/10 rounded-2xl px-5 py-4 text-rose-400 font-extrabold flex items-center justify-between h-[54px] sm:h-[58px]">
                                    <span className="text-sm font-black tracking-wide">{formatMoney(fundingCostDisplay.cost)}</span>
                                    {fundingCostDisplay.cost > 0 && (
                                        <span className="text-[8px] bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-full font-black uppercase tracking-wider text-rose-400">
                                            Custo
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Campos extras para Maquininha (Misto/Card) */}
                {isCardSource && (
                    <div className="space-y-4 pt-4 border-t border-slate-900">
                        <div className="space-y-1">
                            <label className="text-[9px] text-rose-300/70 font-black uppercase tracking-wider ml-2">Operadora / Maquininha</label>
                            <input
                                type="text"
                                placeholder="Ex: InfinitePay"
                                value={formData.fundingProvider || ''}
                                onChange={e => setFormData({...formData, fundingProvider: e.target.value})}
                                className="w-full bg-slate-900/80 border border-rose-500/25 rounded-2xl px-5 py-4 text-white text-sm outline-none focus:border-rose-500/50 focus:ring-4 focus:ring-rose-500/10 transition-all duration-200"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[9px] text-rose-300/70 font-black uppercase tracking-wider ml-2">Taxa (%)</label>
                            <input
                                type="number"
                                step="0.01"
                                placeholder="Ex: 12.5"
                                value={formData.fundingFeePercent || ''}
                                onChange={e => setFormData({...formData, fundingFeePercent: cleanNumberStr(e.target.value)})}
                                className="w-full bg-slate-900/80 border border-rose-500/25 rounded-2xl px-5 py-4 text-white font-bold outline-none focus:border-rose-500/50 focus:ring-4 focus:ring-rose-500/10 transition-all duration-200"
                            />
                        </div>
                    </div>
                )}

                {/* Alerta de erro */}
                {formData.fundingTotalPayable && parseFloat(formData.fundingTotalPayable) < parseFloat(formData.principal) && (
                    <div className="flex items-start gap-2 bg-rose-500/10 border border-rose-500/20 p-3.5 rounded-2xl animate-in fade-in">
                        <AlertTriangle size={16} className="text-rose-500 shrink-0 mt-0.5"/>
                        <p className="text-[10px] text-rose-300 leading-tight">
                            <b>Erro:</b> O total a pagar na fatura não pode ser menor que o valor entregue ao cliente (Principal).
                        </p>
                    </div>
                )}
            </div>
        )}
      </div>
    </div>
  );
};
