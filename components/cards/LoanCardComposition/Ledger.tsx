
import React from 'react';
import { LedgerList } from '../components/LedgerList';
import { LedgerEntry, Loan } from '../../../types';
import { History } from 'lucide-react';

interface LedgerProps {
    allLedger: LedgerEntry[];
    loan: Loan;
    onReverseTransaction: (transaction: LedgerEntry, loan: Loan) => void;
    isStealthMode?: boolean;
}

export const Ledger: React.FC<LedgerProps> = ({
    allLedger, loan, onReverseTransaction, isStealthMode
}) => {
    return (
        <div className="bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden">
            {/* Cabeçalho do Extrato */}
            <div className="bg-slate-900/50 p-3 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <History size={14} className="text-slate-500"/>
                    <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Extrato Recente</span>
                </div>
            </div>
            
            {/* Cabeçalho das Colunas */}
            <div className="grid grid-cols-12 px-4 py-2 bg-slate-900/30 text-[9px] font-bold text-slate-500 uppercase border-b border-slate-800/50">
                <div className="col-span-7">Descrição / Data</div>
                <div className="col-span-5 text-right">Valor / Ação</div>
            </div>

            <div className="p-2">
                <LedgerList
                  ledger={allLedger}
                  loan={loan}
                  onReverseTransaction={onReverseTransaction}
                  isStealthMode={isStealthMode}
                />
            </div>
        </div>
    );
};
