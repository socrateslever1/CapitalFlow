
import React, { useState, useMemo } from 'react';
import { Calculator, TrendingUp, DollarSign, Calendar as CalIcon, ChevronLeft, RefreshCw, CheckCircle2 } from 'lucide-react';
import { calculateLoan, formatDate } from '../../utils/loanCalculator';
import { formatMoney } from '../../utils/formatters';

interface SimulatorPanelProps {
  onClose: () => void;
  activeUser: any;
  clients: any[];
  sources: any[];
  showToast: (msg: string, type?: 'success' | 'error') => void;
  fetchFullData: (id: string) => Promise<void>;
  isStealthMode?: boolean;
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
  const [principal, setPrincipal] = useState(1000);
  const [dailyRate, setDailyRate] = useState(5); // 5%
  const [daysToMaturity, setDaysToMaturity] = useState(30);
  const [gracePeriod, setGracePeriod] = useState(0);
  const [installments, setInstallments] = useState(1);
  const [isInstallmentMode, setIsInstallmentMode] = useState(false);
  const [isAgreementMode, setIsAgreementMode] = useState(false);
  const [discount, setDiscount] = useState(0);
  const [downPayment, setDownPayment] = useState(0);
  
  // Novo estado para modalidade de cálculo
  const [calculationMode, setCalculationMode] = useState<'NORMAL' | 'REVERSE'>('NORMAL');
  const [rateMode, setRateMode] = useState<'DAILY' | 'TOTAL_PERCENT' | 'TOTAL_AMOUNT'>('DAILY');
  const [targetInstallment, setTargetInstallment] = useState(0);
  const [totalInterestPercent, setTotalInterestPercent] = useState(30);
  const [totalInterestAmount, setTotalInterestAmount] = useState(300);

  // Estado de Controle
  const [isSavingContract, setIsSavingContract] = useState(false);

  const today = new Date();
  
  // Cálculo Base
  const calculation = useMemo(() => {
    const safeDays = Math.max(1, daysToMaturity);
    const safeInstallments = Math.max(1, installments);
    const intervalDays = Math.max(1, Math.round(safeDays / safeInstallments));
    const dueDate = new Date(today.getTime() + (safeDays + gracePeriod) * 24 * 60 * 60 * 1000);

    if (isAgreementMode) {
      let effectiveDailyRate = dailyRate / 100;

      if (rateMode === 'TOTAL_PERCENT') {
        effectiveDailyRate = (totalInterestPercent / 100) / safeDays;
      }

      if (rateMode === 'TOTAL_AMOUNT') {
        const baseForRate = Math.max(1, principal - discount - downPayment);
        effectiveDailyRate = (totalInterestAmount / baseForRate) / safeDays;
      }

      const baseDebt = Math.max(0, principal - discount - downPayment);

      const agreementInterest = baseDebt * effectiveDailyRate * safeDays;
      const agreementTotal = baseDebt + agreementInterest;

      const installmentValue = Number((agreementTotal / safeInstallments).toFixed(2));

      const installmentList = Array.from({ length: safeInstallments }).map((_, i) => {
        const instDueDate = new Date(
          today.getTime() + intervalDays * (i + 1) * 24 * 60 * 60 * 1000
        );

        return {
          number: i + 1,
          value: installmentValue,
          dueDate: instDueDate
        };
      });

      return {
        interest: agreementInterest,
        total: agreementTotal,
        principal: baseDebt,
        installmentValue,
        daysToMaturity: safeDays,
        gracePeriod: 0,
        dueDate,
        installmentList,
        cet: baseDebt > 0 ? (agreementInterest / baseDebt) * 100 : 0,
        monthlyRate: (Math.pow(1 + effectiveDailyRate, 30) - 1) * 100,
        effectiveDailyRate
      };
    }

    // Calcular taxa diária efetiva baseada no modo de taxa para NORMAL e REVERSE
    let effectiveDailyRate = dailyRate / 100;
    
    if (rateMode === 'TOTAL_PERCENT') {
      effectiveDailyRate = (totalInterestPercent / 100) / safeDays;
    } else if (rateMode === 'TOTAL_AMOUNT') {
      const baseForRate = calculationMode === 'NORMAL' 
        ? Math.max(1, principal) 
        : Math.max(1, (isInstallmentMode ? targetInstallment * safeInstallments : targetInstallment) - totalInterestAmount);
      effectiveDailyRate = (totalInterestAmount / baseForRate) / safeDays;
    }

    let calcPrincipal = principal;
    let calcInterest = 0;
    let calcTotal = 0;

    if (calculationMode === 'REVERSE') {
      const valorFinalDesejado =
        isInstallmentMode
          ? targetInstallment * safeInstallments
          : targetInstallment;

      const taxaTotal = Math.max(0.000001, effectiveDailyRate * safeDays);

      if (rateMode === 'TOTAL_AMOUNT') {
        calcInterest = totalInterestAmount;
        calcPrincipal = valorFinalDesejado - calcInterest;
        if (calcPrincipal < 0) calcPrincipal = 0;
      } else {
        calcPrincipal = valorFinalDesejado / (1 + taxaTotal);
        calcInterest = valorFinalDesejado - calcPrincipal;
      }

      calcTotal = valorFinalDesejado;
    } else {
      // MODO NORMAL
      const loanResult = calculateLoan({
        principal: principal,
        dailyRate: effectiveDailyRate,
        startDate: today,
        dueDate: dueDate,
        currentDate: dueDate,
        calculationMode: 'NORMAL'
      });
      calcPrincipal = loanResult.principal;
      calcInterest = loanResult.interest;
      calcTotal = loanResult.total;
    }

    const installmentValue = isInstallmentMode
      ? Number((calcTotal / safeInstallments).toFixed(2))
      : Number(calcTotal.toFixed(2));

    const installmentList = Array.from({ length: safeInstallments }).map((_, i) => {
      const instDueDate = new Date(today.getTime() + (gracePeriod + intervalDays * (i + 1)) * 24 * 60 * 60 * 1000);
      return {
        number: i + 1,
        value: installmentValue,
        dueDate: instDueDate
      };
    });

    return {
      interest: calcInterest,
      total: calcTotal,
      principal: calcPrincipal,
      installmentValue,
      daysToMaturity: safeDays,
      gracePeriod,
      dueDate,
      installmentList,
      cet: calcPrincipal > 0 ? (calcInterest / calcPrincipal) * 100 : 0,
      monthlyRate: (Math.pow(1 + effectiveDailyRate, 30) - 1) * 100,
      effectiveDailyRate
    };
  }, [principal, dailyRate, daysToMaturity, gracePeriod, installments, isInstallmentMode, isAgreementMode, discount, downPayment, calculationMode, targetInstallment, rateMode, totalInterestPercent, totalInterestAmount]);


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
      const source = sources.find(s => s.id === selectedSourceId);

