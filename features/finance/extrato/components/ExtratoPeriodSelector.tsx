import React from 'react';
import { ChevronLeft } from 'lucide-react';

export const ExtratoPeriodSelector = ({ 
    month, 
    year, 
    onMonthChange 
}: { 
    month: number, 
    year: number, 
    onMonthChange: (dir: 'prev' | 'next') => void 
}) => (
    <div className="shrink-0 flex flex-col">
        <div className="flex items-center justify-between bg-slate-900 p-1.5 rounded-xl border border-slate-800">
            <button onClick={() => onMonthChange('prev')} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"><ChevronLeft size={20}/></button>
            <div className="text-center flex-1">
                <p className="text-sm font-semibold uppercase text-slate-500 tracking-widest">Período</p>
                <p className="text-sm font-black text-white uppercase">{new Date(year, month).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</p>
            </div>
            <button onClick={() => onMonthChange('next')} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"><ChevronLeft className="rotate-180" size={20}/></button>
        </div>
    </div>
);
