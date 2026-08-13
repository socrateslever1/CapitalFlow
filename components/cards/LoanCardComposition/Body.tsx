import React from 'react';
import { BadgePercent, CalendarClock, CheckCircle2, Handshake, Info, Layers, FolderOpen, FileText, ExternalLink } from 'lucide-react';
import { AgreementView } from '../../../features/agreements/components/AgreementView';
import { InstallmentGrid } from '../components/InstallmentGrid';
import { Loan, UserProfile, Installment, Agreement, AgreementInstallment } from '../../../types';
import { formatMoney } from '../../../utils/formatters';
import { isPaymentOfferActive } from '../../../services/paymentOffers.service';
import { getDueBadgeLabel, getDueBadgeStyle } from './helpers';

interface BodyProps {
    loan: Loan;
    activeUser: UserProfile | null;
    activeAgreement?: Agreement;
    onRefresh: () => void;
    onAgreementPayment: (loan: Loan, agreement: Agreement, inst: AgreementInstallment, amount?: number, forgiveLateFee?: boolean) => void;
    onReverseAgreementPayment?: (loan: Loan, agreement: Agreement, inst: AgreementInstallment) => void;
    onInstallmentPayment?: (loan: Loan, inst: Installment, debt: any, amount?: number, options?: { forgivenessMode?: 'NONE' | 'FINE_ONLY' | 'MORA_ONLY' | 'FINE_AND_MORA' | 'TOTAL_CHARGES' | 'CAPITAL_ONLY' | 'INTEREST_ONLY' | 'BOTH' }) => void;
    onReverseInstallmentPayment?: (loan: Loan, inst: Installment) => void;
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
    onInstallmentPayment, onReverseInstallmentPayment, orderedInstallments, fixedTermStats, isPaid, isLate, isZeroBalance, isFullyFinalized, daysUntilDue,
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
    const activePaymentOffer = (loan.installments || []).find((installment) =>
        isPaymentOfferActive(installment)
    );
    const activeOfferDiscount = activePaymentOffer
        ? Math.max(0, Number(
            activePaymentOffer.paymentOfferDiscountApplied
            || activePaymentOffer.paymentOfferDiscountValue
            || 0
        ))
        : 0;
    const activeOfferPercent = Math.max(0, Number(activePaymentOffer?.paymentOfferDiscountPercent || 0));
    const activeOfferWaivesCharges = Boolean(
        activePaymentOffer?.paymentOfferWaiveLateFee
        || activePaymentOffer?.paymentOfferWaiveFine
        || activePaymentOffer?.paymentOfferWaiveDailyInterest
    );
    const activeOfferValidUntil = activePaymentOffer?.paymentOfferValidUntil
        ? new Date(`${String(activePaymentOffer.paymentOfferValidUntil).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR')
        : '';

    return (
        <div className="space-y-4 pt-1">
            {activePaymentOffer && (
                <section
                    className="flex flex-col gap-3 rounded-lg border border-amber-400/35 bg-amber-400/[0.07] px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                    aria-label={`Condição especial válida até ${activeOfferValidUntil}`}
                >
                    <div className="flex min-w-0 items-start gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-amber-400/30 bg-amber-400/10 text-amber-300">
                            <BadgePercent size={16} />
                        </div>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span className="text-[10px] font-black uppercase text-amber-300">
                                    {activePaymentOffer.paymentOfferType === 'INTEREST_RENEWAL' ? 'Renovação por juros ativa' : 'Condição especial ativa'}
                                </span>
                                <span className="inline-flex items-center gap-1 text-[9px] font-bold text-amber-100/75">
                                    <CalendarClock size={11} />
                                    Até {activeOfferValidUntil}
                                </span>
                            </div>
                            <p className="mt-1 text-[10px] font-semibold text-slate-300">
                                {activeOfferPercent > 0
                                    ? `${activeOfferPercent.toLocaleString('pt-BR')}% de desconto`
                                    : activeOfferDiscount > 0
                                        ? `${formatMoney(activeOfferDiscount, isStealthMode)} de desconto`
                                        : 'Condição de pagamento negociada'}
                                {activeOfferWaivesCharges ? ' + encargos retirados' : ''}
                            </p>
                            {activePaymentOffer.paymentOfferNote && (
                                <p className="mt-1 truncate text-[9px] text-slate-500" title={activePaymentOffer.paymentOfferNote}>
                                    {activePaymentOffer.paymentOfferNote}
                                </p>
                            )}
                        </div>
                    </div>
                    <div className="flex shrink-0 items-baseline justify-between gap-3 border-t border-amber-400/15 pt-2 sm:block sm:border-0 sm:pt-0 sm:text-right">
                        <span className="text-[8px] font-black uppercase text-slate-500">Valor combinado</span>
                        <strong className="block text-sm font-black text-white">
                            {formatMoney(Number(activePaymentOffer.paymentOfferAmount || 0), isStealthMode)}
                        </strong>
                    </div>
                </section>
            )}
            {/* Seção de resumo de status, visível apenas se expandido. */}
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
                        <span className="text-[9px] font-black uppercase tracking-wider">Em Renegociação</span>
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

            {/* Seção de unificação. */}
            {unifiedChildren.length > 0 && (
                <div className="space-y-3 bg-slate-900/40 p-4 rounded-lg border border-slate-800/50">
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
                            <div key={child.id} className="bg-slate-950/60 border border-slate-800/30 px-4 py-3 rounded-lg flex items-center justify-between gap-3 hover:border-indigo-500/30 transition-colors">
                                <div className="flex flex-col min-w-0">
                                    <span className="text-[10px] font-black text-white uppercase truncate">{child.debtorName}</span>
                                    <div className="flex items-center gap-1.5 mt-0.5 opacity-60">
                                        <span className="text-[8px] text-slate-400 uppercase font-bold tracking-tighter">ID: {child.id.slice(0, 8)}</span>
                                        <span className="text-slate-800">•</span>
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
                <div className="pt-1">
                    <AgreementView
                        agreement={activeAgreement!}
                        loan={loan}
                        activeUser={activeUser}
                        onUpdate={onRefresh}
                        onPayment={(inst, amount, forgiveLateFee) => onAgreementPayment(loan, activeAgreement!, inst, amount, forgiveLateFee)}
                        onReversePayment={(inst) => onReverseAgreementPayment?.(loan, activeAgreement!, inst)}
                        onNavigate={onLegalDocument}
                    />
                </div>
            ) : (
                <div className="pt-1">
                    <div className="flex items-center gap-4 mb-4">
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
                        onInstallmentPayment={onInstallmentPayment}
                        onReverseInstallmentPayment={onReverseInstallmentPayment}
                        isStealthMode={isStealthMode}
                        onNavigate={onNavigate}
                        onRefresh={onRefresh}
                    />
                </div>
            )}
        </div>
    );
};
