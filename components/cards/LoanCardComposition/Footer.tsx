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

    const showActivate = isFullyFinalized;
    const showNewAporte = !loan.isArchived && !isFullyFinalized && !hasActiveAgreement && !isCapitalOnlyRecovery && Boolean(onNewAporte);
    const showEdit = !loan.isArchived && !isFullyFinalized && !hasActiveAgreement;
    const showRenegotiate = !loan.isArchived && !isFullyFinalized && !hasActiveAgreement && isLate;
    const showCapitalOnly = !loan.isArchived && !isFullyFinalized && !hasActiveAgreement && Boolean(onToggleCapitalOnly);
    const hasPrimaryActions = showActivate || showNewAporte || showEdit || showRenegotiate || showCapitalOnly;

    const actionBtn =
        'inline-flex min-h-9 flex-1 sm:flex-none items-center justify-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/90 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-slate-700 hover:bg-slate-800 hover:text-white active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70';

    return (
        <div className="border-t border-slate-800/60 pt-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                {hasPrimaryActions && (
                    <div className="flex flex-wrap items-center gap-1.5">
                        {showActivate && (
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); onActivate(loan); }}
                                className={actionBtn}
                            >
                                <RotateCcw size={14} className="shrink-0 text-emerald-400" />
                                <span>Ativar contrato</span>
                            </button>
                        )}

                        {showNewAporte && onNewAporte && (
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); onNewAporte(loan); }}
                                className={actionBtn}
                            >
                                <Upload size={14} className="shrink-0 text-blue-400" />
                                <span>Novo aporte</span>
                            </button>
                        )}

                        {showEdit && (
                            <button
                                type="button"
                                onClick={onEdit}
                                className={actionBtn}
                            >
                                <FileEdit size={14} className="shrink-0 text-slate-400" />
                                <span>Editar</span>
                            </button>
                        )}

                        {showRenegotiate && (
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); onRenegotiate(loan); }}
                                className={actionBtn}
                            >
                                <Handshake size={14} className="shrink-0 text-indigo-400" />
                                <span>Renegociar</span>
                            </button>
                        )}

                        {showCapitalOnly && (
                            <button
                                type="button"
                                onClick={handleCapitalOnlyToggle}
                                title={isCapitalOnlyRecovery ? 'Restaurar juros e encargos preservados' : 'Receber somente o capital'}
                                className={
                                    isCapitalOnlyRecovery
                                        ? 'inline-flex min-h-9 flex-1 sm:flex-none items-center justify-center gap-1.5 rounded-lg border border-rose-500/60 bg-rose-600/90 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-rose-500 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300'
                                        : actionBtn
                                }
                            >
                                <ShieldAlert size={14} className={`shrink-0 ${isCapitalOnlyRecovery ? 'text-white' : 'text-rose-400'}`} />
                                <span>{isCapitalOnlyRecovery ? 'Restaurar juros' : 'Só capital'}</span>
                            </button>
                        )}
                    </div>
                )}

                <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
                    {!loan.isArchived ? (
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onArchive(); }}
                            aria-label="Arquivar contrato"
                            title="Arquivar contrato sem apagar o histórico."
                            className="inline-flex min-h-9 w-full sm:w-auto items-center justify-center gap-1.5 rounded-lg border border-amber-400/25 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-100 transition-colors hover:border-amber-400/50 hover:bg-amber-500/20 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
                        >
                            <Archive size={14} aria-hidden="true" className="shrink-0 text-amber-400" />
                            <span>Arquivar</span>
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onRestore(); }}
                            aria-label="Restaurar contrato arquivado"
                            title="Restaurar contrato arquivado"
                            className="inline-flex min-h-9 w-full sm:w-auto items-center justify-center gap-1.5 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-100 transition-colors hover:bg-emerald-500/20 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
                        >
                            <RotateCcw size={14} aria-hidden="true" className="shrink-0 text-emerald-400" />
                            <span>Restaurar</span>
                        </button>
                    )}

                    {loan.isArchived && (
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onArchive(); }}
                            className={actionBtn}
                        >
                            <FileEdit size={14} aria-hidden="true" className="shrink-0 text-slate-400" />
                            <span>Classificar</span>
                        </button>
                    )}

                    {!hasFinancialHistory && (
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onDelete(); }}
                            aria-label="Excluir contrato sem histórico"
                            title="Excluir definitivamente contrato sem movimentações"
                            className="inline-flex min-h-9 w-full sm:w-auto items-center justify-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-200 transition-colors hover:bg-rose-500/20 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
                        >
                            <Trash2 size={14} aria-hidden="true" className="shrink-0 text-rose-400" />
                            <span>Excluir</span>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
