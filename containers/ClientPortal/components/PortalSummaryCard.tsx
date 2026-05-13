
import React from 'react';
import { ShieldCheck, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { formatMoney } from '../../../utils/formatters';

interface PortalSummaryCardProps {
    summary: { total: number; lateCount: number; maxLate: number };
    contractCount: number;
}

export const PortalSummaryCard: React.FC<PortalSummaryCardProps> = ({ summary, contractCount }) => {
    const alertTheme = summary.lateCount > 0;

    return (
        <div className={`p-6 rounded-2xl border relative overflow-hidden transition-all ${alertTheme ? 'bg-gradient-to-br from-rose-950 to-slate-900 border-rose-500/30' : 'bg-gradient-to-br from-slate-800 to-slate-900 border-slate-700'}`}>
            <div className="relative z-10">
                <p className={`text-[10px] font-black uppercase mb-1 flex items-center gap-1 ${alertTheme ? 'text-rose-300' : 'text-slate-400'}`}>
                    {alertTheme ? <AlertTriangle size={12}/> : <ShieldCheck size={12}/>} Total Consolidado
                </p>
                <p className="text-3xl font-black text-white tracking-tight">{formatMoney(summary.total)}</p>
                
                <div className="mt-4 flex gap-2">
                    {summary.lateCount > 0 ? (
                        <span className="text-[9px] font-black uppercase bg-rose-500 text-white px-2 py-1 rounded-lg animate-pulse">
                            {summary.lateCount} Contratos em Atraso
                        </span>
                    ) : (
                        <span className="text-[9px] font-black uppercase bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded-lg flex items-center gap-1">
                            <CheckCircle2 size={10}/> Situação Regular
                        </span>
                    )}
                    <span className="text-[9px] font-black uppercase bg-slate-950/50 text-slate-400 px-2 py-1 rounded-lg">
                        {contractCount} Contratos
                    </span>
                </div>
            </div>
        </div>
    );
};
