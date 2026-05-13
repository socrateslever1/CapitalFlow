
import React from 'react';
import { formatBRDate, getDaysDiff } from '../../../../utils/dateHelpers';
import { Loan, Installment } from '../../../../types';
import { AlertCircle } from 'lucide-react';

interface InstallmentCardTimelineProps {
    loan: Loan;
    originalInst: Installment;
    displayDueDate: string; // Data real vinda da parcela no banco
    paidUntilDate: string;  // Mesmo valor de displayDueDate
    strategy: any;
    isPrepaid: boolean;
    isLateInst: boolean;
    isPaid: boolean;
}

export const InstallmentCardTimeline: React.FC<InstallmentCardTimelineProps> = ({
    loan,
    originalInst,
    displayDueDate,
    strategy,
    isPrepaid,
    isLateInst,
    isPaid
}) => {
    // Cálculo de dias de atraso baseado estritamente na data da parcela
    const daysLate = getDaysDiff(originalInst.dueDate);

    // Determina a cor da data de vencimento baseada no atraso real do banco
    const dueDateColorClass = isPrepaid 
        ? 'text-emerald-400' 
        : isLateInst && !isPaid 
            ? 'text-rose-400 font-black' 
            : 'text-white';

    const label = strategy?.card?.dueDateLabel ? strategy.card.dueDateLabel(originalInst, loan) : "Vencimento";

    return (
        <div className="relative pl-3 border-l-2 border-slate-800 space-y-4 my-2">
            {/* DATA DO EMPRÉSTIMO / CONTRATO (Conectado à data real de início do contrato) */}
            <div className="relative">
                <div className="absolute -left-[18px] top-1.5 w-2.5 h-2.5 rounded-full bg-slate-800 border-2 border-slate-900"></div>
                <p className="text-[10px] font-black text-slate-500 uppercase leading-normal tracking-widest">Início do Contrato</p>
                <p className="text-sm font-bold text-slate-300 mt-0.5">{formatBRDate(loan.startDate)}</p>
            </div>

            {/* DATA DE VENCIMENTO REAL (Conectado à data real da parcela ativa) */}
            <div className="relative">
                <div className={`absolute -left-[18px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-slate-900 ${isLateInst && !isPaid ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]' : 'bg-slate-800'}`}></div>
                <div className="flex flex-col">
                    <p className="text-[10px] font-black text-slate-500 uppercase leading-normal tracking-widest">
                        {label}
                    </p>
                    <p className={`text-sm font-black mt-0.5 ${dueDateColorClass}`}>
                        {formatBRDate(originalInst.dueDate)}
                    </p>
                    
                    {/* RECONHECIMENTO DE ATRASO DINÂMICO */}
                    {isLateInst && !isPaid && (
                        <div className="mt-1.5 flex items-center gap-1 bg-rose-500/10 border border-rose-500/20 w-fit px-2 py-0.5 rounded-md">
                            <AlertCircle size={10} className="text-rose-500"/>
                            <span className="text-[9px] font-black text-rose-400 uppercase tracking-tight">
                                Atrasado há {daysLate} {daysLate === 1 ? 'dia' : 'dias'}
                            </span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
