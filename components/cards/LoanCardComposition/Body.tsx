import React from 'react';
import { CheckCircle2, Handshake, Info, Layers } from 'lucide-react';
import { AgreementView } from '../../../features/agreements/components/AgreementView';
import { InstallmentGrid } from '../components/InstallmentGrid';
import { Loan, UserProfile, Installment, Agreement, AgreementInstallment } from '../../../types';
import { formatMoney } from '../../../utils/formatters';
import { getDueBadgeLabel, getDueBadgeStyle } from './helpers';

interface BodyProps {
    loan: Loan;
    activeUser: UserProfile | null;
    activeAgreement?: Agreement;
    onRefresh: () => void;
    onAgreementPayment: (loan: Loan, agreement: Agreement, inst: AgreementInstallment, amount?: number) => void;
    onReverseAgreementPayment?: (loan: Loan, agreement: Agreement, inst: AgreementInstallment) => void;
    orderedInstallments: Installment[];
    fixedTermStats: any;
    isPaid: boolean;
    isLate: boolean;
    isZeroBalance: boolean;
    isFullyFinalized: boolean;
    daysUntilDue: number;
    showProgress: boolean;
    strategy: any;
    isDailyFree: boolean;
    isFixedTerm: boolean;
    isStealthMode?: boolean;
    allLoans?: Loan[];
    onNavigate?: () => void;
    onLegalDocument?: (path: string) => void;
    daysBeforeDue?: number;
    hasActiveAgreement: boolean;
}

export const Body: React.FC<BodyProps> = ({
    hasActiveAgreement, loan, activeUser, activeAgreement, onRefresh, onAgreementPayment, onReverseAgreementPayment,
    orderedInstallments, fixedTermStats, isPaid, isLate, isZeroBalance, isFullyFinalized, daysUntilDue,
    showProgress, strategy, isDailyFree, isFixedTerm, isStealthMode, allLoans, onNavigate, onLegalDocument
}) => {
    // Encontrar contratos que foram unificados neste aqui
    const unifiedChildren = React.useMemo(() => {
        if (!allLoans || !loan.id) return [];
        const shortId = loan.id.slice(0, 8);
        const markers = [
            `[LEGADO_PARCELAMENTO:${shortId}`,
            `[UNIFICADO EM ${shortId}`,
            `Contrato migrado para a unificação ${shortId}`,
            `Contrato unificado no parcelamento ${shortId}`
        ];
        return allLoans.filter(l =>
            markers.some(marker => String(l.notes || '').includes(marker))
        );
    }, [allLoans, loan.id]);

    return (
        <div className="space-y-6 pt-2">
            {/* SeÃ§Ã£o de Resumo de Status (VisÃ­vel apenas se expandido) */}
            <div className="flex flex-wrap items-center gap-2 pb-2">
                <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-900/50 rounded-lg border border-slate-800/50">
                   <Info size={10} className="text-slate-500" />
                   <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">Status Detalhado</span>
                </div>

                {isFullyFinalized ? (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 text-emerald-500 rounded-lg border border-emerald-500/20">
                        <CheckCircle2 size={10} className="shrink-0" />
                        <span className="text-[9px] font-black uppercase tracking-wider">Totalmente Quitado</span>
                    </div>
                ) : hasActiveAgreement ? (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-500/10 text-indigo-400 rounded-lg border border-indigo-500/20">
                        <Handshake size={10} className="shrink-0" />
                        <span className="text-[9px] font-black uppercase tracking-wider">Em RenegociaÃ§Ã£o</span>
                    </div>
                ) : (
                    (() => {
                        const label = getDueBadgeLabel(daysUntilDue);
                        const { cls, icon } = getDueBadgeStyle(daysUntilDue);
                        return (
                            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border shadow-sm ${cls}`}>
                                {React.cloneElement(icon as React.ReactElement<any>, { size: 10 })}
                                <span className="text-[9px] font-black uppercase tracking-wider">{label}</span>
                            </div>
                        );
                    })()
                )}

                {loan.last_billed_at && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 text-emerald-500 rounded-lg border border-emerald-500/20">
                        <CheckCircle2 size={10} className="shrink-0" />
                        <span className="text-[9px] font-black uppercase tracking-wider">
                            O cliente foi cobrado {loan.billing_count || 1} vez{ (loan.billing_count || 1) === 1 ? '' : 'es' }.
                        </span>
                    </div>
                )}
            </div>

            {/* SeÃ§Ã£o de UnificaÃ§Ã£o */}
            {unifiedChildren.length > 0 && (
                <div className="space-y-3 bg-slate-900/40 p-4 rounded-[1.5rem] border border-slate-800/50">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400 border border-indigo-500/20">
                            <Layers size={14} />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black uppercase text-white tracking-widest">Contratos Unificados</span>
                            <span className="text-[8px] text-slate-500 font-bold uppercase tracking-tight">Este contrato absorveu {unifiedChildren.length} sub-registros</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-2 mt-2">
                        {unifiedChildren.map(child => (
                            <div key={child.id} className="bg-slate-950/60 border border-slate-800/30 px-4 py-3 rounded-2xl flex items-center justify-between gap-3 hover:border-indigo-500/30 transition-colors">
                                <div className="flex flex-col min-w-0">
                                    <span className="text-[10px] font-black text-white uppercase truncate">{child.debtorName}</span>
                                    <div className="flex items-center gap-1.5 mt-0.5 opacity-60">
                                        <span className="text-[8px] text-slate-400 uppercase font-bold tracking-tighter">ID: {child.id.slice(0, 8)}</span>
                                        <span className="text-slate-800">â€¢</span>
                                        <span className="text-[8px] text-emerald-500/80 font-black tracking-tight">{formatMoney(child.principal, isStealthMode)}</span>
                                    </div>
                                </div>
                                <div className="shrink-0 px-2 py-1 bg-slate-900/80 border border-slate-800/50 rounded-lg text-[7px] font-black text-slate-500 uppercase tracking-widest">
                                    Consolidado
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Se tem acordo ativo, o contrato SE TORNA O ACORDO VISUALMENTE */}
            {hasActiveAgreement ? (
                <div className="pt-2">
                    <AgreementView
                        agreement={activeAgreement!}
                        loan={loan}
                        activeUser={activeUser}
                        onUpdate={onRefresh}
                        onPayment={(inst, amount) => onAgreementPayment(loan, activeAgreement!, inst, amount)}
                        onReversePayment={(inst) => onReverseAgreementPayment?.(loan, activeAgreement!, inst)}
                        onNavigate={onLegalDocument}
                    />
                </div>
            ) : (
                <div className="pt-2">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-800 to-transparent"></div>
                        <span className="text-[9px] font-black uppercase text-slate-500 tracking-[0.25em] whitespace-nowrap">
                            Cronograma de Parcelas
                        </span>
                        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-800 to-transparent"></div>
                    </div>

                    <InstallmentGrid
                        loan={loan}
                        orderedInstallments={orderedInstallments}
                        fixedTermStats={fixedTermStats}
                        isPaid={isPaid}
                        isLate={isLate}
                        isZeroBalance={isZeroBalance}
                        isFullyFinalized={isFullyFinalized}
                        showProgress={showProgress}
                        strategy={strategy}
                        isDailyFree={isDailyFree}
                        isFixedTerm={isFixedTerm}
                        onAgreementPayment={onAgreementPayment}
                        isStealthMode={isStealthMode}
                        onNavigate={onNavigate}
                    />
                </div>
            )}
        </div>
    );
};
