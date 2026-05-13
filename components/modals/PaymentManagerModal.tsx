import React from 'react';
import { Loader2, MessageSquare, DollarSign, CheckSquare, RefreshCcw, Calendar, CalendarClock, AlertCircle, Banknote, CheckCircle2, TrendingUp, AlertTriangle, Clock, X, Receipt, ShieldCheck } from 'lucide-react';
import { Loan, Installment } from '../../types';
import { parseDateOnlyUTC } from '../../utils/dateHelpers';
import { FlexibleDailyScreen } from './payment/FlexibleDailyScreen';
import { usePaymentManagerState, ForgivenessMode } from './payment/hooks/usePaymentManagerState';
import { formatMoney } from '../../utils/formatters';

interface PaymentManagerModalProps {
    data: {loan: Loan, inst: Installment, calculations: any} | null;
    onClose: () => void;
    isProcessing: boolean;
    paymentType: 'FULL' | 'RENEW_INTEREST' | 'RENEW_AV' | 'LEND_MORE' | 'CUSTOM' | 'PARTIAL_INTEREST';
    setPaymentType: (t: any) => void;
    avAmount: string;
    setAvAmount: (v: string) => void;
    onConfirm: (
        forgivePenalty: ForgivenessMode, 
        manualDate?: Date | null, 
        amountPaid?: number,
        realDate?: Date | null,
        interestHandling?: 'CAPITALIZE' | 'KEEP_PENDING'
    ) => void;
    onOpenMessage: (loan: Loan) => void;
}

