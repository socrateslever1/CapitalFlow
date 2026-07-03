import React from 'react';
import { CheckCircle2, DollarSign, XCircle } from 'lucide-react';
import { formatMoney } from '../../../utils/formatters';
import { Loan, Installment, Agreement, AgreementInstallment } from '../../../types';
import { InstallmentCard } from './InstallmentCard';
import { prepareInstallmentViewModel } from './InstallmentGrid.logic';

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
    onInstallmentPayment?: (loan: Loan, inst: Installment, debt: any, amount?: number) => void;
    onReverseInstallmentPayment?: (loan: Loan, inst: Installment) => void;
    isStealthMode?: boolean;
    onNavigate?: () => void;
}

export const InstallmentGrid: React.FC<InstallmentGridProps> = (props) => {
    const [selectedInst, setSelectedInst] = React.useState<Installment | null>(null);
    const [selectedDebt, setSelectedDebt] = React.useState<any>(null);
    const [receiptAmount, setReceiptAmount] = React.useState('');
    const [showCustomAmount, setShowCustomAmount] = React.useState(false);

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
            <div className="grid grid-cols-1 gap-4 items-stretch">
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
                            inlinePaymentEnabled={loan.billingCycle === 'INSTALLMENT_FIXED'}
                            onPayInstallment={(targetLoan, targetInst, targetDebt) => {
                                if (targetLoan.billingCycle === 'INSTALLMENT_FIXED') {
                                    setSelectedInst(targetInst);
                                    setSelectedDebt(targetDebt);
                                    setReceiptAmount(String(Number(targetDebt?.total || targetInst.amount || 0).toFixed(2)));
                                    setShowCustomAmount(false);
                                    return;
                                }
                                onInstallmentPayment?.(targetLoan, targetInst, targetDebt);
                            }}
                            onReverseInstallment={onReverseInstallmentPayment}
                            onNavigate={onNavigate}
                        />
                    );
                })}
            </div>

            {selectedInst && selectedDebt && (
                <div className="absolute inset-0 z-50 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={(e) => e.stopPropagation()}>
                    <div className="bg-slate-900 border border-slate-800 p-6 rounded-lg w-full max-w-[280px] shadow-2xl space-y-4">
                        <div className="w-12 h-12 rounded-lg flex items-center justify-center mx-auto bg-blue-500/20 text-blue-500">
                            <DollarSign size={24}/>
                        </div>
                        <div className="text-center">
                            <h5 className="text-white font-black uppercase text-xs tracking-tight">Confirmar Recebimento?</h5>
                            <p className="text-slate-400 text-[10px] mt-1">Informe se recebeu o total da parcela ou outro valor.</p>
                        </div>
                        <div className="space-y-2">
                            <button
                                onClick={() => {
                                    setReceiptAmount(String(Number(selectedDebt?.total || selectedInst.amount || 0).toFixed(2)));
                                    setShowCustomAmount(false);
                                }}
                                className="w-full py-2 rounded-lg text-[10px] font-black uppercase bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center gap-2"
                            >
                                <CheckCircle2 size={12}/> Recebeu tudo
                            </button>
                            <button
                                onClick={() => setShowCustomAmount(true)}
                                className="w-full py-2 rounded-lg text-[10px] font-black uppercase bg-slate-950 text-slate-300 border border-slate-700"
                            >
                                Outro valor
                            </button>
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
                            <p className="text-center text-[9px] text-slate-500 font-bold uppercase">
                                Total: {formatMoney(Number(selectedDebt?.total || selectedInst.amount || 0), isStealthMode)}
                            </p>
                        </div>
                        <div className="flex flex-col gap-2">
                            <button
                                onClick={() => {
                                    const amount = Number(receiptAmount) || Number(selectedDebt?.total || selectedInst.amount || 0);
                                    onInstallmentPayment?.(loan, selectedInst, selectedDebt, amount);
                                    setSelectedInst(null);
                                    setSelectedDebt(null);
                                }}
                                className="w-full py-2.5 rounded-lg text-[10px] font-black uppercase bg-blue-600 hover:bg-blue-500 text-white transition-all"
                            >
                                Confirmar
                            </button>
                            <button
                                onClick={() => {
                                    setSelectedInst(null);
                                    setSelectedDebt(null);
                                }}
                                className="w-full py-2.5 rounded-lg text-[10px] font-black uppercase text-slate-500 hover:text-white transition-all flex items-center justify-center gap-1"
                            >
                                <XCircle size={12}/> Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};