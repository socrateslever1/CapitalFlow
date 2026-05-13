
import React from 'react';
import { RefreshCcw } from 'lucide-react';

interface InstallmentCardHeaderProps {
    realIndex: number;
    showProgress: boolean;
    renewalCount?: number;
}

export const InstallmentCardHeader: React.FC<InstallmentCardHeaderProps> = ({ realIndex, showProgress, renewalCount }) => {
    return (
        <div className="flex items-center gap-2 mb-4">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                {showProgress ? `${realIndex}ª Parcela` : 'Detalhes'}
            </p>
            {renewalCount && renewalCount > 0 ? (
                <span className="text-[8px] font-black bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded flex items-center gap-1" title="Vezes que os juros foram pagos (Renovações)">
                    <RefreshCcw size={8} /> {renewalCount}x
                </span>
            ) : null}
        </div>
    );
};
