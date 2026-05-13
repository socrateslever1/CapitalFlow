
import React from 'react';
import { MoreHorizontal, Lock } from 'lucide-react';
import { Loan, Installment } from '../../../../types';
import { CalculationResult } from '../../../../domain/finance/modalities/types';

interface InstallmentCardActionProps {
    isDisabled: boolean;
    isFullyFinalized: boolean;
    loan: Loan;
    originalInst: Installment;
    debt: CalculationResult;
    onNavigate?: () => void;
}

export const InstallmentCardAction: React.FC<InstallmentCardActionProps> = ({
    isDisabled,
    isFullyFinalized,
    loan,
    originalInst,
    debt,
    onNavigate
}) => {
    if (!isDisabled) {
        return (
            <button 
                onClick={(e) => {
                    e.stopPropagation();
                    onNavigate?.();
                }}
                className="text-[9px] font-black uppercase bg-blue-600/20 text-blue-400 border border-blue-500/30 px-3 py-1.5 rounded-lg hover:bg-blue-600 hover:text-white transition-all flex items-center gap-1.5"
                title="Abrir Contrato para Pagar"
            >
                <MoreHorizontal size={12} /> Abrir
            </button>
        );
    }

    const isRenegotiated = originalInst.status === 'RENEGOCIADO';

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