      const newLoan: any = {
        id: crypto.randomUUID(),
        clientId: selectedClientId,
        sourceId: selectedSourceId,
        debtorName: client?.name || '',
        debtorPhone: client?.phone || '',
        debtorDocument: client?.document || '',
        debtorAddress: client?.address || '',
        principal: calculation.principal,
        interestRate: calculation.effectiveDailyRate * 100,
        finePercent: 2,
        dailyInterestPercent: 0.1,
        billingCycle: 'DAILY_FIXED_TERM',
        amortizationType: 'JUROS',
        startDate: today.toISOString().split('T')[0],
        totalToReceive: calculation.total,
        status: 'ATIVO',
        installments: calculation.installmentList.map((inst) => {
          const installmentPrincipal = calculation.principal / calculation.installmentList.length;
          const installmentInterest = calculation.interest / calculation.installmentList.length;
          
          let dueDateStr = '';
          try {
            dueDateStr = inst.dueDate.toISOString().split('T')[0];
          } catch (e) {
            dueDateStr = new Date().toISOString().split('T')[0];
          }

          return {
            id: crypto.randomUUID(),
            number: inst.number,
            dueDate: dueDateStr,
            amount: inst.value,
            scheduledPrincipal: installmentPrincipal,
            scheduledInterest: installmentInterest,
            principalRemaining: installmentPrincipal,
            interestRemaining: installmentInterest,
            lateFeeAccrued: 0
          };
        })
      };

