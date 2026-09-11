import React, { useEffect, useRef, useState } from 'react';
import { Loader2, MessageSquare, DollarSign, Calendar, CalendarClock, AlertCircle, Banknote, CheckCircle2, TrendingUp, AlertTriangle, Clock, X, Receipt, ShieldCheck } from 'lucide-react';
import { Loan, Installment } from '../../types';
import { parseDateOnlyUTC } from '../../utils/dateHelpers';
import { FlexibleDailyScreen } from './payment/FlexibleDailyScreen';
import { usePaymentManagerState, ForgivenessMode } from './payment/hooks/usePaymentManagerState';
import { isCapitalOnlyRecoveryLoan } from '../../utils/capitalOnlyRecovery';
import { formatMoney } from '../../utils/formatters';

type InterestHandling = 'CAPITALIZE' | 'KEEP_PENDING' | 'RENEW_KEEP_PENDING';

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
        interestHandling?: InterestHandling
    ) => void;
    onOpenMessage: (loan: Loan) => void;
}

export const PaymentManagerModal: React.FC<PaymentManagerModalProps> = ({
    data, onClose, isProcessing, paymentType, setPaymentType, avAmount, setAvAmount, onConfirm, onOpenMessage
}) => {
    const {
        manualDateStr, setManualDateStr,
        realPaymentDateStr, setRealPaymentDateStr,
        subMode, setSubMode,
        forgivenessMode, setForgivenessMode,
        interestHandling, setInterestHandling,
        debtBreakdown,
        resolvedBillingCycle
    } = usePaymentManagerState({ data, paymentType, setPaymentType, avAmount, setAvAmount });

    const [autoFillMode, setAutoFillMode] = useState<'NONE' | 'TOTAL' | 'INTEREST'>('TOTAL');
    const previousAutoFillRef = useRef<{ mode: 'NONE' | 'TOTAL'; amount: string } | null>(null);
    const totalInterestDue = debtBreakdown.interest + debtBreakdown.fine + debtBreakdown.dailyMora;

    useEffect(() => {
        if (autoFillMode === 'TOTAL') setAvAmount(debtBreakdown.total > 0 ? debtBreakdown.total.toFixed(2) : '');
        else if (autoFillMode === 'INTEREST') setAvAmount(totalInterestDue.toFixed(2));
    }, [autoFillMode, debtBreakdown.total, totalInterestDue, setAvAmount]);

    if (!data) return null;

    const { loan, calculations } = data;
    const isCapitalOnlyRecovery = isCapitalOnlyRecoveryLoan(loan);

    const safeParse = (val: string) => {
        if (!val) return 0;
        const str = String(val).trim();
        if (str.includes('.') && str.includes(',')) return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
        if (str.includes(',')) return parseFloat(str.replace(',', '.')) || 0;
        return parseFloat(str) || 0;
    };

    const amountEntering = safeParse(avAmount);
    const remainingInterest = Math.max(0, totalInterestDue - amountEntering);
    const showInterestDecision = remainingInterest > 0.05;

    const handleConfirmWrapper = () => {
        const val = safeParse(avAmount);
        if (val <= 0) return;
        const nextDueDate = manualDateStr ? parseDateOnlyUTC(manualDateStr) : null;
        const realPaymentDate = realPaymentDateStr ? parseDateOnlyUTC(realPaymentDateStr) : new Date();
        onConfirm(forgivenessMode, nextDueDate, val, realPaymentDate, interestHandling as InterestHandling);
    };

    const toggleInterestAutoFill = () => {
        if (autoFillMode === 'INTEREST') {
            const previous = previousAutoFillRef.current;
            const nextMode = previous?.mode ?? 'TOTAL';
            setAutoFillMode(nextMode);
            if (nextMode === 'NONE') setAvAmount(previous?.amount ?? '');
            else setAvAmount(debtBreakdown.total > 0 ? debtBreakdown.total.toFixed(2) : '');
            previousAutoFillRef.current = null;
            return;
        }
        previousAutoFillRef.current = { mode: autoFillMode, amount: avAmount || '' };
        setAutoFillMode('INTEREST');
        setAvAmount(totalInterestDue.toFixed(2));
    };

    const hasOriginalFine = (Number(calculations.lateFee) || 0) > 0 || debtBreakdown.fine > 0 || debtBreakdown.dailyMora > 0;
    const hasChargesToForgive = !isCapitalOnlyRecovery && ((Number(calculations.interest) || 0) > 0 || debtBreakdown.interest > 0 || hasOriginalFine);
    const forgivesFine = forgivenessMode === 'FINE_ONLY' || forgivenessMode === 'FINE_AND_MORA' || forgivenessMode === 'BOTH' || forgivenessMode === 'TOTAL_CHARGES' || isCapitalOnlyRecovery;
    const forgivesMora = forgivenessMode === 'MORA_ONLY' || forgivenessMode === 'INTEREST_ONLY' || forgivenessMode === 'FINE_AND_MORA' || forgivenessMode === 'BOTH' || forgivenessMode === 'TOTAL_CHARGES' || isCapitalOnlyRecovery;
    const forgivesInterest = forgivenessMode === 'TOTAL_CHARGES' || isCapitalOnlyRecovery;

    const toggleFineForgiveness = () => {
        if (forgivenessMode === 'FINE_ONLY') setForgivenessMode('NONE');
        else if (forgivenessMode === 'MORA_ONLY' || forgivenessMode === 'INTEREST_ONLY') setForgivenessMode('FINE_AND_MORA');
        else if (forgivenessMode === 'FINE_AND_MORA' || forgivenessMode === 'BOTH') setForgivenessMode('MORA_ONLY');
        else setForgivenessMode('FINE_ONLY');
    };

    const toggleMoraForgiveness = () => {
        if (forgivenessMode === 'MORA_ONLY' || forgivenessMode === 'INTEREST_ONLY') setForgivenessMode('NONE');
        else if (forgivenessMode === 'FINE_ONLY') setForgivenessMode('FINE_AND_MORA');
        else if (forgivenessMode === 'FINE_AND_MORA' || forgivenessMode === 'BOTH') setForgivenessMode('FINE_ONLY');
        else setForgivenessMode('MORA_ONLY');
    };

    return (
        <div className="fixed inset-0 z-[var(--z-modal)] bg-slate-950/80 backdrop-blur-md flex items-stretch sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-300">
            <div className="bg-slate-950 border border-slate-800 w-full max-w-4xl sm:rounded-xl shadow-[0_0_60px_-15px_rgba(0,0,0,0.7)] animate-in zoom-in-95 slide-in-from-bottom-4 flex flex-col h-[100dvh] sm:h-auto sm:max-h-[92dvh] overflow-hidden">
                <div className="h-16 border-b border-slate-800 bg-slate-950 flex items-center justify-between px-4 sm:px-6 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-emerald-600 rounded-full flex items-center justify-center text-white shadow-lg shadow-emerald-900/50"><DollarSign size={18}/></div>
                        <div><h1 className="text-sm font-black text-white uppercase tracking-wider leading-none">Recebimento</h1><p className="text-[10px] text-slate-500 font-bold uppercase mt-1 tracking-widest">{loan.debtorName}</p></div>
                    </div>
                    <button onClick={onClose} className="p-2.5 bg-slate-900 text-slate-400 hover:text-white hover:bg-rose-950/30 hover:border-rose-900 border border-slate-800 rounded-full transition-all"><X size={18}/></button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar overscroll-contain">
                    <div className="flex flex-col md:flex-row min-h-full">
                        <div className="w-full md:w-[380px] lg:w-[420px] bg-slate-900/50 border-b md:border-b-0 md:border-r border-slate-800 p-4 sm:p-6 shrink-0">
                            <div className="bg-slate-950 p-6 rounded-lg border border-slate-800 text-center relative overflow-hidden shadow-2xl mb-6">
                                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-emerald-500"></div>
                                <p className="text-xs font-black uppercase text-slate-500 mb-2 tracking-widest">Total a Receber</p>
                                <p className="text-4xl font-black text-white mb-2 tracking-tight">{formatMoney(debtBreakdown.total)}</p>
                                {forgivenessMode !== 'NONE' && <div className="inline-flex items-center gap-2 bg-rose-500/10 px-3 py-1 rounded-full border border-rose-500/20"><span className="text-[10px] text-rose-400 font-bold line-through decoration-rose-500/50">Original: R$ {calculations.total.toFixed(2)}</span></div>}
                            </div>

                            <div className="space-y-4">
                                <h3 className="text-[10px] font-black uppercase text-slate-500 tracking-widest flex items-center gap-2"><Receipt size={14}/> Detalhamento Contábil</h3>
                                <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-3">
                                    <div className="flex justify-between items-center text-xs border-b border-slate-800/50 pb-2"><span className="text-slate-400 font-bold uppercase">Capital Principal</span><span className="text-white font-bold">{formatMoney(debtBreakdown.principal)}</span></div>
                                    <div className={`flex justify-between items-center text-xs border-b border-slate-800/50 pb-2 ${forgivesInterest ? 'line-through opacity-50' : ''}`}><span className="text-blue-400 font-bold uppercase flex items-center gap-1"><TrendingUp size={12}/> Lucro (Juros)</span><span className="text-blue-400 font-bold">{formatMoney(debtBreakdown.interest)}</span></div>
                                    {(calculations.lateFee > 0) && <><div className={`flex justify-between items-center text-xs ${forgivesFine ? 'line-through opacity-50' : ''}`}><span className="text-rose-400 font-bold uppercase flex items-center gap-1"><AlertTriangle size={12}/> Multa Fixa</span><span className="text-rose-400 font-bold">{formatMoney(debtBreakdown.fine)}</span></div><div className={`flex justify-between items-center text-xs ${forgivesMora ? 'line-through opacity-50' : ''}`}><span className="text-orange-400 font-bold uppercase flex items-center gap-1"><Clock size={12}/> Juros Mora</span><span className="text-orange-400 font-bold">{formatMoney(debtBreakdown.dailyMora)}</span></div></>}
                                    <div className="flex justify-between items-center text-sm pt-1"><span className="text-slate-200 font-black uppercase">Total Final</span><span className="text-emerald-400 font-black">{formatMoney(debtBreakdown.total)}</span></div>
                                </div>
                            </div>

                            {hasChargesToForgive && paymentType !== 'FULL' && <div className="mt-6 space-y-3"><h3 className="text-[10px] font-black uppercase text-slate-500 tracking-widest flex items-center gap-2"><ShieldCheck size={14}/> Gestão de Perdão</h3><div className="grid grid-cols-2 gap-2"><button onClick={toggleFineForgiveness} className={`px-3 py-2 rounded-full text-[9px] font-bold uppercase border transition-all ${forgivesFine && forgivenessMode !== 'TOTAL_CHARGES' ? 'bg-rose-500 text-white border-rose-600' : 'bg-slate-900 text-slate-400 border-slate-800'}`}>Perdoar Multa</button><button onClick={toggleMoraForgiveness} className={`px-3 py-2 rounded-full text-[9px] font-bold uppercase border transition-all ${forgivesMora && forgivenessMode !== 'TOTAL_CHARGES' ? 'bg-orange-500 text-white border-orange-600' : 'bg-slate-900 text-slate-400 border-slate-800'}`}>Perdoar Mora</button><button onClick={() => setForgivenessMode(forgivenessMode === 'TOTAL_CHARGES' ? 'NONE' : 'TOTAL_CHARGES')} className={`col-span-2 px-3 py-2 rounded-full text-[9px] font-bold uppercase border transition-all ${forgivenessMode === 'TOTAL_CHARGES' ? 'bg-emerald-500 text-white border-emerald-600' : 'bg-slate-900 text-slate-400 border-slate-800'}`}>Perdoar 100% dos Encargos</button></div></div>}
                        </div>

                        <div className="flex-1 bg-slate-950 min-w-0">
                            <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-8 w-full pb-8">
                                <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-800 flex items-center justify-between group focus-within:border-blue-500 transition-colors"><div><label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Data do Recebimento (Auditoria)</label><input type="date" value={realPaymentDateStr} onChange={e => setRealPaymentDateStr(e.target.value)} onClick={(e) => { try { (e.target as any).showPicker(); } catch(e){} }} className="bg-transparent text-white font-bold text-sm outline-none w-full cursor-pointer [color-scheme:dark]"/></div><Calendar size={20} className="text-slate-500 group-focus-within:text-blue-500 transition-colors"/></div>

                                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    {(resolvedBillingCycle === 'DAILY_FREE' || resolvedBillingCycle === 'DAILY_FIXED_TERM') ? (
                                        <FlexibleDailyScreen amount={avAmount} setAmount={setAvAmount} manualDateStr={manualDateStr} setManualDateStr={setManualDateStr} debt={debtBreakdown} loan={loan} subMode={subMode} setSetSubMode={setSubMode} paymentType={paymentType} setPaymentType={setPaymentType} onConfirmFull={() => setAvAmount(debtBreakdown.total.toFixed(2))}/>
                                    ) : (
                                        <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 sm:p-8 shadow-2xl relative overflow-hidden group focus-within:border-blue-500 transition-all">
                                            <div className="relative z-10">
                                                <div className="flex items-center justify-between mb-6"><h2 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500 flex items-center gap-2"><Banknote size={16} className="text-blue-500"/> Registrar Recebimento</h2><span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Detecção Automática</span></div>
                                                <div className="flex items-baseline gap-3 mb-6"><span className="text-3xl sm:text-4xl font-black text-blue-500">R$</span><input type="text" inputMode="decimal" value={avAmount || ''} onChange={e => { setAvAmount(e.target.value.replace(/[^0-9.,]/g, '')); setAutoFillMode('NONE'); previousAutoFillRef.current = null; }} className="w-full bg-transparent text-5xl sm:text-6xl font-black text-white outline-none placeholder:text-slate-800 tracking-tighter min-w-0" placeholder="0,00" autoFocus/></div>
                                                <button onClick={toggleInterestAutoFill} className={`w-full px-3 py-2 rounded-lg text-[10px] font-black uppercase border transition-all ${autoFillMode === 'INTEREST' ? 'bg-orange-600 border-orange-500 text-white' : 'border-orange-900/50 bg-orange-900/20 text-orange-400'}`}>Somente Juros/Encargos</button>

                                                {safeParse(avAmount) > 0 && <div className="mt-6 bg-slate-950/50 border border-slate-800/50 p-5 rounded-lg space-y-4"><p className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Impacto do Recebimento</p><p className="text-sm text-slate-200 font-bold leading-relaxed">{(() => { const val = safeParse(avAmount); const totalDue = debtBreakdown.total; const interestDue = totalInterestDue; if (isCapitalOnlyRecovery) return val >= debtBreakdown.principal - 0.05 ? 'Quitação sem juros.' : `Abate ${formatMoney(val)} diretamente do capital.`; if (val >= totalDue - 0.05) return 'Quitação total: o contrato será encerrado.'; if (val >= interestDue - 0.05) { const amort = val - interestDue; return amort > 0.05 ? `Quita os encargos e abate ${formatMoney(amort)} do capital.` : 'Quita os encargos do período.'; } return `Pagamento parcial: ainda restam ${formatMoney(Math.max(0, interestDue - val))} em juros/encargos.`; })()}</p></div>}
                                            </div>
                                        </div>
                                    )}

                                    <div className="grid grid-cols-1 gap-4">
                                        <div className="bg-slate-900/50 p-5 rounded-lg border border-slate-800 space-y-3"><label className="text-[10px] font-black uppercase text-slate-500 block tracking-widest flex items-center gap-2"><CalendarClock size={14} className="text-blue-500"/> Próximo Vencimento</label><input type="date" className="bg-slate-950 border border-slate-800 rounded-full p-3 text-white font-bold text-sm outline-none w-full focus:border-blue-500 transition-all cursor-pointer [color-scheme:dark]" value={manualDateStr || ''} onChange={e => setManualDateStr(e.target.value)} onClick={(e) => { try { (e.target as any).showPicker(); } catch(e){} }}/></div>

                                        {showInterestDecision && (
                                            <div className="bg-slate-900/50 p-5 rounded-lg border border-amber-500/20 space-y-3">
                                                <label className="text-[10px] font-black uppercase text-slate-400 block tracking-widest flex items-center gap-2"><AlertCircle size={14} className="text-amber-500"/> O que fazer com o saldo restante?</label>
                                                <p className="text-[11px] text-slate-400">Restam {formatMoney(remainingInterest)} de juros/encargos após este recebimento.</p>
                                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                                    <button onClick={() => setInterestHandling('KEEP_PENDING' as any)} className={`p-3 rounded-lg border text-[10px] font-black uppercase transition-all ${interestHandling === 'KEEP_PENDING' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-500'}`}>Não renovar<br/><span className="normal-case font-bold opacity-70">mantém vencimento e saldo</span></button>
                                                    <button onClick={() => setInterestHandling('RENEW_KEEP_PENDING' as any)} className={`p-3 rounded-lg border text-[10px] font-black uppercase transition-all ${interestHandling === 'RENEW_KEEP_PENDING' ? 'bg-amber-600 border-amber-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-500'}`}>Renovar<br/><span className="normal-case font-bold opacity-70">mantém o restante pendente</span></button>
                                                    <button onClick={() => setInterestHandling('CAPITALIZE' as any)} className={`p-3 rounded-lg border text-[10px] font-black uppercase transition-all ${interestHandling === 'CAPITALIZE' ? 'bg-rose-600 border-rose-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-500'}`}>Capitalizar<br/><span className="normal-case font-bold opacity-70">leva o restante ao principal</span></button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="sticky bottom-0 p-3 sm:p-5 border-t border-slate-800 flex gap-3 bg-slate-950/95 backdrop-blur-xl shrink-0 z-30 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                    <button onClick={() => { onOpenMessage(loan); }} disabled={isProcessing} className="p-4 bg-slate-900 border border-slate-800 rounded-full text-slate-400 hover:text-emerald-500 transition-all shrink-0"><MessageSquare size={18}/></button>
                    <button onClick={handleConfirmWrapper} disabled={isProcessing || !avAmount || safeParse(avAmount) <= 0} className="flex-1 py-4 text-white rounded-full font-black uppercase text-sm shadow-xl transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed bg-emerald-600 hover:bg-emerald-500">
                        {isProcessing ? <Loader2 className="animate-spin" size={18}/> : <><CheckCircle2 size={18}/> Confirmar Recebimento</>}
                    </button>
                </div>
            </div>
        </div>
    );
};