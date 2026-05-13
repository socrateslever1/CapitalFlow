
import React from 'react';
import { Upload, FileEdit, Handshake, Archive, RotateCcw, Trash2 } from 'lucide-react';
import { Loan } from '../../../types';

interface FooterProps {
    loan: Loan;
    isFullyFinalized: boolean;
    hasActiveAgreement: boolean;
    isLate: boolean;
    onNewAporte?: (loan: Loan) => void;
    onEdit: (e: React.MouseEvent) => void;
    onRenegotiate: (loan: Loan) => void;
    onActivate: (loan: Loan) => void;
    onArchive: () => void;
    onRestore: () => void;
    onDelete: () => void;
}

export const Footer: React.FC<FooterProps> = ({
    loan, isFullyFinalized, hasActiveAgreement, isLate,
    onNewAporte, onEdit, onRenegotiate, onActivate, onArchive, onRestore, onDelete
}) => {
    return (
        <div className="pt-4 border-t border-slate-800/50">
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 mb-3">
                {/* Botão ATIVAR CONTRATO (Se finalizado) */}
                {isFullyFinalized && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onActivate(loan); }}
                    className="col-span-2 sm:col-span-1 px-4 py-3 bg-emerald-950/30 text-emerald-400 border border-emerald-500/20 rounded-xl hover:bg-gradient-to-br hover:from-emerald-600 hover:to-emerald-700 hover:text-white transition-all flex flex-col sm:flex-row items-center justify-center gap-2"
                  >
                    <RotateCcw size={14} /> 
                    <span className="text-[9px] font-black uppercase tracking-tight">Ativar Contrato</span>
                  </button>
                )}

                {/* Botão NOVO APORTE (Seguro) */}
                {!loan.isArchived && !isFullyFinalized && !hasActiveAgreement && onNewAporte && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onNewAporte(loan); }}
                    className="col-span-1 px-4 py-3 bg-blue-950/30 text-blue-400 border border-blue-500/20 rounded-xl hover:bg-gradient-to-br hover:from-blue-600 hover:to-blue-700 hover:text-white transition-all flex flex-col sm:flex-row items-center justify-center gap-2"
                  >
                    <Upload size={14} /> 
                    <span className="text-[9px] font-black uppercase tracking-tight">Novo Aporte</span>
                  </button>
                )}

                {/* Botão EDITAR CONTRATO */}
                {!loan.isArchived && !isFullyFinalized && !hasActiveAgreement && (
                  <button
                    onClick={onEdit}
                    className="col-span-1 px-4 py-3 bg-slate-800 text-slate-400 rounded-xl hover:bg-slate-700 hover:text-white transition-all flex flex-col sm:flex-row items-center justify-center gap-2"
                  >
                    <FileEdit size={14} /> 
                    <span className="text-[9px] font-black uppercase tracking-tight">Editar</span>
                  </button>
                )}
                
                {/* Botão RENEGOCIAR (Apenas se atrasado) */}
                {!loan.isArchived && !isFullyFinalized && !hasActiveAgreement && isLate && (
                   <button 
                    onClick={(e) => { e.stopPropagation(); onRenegotiate(loan); }} 
                    className="col-span-2 sm:col-span-1 px-4 py-3 bg-indigo-950/30 text-indigo-400 border border-indigo-500/20 rounded-xl hover:bg-gradient-to-br hover:from-indigo-600 hover:to-indigo-700 hover:text-white transition-all flex flex-col sm:flex-row items-center justify-center gap-2"
                   >
                      <Handshake size={14}/> 
                      <span className="text-[9px] font-black uppercase tracking-tight">Renegociar</span>
                   </button>
                )}
            </div>

            {/* Ações destrutivas (ex: Arquivar/Deletar) - Direita */}
            <div className="flex justify-end gap-2 border-t border-slate-800/30 pt-3">
                {!loan.isArchived ? (
                    <button onClick={(e) => { e.stopPropagation(); onArchive(); }} className="p-2 text-slate-500 hover:text-amber-500 hover:bg-amber-950/20 rounded-xl transition-all flex items-center gap-2" title="Arquivar">
                        <Archive size={14}/> 
                        <span className="section-title">Arquivar</span>
                    </button>
                ) : (
                    <button onClick={(e) => { e.stopPropagation(); onRestore(); }} className="p-2 text-slate-500 hover:text-emerald-500 hover:bg-emerald-950/20 rounded-xl transition-all flex items-center gap-2" title="Restaurar">
                        <RotateCcw size={14}/> 
                        <span className="section-title">Restaurar</span>
                    </button>
                )}
                <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="p-2 text-slate-500 hover:text-rose-500 hover:bg-rose-950/20 rounded-xl transition-all flex items-center gap-2" title="Excluir">
                    <Trash2 size={14}/> 
                    <span className="section-title">Excluir</span>
                </button>
            </div>
        </div>
    );
};
