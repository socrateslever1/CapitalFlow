/**
 * Componente PaymentRegistrationForm.
 * Responsável por exibir o formulário de registro de pagamento do contrato,
 * com detecção automática do impacto do pagamento, campos de data,
 * opções de perdão de multa/mora, decisão de juros restantes e suporte
 * integrado a cobranças diárias flexíveis.
 */

import React from 'react';
import { Banknote, TrendingUp, ShieldCheck, CheckCircle2, Loader2 } from 'lucide-react';
import { Loan } from '../../types';
import { formatMoney } from '../../utils/formatters';
import { ForgivenessMode } from '../../components/modals/payment/hooks/usePaymentManagerState';
import { FlexibleDailyScreen } from '../../components/modals/payment/FlexibleDailyScreen';
import { isCapitalOnlyRecoveryLoan } from '../../utils/capitalOnlyRecovery';

interface PaymentRegistrationFormProps {
    loan: Loan;
    resolvedBillingCycle: string;
    avAmount: string;
    setAvAmount: (val: string) => void;
    manualDateStr: string;
    setManualDateStr: (val: string) => void;
    realPaymentDateStr: string;
    setRealPaymentDateStr: (val: string) => void;
    forgivenessMode: ForgivenessMode;
    setForgivenessMode: (mode: ForgivenessMode) => void;
    interestHandling: 'CAPITALIZE' | 'KEEP_PENDING';
    setInterestHandling: (handling: 'CAPITALIZE' | 'KEEP_PENDING') => void;
    debtBreakdown: any;
    subMode: 'DAYS' | 'AMORTIZE';
    setSubMode: (mode: 'DAYS' | 'AMORTIZE') => void;
    paymentType: any;
    setPaymentType: (type: any) => void;
    isProcessing: boolean;
    isStealthMode: boolean;
    showInterestDecision: boolean;
    totalInterestDue: number;
    safeParse: (val: string) => number;
    handleConfirm: () => void;
}

