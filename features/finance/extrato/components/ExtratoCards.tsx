import React from 'react';
import { FilterType } from '../hooks/useExtrato';

const VariationDisplay = ({ v }: { v: { diff: number, percent: number, isImprovement: boolean } }) => (
    <p className={`text-[9px] font-bold ${v.isImprovement ? 'text-emerald-500' : 'text-rose-500'}`}>
        {v.percent > 0 ? '+' : ''}{v.percent.toFixed(0)}% ({v.diff >= 0 ? '↑' : '↓'} R$ {Math.abs(v.diff).toFixed(2)})
    </p>
);

export const ExtratoCards = ({ dre, variations, activeFilter, onFilterChange }: { dre: any, variations: any, activeFilter: FilterType, onFilterChange: (f: FilterType) => void }) => {
    const getCardStyle = (filter: FilterType) => {
        return activeFilter === filter 
            ? 'bg-slate-800 border-blue-500 ring-1 ring-blue-500' 
            : 'bg-slate-900 border-slate-800 hover:border-slate-700';
    };

    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 shrink-0">
            <div onClick={() => onFilterChange('RECEITA')} className={`cursor-pointer transition-all p-3 rounded-xl border ${getCardStyle('RECEITA')} ${activeFilter !== 'ALL' && activeFilter !== 'RECEITA' ? 'opacity-60' : ''}`}>
                <p className="text-[10px] font-bold uppercase text-slate-500 tracking-wider mb-1">Receita Bruta</p>
                <p className="text-lg font-black text-emerald-400">R$ {dre.grossRevenue.toFixed(2)}</p>
                <VariationDisplay v={variations.grossRevenue} />
                <p className="text-[9px] text-slate-600 mt-1">Juros: R$ {dre.interestReceived.toFixed(2)} | Multa: R$ {dre.lateFeeReceived.toFixed(2)}</p>
            </div>
            <div onClick={() => onFilterChange('RECUPERACAO')} className={`cursor-pointer transition-all p-3 rounded-xl border ${getCardStyle('RECUPERACAO')} ${activeFilter !== 'ALL' && activeFilter !== 'RECUPERACAO' ? 'opacity-60' : ''}`}>
                <p className="text-[10px] font-bold uppercase text-slate-500 tracking-wider mb-1">Recuperação</p>
                <p className="text-lg font-black text-blue-400">R$ {dre.principalRecovered.toFixed(2)}</p>
                <VariationDisplay v={variations.principalRecovered} />
            </div>
            <div onClick={() => onFilterChange('APORTE')} className={`cursor-pointer transition-all p-3 rounded-xl border ${getCardStyle('APORTE')} ${activeFilter !== 'ALL' && activeFilter !== 'APORTE' ? 'opacity-60' : ''}`}>
                <p className="text-[10px] font-bold uppercase text-slate-500 tracking-wider mb-1">Aportes</p>
                <p className="text-lg font-black text-rose-400">R$ {dre.investment.toFixed(2)}</p>
                <VariationDisplay v={variations.investment} />
            </div>
            <div onClick={() => onFilterChange('CAIXA')} className={`cursor-pointer transition-all p-3 rounded-xl border ${getCardStyle('CAIXA')} ${activeFilter !== 'ALL' && activeFilter !== 'CAIXA' ? 'opacity-60' : ''}`}>
                <p className="text-[10px] font-bold uppercase text-slate-400 tracking-wider mb-1">Caixa Líquido</p>
                <p className={`text-lg font-black ${dre.cashFlow >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {dre.cashFlow > 0 ? '+' : ''}R$ {dre.cashFlow.toFixed(2)}
                </p>
                <VariationDisplay v={variations.cashFlow} />
            </div>
        </div>
    );
};
