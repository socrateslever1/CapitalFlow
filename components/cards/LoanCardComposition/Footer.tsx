import React from 'react';
import { Upload, FileEdit, Handshake, Archive, RotateCcw, Trash2, ShieldAlert } from 'lucide-react';
import { Loan } from '../../../types';
import { isCapitalOnlyRecoveryLoan } from '../../../utils/capitalOnlyRecovery';

interface FooterProps {
    loan: Loan;
    isFullyFinalized: boolean;
    hasActiveAgreement: boolean;
    isLate: boolean;
    onNewAporte?: (loan: Loan) => void;
    onToggleCapitalOnly?: (loan: Loan) => void;
    onEdit: (e: React.MouseEvent) => void;
    onRenegotiate: (loan: Loan) => void;
    onActivate: (loan: Loan) => void;
    onArchive: () => void;
    onRestore: () => void;
    onDelete: () => void;
}

export const Footer: React.FC<FooterProps> = ({
    loan, isFullyFinalized, hasActiveAgreement, isLate,
    onNewAporte, onToggleCapitalOnly, onEdit, onRenegotiate, onActivate, onArchive, onRestore, onDelete
}) => {
    const isCapitalOnlyRecovery = isCapitalOnlyRecoveryLoan(loan);
    // Permanent deletion can destroy transactions, receipts, agreements and
    // audit references. Offer recoverable archiving instead when history exists.
    const hasFinancialHistory = (loan.ledger?.length || 0) > 0
      || !!loan.activeAgreement || (loan.pastAgreements?.length || 0) > 0
      || (loan.installments || []).some((i) => Number(i.paidAmount || 0) > 0);


    const handleCapitalOnlyToggle = (event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();

        const confirmed = window.confirm(
            isCapitalOnlyRecovery
                ? 'Restaurar a cobrança normal?\n\nOs juros e encargos preservados antes da ativação voltarão ao contrato. O histórico de pagamentos não será apagado.'
                : 'Receber só o capital?\n\nA partir deste momento, os recebimentos abaterão somente o capital, sem cobrar juros, multa ou mora. Clique novamente depois para restaurar a cobrança anterior.'
        );
        if (!confirmed) return;

        onToggleCapitalOnly?.(loan);
    };

    return (
        <div className="pt-4 border-t border-slate-800/50">
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 mb-3">
                {/* Botão ATIVAR CONTRATO (Se finalizado) */}
                {isFullyFinalized && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onActivate(loan); }}
                    className="col-span-2 sm:col-span-1 px-4 py-3 bg-emerald-950/30 text-emerald-400 border border-emerald-500/20 rounded-lg hover:bg-gradient-to-br hover:from-emerald-600 hover:to-emerald-700 hover:text-white transition-all flex flex-col sm:flex-row items-center justify-center gap-2"
                  >
                    <RotateCcw size={14} />
                    <span className="text-[9px] font-black uppercase tracking-tight">Ativar Contrato</span>
                  </button>
                )}

                {/* Botão NOVO APORTE (Seguro) */}
                {!loan.isArchived && !isFullyFinalized && !hasActiveAgreement && !isCapitalOnlyRecovery && onNewAporte && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onNewAporte(loan); }}
                    className="col-span-1 px-4 py-3 bg-blue-950/30 text-blue-400 border border-blue-500/20 rounded-lg hover:bg-gradient-to-br hover:from-blue-600 hover:to-blue-700 hover:text-white transition-all flex flex-col sm:flex-row items-center justify-center gap-2"
                  >
                    <Upload size={14} />
                    <span className="text-[9px] font-black uppercase tracking-tight">Novo Aporte</span>
                  </button>
                )}

                {/* Botão EDITAR CONTRATO */}
                {!loan.isArchived && !isFullyFinalized && !hasActiveAgreement && (
                  <button
                    onClick={onEdit}
                    className="col-span-1 px-4 py-3 bg-slate-800 text-slate-400 rounded-lg hover:bg-slate-700 hover:text-white transition-all flex flex-col sm:flex-row items-center justify-center gap-2"
                  >
                    <FileEdit size={14} />
                    <span className="text-[9px] font-black uppercase tracking-tight">Editar</span>
                  </button>
                )}

                {/* Botão RENEGOCIAR (Apenas se atrasado) */}
                {!loan.isArchived && !isFullyFinalized && !hasActiveAgreement && isLate && (
                   <button
                    onClick={(e) => { e.stopPropagation(); onRenegotiate(loan); }}
                    className="col-span-2 sm:col-span-1 px-4 py-3 bg-indigo-950/30 text-indigo-400 border border-indigo-500/20 rounded-lg hover:bg-gradient-to-br hover:from-indigo-600 hover:to-indigo-700 hover:text-white transition-all flex flex-col sm:flex-row items-center justify-center gap-2"
                   >
                      <Handshake size={14}/>
                      <span className="text-[9px] font-black uppercase tracking-tight">Renegociar</span>
                   </button>
                )}
                {!loan.isArchived && !isFullyFinalized && !hasActiveAgreement && onToggleCapitalOnly && (
                   <button
                    onClick={handleCapitalOnlyToggle}
                    className={`col-span-2 sm:col-span-1 px-4 py-3 rounded-lg transition-all flex flex-col sm:flex-row items-center justify-center gap-2 ${isCapitalOnlyRecovery ? 'bg-rose-600 text-white border border-rose-500' : 'bg-rose-950/30 text-rose-400 border border-rose-500/20 hover:bg-rose-600 hover:text-white'}`}
                    title={isCapitalOnlyRecovery ? 'Restaurar juros e encargos preservados' : 'Receber somente o capital'}
                   >
                      <ShieldAlert size={14}/>
                      <span className="text-[9px] font-black uppercase tracking-tight">{isCapitalOnlyRecovery ? 'Restaurar juros' : 'Receber só capital'}</span>
                   </button>
                )}
            </div>

            {/* Arquivamento reversível; exclusão definitiva só quando não existe histórico. */}
            <div className="flex flex-col gap-3 border-t border-slate-800/40 pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                {!loan.isArchived ? (
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onArchive(); }}
                        aria-label="Arquivar contrato (recuperável)"
                        title="Arquivar contrato sem apagar o histórico. É possível restaurá-lo depois."
                        className="inline-flex min-h-12 w-full sm:w-auto items-center justify-center gap-2.5 rounded-xl border border-amber-400/60 bg-amber-500/20 px-5 py-3 text-amber-100 shadow-sm shadow-amber-950/30 transition-all hover:border-amber-300 hover:bg-amber-500/30 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                    >
                        <Archive size={18} aria-hidden="true" className="shrink-0" />
                        <span className="text-sm font-bold">Arquivar (recuperável)</span>
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onRestore(); }}
                        aria-label="Restaurar contrato arquivado"
                        title="Restaurar contrato arquivado"
                        className="inline-flex min-h-12 w-full sm:w-auto items-center justify-center gap-2.5 rounded-xl border border-emerald-400/50 bg-emerald-500/15 px-5 py-3 text-sm font-bold text-emerald-100 transition-all hover:bg-emerald-500/25 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                    >
                        <RotateCcw size={18} aria-hidden="true" className="shrink-0" />
                        Restaurar contrato
                    </button>
                )}
                {loan.isArchived && (
                    <button type="button"
                        onClick={(e) => { e.stopPropagation(); onArchive(); }}
                        className="inline-flex min-h-12 w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-slate-600 bg-slate-900 px-4 py-3 text-sm font-semibold text-slate-200 hover:border-blue-400 hover:text-white">
                        <FileEdit size={16} aria-hidden="true" />
                        Classificar arquivamento
                    </button>
                )}
                {!hasFinancialHistory ? (
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onDelete(); }}
                        aria-label="Excluir contrato sem histórico"
                        title="Excluir definitivamente contrato sem movimentações"
                        className="inline-flex min-h-12 w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs font-bold text-rose-200 transition-all hover:bg-rose-500/20 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                    >
                        <Trash2 size={16} aria-hidden="true" className="shrink-0" />
                        Excluir sem histórico
                    </button>
                ) : (
                    <p className="min-w-0 self-center rounded-lg border border-slate-700/40 bg-slate-900/50 px-3 py-2 text-center text-xs leading-relaxed text-slate-400 sm:max-w-52 sm:text-left" title="O histórico financeiro deve ser preservado. O contrato pode ser restaurado após o arquivamento.">
                        Exclusão definitiva bloqueada: contrato com histórico. Use Arquivar.
                    </p>
                )}
            </div>
        </div>
    );
};