export const PaymentRegistrationForm: React.FC<PaymentRegistrationFormProps> = ({
    loan,
    resolvedBillingCycle,
    avAmount,
    setAvAmount,
    manualDateStr,
    setManualDateStr,
    realPaymentDateStr,
    setRealPaymentDateStr,
    forgivenessMode,
    setForgivenessMode,
    interestHandling,
    setInterestHandling,
    debtBreakdown,
    subMode,
    setSubMode,
    paymentType,
    setPaymentType,
    isProcessing,
    isStealthMode,
    showInterestDecision,
    totalInterestDue,
    safeParse,
    handleConfirm
}) => {
    const isCapitalOnlyRecovery = isCapitalOnlyRecoveryLoan(loan);
    const forgivesFine = forgivenessMode === 'FINE_ONLY' || forgivenessMode === 'FINE_AND_MORA' || forgivenessMode === 'BOTH' || forgivenessMode === 'TOTAL_CHARGES' || isCapitalOnlyRecovery;
    const forgivesMora = forgivenessMode === 'MORA_ONLY' || forgivenessMode === 'INTEREST_ONLY' || forgivenessMode === 'FINE_AND_MORA' || forgivenessMode === 'BOTH' || forgivenessMode === 'TOTAL_CHARGES' || isCapitalOnlyRecovery;

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

    if (resolvedBillingCycle === 'DAILY_FREE' || resolvedBillingCycle === 'DAILY_FIXED_TERM') {
        return (
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
        );
    }

    return (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-8 shadow-2xl relative overflow-hidden group focus-within:border-blue-500 transition-all">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/5 blur-[60px] rounded-full"></div>

            <div className="relative z-10">
                <div className="flex items-center justify-between mb-8">
                    <h2 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500 flex items-center gap-2">
                        <Banknote size={16} className="text-blue-500" />
                        Registrar Recebimento
                    </h2>
                    <div className="flex items-center gap-2 px-3 py-1 bg-slate-950 border border-slate-800 rounded-full">
                        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                            Detecção Automática
                        </span>
                    </div>
                </div>

                <div className="flex items-baseline gap-4 mb-8">
                    <span className="text-4xl font-black text-blue-500">R$</span>
                    <input
                        type="text"
                        inputMode="decimal"
                        value={avAmount || ''}
                        onChange={(e) => setAvAmount(e.target.value.replace(/[^0-9.,]/g, ''))}
                        className="w-full bg-transparent text-6xl font-black text-white outline-none placeholder:text-slate-800 tracking-tighter"
                        placeholder="0,00"
                    />
                </div>

                {/* PREVIEW DINÂMICO */}
                {safeParse(avAmount) > 0 && (
                    <div className="bg-slate-950/50 border border-slate-800/50 p-6 rounded-lg space-y-4 animate-in zoom-in-95 duration-300 mb-8">
                        <div className="flex items-start gap-4">
                            <div className="w-10 h-10 bg-blue-600/20 rounded-lg flex items-center justify-center text-blue-500 shrink-0">
                                <TrendingUp size={20} />
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">
                                    Impacto do Recebimento
                                </p>
                                <p className="text-sm text-slate-200 font-bold leading-relaxed">
                                    {(() => {
                                        const val = safeParse(avAmount);
                                        const totalDue = debtBreakdown.total;
                                        const interestDue = totalInterestDue;

                                        if (isCapitalOnlyRecovery) {
                                            if (val >= debtBreakdown.principal - 0.05) return 'Quitação sem juros: recebe apenas o capital e encerra os encargos.';
                                            return `Recebimento sem juros: abate ${formatMoney(val, isStealthMode)} diretamente do capital.`;
                                        }
                                        if (val >= totalDue - 0.05) return 'Quitação total: O contrato será encerrado e arquivado.';
                                        if (val >= interestDue - 0.05) {
                                            const amort = val - interestDue;
                                            if (amort > 0.05)
                                                return `Encargos + Amortização: Quita os juros e abate ${formatMoney(
                                                    amort,
                                                    isStealthMode
                                                )} do capital principal.`;
                                            return 'Renovação: Quita os juros/multas do período e mantém o capital principal.';
                                        }
                                        return `Recebimento Parcial: Abate ${formatMoney(val, isStealthMode)} apenas dos juros/encargos acumulados.`;
                                    })()}
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                <div className="bg-transparent p-0 mb-8 space-y-4">
                    <div className="flex items-center gap-2">
                        <ShieldCheck size={14} className="text-rose-500" />
                        <label className="text-[9px] font-black uppercase text-slate-500 block tracking-widest">
                            Gestão de Perdão
                        </label>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            onClick={toggleFineForgiveness}
                            className={`p-3 rounded-lg border text-[9px] font-black uppercase transition-all ${
                                forgivesFine && forgivenessMode !== 'TOTAL_CHARGES'
                                    ? 'bg-rose-600 border-rose-500 text-white'
                                    : 'bg-slate-900 border-slate-800 text-slate-500'
                            }`}
                        >
                            Perdoar Multa
                        </button>
                        <button
                            onClick={toggleMoraForgiveness}
                            className={`p-3 rounded-lg border text-[9px] font-black uppercase transition-all ${
                                forgivesMora && forgivenessMode !== 'TOTAL_CHARGES'
                                    ? 'bg-orange-600 border-orange-500 text-white'
                                    : 'bg-slate-900 border-slate-800 text-slate-500'
                            }`}
                        >
                            Perdoar Mora
                        </button>
                        <button
                            onClick={() => setForgivenessMode(forgivenessMode === 'TOTAL_CHARGES' ? 'NONE' : 'TOTAL_CHARGES')}
                            className={`col-span-2 p-3 rounded-lg border text-[9px] font-black uppercase transition-all ${
                                forgivenessMode === 'TOTAL_CHARGES'
                                    ? 'bg-emerald-600 border-emerald-500 text-white'
                                    : 'bg-slate-900 border-slate-800 text-slate-500'
                            }`}
                        >
                            Perdoar 100% dos Encargos
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                    <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-2">
                        <label className="text-[9px] font-black uppercase text-slate-500 block tracking-widest">
                            Data Recebimento
                        </label>
                        <input
                            type="date"
                            value={realPaymentDateStr}
                            onChange={(e) => setRealPaymentDateStr(e.target.value)}
                            className="bg-transparent text-white font-bold text-sm outline-none w-full appearance-none cursor-pointer"
                        />
                    </div>
                    <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-2">
                        <label className="text-[9px] font-black uppercase text-slate-500 block tracking-widest">
                            Próximo Vencimento
                        </label>
                        <input
                            type="date"
                            value={manualDateStr || ''}
                            onChange={(e) => setManualDateStr(e.target.value)}
                            className="bg-transparent text-white font-bold text-sm outline-none w-full appearance-none cursor-pointer"
                        />
                    </div>
                </div>

                {showInterestDecision && (
                    <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 mb-8 space-y-3">
                        <label className="text-[9px] font-black uppercase text-slate-500 block tracking-widest">
                            Saldo de Juros Restante
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                onClick={() => setInterestHandling('KEEP_PENDING')}
                                className={`p-3 rounded-lg border text-[10px] font-black uppercase transition-all ${
                                    interestHandling === 'KEEP_PENDING'
                                        ? 'bg-blue-600 border-blue-500 text-white'
                                        : 'bg-slate-900 border-slate-800 text-slate-500'
                                }`}
                            >
                                Manter Pendente
                            </button>
                            <button
                                onClick={() => setInterestHandling('CAPITALIZE')}
                                className={`p-3 rounded-lg border text-[10px] font-black uppercase transition-all ${
                                    interestHandling === 'CAPITALIZE'
                                        ? 'bg-rose-600 border-rose-500 text-white'
                                        : 'bg-slate-900 border-slate-800 text-slate-500'
                                }`}
                            >
                                Capitalizar
                            </button>
                        </div>
                    </div>
                )}

                <button
                    onClick={handleConfirm}
                    disabled={isProcessing || !avAmount || safeParse(avAmount) <= 0}
                    className="w-full py-5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-black uppercase text-sm shadow-xl shadow-emerald-900/20 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isProcessing ? (
                        <Loader2 className="animate-spin" size={20} />
                    ) : (
                        <>
                            <CheckCircle2 size={20} /> Confirmar Recebimento
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};
