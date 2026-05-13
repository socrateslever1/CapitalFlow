import React from 'react';
import { Filter, Printer, X } from 'lucide-react';
import { classifyLedgerEntry, OperationClassification } from '../../../../domain/finance/dre.calculations';

const getClassificationStyle = (c: OperationClassification) => {
    switch(c) {
        case 'APORTE': return { color: 'bg-rose-500', text: 'text-rose-400', label: 'Aporte' };
        case 'RECEITA_OPERACIONAL': return { color: 'bg-emerald-500', text: 'text-emerald-400', label: 'Receita' };
        case 'RECUPERACAO_PRINCIPAL': return { color: 'bg-blue-500', text: 'text-blue-400', label: 'Recuperação' };
        case 'MOVIMENTO_TECNICO': return { color: 'bg-slate-500', text: 'text-slate-400', label: 'Técnico' };
        default: return { color: 'bg-slate-500', text: 'text-slate-400', label: 'Outro' };
    }
};

export const ExtratoOperationsList = ({ 
    transactions, 
    activeFilter, 
    onClearFilter, 
    onPrint, 
    onNavigate 
}: { 
    transactions: any[], 
    activeFilter: string, 
    onClearFilter: () => void, 
    onPrint: () => void, 
    onNavigate: (loanId: string) => void 
}) => (
    <div className="bg-slate-950 rounded-xl border border-slate-800 overflow-hidden flex flex-col flex-1 min-h-[350px]">
        <div className="p-3 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center shrink-0">
            <div className="flex items-center gap-3">
                <p className="text-sm font-semibold uppercase text-slate-500 tracking-widest">Detalhamento das Operações</p>
                {activeFilter !== 'ALL' && (
                    <button onClick={onClearFilter} className="text-[10px] font-bold uppercase bg-slate-800 text-slate-300 px-2 py-1 rounded flex items-center gap-1 hover:bg-slate-700 transition-colors">
                        <X size={10}/> Limpar filtro
                    </button>
                )}
            </div>
            <button onClick={onPrint} className="text-sm font-bold uppercase bg-slate-800 text-white px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-blue-600 transition-colors">
                <Printer size={12}/> Imprimir Relatório
            </button>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar">
            {transactions.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-500 opacity-50">
                    <Filter size={40} className="mb-2"/>
                    <p className="text-xs font-bold uppercase">Sem movimentos no período</p>
                    </div>
            ) : (
                transactions.map((t) => {
                    const classification = classifyLedgerEntry(t);
                    const style = getClassificationStyle(classification);
                    return (
                        <div key={t.id} onClick={() => t.loanId && onNavigate(t.loanId)} className="cursor-pointer flex justify-between items-center p-3 border-b border-slate-800 last:border-0 hover:bg-slate-900 transition-colors">
                            <div className="flex items-center gap-3">
                                <div className={`w-1 h-8 rounded-full ${style.color}`}></div>
                                <div>
                                    <p className="text-xs font-bold text-white uppercase">{t.clientName}</p>
                                    <div className="flex items-center gap-2 text-[10px] text-slate-500">
                                        <span>{new Date(t.date).toLocaleDateString()}</span>
                                        <span className="w-1 h-1 rounded-full bg-slate-700"></span>
                                        <span className={`${style.text}`}>
                                            {style.label}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <span className={`text-sm font-black ${classification === 'APORTE' ? 'text-rose-500' : 'text-emerald-500'}`}>
                                {classification === 'APORTE' ? '-' : '+'} R$ {t.amount.toFixed(2)}
                            </span>
                        </div>
                    );
                })
            )}
        </div>
    </div>
);
