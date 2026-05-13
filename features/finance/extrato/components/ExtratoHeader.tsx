import React from 'react';
import { ArrowRightLeft, TrendingUp } from 'lucide-react';

export const ExtratoHeader = ({ onOpenAi }: { onOpenAi: () => void }) => (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-600 to-teal-600 flex items-center justify-center text-white shrink-0 shadow-lg shadow-emerald-900/20">
                    <ArrowRightLeft size={20} />
                </div>
                <div>
                    <h1 className="text-xl font-semibold text-white uppercase tracking-wider leading-none">Extrato <span className="text-blue-500">Geral</span></h1>
                    <p className="text-sm text-slate-500 font-medium uppercase mt-1 tracking-widest">DRE e Resultado Financeiro</p>
                </div>
            </div>
        </div>
        <button onClick={onOpenAi} className="text-sm font-bold uppercase bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 transition-colors">
            <TrendingUp size={16}/> Analisar período com IA
        </button>
    </div>
);
