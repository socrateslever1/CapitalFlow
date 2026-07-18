import React from 'react';
import { DollarSign, Lock, RefreshCcw } from 'lucide-react';
import { Loan, Installment } from '../../../../types';
import { CalculationResult } from '../../../../domain/finance/modalities/types';

interface InstallmentCardActionProps {
    isDisabled: boolean;
    isFullyFinalized: boolean;
    loan: Loan;
    originalInst: Installment;
    debt: CalculationResult;
    inlinePaymentEnabled?: boolean;
    onPayInstallment?: (loan: Loan, inst: Installment, debt: CalculationResult) => void;
    onReverseInstallment?: (loan: Loan, inst: Installment) => void;
    onNavigate?: () => void;
}

export const InstallmentCardAction: React.FC<InstallmentCardActionProps> = ({
    isDisabled,
    isFullyFinalized,
    loan,
    originalInst,
    debt,
    inlinePaymentEnabled,
    onPayInstallment,
    onReverseInstallment,
    onNavigate
}) => {
    const isRenegotiated = originalInst.status === 'RENEGOCIADO';

    if (!isDisabled) {
        const handleReceive = (e: React.MouseEvent) => {
            e.stopPropagation();
            if (inlinePaymentEnabled && onPayInstallment) {
                onPayInstallment(loan, originalInst, debt);
                return;
            }
            onNavigate?.();
        };

        const handleOpen = (e: React.MouseEvent) => {
            e.stopPropagation();
            onNavigate?.();
        };

        if (inlinePaymentEnabled && onPayInstallment) {
            return (
                <div className="flex items-center justify-end gap-1.5 flex-wrap">
                    <button
                        onClick={handleReceive}
                        className="text-[9px] font-black uppercase bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 px-2.5 py-1.5 rounded-lg hover:bg-emerald-600 hover:text-white transition-all flex items-center gap-1.5"
                        title="Registrar recebimento da parcela"
                    >
                        <DollarSign size={12} /> Receber
                    </button>
                    <button
                        onClick={handleOpen}
                        className="text-[9px] font-black uppercase bg-blue-600/20 text-blue-400 border border-blue-500/30 px-2.5 py-1.5 rounded-lg hover:bg-blue-600 hover:text-white transition-all"
                        title={loan.billingCycle === 'MONTHLY' ? "Detalhes da parcela" : "Abrir contrato"}
                    >
                        {loan.billingCycle === 'MONTHLY' ? 'Detalhes' : 'Abrir'}
                    </button>
                </div>
            );
        }

        return (
            <button
                onClick={handleReceive}
                className="text-[9px] font-black uppercase bg-blue-600/20 text-blue-400 border border-blue-500/30 px-3 py-1.5 rounded-lg hover:bg-blue-600 hover:text-white transition-all flex items-center gap-1.5"
                title={loan.billingCycle === 'MONTHLY' ? "Detalhes da parcela" : "Abrir contrato"}
            >
                <DollarSign size={12} /> {loan.billingCycle === 'MONTHLY' ? 'Detalhes' : 'Abrir'}
            </button>
        );
    }

    const canReverse = inlinePaymentEnabled && !isFullyFinalized && !isRenegotiated && onReverseInstallment;

    if (canReverse) {
        return (
            <div className="flex flex-col items-end">
                <span className="text-[9px] font-black uppercase flex items-center gap-1 text-emerald-500">
                    <Lock size={10} /> Pago
                </span>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onReverseInstallment?.(loan, originalInst);
                    }}
                    className="text-[8px] font-black uppercase text-rose-500/60 hover:text-rose-500 transition-colors mt-0.5 flex items-center gap-1"
                    title="Estornar pagamento desta parcela"
                >
                    <RefreshCcw size={9} /> Estornar
                </button>
            </div>
        );
    }

    return (
        <div
            onClick={(e) => {
                e.stopPropagation();
                onNavigate?.();
            }}
            className="flex flex-col items-end cursor-pointer group"
        >
            <span className="text-[9px] font-black uppercase flex items-center gap-1 text-emerald-500">
                <Lock size={10} className="group-hover:opacity-70 transition-opacity" />
                {isFullyFinalized ? 'Finalizado' : isRenegotiated ? 'Renegociado' : 'Pago'}
            </span>
        </div>
    );
};