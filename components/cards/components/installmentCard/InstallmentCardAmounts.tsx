
import React from 'react';
import { formatMoney } from '../../../../utils/formatters';
import { CalculationResult } from '../../../../domain/finance/modalities/types';

interface InstallmentCardAmountsProps {
    debt: CalculationResult;
    originalAmount?: number; // Valor original agendado
    isPrepaid: boolean;
    isLateInst: boolean;
    isPaid: boolean;
    isStealthMode?: boolean;
}

export const InstallmentCardAmounts: React.FC<InstallmentCardAmountsProps> = ({
    debt,
    originalAmount,
    isPrepaid,
    isLateInst,
    isPaid,
    isStealthMode
}) => {
    // Se estiver pago ou não houver juros/multa a mostrar, mostra apenas principal (ou total pago)
    const hasCharges = (debt.interest + debt.lateFee) > 0;
    const showInterestBlock = hasCharges && !isPrepaid;
    
    // Cor do bloco de juros
    const interestColorClass = isLateInst && !isPaid ? 'text-rose-500' : 'text-emerald-500';

    return (
        <div className="mb-4 sm:mb-5">
            <div className="flex flex-col space-y-3">
                {/* Bloco de Valores Detalhados */}
                <div className="flex flex-wrap gap-4">
                    {originalAmount !== undefined && (
                        <div className="flex flex-col min-w-[80px]">
                            <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-1">Valor Parcela</span>
                            <span className="text-sm font-black text-slate-300">
                                {formatMoney(originalAmount, isStealthMode)}
                            </span>
                        </div>
                    )}

                    <div className="flex flex-col min-w-[80px]">
                        <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-1">Principal Atual</span>
                        <span className="text-sm font-black text-white">
                            {formatMoney(debt.principal, isStealthMode)}
                        </span>
                    </div>
                    
                    {showInterestBlock && (
                        <div className="flex flex-col min-w-[80px]">
                            <span className={`text-[10px] font-black uppercase tracking-widest mb-1 ${isLateInst && !isPaid ? 'text-rose-500/70' : 'text-emerald-500/70'}`}>
                                Encargos
                            </span>
                            <span className={`text-sm font-black ${interestColorClass}`}>
                                {formatMoney(debt.interest + debt.lateFee, isStealthMode)}
                            </span>
                        </div>
                    )}
                </div>

                {/* Total Consolidado */}
                <div className="pt-2 border-t border-slate-800/50">
                    <div className="flex flex-wrap items-baseline gap-2">
                        <span className="text-xl font-black text-white">
                            {formatMoney(debt.total, isStealthMode)}
                        </span>
                        <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">
                            Total
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