export const PaymentManagerModal: React.FC<PaymentManagerModalProps> = ({ 
    data, onClose, isProcessing, paymentType, setPaymentType, avAmount, setAvAmount, onConfirm, onOpenMessage 
}) => {
    
    const {
        customAmount, setCustomAmount,
        manualDateStr, setManualDateStr,
        realPaymentDateStr, setRealPaymentDateStr,
        subMode, setSubMode,
        fixedTermData,
        forgivenessMode, setForgivenessMode,
        interestHandling, setInterestHandling,
        debtBreakdown,
        virtualSchedule,
        resolvedBillingCycle
    } = usePaymentManagerState({ data, paymentType, setPaymentType, avAmount, setAvAmount });

    if (!data) return null;

    const { loan, calculations } = data;

    const safeParse = (val: string) => {
        if (!val) return 0;
        const str = String(val).trim();
        if (str.includes('.') && str.includes(',')) return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
        if (str.includes(',')) return parseFloat(str.replace(',', '.')) || 0;
        return parseFloat(str) || 0;
    };

    // Cálculos de Display Baseados no Breakdown (Já com perdão aplicado)
    const totalInterestDue = debtBreakdown.interest + debtBreakdown.fine + debtBreakdown.dailyMora;
    
    const amountEntering = safeParse(avAmount);
    const remainingInterest = Math.max(0, totalInterestDue - amountEntering);
    
    // Regra: Mostrar decisão de sobra apenas se houver sobra significativa
    const showInterestDecision = remainingInterest > 0.05;

    const handleConfirmWrapper = () => {
        const val = safeParse(avAmount);
        if (val <= 0) return;

        const nextDueDate = manualDateStr ? parseDateOnlyUTC(manualDateStr) : null;
        const realPaymentDate = realPaymentDateStr ? parseDateOnlyUTC(realPaymentDateStr) : new Date();

        onConfirm(
            forgivenessMode, 
            nextDueDate, 
            val, 
            realPaymentDate, 
            interestHandling
        );
    };

    // Tem multa ou mora original para perdoar?
    const hasOriginalFine = debtBreakdown.fine > 0 || debtBreakdown.dailyMora > 0;

    return (
        <div className="fixed inset-0 z-[90] bg-slate-950 flex flex-col animate-in fade-in duration-300 font-sans h-[100dvh] pt-16 sm:pt-20 pb-28 md:pb-0">
            
            {/* HEADER SUPERIOR */}
            <div className="h-16 border-b border-slate-800 bg-slate-950 flex items-center justify-between px-4 sm:px-6 shrink-0">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-emerald-600 rounded-full flex items-center justify-center text-white shadow-lg shadow-emerald-900/50">
                        <DollarSign size={18}/>
                    </div>
                    <div>
                        <h1 className="text-sm font-black text-white uppercase tracking-wider leading-none">Recebimento</h1>
                        <p className="text-[10px] text-slate-500 font-bold uppercase mt-1 tracking-widest">{loan.debtorName}</p>
                    </div>
                </div>
                <button onClick={onClose} className="p-2.5 bg-slate-900 text-slate-400 hover:text-white hover:bg-rose-950/30 hover:border-rose-900 border border-slate-800 rounded-full transition-all group">
                    <X size={18} className="group-hover:scale-110 transition-transform"/>
                </button>
            </div>

            <div className="flex-1 flex flex-col md:flex-row overflow-y-auto md:overflow-hidden">
                
                {/* COLUNA ESQUERDA: RESUMO E DETALHES (SIDEBAR) */}
                <div className="w-full md:w-[380px] lg:w-[420px] bg-slate-900/50 border-b md:border-b-0 md:border-r border-slate-800 flex flex-col md:overflow-y-auto custom-scrollbar p-4 sm:p-6 shrink-0">
                    
                    {/* CARD PRINCIPAL DE VALOR */}
                    <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 text-center relative overflow-hidden shadow-2xl mb-6">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-emerald-500"></div>
                        <p className="text-xs font-black uppercase text-slate-500 mb-2 tracking-widest">Total a Receber</p>
                        <p className="text-4xl font-black text-white mb-2 tracking-tight">
                            {formatMoney(debtBreakdown.total)}
                        </p>
                        {forgivenessMode !== 'NONE' && (
                            <div className="inline-flex items-center gap-2 bg-rose-500/10 px-3 py-1 rounded-full border border-rose-500/20">
                                <span className="text-[10px] text-rose-400 font-bold line-through decoration-rose-500/50">
                                    Original: R$ {calculations.total.toFixed(2)}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* DETALHAMENTO DA DÍVIDA */}
                    <div className="space-y-4">
                        <h3 className="text-[10px] font-black uppercase text-slate-500 tracking-widest flex items-center gap-2">
                            <Receipt size={14}/> Detalhamento Contábil
                        </h3>
                        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
                            <div className="flex justify-between items-center text-xs border-b border-slate-800/50 pb-2">
                                <span className="text-slate-400 font-bold uppercase">Capital Principal</span>
                                <span className="text-white font-bold">{formatMoney(debtBreakdown.principal)}</span>
                            </div>
                            <div className="flex justify-between items-center text-xs border-b border-slate-800/50 pb-2">
                                <span className="text-blue-400 font-bold uppercase flex items-center gap-1"><TrendingUp size={12}/> Lucro (Juros)</span>
                                <span className="text-blue-400 font-bold">{formatMoney(debtBreakdown.interest)}</span>
                            </div>
                            {(calculations.lateFee > 0) && (
                                <>
                                    <div className={`flex justify-between items-center text-xs ${forgivenessMode === 'FINE_ONLY' || forgivenessMode === 'BOTH' ? 'line-through opacity-50' : ''}`}>
                                        <span className="text-rose-400 font-bold uppercase flex items-center gap-1"><AlertTriangle size={12}/> Multa Fixa</span>
                                        <span className="text-rose-400 font-bold">{formatMoney(debtBreakdown.fine)}</span>
                                    </div>
                                    <div className={`flex justify-between items-center text-xs ${forgivenessMode === 'INTEREST_ONLY' || forgivenessMode === 'BOTH' ? 'line-through opacity-50' : ''}`}>
                                        <span className="text-orange-400 font-bold uppercase flex items-center gap-1"><Clock size={12}/> Juros Mora</span>
                                        <span className="text-orange-400 font-bold">{formatMoney(debtBreakdown.dailyMora)}</span>
                                    </div>
                                </>
                            )}
                            <div className="flex justify-between items-center text-sm pt-1">
                                <span className="text-slate-200 font-black uppercase">Total Final</span>
                                <span className="text-emerald-400 font-black">{formatMoney(debtBreakdown.total)}</span>
                            </div>
                        </div>
                    </div>

                    {/* OPÇÕES DE PERDÃO */}
                    {hasOriginalFine && paymentType !== 'FULL' && (
                        <div className="mt-6 space-y-3">
                            <h3 className="text-[10px] font-black uppercase text-slate-500 tracking-widest flex items-center gap-2">
                                <ShieldCheck size={14}/> Gestão de Perdão
                            </h3>
                            <div className="grid grid-cols-2 gap-2">
                                <button 
                                    onClick={() => setForgivenessMode(forgivenessMode === 'FINE_ONLY' ? 'NONE' : 'FINE_ONLY')}
                                    className={`px-3 py-2 rounded-full text-[9px] font-bold uppercase border transition-all ${forgivenessMode === 'FINE_ONLY' ? 'bg-rose-500 text-white border-rose-600' : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-rose-500'}`}
                                >
                                    Perdoar Multa
                                </button>
                                <button 
                                    onClick={() => setForgivenessMode(forgivenessMode === 'INTEREST_ONLY' ? 'NONE' : 'INTEREST_ONLY')}
                                    className={`px-3 py-2 rounded-full text-[9px] font-bold uppercase border transition-all ${forgivenessMode === 'INTEREST_ONLY' ? 'bg-orange-500 text-white border-orange-600' : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-orange-500'}`}
                                >
                                    Perdoar Mora
                                </button>
                                <button 
                                    onClick={() => setForgivenessMode(forgivenessMode === 'BOTH' ? 'NONE' : 'BOTH')}
                                    className={`col-span-2 px-3 py-2 rounded-full text-[9px] font-bold uppercase border transition-all ${forgivenessMode === 'BOTH' ? 'bg-emerald-500 text-white border-emerald-600' : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-emerald-500'}`}
                                >
                                    Perdoar Total (100% Encargos)
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* COLUNA DIREITA: ÁREA DE AÇÃO (MAIN) */}
                <div className="flex-1 bg-slate-950 flex flex-col md:overflow-y-auto custom-scrollbar">
                    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-8 w-full">
                        
                        {/* Seletor de Data Real (GLOBAL PARA TODOS OS TIPOS) */}
                        <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-800 flex items-center justify-between group focus-within:border-blue-500 transition-colors">
                            <div>
                                <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Data do Recebimento (Auditoria)</label>
                                <input 
                                    type="date" 
                                    value={realPaymentDateStr}
                                    onChange={e => setRealPaymentDateStr(e.target.value)}
                                    className="bg-transparent text-white font-bold text-sm outline-none w-full appearance-none cursor-pointer"
                                />
                            </div>
                            <Calendar size={20} className="text-slate-500 group-focus-within:text-blue-500 transition-colors"/>
                        </div>

                        {/* WORKSPACE PRINCIPAL - FLUXO ÚNICO */}
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            
                            {(resolvedBillingCycle === 'DAILY_FREE' || resolvedBillingCycle === 'DAILY_FIXED_TERM') ? (
                                <FlexibleDailyScreen 
                                    amount={avAmount}
                                    setAmount={setAvAmount}
                                    manualDateStr={manualDateStr}
                                    setManualDateStr={setManualDateStr}
                                    debt={debtBreakdown}
                                    loan={loan}
                                    subMode={subMode}
                                    setSetSubMode={setSubMode}
                                    paymentType={paymentType}
                                    setPaymentType={setPaymentType}
                                    onConfirmFull={() => setAvAmount(debtBreakdown.total.toFixed(2))}
                                />
                            ) : (
                                /* CARD DE ENTRADA DE VALOR (GIRO/MENSAL) */
                                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl relative overflow-hidden group focus-within:border-blue-500 transition-all">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/5 blur-[60px] rounded-full"></div>
                                    
                                    <div className="relative z-10">
                                        <div className="flex items-center justify-between mb-6">
                                            <h2 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500 flex items-center gap-2">
                                                <Banknote size={16} className="text-blue-500"/>
                                                Registrar Pagamento
                                            </h2>
                                            <div className="flex items-center gap-2 px-3 py-1 bg-slate-950 border border-slate-800 rounded-full">
                                                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Detecção Automática</span>
                                            </div>
                                        </div>

                                        <div className="flex items-baseline gap-4 mb-8">
                                            <span className="text-4xl font-black text-blue-500">R$</span>
                                            <input 
                                                type="text" 
                                                inputMode="decimal" 
                                                value={avAmount || ''} 
                                                onChange={e => setAvAmount(e.target.value.replace(/[^0-9.,]/g, ''))} 
                                                className="w-full bg-transparent text-6xl font-black text-white outline-none placeholder:text-slate-800 tracking-tighter" 
                                                placeholder="0,00" 
                                                autoFocus 
                                            />
                                        </div>

                                        {/* PREVIEW DINÂMICO */}
                                        {safeParse(avAmount) > 0 && (
                                            <div className="bg-slate-950/50 border border-slate-800/50 p-6 rounded-2xl space-y-4 animate-in zoom-in-95 duration-300">
                                                <div className="flex items-start gap-4">
                                                    <div className="w-10 h-10 bg-blue-600/20 rounded-full flex items-center justify-center text-blue-500 shrink-0">
                                                        <TrendingUp size={18}/>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Impacto do Recebimento</p>
                                                        <p className="text-sm text-slate-200 font-bold leading-relaxed">
                                                            {(() => {
                                                                const val = safeParse(avAmount);
                                                                const totalDue = debtBreakdown.total;
                                                                const interestDue = totalInterestDue;
                                                                
                                                                if (val >= totalDue - 0.05) return "Quitação total: O contrato será encerrado e arquivado.";
                                                                if (val >= interestDue - 0.05) {
                                                                    const amort = val - interestDue;
                                                                    if (amort > 0.05) return `Encargos + Amortização: Quita os juros e abate ${formatMoney(amort)} do capital principal.`;
                                                                    return "Renovação: Quita os juros/multas do período e mantém o capital principal.";
                                                                }
                                                                return `Pagamento Parcial: Abate ${formatMoney(val)} apenas dos juros/encargos acumulados.`;
                                                            })()}
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="h-px bg-slate-800/50 w-full" />

                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="space-y-1">
                                                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Novo Saldo Devedor</p>
                                                        <p className="text-lg font-black text-white">
                                                            {formatMoney(Math.max(0, debtBreakdown.principal - Math.max(0, safeParse(avAmount) - totalInterestDue)))}
                                                        </p>
                                                    </div>
                                                    <div className="space-y-1 text-right">
                                                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Status do Contrato</p>
                                                        <p className="text-lg font-black text-emerald-500">
                                                            {safeParse(avAmount) >= debtBreakdown.total - 0.05 ? 'QUITADO' : 'ATIVO'}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* CONFIGURAÇÕES ADICIONAIS */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="bg-slate-900/50 p-5 rounded-2xl border border-slate-800 space-y-3">
                                    <label className="text-[10px] font-black uppercase text-slate-500 block tracking-widest flex items-center gap-2">
                                        <CalendarClock size={14} className="text-blue-500"/>
                                        Próximo Vencimento
                                    </label>
                                    <input 
                                        type="date" 
                                        className="bg-slate-950 border border-slate-800 rounded-full p-3 text-white font-bold text-sm outline-none w-full focus:border-blue-500 transition-all" 
                                        value={manualDateStr || ''} 
                                        onChange={e => setManualDateStr(e.target.value)} 
                                    />
                                </div>

                                {showInterestDecision && (
                                    <div className="bg-slate-900/50 p-5 rounded-2xl border border-slate-800 space-y-3">
                                        <label className="text-[10px] font-black uppercase text-slate-500 block tracking-widest flex items-center gap-2">
                                            <AlertCircle size={14} className="text-amber-500"/>
                                            Saldo de Juros
                                        </label>
                                        <div className="grid grid-cols-2 gap-2">
                                            <button 
                                                onClick={() => setInterestHandling('KEEP_PENDING')}
                                                className={`p-3 rounded-full border text-[10px] font-black uppercase transition-all ${interestHandling === 'KEEP_PENDING' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-500'}`}
                                            >
                                                Manter Pendente
                                            </button>
                                            <button 
                                                onClick={() => setInterestHandling('CAPITALIZE')}
                                                className={`p-3 rounded-full border text-[10px] font-black uppercase transition-all ${interestHandling === 'CAPITALIZE' ? 'bg-rose-600 border-rose-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-500'}`}
                                            >
                                                Capitalizar
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* FOOTER DE AÇÃO */}
            <div className="p-4 sm:p-6 border-t border-slate-800 flex gap-4 bg-slate-950 shrink-0 mt-auto z-10">
                <button onClick={() => { onOpenMessage(loan); }} disabled={isProcessing} className="p-4 bg-slate-900 border border-slate-800 rounded-full text-slate-400 hover:text-emerald-500 hover:border-emerald-500/30 transition-all shrink-0">
                    <MessageSquare size={18}/>
                </button>
                <button 
                    onClick={handleConfirmWrapper} 
                    disabled={isProcessing || !avAmount || safeParse(avAmount) <= 0} 
                    className={`flex-1 py-4 text-white rounded-full font-black uppercase text-sm shadow-xl transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed bg-emerald-600 hover:bg-emerald-500 hover:shadow-emerald-600/20`}
                >
                    {isProcessing ? <Loader2 className="animate-spin" size={18}/> : <><CheckCircle2 size={18}/> Confirmar Recebimento</>}
                </button>
            </div>
        </div>
    );
};