import React from 'react';
import { CalendarClock, DollarSign, Lock, RefreshCcw, QrCode } from 'lucide-react';
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
    onPaymentOffer?: (loan: Loan, inst: Installment) => void;
    onOpenPix?: (loan: Loan, inst: Installment, debt: CalculationResult) => void;
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
    onPaymentOffer,
    onOpenPix,
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
                <div className="grid w-full min-w-0 grid-cols-2 gap-2 sm:grid-cols-4">
                    {onOpenPix && (
                        <button
                            onClick={(event) => {
                                event.stopPropagation();
                                onOpenPix(loan, originalInst, debt);
                            }}
                            className="flex min-h-9 min-w-0 items-center justify-center gap-1 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-1.5 text-[9px] font-black uppercase text-cyan-400 hover:bg-cyan-500 hover:text-slate-950 transition-colors"
                            title="Gerar QR Code Pix desta parcela"
                        >
                            <QrCode size={12} /> Pix
                        </button>
                    )}
                    {onPaymentOffer && (
                        <button
                            onClick={(event) => {
                                event.stopPropagation();
                                onPaymentOffer(loan, originalInst);
                            }}
                            className="flex min-h-9 min-w-0 items-center justify-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[9px] font-black uppercase text-amber-400 hover:bg-amber-500 hover:text-slate-950"
                            title="Criar ou alterar condição especial de pagamento"
                        >
                            <CalendarClock size={12} /> Condição
                        </button>
                    )}
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
                        title={['MONTHLY', 'BIWEEKLY', 'WEEKLY'].includes(loan.billingCycle) ? "Detalhes da parcela" : "Abrir contrato"}
                    >
                        {['MONTHLY', 'BIWEEKLY', 'WEEKLY'].includes(loan.billingCycle) ? 'Detalhes' : 'Abrir'}
                    </button>
                </div>
            );
        }

        return (
            <div className="flex items-center gap-1.5">
                {onOpenPix && (
                    <button
                        onClick={(event) => {
                            event.stopPropagation();
                            onOpenPix(loan, originalInst, debt);
                        }}
                        className="flex items-center gap-1 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1.5 text-[9px] font-black uppercase text-cyan-400 hover:bg-cyan-500 hover:text-slate-950 transition-colors"
                        title="Gerar QR Code Pix desta parcela"
                    >
                        <QrCode size={12} /> Pix
                    </button>
                )}
                <button
                    onClick={handleReceive}
                    className="text-[9px] font-black uppercase bg-blue-600/20 text-blue-400 border border-blue-500/30 px-3 py-1.5 rounded-lg hover:bg-blue-600 hover:text-white transition-all flex items-center gap-1.5"
                    title={['MONTHLY', 'BIWEEKLY', 'WEEKLY'].includes(loan.billingCycle) ? "Detalhes da parcela" : "Abrir contrato"}
                >
                    <DollarSign size={12} /> {['MONTHLY', 'BIWEEKLY', 'WEEKLY'].includes(loan.billingCycle) ? 'Detalhes' : 'Abrir'}
                </button>
            </div>
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
