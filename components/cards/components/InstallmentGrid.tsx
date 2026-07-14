import React from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, DollarSign, XCircle } from 'lucide-react';
import { formatMoney } from '../../../utils/formatters';
import { Loan, Installment, Agreement, AgreementInstallment } from '../../../types';
import { InstallmentCard } from './InstallmentCard';
import { prepareInstallmentViewModel } from './InstallmentGrid.logic';

type QuickPaymentOptions = {
    forgivenessMode?: 'NONE' | 'FINE_ONLY' | 'MORA_ONLY' | 'FINE_AND_MORA' | 'TOTAL_CHARGES' | 'CAPITAL_ONLY' | 'INTEREST_ONLY' | 'BOTH';
};

interface InstallmentGridProps {
    loan: Loan;
    orderedInstallments: Installment[];
    fixedTermStats: any;
    isPaid: boolean;
    isLate: boolean;
    isZeroBalance: boolean;
    isFullyFinalized: boolean;
    showProgress: boolean;
    strategy: any;
    isDailyFree: boolean;
    isFixedTerm: boolean;
    onAgreementPayment: (loan: Loan, agreement: Agreement, inst: AgreementInstallment, amount?: number) => void;
    onInstallmentPayment?: (loan: Loan, inst: Installment, debt: any, amount?: number, options?: QuickPaymentOptions) => void;
    onReverseInstallmentPayment?: (loan: Loan, inst: Installment) => void;
    isStealthMode?: boolean;
    onNavigate?: () => void;
}

