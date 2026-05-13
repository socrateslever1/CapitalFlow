
import React from 'react';
import { Clock, Calculator } from 'lucide-react';
import { formatBRDate } from '../../../../utils/dateHelpers';
import { formatMoney } from '../../../../utils/formatters';

interface InstallmentCardFixedTermPanelProps {
    fixedTermStats: any;
    isStealthMode?: boolean;
}

export const InstallmentCardFixedTermPanel: React.FC<InstallmentCardFixedTermPanelProps> = ({ fixedTermStats, isStealthMode }) => {
    if (!fixedTermStats) return null;

    return (
        <div className="mb-4">
            <div className="flex justify-between items-end mb-2">
                <span className="text-[10px] font-black uppercase text-blue-400 tracking-widest flex items-center gap-1">
                    <Clock size={12}/> Contador de Dias
                </span>
                <span className="text-white font-black text-xs">
                    {fixedTermStats.paidDays} / {fixedTermStats.totalDays} Pagos
                </span>
            </div>
            <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden mb-3">
                <div 
                    className="h-full bg-blue-600 rounded-full transition-all duration-500" 
                    style={{width: `${fixedTermStats.progressPercent}%`}}
                ></div>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-full p-3 text-center">
                <p className="text-[8px] text-slate-500 uppercase font-black mb-1 flex items-center justify-center gap-1">
                    <Calculator size={10}/> Data Coberta (Pago Até)
                </p>
                <p className="text-sm font-black text-emerald-400">
                    {formatBRDate(fixedTermStats.paidUntilDate)}
                </p>
                <div className="h-px w-full bg-slate-800 my-2"></div>
                <p className="text-[9px] text-slate-400 font-medium">
                    Valor da Diária: {formatMoney(fixedTermStats.dailyValue, isStealthMode)}
                </p>
            </div>
        </div>
    );
};