      await contractsService.saveLoan(newLoan, activeUser, sources, null);
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
              {calculationMode === 'REVERSE' && (
                <div className="text-[10px] text-indigo-400 uppercase tracking-widest font-bold ml-6">
                  cálculo reverso ativo — capital calculado a partir do valor de pagamento
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
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

              <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
                <button 
                  onClick={() => { setIsInstallmentMode(false); setIsAgreementMode(false); }}
                  className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                    !isInstallmentMode && !isAgreementMode
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' 
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  À Vista
                </button>
                <button 
                  onClick={() => { setIsInstallmentMode(true); setIsAgreementMode(false); }}
                  className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                    isInstallmentMode && !isAgreementMode
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' 
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  Parcelado
                </button>
                <button 
                  onClick={() => { setIsAgreementMode(true); setIsInstallmentMode(false); }}
                  className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                    isAgreementMode
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' 
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  Acordo
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-6 relative z-10">
            {/* Seleção de Cliente e Fonte (Para criação de contrato) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 bg-slate-950/30 rounded-2xl border border-slate-800/50">
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
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-400 uppercase tracking-widest block ml-1">
                  {calculationMode === 'REVERSE'
                    ? (isInstallmentMode
                        ? 'Valor de cada parcela desejada (R$)'
                        : 'Quanto o cliente pode pagar (R$)')
                    : (isAgreementMode
                        ? 'Dívida base (R$)'
                        : 'Valor do capital (R$)')}
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

              {!isAgreementMode ? (
                <div className="space-y-4">
                  <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
                    {(['DAILY', 'TOTAL_PERCENT', 'TOTAL_AMOUNT'] as const).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => setRateMode(mode)}
                        className={`flex-1 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all ${
                          rateMode === mode
                            ? 'bg-slate-800 text-white'
                            : 'text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        {mode === 'DAILY' ? 'Taxa Diária' : mode === 'TOTAL_PERCENT' ? 'Juros Total %' : 'Valor Juros R$'}
                      </button>
                    ))}
                  </div>

                  {rateMode === 'DAILY' && (
                    <div className="space-y-2 animate-in fade-in slide-in-from-left-2">
                      <label className="text-sm font-semibold text-slate-400 uppercase tracking-widest block ml-1">
                        Taxa Diária (%)
                      </label>
                      <div className="relative">
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 font-black text-xs">%</span>
                        <input
                          type="number"
                          step="0.01"
                          value={dailyRate}
                          onChange={(e) => { 
                            let raw = e.target.value;
                            if (raw.length > 1 && raw.startsWith('0') && !raw.startsWith('0.')) {
                              raw = raw.replace(/^0+/, '');
                              e.target.value = raw;
                            }
                            setDailyRate(raw === '' ? 0 : Number(raw)); 
                          }}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-base font-black text-white outline-none focus:border-blue-500 transition-all shadow-inner"
                        />
                      </div>
                    </div>
                  )}

                  {rateMode === 'TOTAL_PERCENT' && (
                    <div className="space-y-2 animate-in fade-in slide-in-from-left-2">
                      <label className="text-sm font-semibold text-slate-400 uppercase tracking-widest block ml-1">
                        Juros Total do Período (%)
                      </label>
                      <div className="relative">
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 font-black text-xs">%</span>
                        <input
                          type="number"
                          value={totalInterestPercent}
                          onChange={(e) => { 
                            let raw = e.target.value;
                            if (raw.length > 1 && raw.startsWith('0') && !raw.startsWith('0.')) {
                              raw = raw.replace(/^0+/, '');
                              e.target.value = raw;
                            }
                            setTotalInterestPercent(raw === '' ? 0 : Number(raw)); 
                          }}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-base font-black text-white outline-none focus:border-blue-500 transition-all shadow-inner"
                        />
                      </div>
                    </div>
                  )}

                  {rateMode === 'TOTAL_AMOUNT' && (
                    <div className="space-y-2 animate-in fade-in slide-in-from-left-2">
                      <label className="text-sm font-semibold text-slate-400 uppercase tracking-widest block ml-1">
                        Valor de Juros Desejado (R$)
                      </label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-black text-xs">R$</span>
                        <input
                          type="number"
                          value={totalInterestAmount}
                          onChange={(e) => { 
                            let raw = e.target.value;
                            if (raw.length > 1 && raw.startsWith('0') && !raw.startsWith('0.')) {
                              raw = raw.replace(/^0+/, '');
                              e.target.value = raw;
                            }
                            setTotalInterestAmount(raw === '' ? 0 : Number(raw)); 
                          }}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-base font-black text-white outline-none focus:border-blue-500 transition-all shadow-inner"
                        />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-400 uppercase tracking-widest block ml-1">
                    Desconto (R$)
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-black text-xs">R$</span>
                    <input
                      type="number"
                      value={discount}
                      onChange={(e) => { 
                        let raw = e.target.value;
                        if (raw.length > 1 && raw.startsWith('0') && !raw.startsWith('0.')) {
                          raw = raw.replace(/^0+/, '');
                          e.target.value = raw;
                        }
                        setDiscount(raw === '' ? 0 : Number(raw)); 
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-base font-black text-white outline-none focus:border-blue-500 transition-all shadow-inner"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-400 uppercase tracking-widest block ml-1">
                  {isAgreementMode ? 'Valor de Entrada (R$)' : 'Prazo Total (Dias)'}
                </label>
                <div className="relative">
                  {isAgreementMode && <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-black text-xs">R$</span>}
                  <input
                    type="number"
                    value={isAgreementMode ? downPayment : daysToMaturity}
                    onChange={(e) => { 
                      let raw = e.target.value;
                      if (raw.length > 1 && raw.startsWith('0') && !raw.startsWith('0.')) {
                        raw = raw.replace(/^0+/, '');
                        e.target.value = raw;
                      }
                      const val = raw === '' ? 0 : Number(raw);
                      if (isAgreementMode) setDownPayment(val);
                      else setDaysToMaturity(val);
                    }}
                    className={`w-full bg-slate-950 border border-slate-800 rounded-xl py-3 ${isAgreementMode ? 'pl-10' : 'px-4'} pr-4 text-base font-black text-white outline-none focus:border-blue-500 transition-all shadow-inner`}
                  />
                </div>
              </div>

              {!isAgreementMode ? (
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-400 uppercase tracking-widest block ml-1">
                    Carência (Dias)
                  </label>
                  <input
                    type="number"
                    value={gracePeriod}
                    onChange={(e) => { 
                      let raw = e.target.value;
                      if (raw.length > 1 && raw.startsWith('0') && !raw.startsWith('0.')) {
                        raw = raw.replace(/^0+/, '');
                        e.target.value = raw;
                      }
                      setGracePeriod(raw === '' ? 0 : Number(raw)); 
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-base font-black text-white outline-none focus:border-blue-500 transition-all shadow-inner"
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-400 uppercase tracking-widest block ml-1">
                    Prazo do Acordo (Dias)
                  </label>
                  <input
                    type="number"
                    value={daysToMaturity}
                    onChange={(e) => { 
                      let raw = e.target.value;
                      if (raw.length > 1 && raw.startsWith('0') && !raw.startsWith('0.')) {
                        raw = raw.replace(/^0+/, '');
                        e.target.value = raw;
                      }
                      setDaysToMaturity(raw === '' ? 0 : Number(raw)); 
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-base font-black text-white outline-none focus:border-blue-500 transition-all shadow-inner"
                  />
                </div>
              )}

              {(isInstallmentMode || isAgreementMode) && (
                <div className="space-y-2 animate-in slide-in-from-top-2 duration-200">
                  <label className="text-sm font-semibold text-slate-400 uppercase tracking-widest block ml-1">
                    Número de Parcelas
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="48"
                    value={installments}
                    onChange={(e) => { 
                      let raw = e.target.value;
                      if (raw.length > 1 && raw.startsWith('0') && !raw.startsWith('0.')) {
                        raw = raw.replace(/^0+/, '');
                        e.target.value = raw;
                      }
                      setInstallments(raw === '' ? 0 : Number(raw)); 
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-base font-black text-white outline-none focus:border-blue-500 transition-all shadow-inner"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 2. Resultado Detalhado */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6 shadow-2xl relative overflow-hidden">
          <div className="absolute bottom-0 left-0 w-40 h-40 bg-emerald-600/5 blur-3xl rounded-full -ml-20 -mb-20"></div>
          
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2 relative z-10">
            <TrendingUp size={14} className="text-emerald-500" /> Resumo do Cálculo
          </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative z-10">
            {calculationMode === 'REVERSE' && (
              <div className="bg-indigo-600/10 rounded-2xl p-5 border border-indigo-500/20">
                <p className="text-sm text-indigo-400 font-semibold uppercase tracking-widest mb-1">
                  Valor informado pelo usuário
                </p>
                <p className="text-xl font-black text-white">
                  {formatMoney(
                    isInstallmentMode
                      ? targetInstallment * Math.max(1, installments)
                      : targetInstallment,
                    isStealthMode
                  )}
                </p>
              </div>
            )}
            <div className="bg-slate-950/50 rounded-2xl p-5 border border-slate-800/50">
              <p className="text-sm text-slate-500 font-semibold uppercase tracking-widest mb-1">Capital Base</p>
              <p className="text-xl font-black text-white">{formatMoney(calculation.principal, isStealthMode)}</p>
            </div>
            <div className="bg-slate-950/50 rounded-2xl p-5 border border-slate-800/50">
              <p className="text-sm text-slate-500 font-semibold uppercase tracking-widest mb-1">Juros Totais</p>
              <p className="text-xl font-black text-white">{formatMoney(calculation.interest, isStealthMode)}</p>
            </div>
            <div className="bg-slate-950/50 rounded-2xl p-5 border border-slate-800/50">
              <p className="text-sm text-slate-500 font-semibold uppercase tracking-widest mb-1">Juros Mensal (Equiv.)</p>
              <p className="text-xl font-black text-white">{(calculation.monthlyRate || 0).toFixed(1)}%</p>
            </div>
            <div className="bg-slate-950/50 rounded-2xl p-5 border border-slate-800/50">
              <p className="text-sm text-slate-500 font-semibold uppercase tracking-widest mb-1">Custo Efetivo (CET)</p>
              <p className="text-xl font-black text-emerald-500">+{(calculation.cet || 0).toFixed(1)}%</p>
            </div>
            <div className="bg-blue-600/10 rounded-2xl p-5 border border-blue-500/20">
              <p className="text-sm text-blue-400 font-semibold uppercase tracking-widest mb-1">Valor Final Total</p>
              <p className="text-xl font-black text-white">{formatMoney(calculation.total, isStealthMode)}</p>
            </div>
          </div>

          {(isInstallmentMode || isAgreementMode) && (
            <div className="space-y-4 relative z-10">
              <div className="bg-slate-950/80 rounded-2xl p-5 border border-slate-800 flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500 font-semibold uppercase tracking-widest">Valor de cada Parcela</p>
                  <p className="text-2xl font-black text-white">{formatMoney(calculation.installmentValue, isStealthMode)}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-slate-500 font-semibold uppercase tracking-widest">Frequência</p>
                  <p className="text-sm font-black text-white uppercase">A cada {Math.max(1, Math.round(daysToMaturity / installments))} dias</p>
                </div>
              </div>

              {/* Lista de Parcelas */}
              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-500 uppercase tracking-widest ml-1">Cronograma de Pagamentos</p>
                <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                  {calculation.installmentList.map((inst) => (
                    <div key={inst.number} className="flex items-center justify-between bg-slate-950/40 p-3 rounded-xl border border-slate-800/50 hover:bg-slate-950 transition-colors">
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-lg bg-slate-800 flex items-center justify-center text-sm font-black text-slate-400">
                          {inst.number}
                        </span>
                        <span className="text-sm font-bold text-slate-300">{formatDate(inst.dueDate)}</span>
                      </div>
                      <span className="text-sm font-black text-white">{formatMoney(inst.value, isStealthMode)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {!isInstallmentMode && !isAgreementMode && (
            <div className="bg-slate-950/80 rounded-2xl p-5 border border-slate-800 flex items-center justify-between relative z-10">
              <div className="flex items-center gap-3">
                <CalIcon size={20} className="text-slate-500" />
                <div>
                  <p className="text-sm text-slate-500 font-semibold uppercase tracking-widest">Vencimento Único</p>
                  <p className="text-sm font-black text-white">{formatDate(calculation.dueDate)}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-slate-500 font-semibold uppercase tracking-widest">Prazo</p>
                <p className="text-sm font-black text-white">{daysToMaturity} dias</p>
              </div>
            </div>
          )}
        </div>

        {/* 3. Finalização */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-32 h-32 bg-emerald-600/5 blur-3xl rounded-full -ml-16 -mt-16"></div>
          
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2 relative z-10">
            <CheckCircle2 size={14} className="text-emerald-500" /> Finalizar Operação
          </h3>

          <div className="pt-4 relative z-10">
            <button
              onClick={handleCreateContract}
              disabled={isSavingContract || !selectedClientId || !selectedSourceId}
              className="w-full py-5 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 hover:bg-emerald-500 transition-all disabled:opacity-50 shadow-xl active:scale-95"
            >
              {isSavingContract ? (
                <RefreshCw size={20} className="animate-spin" />
              ) : (
                <><CheckCircle2 size={20} /> Gerar Contrato Real</>
              )}
            </button>
            {(!selectedClientId || !selectedSourceId) && (
              <p className="text-[10px] text-slate-500 text-center mt-2 uppercase tracking-widest">
                Selecione cliente e fonte para habilitar a criação do contrato
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