export const InstallmentGrid: React.FC<InstallmentGridProps> = (props) => {
    const [selectedInst, setSelectedInst] = React.useState<Installment | null>(null);
    const [selectedDebt, setSelectedDebt] = React.useState<any>(null);
    const [receiptAmount, setReceiptAmount] = React.useState('');
    const [showCustomAmount, setShowCustomAmount] = React.useState(false);
    const [quickMode, setQuickMode] = React.useState<'TOTAL' | 'CUSTOM' | 'CHARGES_ONLY'>('TOTAL');
    const [forgiveLateFee, setForgiveLateFee] = React.useState(false);

    const {
        loan, orderedInstallments, fixedTermStats, isPaid, isZeroBalance, isFullyFinalized,
        showProgress, strategy, isDailyFree, isFixedTerm, isStealthMode, onNavigate,
        onInstallmentPayment, onReverseInstallmentPayment
    } = props;

    const context = {
        fixedTermStats,
        isPaid,
        isZeroBalance,
        isFullyFinalized,
        showProgress,
        strategy,
        isDailyFree,
        isFixedTerm
    };

    return (
        <>
            <div className="flex flex-col gap-0.5 max-h-[60vh] overflow-y-auto custom-scrollbar pr-1 -mr-1">
                {orderedInstallments.map((inst, i) => {
                    const viewModel = prepareInstallmentViewModel(loan, inst, i, context);

                    return (
                        <InstallmentCard
                            key={inst.id}
                            vm={viewModel}
                            loan={loan}
                            fixedTermStats={fixedTermStats}
                            strategy={strategy}
                            isStealthMode={isStealthMode}
                            inlinePaymentEnabled={!!onInstallmentPayment}
                            onPayInstallment={(_targetLoan, targetInst, targetDebt) => {
                                setSelectedInst(targetInst);
                                setSelectedDebt(targetDebt);
                                setReceiptAmount(String(Number(targetDebt?.total || targetInst.amount || 0).toFixed(2)));
                                setShowCustomAmount(false);
                                setQuickMode('TOTAL');
                                setForgiveLateFee(false);
                            }}
                            onReverseInstallment={onReverseInstallmentPayment}
                            onNavigate={onNavigate}
                        />
                    );
                })}
            </div>

            {selectedInst && selectedDebt && (() => {
                const principal = Math.max(0, Number(selectedDebt?.principal ?? selectedInst.principalRemaining ?? 0) || 0);
                const interest = Math.max(0, Number(selectedDebt?.interest ?? selectedInst.interestRemaining ?? 0) || 0);
                const lateFee = Math.max(0, Number(selectedDebt?.lateFee ?? selectedInst.lateFeeAccrued ?? 0) || 0);
                const effectiveLateFee = forgiveLateFee ? 0 : lateFee;
                const totalAmount = Math.max(0, Number(selectedDebt?.total || 0) - (forgiveLateFee ? lateFee : 0));
                const chargesAmount = Math.max(0, interest + effectiveLateFee);
                const displayedAmount = quickMode === 'CUSTOM'
                    ? (Number(receiptAmount) || 0)
                    : quickMode === 'CHARGES_ONLY'
                        ? chargesAmount
                        : totalAmount;
                const canReceiveChargesOnly = chargesAmount > 0.05 && principal > 0.05;
                const forgivenessMode = forgiveLateFee ? 'FINE_AND_MORA' : 'NONE';

                const modalContent = (
                <div className="fixed inset-0 z-[120] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={(e) => e.stopPropagation()}>
                    <div className="bg-slate-900 border border-slate-800 p-5 rounded-lg w-full max-w-[320px] shadow-2xl space-y-4 max-h-[calc(100dvh-2rem)] overflow-y-auto custom-scrollbar">
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center mx-auto bg-blue-500/20 text-blue-500">
                            <DollarSign size={22}/>
                        </div>
                        <div className="text-center">
                            <h5 className="text-white font-black uppercase text-xs tracking-tight">Confirmar Recebimento?</h5>
                            <p className="text-slate-400 text-[10px] mt-1">Informe se recebeu o total da parcela ou outro valor.</p>
                        </div>
                        <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    onClick={() => {
                                        setQuickMode('TOTAL');
                                        setShowCustomAmount(false);
                                        setReceiptAmount(String(totalAmount.toFixed(2)));
                                    }}
                                    className={`py-2 rounded-lg text-[10px] font-black uppercase border flex items-center justify-center gap-1.5 ${quickMode === 'TOTAL' && !showCustomAmount ? 'bg-emerald-600/20 text-emerald-400 border-emerald-500/30' : 'bg-slate-950 text-slate-400 border-slate-700'}`}
                                >
                                    <CheckCircle2 size={12}/> Tudo
                                </button>
                                <button
                                    onClick={() => {
                                        setQuickMode('CUSTOM');
                                        setShowCustomAmount(true);
                                    }}
                                    className={`py-2 rounded-lg text-[10px] font-black uppercase border ${quickMode === 'CUSTOM' || showCustomAmount ? 'bg-blue-600/20 text-blue-400 border-blue-500/40' : 'bg-slate-950 text-slate-400 border-slate-700'}`}
                                >
                                    Outro valor
                                </button>
                            </div>
                            {canReceiveChargesOnly && (
                                <button
                                    onClick={() => {
                                        setQuickMode('CHARGES_ONLY');
                                        setShowCustomAmount(false);
                                        setReceiptAmount(String(chargesAmount.toFixed(2)));
                                    }}
                                    className={`w-full py-2 rounded-lg text-[10px] font-black uppercase border ${quickMode === 'CHARGES_ONLY' ? 'bg-orange-600/20 text-orange-400 border-orange-500/50' : 'bg-slate-950 text-slate-400 border-slate-700'}`}
                                >
                                    Somente juros/encargos
                                </button>
                            )}
                            {lateFee > 0.05 && (
                                <button
                                    type="button"
                                    onClick={() => setForgiveLateFee(prev => !prev)}
                                    className={`w-full py-2 rounded-lg text-[9px] font-black uppercase border transition-all ${forgiveLateFee ? 'bg-rose-600/20 text-rose-300 border-rose-500/40' : 'bg-slate-950 text-slate-400 border-slate-700'}`}
                                >
                                    {forgiveLateFee ? 'Atraso perdoado' : `Perdoar atraso (${formatMoney(lateFee, isStealthMode)})`}
                                </button>
                            )}
                            {showCustomAmount && (
                                <input
                                    type="number"
                                    step="0.01"
                                    value={receiptAmount}
                                    onChange={e => setReceiptAmount(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white font-bold outline-none"
                                    autoFocus
                                />
                            )}
                            <div className="grid grid-cols-3 gap-1 text-center">
                                <span className="rounded-md bg-slate-950/70 border border-slate-800 px-1.5 py-1 text-[8px] font-black uppercase text-slate-500">Cap. {formatMoney(principal, isStealthMode)}</span>
                                <span className="rounded-md bg-slate-950/70 border border-slate-800 px-1.5 py-1 text-[8px] font-black uppercase text-blue-400">Jur. {formatMoney(interest, isStealthMode)}</span>
                                <span className="rounded-md bg-slate-950/70 border border-slate-800 px-1.5 py-1 text-[8px] font-black uppercase text-rose-400">Atr. {formatMoney(lateFee, isStealthMode)}</span>
                            </div>
                            <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg text-center">
                                <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Valor a receber</p>
                                <p className="text-base font-black text-emerald-400">{formatMoney(displayedAmount, isStealthMode)}</p>
                            </div>
                        </div>
                        <div className="flex flex-col gap-2">
                            <button
                                onClick={() => {
                                    const amount = quickMode === 'CUSTOM'
                                        ? (Number(receiptAmount) || displayedAmount)
                                        : displayedAmount;
                                    onInstallmentPayment?.(loan, selectedInst, selectedDebt, amount, { forgivenessMode });
                                    setSelectedInst(null);
                                    setSelectedDebt(null);
                                    setQuickMode('TOTAL');
                                    setForgiveLateFee(false);
                                }}
                                className="w-full py-2.5 rounded-lg text-[10px] font-black uppercase bg-blue-600 hover:bg-blue-500 text-white transition-all"
                            >
                                Confirmar
                            </button>
                            <button
                                onClick={() => {
                                    setSelectedInst(null);
                                    setSelectedDebt(null);
                                    setQuickMode('TOTAL');
                                    setForgiveLateFee(false);
                                }}
                                className="w-full py-2.5 rounded-lg text-[10px] font-black uppercase text-slate-500 hover:text-white transition-all flex items-center justify-center gap-1"
                            >
                                <XCircle size={12}/> Cancelar
                            </button>
                        </div>
                    </div>
                </div>
                );
                return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
            })()}
        </>
    );
};
