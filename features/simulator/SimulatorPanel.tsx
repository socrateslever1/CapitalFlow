import React, { useState, useMemo } from 'react';
import { Calculator, TrendingUp, DollarSign, Calendar as CalIcon, ChevronLeft, RefreshCw, CheckCircle2, CreditCard, ArrowDownRight, ArrowUpRight, CalendarX } from 'lucide-react';
import { formatDate } from '../../utils/loanCalculator';
import { formatMoney } from '../../utils/formatters';
import { modalityRegistry } from '../../domain/finance/modalities/registry';
import { mapFormToLoan } from '../loans/domain/loanForm.mapper';
import { LoanBillingModality } from '../../types';

interface SimulatorPanelProps {
  onClose: () => void;
  activeUser: any;
  clients: any[];
  sources: any[];
  showToast: (msg: string, type?: 'success' | 'error') => void;
  fetchFullData: (id: string) => Promise<void>;
  isStealthMode?: boolean;
}

function pmt(principal: number, monthlyRatePercent: number, installmentsCount: number): number {
  const n = Math.max(1, Math.floor(installmentsCount));
  const i = monthlyRatePercent / 100;
  if (i <= 0) return principal / n;
  return principal * (i / (1 - Math.pow(1 + i, -n)));
}

export const SimulatorPanel: React.FC<SimulatorPanelProps> = ({ 
  onClose, 
  activeUser, 
  clients, 
  sources, 
  showToast, 
  fetchFullData,
  isStealthMode
}) => {
  // Estados de Entrada
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [selectedSourceId, setSelectedSourceId] = useState<string>('');
  const [selectedModality, setSelectedModality] = useState<LoanBillingModality>('MONTHLY');
  const [startDateStr, setStartDateStr] = useState<string>(() => new Date().toISOString().split('T')[0]);
  
  // Parâmetros gerais
  const [principal, setPrincipal] = useState(1000);
  const [interestRate, setInterestRate] = useState(30); // 30% padrão para Mensal/Diário
  const [fixedDuration, setFixedDuration] = useState('30'); // Prazo em dias para DAILY_FIXED_TERM
  const [skipWeekends, setSkipWeekends] = useState(false);
  const [calculationMode, setCalculationMode] = useState<'NORMAL' | 'REVERSE'>('NORMAL');
  const [targetInstallment, setTargetInstallment] = useState(1300);

  // Parâmetros de Empréstimo Parcelado (INSTALLMENT_FIXED)
  const [fundingCalculationMode, setFundingCalculationMode] = useState<'TOTAL' | 'RATE'>('TOTAL');
  const [fundingInstallmentsCount, setFundingInstallmentsCount] = useState(10);
  const [customerMarginPercent, setCustomerMarginPercent] = useState(30);
  const [fundingTotalPayable, setFundingTotalPayable] = useState(1200);
  const [fundingMonthlyRate, setFundingMonthlyRate] = useState(4.49);

  // Estado de Controle
  const [isSavingContract, setIsSavingContract] = useState(false);

  // Cálculo Base
  const calculation = useMemo(() => {
    // Determinar o principal efetivo para o cálculo (considerando modo reverso)
    let effPrincipal = principal;
    if (calculationMode === 'REVERSE' && selectedModality !== 'INSTALLMENT_FIXED') {
      if (selectedModality === 'MONTHLY' || selectedModality === 'DAILY_FIXED_TERM') {
        effPrincipal = targetInstallment / (1 + interestRate / 100);
      } else if (selectedModality === 'DAILY_FREE') {
        effPrincipal = targetInstallment;
      }
    }

    try {
      const strategy = modalityRegistry.get(selectedModality);
      
      const { installments: installmentList, totalToReceive } = strategy.generateInstallments({
        principal: effPrincipal,
        rate: interestRate,
        startDate: startDateStr,
        fixedDuration,
        fundingTotalPayable,
        fundingInstallmentsCount,
        fundingMonthlyRate,
        fundingCalculationMode,
        customerMarginPercent,
        initialData: {
          skipWeekends
        } as any
      });

      const totalInterest = Math.max(0, totalToReceive - effPrincipal);
      const cet = effPrincipal > 0 ? (totalInterest / effPrincipal) * 100 : 0;
      
      // Taxa equivalente
      let monthlyRate = interestRate;
      if (selectedModality === 'INSTALLMENT_FIXED') {
        monthlyRate = fundingMonthlyRate * (1 + customerMarginPercent / 100);
      }

      const installmentValue = installmentList[0]?.amount || 0;
      const dueDateStr = installmentList[installmentList.length - 1]?.dueDate || startDateStr;
      
      // Converter YYYY-MM-DD para Date com segurança de fuso
      const dueDate = new Date(dueDateStr + 'T12:00:00');

      return {
        installmentList,
        total: totalToReceive,
        principal: effPrincipal,
        interest: totalInterest,
        cet,
        monthlyRate,
        dueDate,
        installmentValue
      };
    } catch (e) {
      console.error(e);
      return {
        installmentList: [],
        total: 0,
        principal: effPrincipal,
        interest: 0,
        cet: 0,
        monthlyRate: 0,
        dueDate: new Date(),
        installmentValue: 0
      };
    }
  }, [
    selectedModality,
    principal,
    interestRate,
    startDateStr,
    fixedDuration,
    fundingTotalPayable,
    fundingInstallmentsCount,
    fundingMonthlyRate,
    fundingCalculationMode,
    customerMarginPercent,
    skipWeekends,
    calculationMode,
    targetInstallment
  ]);

  const handleCreateContract = async () => {
    if (!activeUser) {
      showToast('Você precisa estar logado para criar um contrato.', 'error');
      return;
    }
    if (!selectedClientId) {
      showToast('Selecione um cliente para criar o contrato.', 'error');
      return;
    }
    if (!selectedSourceId) {
      showToast('Selecione uma fonte de capital.', 'error');
      return;
    }

    setIsSavingContract(true);
    try {
      const { contractsService } = await import('../../services/contracts.service');
      const client = clients.find(c => c.id === selectedClientId);

      const formState: any = {
        clientId: selectedClientId,
        debtorName: client?.name || '',
        debtorPhone: client?.phone || '',
        debtorDocument: client?.document || '',
        debtorAddress: client?.address || '',
        sourceId: selectedSourceId,
        preferredPaymentMethod: 'PIX',
        pixKey: activeUser?.pixKey || '',
        principal: String(calculation.principal),
        interestRate: String(interestRate),
        finePercent: '2',
        dailyInterestPercent: '0.1',
        billingCycle: selectedModality,
        notes: 'Gerado via Simulador Financeiro',
        guaranteeDescription: '',
        startDate: startDateStr,
        skipWeekends: skipWeekends,
        fundingTotalPayable: selectedModality === 'INSTALLMENT_FIXED' ? String(fundingTotalPayable) : undefined,
        fundingProvider: selectedModality === 'INSTALLMENT_FIXED' ? 'Simulador' : undefined,
        fundingFeePercent: undefined,
        fundingCalculationMode: selectedModality === 'INSTALLMENT_FIXED' ? fundingCalculationMode : undefined,
        fundingInstallmentsCount: selectedModality === 'INSTALLMENT_FIXED' ? String(fundingInstallmentsCount) : undefined,
        fundingMonthlyRate: selectedModality === 'INSTALLMENT_FIXED' ? String(fundingMonthlyRate) : undefined,
        customerMarginPercent: selectedModality === 'INSTALLMENT_FIXED' ? String(customerMarginPercent) : undefined,
      };

      const loanPayload = mapFormToLoan(
        formState,
        fixedDuration,
        null,
        [],
        [],
        [],
        activeUser?.id || ''
      );

      await contractsService.saveLoan(loanPayload, activeUser, sources, null);
      showToast('Contrato criado com sucesso!', 'success');
      await fetchFullData(activeUser.id);
      onClose();
    } catch (err: any) {
      showToast('Erro ao criar contrato: ' + err.message, 'error');
    } finally {
      setIsSavingContract(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 font-sans pb-24">
      {/* Header - Minimalista e Padronizado */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white shrink-0 shadow-lg shadow-blue-900/20">
              <Calculator size={20} />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-white uppercase tracking-wider leading-none">
                Simulador <span className="text-blue-500">Financeiro</span>
              </h1>
              <p className="text-sm text-slate-500 font-medium uppercase mt-1 tracking-widest">Cálculos e Projeções</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 space-y-6">
        
        {/* 1. Parâmetros de Entrada */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/5 blur-3xl rounded-full -mr-16 -mt-16"></div>
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                <DollarSign size={14} className="text-blue-500" /> Parâmetros do Empréstimo
              </h3>
              {calculationMode === 'REVERSE' && selectedModality !== 'INSTALLMENT_FIXED' && (
                <div className="text-[10px] text-indigo-400 uppercase tracking-widest font-bold ml-6">
                  cálculo reverso ativo — capital calculado a partir do valor de pagamento
                </div>
              )}
            </div>
            
            <div className="flex flex-wrap gap-2">
              {selectedModality !== 'INSTALLMENT_FIXED' && (
                <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 animate-in fade-in">
                  <button 
                    onClick={() => { setCalculationMode('NORMAL'); }}
                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                      calculationMode === 'NORMAL'
                        ? 'bg-slate-800 text-white' 
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    Normal
                  </button>
                  <button 
                    onClick={() => { setCalculationMode('REVERSE'); }}
                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                      calculationMode === 'REVERSE'
                        ? 'bg-slate-800 text-white' 
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    Reverso
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 sm:flex bg-slate-950 p-1 rounded-xl border border-slate-800 gap-1 sm:gap-0">
                <button 
                  onClick={() => { setSelectedModality('MONTHLY'); if(calculationMode==='REVERSE') setCalculationMode('NORMAL'); }}
                  className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                    selectedModality === 'MONTHLY'
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' 
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  Mensal
                </button>
                <button 
                  onClick={() => { setSelectedModality('INSTALLMENT_FIXED'); }}
                  className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                    selectedModality === 'INSTALLMENT_FIXED'
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' 
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  Parcelado
                </button>
                <button 
                  onClick={() => { setSelectedModality('DAILY_FREE'); if(calculationMode==='REVERSE') setCalculationMode('NORMAL'); }}
                  className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                    selectedModality === 'DAILY_FREE'
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' 
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  Diário Livre
                </button>
                <button 
                  onClick={() => { setSelectedModality('DAILY_FIXED_TERM'); if(calculationMode==='REVERSE') setCalculationMode('NORMAL'); }}
                  className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                    selectedModality === 'DAILY_FIXED_TERM'
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' 
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  Prazo Fixo
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-6 relative z-10">
            {/* Seleção de Cliente, Fonte e Data do Contrato */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-4 bg-slate-950/30 rounded-2xl border border-slate-800/50">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-blue-400 uppercase tracking-[0.2em] block ml-1">
                  Vincular ao Cliente
                </label>
                <div className="relative">
                  <select
                    value={selectedClientId}
                    onChange={(e) => setSelectedClientId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-sm font-bold text-white outline-none focus:border-blue-500 transition-all appearance-none cursor-pointer"
                  >
                    <option value="">Selecione um cliente...</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                    <ChevronLeft size={16} className="-rotate-90" />
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-blue-400 uppercase tracking-[0.2em] block ml-1">
                  Fonte de Capital
                </label>
                <div className="relative">
                  <select
                    value={selectedSourceId}
                    onChange={(e) => setSelectedSourceId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-sm font-bold text-white outline-none focus:border-blue-500 transition-all appearance-none cursor-pointer"
                  >
                    <option value="">Selecione uma fonte...</option>
                    {sources.map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({formatMoney(s.balance, isStealthMode)})</option>
                    ))}
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                    <ChevronLeft size={16} className="-rotate-90" />
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-blue-400 uppercase tracking-[0.2em] block ml-1">
                  Data do Contrato
                </label>
                <input
                  type="date"
                  value={startDateStr}
                  onChange={(e) => setStartDateStr(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-sm font-bold text-white outline-none focus:border-blue-500 transition-all"
                />
              </div>
            </div>

            {selectedModality !== 'INSTALLMENT_FIXED' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-400 uppercase tracking-widest block ml-1">
                    {calculationMode === 'REVERSE'
                      ? 'Valor do pagamento desejado (R$)'
                      : 'Valor do capital (R$)'}
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-black text-xs">R$</span>
                    <input
                      type="number"
                      value={calculationMode === 'REVERSE' ? targetInstallment : principal}
                      onChange={(e) => { 
                        let raw = e.target.value;
                        if (raw.length > 1 && raw.startsWith('0') && !raw.startsWith('0.')) {
                          raw = raw.replace(/^0+/, '');
                          e.target.value = raw;
                        }
                        const val = raw === '' ? 0 : Number(raw);
                        if (calculationMode === 'REVERSE') setTargetInstallment(val);
                        else setPrincipal(val); 
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-base font-black text-white outline-none focus:border-blue-500 transition-all shadow-inner"
                    />
                  </div>
                </div>

                {calculationMode === 'REVERSE' && (
                  <div className="space-y-2 animate-in slide-in-from-top-2">
                    <label className="text-sm font-semibold text-slate-400 uppercase tracking-widest block ml-1">
                      Valor que pode ser liberado (R$)
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-black text-xs">R$</span>
                      <input
                        type="text"
                        readOnly
                        value={formatMoney(calculation.principal, isStealthMode).replace('R$', '').trim()}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-base font-black text-blue-400 outline-none cursor-default"
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-400 uppercase tracking-widest block ml-1">
                    {selectedModality === 'MONTHLY' ? 'Juros (%) Mensal' : 'Taxa (%) Mensal'}
                  </label>
                  <div className="relative">
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 font-black text-xs">%</span>
                    <input
                      type="number"
                      step="0.01"
                      value={interestRate}
                      onChange={(e) => { 
                        let raw = e.target.value;
                        if (raw.length > 1 && raw.startsWith('0') && !raw.startsWith('0.')) {
                          raw = raw.replace(/^0+/, '');
                          e.target.value = raw;
                        }
                        setInterestRate(raw === '' ? 0 : Number(raw)); 
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-base font-black text-white outline-none focus:border-blue-500 transition-all shadow-inner"
                    />
                  </div>
                </div>
              </div>
            ) : null}

            {selectedModality === 'DAILY_FIXED_TERM' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-top-2">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-400 uppercase tracking-widest block ml-1">
                    Prazo Total (Dias)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={fixedDuration}
                    onChange={(e) => {
                      let raw = e.target.value;
                      if (raw.length > 1 && raw.startsWith('0') && !raw.startsWith('0.')) {
                        raw = raw.replace(/^0+/, '');
                        e.target.value = raw;
                      }
                      setFixedDuration(raw === '' ? '0' : raw);
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-base font-black text-white outline-none focus:border-blue-500 transition-all shadow-inner"
                  />
                </div>
              </div>
            )}

            {(selectedModality === 'DAILY_FREE' || selectedModality === 'DAILY_FIXED_TERM') && (
              <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800/80 flex items-center justify-between group hover:border-blue-500/30 transition-all max-w-md">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg transition-colors ${skipWeekends ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-500'}`}>
                    <CalendarX size={18}/>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white">Pular Fins de Semana</p>
                    <p className="text-[9px] text-slate-500 font-bold uppercase mt-0.5 tracking-widest">Apenas Dias Úteis</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSkipWeekends(!skipWeekends)}
                  className={`w-12 h-6 rounded-full transition-all relative ${skipWeekends ? 'bg-blue-600' : 'bg-slate-700'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${skipWeekends ? 'left-7' : 'left-1'}`}></div>
                </button>
              </div>
            )}

            {selectedModality === 'INSTALLMENT_FIXED' && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-400 uppercase tracking-widest block ml-1">
                      Valor do capital (R$)
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-black text-xs">R$</span>
                      <input
                        type="number"
                        value={principal}
                        onChange={(e) => { 
                          let raw = e.target.value;
                          if (raw.length > 1 && raw.startsWith('0') && !raw.startsWith('0.')) {
                            raw = raw.replace(/^0+/, '');
                            e.target.value = raw;
                          }
                          setPrincipal(raw === '' ? 0 : Number(raw)); 
                        }}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-base font-black text-white outline-none focus:border-blue-500 transition-all shadow-inner"
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-400 uppercase tracking-widest block ml-1">
                      Margem Cliente (%)
                    </label>
                    <div className="relative">
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 font-black text-xs">%</span>
                      <input
                        type="number"
                        step="0.01"
                        value={customerMarginPercent}
                        onChange={(e) => { 
                          let raw = e.target.value;
                          if (raw.length > 1 && raw.startsWith('0') && !raw.startsWith('0.')) {
                            raw = raw.replace(/^0+/, '');
                            e.target.value = raw;
                          }
                          setCustomerMarginPercent(raw === '' ? 0 : Number(raw)); 
                        }}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-base font-black text-white outline-none focus:border-blue-500 transition-all shadow-inner"
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-slate-950/60 border border-slate-850 rounded-3xl p-5 sm:p-6 space-y-6 shadow-2xl relative overflow-hidden transition-all duration-300 hover:border-slate-800">
                  <div className="flex items-center gap-2.5 text-rose-400 border-b border-slate-900 pb-3">
                    <CreditCard size={18} className="text-rose-500" />
                    <span className="text-xs font-black uppercase tracking-widest text-slate-200 font-sans">Custo de Captação / Banco</span>
                  </div>

                  <div className="space-y-5">
                    {/* Toggle Mode */}
                    <div className="flex bg-slate-900/80 p-1 rounded-2xl border border-slate-800/60 max-w-xs">
                      <button
                        type="button"
                        onClick={() => setFundingCalculationMode('TOTAL')}
                        className={`flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all duration-200 ${fundingCalculationMode !== 'RATE' ? 'bg-gradient-to-r from-rose-600 to-pink-600 text-white shadow-md shadow-rose-950/50' : 'text-slate-400 hover:text-slate-200'}`}
                      >
                        Valor final
                      </button>
                      <button
                        type="button"
                        onClick={() => setFundingCalculationMode('RATE')}
                        className={`flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all duration-200 ${fundingCalculationMode === 'RATE' ? 'bg-gradient-to-r from-rose-600 to-pink-600 text-white shadow-md shadow-rose-950/50' : 'text-slate-400 hover:text-slate-200'}`}
                      >
                        Taxa mensal
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="space-y-1">
                        <label className="text-[9px] text-rose-300/70 font-black uppercase tracking-wider ml-2 block font-sans">Parcelas do Banco</label>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={fundingInstallmentsCount}
                          onChange={e => {
                            let raw = e.target.value;
                            if (raw.length > 1 && raw.startsWith('0') && !raw.startsWith('0.')) {
                              raw = raw.replace(/^0+/, '');
                              e.target.value = raw;
                            }
                            setFundingInstallmentsCount(raw === '' ? 0 : Number(raw));
                          }}
                          className="w-full bg-slate-900/80 border border-rose-500/25 rounded-2xl px-5 py-3 text-white font-bold outline-none focus:border-rose-500/50 focus:ring-4 focus:ring-rose-500/10 transition-all duration-200"
                        />
                      </div>

                      {fundingCalculationMode === 'RATE' ? (
                        <div className="space-y-1">
                          <label className="text-[9px] text-rose-300/70 font-black uppercase tracking-wider ml-2 block font-sans">Juros Banco (% ao mês)</label>
                          <input
                            type="number"
                            step="0.01"
                            placeholder="Ex: 4.49"
                            value={fundingMonthlyRate}
                            onChange={e => {
                              let raw = e.target.value;
                              if (raw.length > 1 && raw.startsWith('0') && !raw.startsWith('0.')) {
                                raw = raw.replace(/^0+/, '');
                                e.target.value = raw;
                              }
                              setFundingMonthlyRate(raw === '' ? 0 : Number(raw));
                            }}
                            className="w-full bg-slate-900/80 border border-rose-500/25 rounded-2xl px-5 py-3 text-white font-bold outline-none focus:border-rose-500/50 focus:ring-4 focus:ring-rose-500/10 transition-all duration-200"
                          />
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <label className="text-[9px] text-rose-300/70 font-black uppercase tracking-wider ml-2 block font-sans">Total a Pagar na Fatura</label>
                          <input
                            type="number"
                            step="0.01"
                            placeholder="Ex: 1200.00"
                            value={fundingTotalPayable}
                            onChange={e => {
                              let raw = e.target.value;
                              if (raw.length > 1 && raw.startsWith('0') && !raw.startsWith('0.')) {
                                raw = raw.replace(/^0+/, '');
                                e.target.value = raw;
                              }
                              setFundingTotalPayable(raw === '' ? 0 : Number(raw));
                            }}
                            className="w-full bg-slate-900/80 border border-rose-500/25 rounded-2xl px-5 py-3 text-white font-bold outline-none focus:border-rose-500/50 focus:ring-4 focus:ring-rose-500/10 transition-all duration-200"
                          />
                        </div>
                      )}

                      <div className="space-y-1">
                        <label className="text-[9px] text-rose-300/70 font-black uppercase tracking-wider ml-2 block font-sans">Custo do Crédito (Banco)</label>
                        <div className="w-full bg-slate-900/40 border border-rose-500/15 rounded-2xl px-5 py-3 text-rose-400 font-extrabold flex items-center justify-between h-[48px]">
                          <span className="text-sm font-black tracking-wide font-sans">
                            {formatMoney(Math.max(0, (fundingCalculationMode === 'RATE' ? (pmt(principal, fundingMonthlyRate, fundingInstallmentsCount) * fundingInstallmentsCount) : fundingTotalPayable) - principal))}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Resumo da Operação */}
                    <div className="bg-slate-950/80 border border-slate-900 rounded-2xl p-5 space-y-4 shadow-inner">
                      <div className="flex items-center justify-between border-b border-slate-900 pb-2.5">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 font-sans">Resumo da Operação</span>
                        <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 px-2 py-0.5 rounded-full font-black uppercase tracking-wider font-sans">
                          {customerMarginPercent || '0'}% Margem
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
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-sans leading-none mb-1">Banco (Custo)</p>
                              <p className="text-[11px] font-semibold text-slate-200 font-sans">
                                {fundingInstallmentsCount || '0'}x {formatMoney(fundingCalculationMode === 'RATE' ? pmt(principal, fundingMonthlyRate, fundingInstallmentsCount) : fundingTotalPayable / Math.max(1, fundingInstallmentsCount))}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider font-sans">Total Banco</p>
                            <p className="text-xs font-bold text-slate-200 font-sans">
                              {formatMoney(fundingCalculationMode === 'RATE' ? pmt(principal, fundingMonthlyRate, fundingInstallmentsCount) * fundingInstallmentsCount : fundingTotalPayable)}
                            </p>
                          </div>
                        </div>

                        {/* Linha Cliente */}
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
                              <ArrowUpRight size={14} />
                            </div>
                            <div>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-sans leading-none mb-1">Cliente (Cobrança)</p>
                              <p className="text-[11px] font-bold text-emerald-400 font-sans">
                                {fundingInstallmentsCount || '0'}x {formatMoney((fundingCalculationMode === 'RATE' ? pmt(principal, fundingMonthlyRate, fundingInstallmentsCount) : fundingTotalPayable / Math.max(1, fundingInstallmentsCount)) * (1 + customerMarginPercent / 100))}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider font-sans">Total Recebível</p>
                            <p className="text-xs font-extrabold text-emerald-400 font-sans">{formatMoney(calculation.total)}</p>
                          </div>
                        </div>
                      </div>

                      {/* Lucro Bruto Pill/Row */}
                      <div className="bg-gradient-to-r from-emerald-950/20 via-emerald-900/10 to-transparent border border-emerald-500/20 rounded-xl p-3 flex items-center justify-between mt-2 transition-all">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                          <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider font-sans">Lucro Bruto Estimado</span>
                        </div>
                        <span className="text-sm font-black text-emerald-400 font-sans">
                          {formatMoney(calculation.total - (fundingCalculationMode === 'RATE' ? pmt(principal, fundingMonthlyRate, fundingInstallmentsCount) * fundingInstallmentsCount : fundingTotalPayable))}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 2. Resultado Detalhado */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6 shadow-2xl relative overflow-hidden">
          <div className="absolute bottom-0 left-0 w-40 h-40 bg-emerald-600/5 blur-3xl rounded-full -ml-20 -mb-20"></div>
          
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2 relative z-10 font-sans">
            <TrendingUp size={14} className="text-emerald-500" /> Resumo do Cálculo
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative z-10">
            {calculationMode === 'REVERSE' && selectedModality !== 'INSTALLMENT_FIXED' && (
              <div className="bg-indigo-600/10 rounded-2xl p-5 border border-indigo-500/20">
                <p className="text-sm text-indigo-400 font-semibold uppercase tracking-widest mb-1 leading-tight font-sans">
                  Valor informado pelo usuário
                </p>
                <p className="text-xl font-black text-white font-sans font-mono">
                  {formatMoney(targetInstallment, isStealthMode)}
                </p>
              </div>
            )}
            <div className="bg-slate-950/50 rounded-2xl p-5 border border-slate-800/50 font-sans">
              <p className="text-sm text-slate-500 font-semibold uppercase tracking-widest mb-1 leading-tight">Capital Base</p>
              <p className="text-xl font-black text-white">{formatMoney(calculation.principal, isStealthMode)}</p>
            </div>
            <div className="bg-slate-950/50 rounded-2xl p-5 border border-slate-800/50 font-sans">
              <p className="text-sm text-slate-500 font-semibold uppercase tracking-widest mb-1 leading-tight">Juros Totais</p>
              <p className="text-xl font-black text-white">{formatMoney(calculation.interest, isStealthMode)}</p>
            </div>
            <div className="bg-slate-950/50 rounded-2xl p-5 border border-slate-800/50 font-sans">
              <p className="text-sm text-slate-500 font-semibold uppercase tracking-widest mb-1 leading-tight">Juros Mensal (Equiv.)</p>
              <p className="text-xl font-black text-white">{(calculation.monthlyRate || 0).toFixed(1)}%</p>
            </div>
            <div className="bg-slate-950/50 rounded-2xl p-5 border border-slate-800/50 font-sans">
              <p className="text-sm text-slate-500 font-semibold uppercase tracking-widest mb-1 leading-tight">Custo Efetivo (CET)</p>
              <p className="text-xl font-black text-emerald-500">+{calculation.cet.toFixed(1)}%</p>
            </div>
            <div className="bg-blue-600/10 rounded-2xl p-5 border border-blue-500/20 font-sans">
              <p className="text-sm text-blue-400 font-semibold uppercase tracking-widest mb-1 leading-tight">Valor Final Total</p>
              <p className="text-xl font-black text-white">{formatMoney(calculation.total, isStealthMode)}</p>
            </div>
          </div>

          {selectedModality === 'INSTALLMENT_FIXED' ? (
            <div className="space-y-4 relative z-10">
              <div className="bg-slate-950/80 rounded-2xl p-5 border border-slate-800 flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500 font-semibold uppercase tracking-widest font-sans">Valor de cada Parcela</p>
                  <p className="text-2xl font-black text-white font-sans">{formatMoney(calculation.installmentValue, isStealthMode)}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-slate-500 font-semibold uppercase tracking-widest font-sans">Frequência</p>
                  <p className="text-sm font-black text-white uppercase font-sans">Mensal</p>
                </div>
              </div>

              {/* Lista de Parcelas */}
              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-500 uppercase tracking-widest ml-1 font-sans">Cronograma de Pagamentos</p>
                <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                  {calculation.installmentList.map((inst) => (
                    <div key={inst.number} className="flex items-center justify-between bg-slate-950/40 p-3 rounded-xl border border-slate-800/50 hover:bg-slate-950 transition-colors">
                      <div className="flex items-center gap-3 font-sans">
                        <span className="w-6 h-6 rounded-lg bg-slate-800 flex items-center justify-center text-sm font-black text-slate-400">
                          {inst.number}
                        </span>
                        <span className="text-sm font-bold text-slate-300">
                          {formatDate(new Date(inst.dueDate + 'T12:00:00'))}
                        </span>
                      </div>
                      <span className="text-sm font-black text-white font-sans">{formatMoney(inst.amount, isStealthMode)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-950/80 rounded-2xl p-5 border border-slate-800 flex items-center justify-between relative z-10">
              <div className="flex items-center gap-3">
                <CalIcon size={20} className="text-slate-500" />
                <div>
                  <p className="text-sm text-slate-500 font-semibold uppercase tracking-widest font-sans">Vencimento Único</p>
                  <p className="text-sm font-black text-white font-sans">{formatDate(calculation.dueDate)}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-slate-500 font-semibold uppercase tracking-widest font-sans">Prazo</p>
                <p className="text-sm font-black text-white font-sans">
                  {selectedModality === 'MONTHLY' ? '1 Mês' : selectedModality === 'DAILY_FREE' ? 'Diário Livre' : `${fixedDuration} dias`}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* 3. Finalização */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-32 h-32 bg-emerald-600/5 blur-3xl rounded-full -ml-16 -mt-16"></div>
          
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2 relative z-10 font-sans">
            <CheckCircle2 size={14} className="text-emerald-500" /> Finalizar Operação
          </h3>

          <div className="pt-4 relative z-10">
            <button
              onClick={handleCreateContract}
              disabled={isSavingContract || !selectedClientId || !selectedSourceId}
              className="w-full py-5 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 hover:bg-emerald-500 transition-all disabled:opacity-50 shadow-xl active:scale-95 cursor-pointer font-sans"
            >
              {isSavingContract ? (
                <RefreshCw size={20} className="animate-spin" />
              ) : (
                <><CheckCircle2 size={20} /> Gerar Contrato Real</>
              )}
            </button>
            {(!selectedClientId || !selectedSourceId) && (
              <p className="text-[10px] text-slate-500 text-center mt-2 uppercase tracking-widest font-sans">
                Selecione cliente e fonte para habilitar a criação do contrato
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
