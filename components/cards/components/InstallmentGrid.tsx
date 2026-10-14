import React from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, CheckCircle2, Loader2, WalletCards, ChevronRight, Check } from 'lucide-react';
import { Modal } from '../../ui/Modal';
import { LateFeeWaiverOptions } from '../../modals/payment/LateFeeWaiverOptions';
import { DebtCompositionSummary } from '../../modals/payment/DebtCompositionSummary';
import { ReceiptRemainderDecision } from '../../modals/payment/ReceiptRemainderDecision';
import { toISODateOnlyUTC, formatBRDate } from '../../../utils/dateHelpers';
import { formatMoney } from '../../../utils/formatters';
import { Loan, Installment, Agreement, AgreementInstallment } from '../../../types';
import { InstallmentCard } from './InstallmentCard';
import { prepareInstallmentViewModel } from './InstallmentGrid.logic';
import { PaymentOfferModal } from './PaymentOfferModal';
import { getInstallmentsPaidAmount } from '../../../utils/loanStatus';
import { computeLoanRemainingBalance, ZERO_BALANCE_THRESHOLD } from '../../../domain/finance/calculations';
import { buildInstallmentReceiptModel, inferReceiptMode, type QuickPaymentOptions, type QuickMode } from './InstallmentReceiptModel';
import { previewFinancialOperation, type FinancialOperationResult, type FinancialPaymentMethod } from '../../../services/payments/paymentEngineV4';
import { resolveReceiptDecision, type ReceiptBusinessAction } from '../../../services/payments/receiptDecision';

interface InstallmentGridProps {
    loan: Loan;
    orderedInstallments: Installment[];
    fixedTermStats: any;
    isPaid: boolean;
    isLate: boolean;
    isZeroBalance: boolean;
    isFullyFinalized: boolean;
    showProgress: boolean;
    strategy: any;
    isDailyFree: boolean;
    isFixedTerm: boolean;
    onAgreementPayment: (loan: Loan, agreement: Agreement, inst: AgreementInstallment, amount?: number) => void;
    onInstallmentPayment?: (loan: Loan, inst: Installment, debt: any, amount?: number, options?: QuickPaymentOptions) => boolean | void | Promise<boolean | void>;
    onReverseInstallmentPayment?: (loan: Loan, inst: Installment) => void;
    isStealthMode?: boolean;
    onNavigate?: () => void;
    onRefresh?: () => void | Promise<void>;
}

export const InstallmentGrid: React.FC<InstallmentGridProps> = (props) => {
    const [selectedInst, setSelectedInst] = React.useState<Installment | null>(null);
    const [selectedDebt, setSelectedDebt] = React.useState<any>(null);
    const [receiptAmount, setReceiptAmount] = React.useState('');
    const [showCustomAmount, setShowCustomAmount] = React.useState(false);
    const [quickMode, setQuickMode] = React.useState<QuickMode>('TOTAL');
    const [manualReceiptMode, setManualReceiptMode] = React.useState(false);
    const [lateFeeForgiven, setLateFeeForgiven] = React.useState(0);
    const [businessAction, setBusinessAction] = React.useState<ReceiptBusinessAction>('CAPITALIZE_REMAINDER');
    const [offerInstallment, setOfferInstallment] = React.useState<Installment | null>(null);
    const [reviewPreview, setReviewPreview] = React.useState<FinancialOperationResult | null>(null);
    const [isReviewReady, setIsReviewReady] = React.useState(false);
    const [isPreparingReview, setIsPreparingReview] = React.useState(false);
    const [isSubmittingReceipt, setIsSubmittingReceipt] = React.useState(false);
    const [receiptError, setReceiptError] = React.useState<string | null>(null);

    const {
        loan, orderedInstallments, fixedTermStats, isPaid, isZeroBalance, isFullyFinalized,
        showProgress, strategy, isDailyFree, isFixedTerm, isStealthMode, onNavigate,
        onInstallmentPayment, onReverseInstallmentPayment, onRefresh
    } = props;

    React.useEffect(() => {
        setReviewPreview(null);
        setIsReviewReady(false);
        setReceiptError(null);
    }, [selectedInst?.id, receiptAmount, quickMode, lateFeeForgiven, businessAction]);

    const context = {
        fixedTermStats,
        isPaid,
        isZeroBalance,
        isFullyFinalized,
        showProgress,
        strategy,
        isDailyFree,
        isFixedTerm
    };
    const paymentSummary = React.useMemo(() => {
        if (loan.billingCycle !== 'INSTALLMENT_FIXED') return null;

        const totalPaid = getInstallmentsPaidAmount(loan.installments);
        if (totalPaid <= ZERO_BALANCE_THRESHOLD) return null;

        return {
            totalPaid,
            remainingDebt: computeLoanRemainingBalance(loan).totalRemaining
        };
    }, [loan]);

    return (
        <>
            <div className="flex flex-col gap-0.5 max-h-[60vh] overflow-y-auto custom-scrollbar pr-1 -mr-1">
                {orderedInstallments.map((inst, i) => {
                    const viewModel = prepareInstallmentViewModel(loan, inst, i, context);

                    return (
                        <InstallmentCard
                            key={inst.id}
                            vm={viewModel}
                            loan={loan}
                            fixedTermStats={fixedTermStats}
                            strategy={strategy}
                            isStealthMode={isStealthMode}
                            inlinePaymentEnabled={!!onInstallmentPayment}
                            onPayInstallment={(_targetLoan, targetInst, targetDebt) => {
                                setSelectedInst(targetInst);
                                setSelectedDebt(targetDebt);
                                const offerAmount = Number(targetInst.paymentOfferAmount || 0);
                                const offerIsActive = String(targetInst.paymentOfferStatus || '') === 'ACTIVE'
                                    && String(targetInst.paymentOfferValidUntil || '') >= new Date().toISOString().slice(0, 10)
                                    && offerAmount > 0.05;
                                setReceiptAmount(String(Number(offerIsActive ? offerAmount : targetDebt?.total || targetInst.amount || 0).toFixed(2)));
                                setShowCustomAmount(false);
                                setQuickMode('TOTAL');
                                setManualReceiptMode(false);
                                setLateFeeForgiven(0);
                                setBusinessAction('CAPITALIZE_REMAINDER');
                                setReviewPreview(null);
                                setIsReviewReady(false);
                                setReceiptError(null);
                            }}
                            onReverseInstallment={onReverseInstallmentPayment}
                            onPaymentOffer={(_targetLoan, targetInst) => setOfferInstallment(targetInst)}
                            onNavigate={onNavigate}
                        />
                    );
                })}
                {paymentSummary && (
                    <div className="mt-2 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.06] px-3 py-2.5">
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-2">
                                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-400">
                                    <WalletCards size={14} />
                                </span>
                                <div className="min-w-0">
                                    <p className="text-[8px] font-black uppercase tracking-[0.16em] text-emerald-500/80">Total pago</p>
                                    <p className="text-sm font-black text-emerald-400">{formatMoney(paymentSummary.totalPaid, isStealthMode)}</p>
                                </div>
                            </div>
                            <div className="shrink-0 border-l border-slate-700/70 pl-3 text-right">
                                <p className="text-[8px] font-black uppercase tracking-[0.12em] text-slate-500">Saldo devedor</p>
                                <p className="text-xs font-black text-slate-200">{formatMoney(paymentSummary.remainingDebt, isStealthMode)}</p>
                            </div>
                        </div>
                        <p className="mt-1.5 text-[8px] font-semibold text-slate-500">Valor pago já abatido do total da dívida.</p>
                    </div>
                )}
            </div>

            {selectedInst && selectedDebt && (() => {
                const {
                    principal, interest, lateFee, appliedLateFeeForgiveness, effectiveLateFee, activeOfferAmount,
                    totalAmount, chargesAmount, displayedAmount, canReceiveInterestOnly, canReceiveChargesOnly,
                    hasActiveOffer, forgivenessMode, isPartialPayment, isOnline, remainingAfterInput, missingInterestAmount,
                    needsBusinessChoice, modalityRule, receiptEffect, automaticDecision, canAbatePrincipal,
                    isDirectCapitalReduction
                } = buildInstallmentReceiptModel({ loan, selectedInst, selectedDebt, lateFeeForgiven, quickMode, receiptAmount, showCustomAmount });

                const resetSelection = () => {
                    setSelectedInst(null);
                    setSelectedDebt(null);
                    setQuickMode('TOTAL');
                    setManualReceiptMode(false);
                    setLateFeeForgiven(0);
                    setBusinessAction('CAPITALIZE_REMAINDER');
                    setReviewPreview(null);
                    setIsReviewReady(false);
                    setReceiptError(null);
                };
                const instNumber = selectedInst.number ?? 1;
                const dueDateFormatted = formatBRDate(selectedInst.dueDate);

                const modalContent = (
                <Modal onClose={resetSelection} title="Registrar recebimento" subtitle={`Parcela nº ${instNumber} · Vencimento ${dueDateFormatted}`} size="sm">
                    <div className="space-y-3.5">
                        <div className="space-y-3">
                            <DebtCompositionSummary
                                principal={principal}
                                interest={interest}
                                lateFee={effectiveLateFee}
                                total={totalAmount}
                                dueDate={selectedInst.dueDate}
                                isStealthMode={isStealthMode}
                            />

                            <div className="flex items-center justify-between gap-2 px-0.5">
                                <span className="text-[8px] font-black uppercase tracking-wider text-slate-500">{modalityRule.name}</span>
                                <span className="min-w-0 truncate text-right text-[8px] text-slate-500">{modalityRule.rule}</span>
                            </div>

                            {/* Condição Especial se ativa */}
                            {hasActiveOffer && (
                                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-center">
                                    <p className="text-[9px] font-black uppercase text-emerald-400">Condição especial ativa</p>
                                    <p className="mt-0.5 text-[8.5px] text-slate-300">Valor reservado de {formatMoney(activeOfferAmount, isStealthMode)} até a data combinada. É possível receber parte sem desfazer a condição.</p>
                                </div>
                            )}

                            {!hasActiveOffer && (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between px-0.5">
                                        <span className="text-[8px] font-black uppercase tracking-wider text-slate-500">Atalhos de valor</span>
                                        <span className="text-[8px] text-slate-600">O efeito aparece logo abaixo</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-1.5">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setQuickMode('TOTAL');
                                                setManualReceiptMode(true);
                                                setShowCustomAmount(false);
                                                setReceiptAmount(String(totalAmount.toFixed(2)));
                                                setBusinessAction('CAPITALIZE_REMAINDER');
                                            }}
                                            className={`min-h-12 rounded-lg border px-2.5 py-2 text-left transition-all ${
                                                quickMode === 'TOTAL' && !showCustomAmount
                                                    ? 'border-emerald-500/45 bg-emerald-500/10'
                                                    : 'border-slate-800 bg-slate-950/70 hover:border-slate-700'
                                            }`}
                                        >
                                            <span className="block text-[8px] font-black uppercase text-slate-300">Quitar esta parcela</span>
                                            <span className="mt-0.5 block text-[9px] font-black tabular-nums text-emerald-400">{formatMoney(totalAmount, isStealthMode)}</span>
                                        </button>

                                        {canReceiveInterestOnly && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setQuickMode('INTEREST_ONLY');
                                                    setManualReceiptMode(true);
                                                    setShowCustomAmount(false);
                                                    setReceiptAmount(String(interest.toFixed(2)));
                                                    setBusinessAction('CAPITALIZE_REMAINDER');
                                                }}
                                                className={`min-h-12 rounded-lg border px-2.5 py-2 text-left transition-all ${
                                                    quickMode === 'INTEREST_ONLY'
                                                        ? 'border-blue-500/45 bg-blue-500/10'
                                                        : 'border-slate-800 bg-slate-950/70 hover:border-slate-700'
                                                }`}
                                            >
                                                <span className="block text-[8px] font-black uppercase text-slate-300">Receber somente juros</span>
                                                <span className="mt-0.5 block text-[9px] font-black tabular-nums text-blue-400">{formatMoney(interest, isStealthMode)}</span>
                                            </button>
                                        )}

                                        {canReceiveChargesOnly && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setQuickMode('CHARGES_ONLY');
                                                    setManualReceiptMode(true);
                                                    setShowCustomAmount(false);
                                                    setReceiptAmount(String(chargesAmount.toFixed(2)));
                                                    setBusinessAction('CAPITALIZE_REMAINDER');
                                                }}
                                                className={`min-h-12 rounded-lg border px-2.5 py-2 text-left transition-all ${
                                                    quickMode === 'CHARGES_ONLY'
                                                        ? 'border-orange-500/45 bg-orange-500/10'
                                                        : 'border-slate-800 bg-slate-950/70 hover:border-slate-700'
                                                }`}
                                            >
                                                <span className="block text-[8px] font-black uppercase text-slate-300">Receber juros e atraso</span>
                                                <span className="mt-0.5 block text-[9px] font-black tabular-nums text-orange-400">{formatMoney(chargesAmount, isStealthMode)}</span>
                                            </button>
                                        )}

                                        {canAbatePrincipal && isDirectCapitalReduction && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setQuickMode('PRINCIPAL_REDUCTION');
                                                    setManualReceiptMode(true);
                                                    setShowCustomAmount(true);
                                                    setReceiptAmount('');
                                                    setBusinessAction('PRINCIPAL_REDUCTION');
                                                }}
                                                className={`min-h-12 rounded-lg border px-2.5 py-2 text-left transition-all ${
                                                    quickMode === 'PRINCIPAL_REDUCTION'
                                                        ? 'border-purple-500/45 bg-purple-500/10'
                                                        : 'border-slate-800 bg-slate-950/70 hover:border-slate-700'
                                                }`}
                                            >
                                                <span className="block text-[8px] font-black uppercase text-slate-300">Abater capital</span>
                                                <span className="mt-0.5 block text-[8px] font-bold text-purple-300">Sem mudar vencimento</span>
                                            </button>
                                        )}

                                        <button
                                            type="button"
                                            onClick={() => {
                                                setQuickMode('CUSTOM');
                                                setManualReceiptMode(false);
                                                setShowCustomAmount(true);
                                                setReceiptAmount('');
                                                setBusinessAction('CAPITALIZE_REMAINDER');
                                            }}
                                            className={`min-h-12 rounded-lg border px-2.5 py-2 text-left transition-all ${
                                                quickMode === 'CUSTOM' && showCustomAmount
                                                    ? 'border-slate-500/60 bg-slate-800/55'
                                                    : 'border-slate-800 bg-slate-950/70 hover:border-slate-700'
                                            }`}
                                        >
                                            <span className="block text-[8px] font-black uppercase text-slate-300">Receber outro valor</span>
                                            <span className="mt-0.5 block text-[8px] font-bold text-slate-500">O sistema distribui automaticamente</span>
                                        </button>
                                    </div>
                                </div>
                            )}

                            {hasActiveOffer && String(selectedInst.paymentOfferType || '').toUpperCase() !== 'INTEREST_RENEWAL' && (
                                <button type="button"
                                    onClick={() => { setQuickMode('CUSTOM'); setShowCustomAmount(true); setReceiptAmount(''); }}
                                    className="w-full rounded-lg border border-blue-500/40 bg-blue-500/10 py-2 text-[10px] font-black uppercase text-blue-300">
                                    Receber parte da condição
                                </button>
                            )}

                            {!hasActiveOffer && (
                                <LateFeeWaiverOptions
                                    loan={loan}
                                    installment={selectedInst}
                                    lateFee={lateFee}
                                    referenceDate={toISODateOnlyUTC(new Date())}
                                    value={appliedLateFeeForgiveness}
                                    onChange={(amount) => {
                                        setLateFeeForgiven(amount);
                                        if (quickMode === 'CHARGES_ONLY' && Math.max(0, lateFee - amount) <= ZERO_BALANCE_THRESHOLD) {
                                            setQuickMode('INTEREST_ONLY');
                                            setReceiptAmount(String(interest.toFixed(2)));
                                        }
                                    }}
                                    isStealthMode={isStealthMode}
                                />
                            )}

                            {showCustomAmount && (
                                <div className="rounded-xl border border-blue-500/30 bg-blue-500/[0.04] p-3 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[8.5px] font-black uppercase tracking-wider text-blue-300">
                                            {quickMode === 'PRINCIPAL_REDUCTION' ? 'Valor a abater do capital principal' : 'Valor recebido em dinheiro ou Pix'}
                                        </label>
                                        {quickMode === 'PRINCIPAL_REDUCTION' && (
                                            <span className="text-[8px] font-bold text-slate-400">
                                                Disponível: {formatMoney(principal, isStealthMode)}
                                            </span>
                                        )}
                                    </div>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-slate-400">R$</span>
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0.01"
                                            max={quickMode === 'PRINCIPAL_REDUCTION' ? principal : undefined}
                                            placeholder={quickMode === 'PRINCIPAL_REDUCTION' ? `Até ${principal.toFixed(2)}` : '0,00'}
                                            value={receiptAmount}
                                            onChange={e => {
                                                const nextAmount = e.target.value;
                                                setReceiptAmount(nextAmount);
                                                if (!manualReceiptMode) {
                                                    setQuickMode(inferReceiptMode(Number(nextAmount) || 0, totalAmount, interest));
                                                }
                                            }}
                                            className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-sm font-black text-white outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                            autoFocus
                                        />
                                    </div>
                                    {quickMode === 'PRINCIPAL_REDUCTION' && principal > 0 && (
                                        <div className="flex items-center gap-1.5 pt-0.5">
                                            <span className="text-[7.5px] font-bold uppercase text-slate-400">Atalhos:</span>
                                            {[0.25, 0.5, 1].map((ratio) => {
                                                const val = (principal * ratio).toFixed(2);
                                                return (
                                                    <button
                                                        key={ratio}
                                                        type="button"
                                                        onClick={() => setReceiptAmount(val)}
                                                        className="rounded border border-slate-700/80 bg-slate-900 px-2 py-0.5 text-[8px] font-bold text-slate-300 hover:border-slate-500 hover:bg-slate-800 transition-colors"
                                                    >
                                                        {ratio === 1 ? 'Total (100%)' : `${ratio * 100}%`}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Resumo do Lançamento */}
                            <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-2.5">
                                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                                    <div>
                                        <span className="text-[8px] font-black uppercase tracking-wider text-slate-400">
                                            {activeOfferAmount > 0.05 ? 'Valor da Condição Especial' : 'Valor a Liquidar'}
                                        </span>
                                        <p className="text-base font-black text-emerald-400">
                                            {formatMoney(displayedAmount, isStealthMode)}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-[8px] font-bold uppercase tracking-wider text-slate-400">Saldo Restante</span>
                                        <p className={`text-xs font-black ${remainingAfterInput <= ZERO_BALANCE_THRESHOLD ? 'text-emerald-400' : 'text-slate-200'}`}>
                                            {remainingAfterInput <= ZERO_BALANCE_THRESHOLD ? 'R$ 0,00 (Quitado)' : formatMoney(remainingAfterInput, isStealthMode)}
                                        </p>
                                    </div>
                                </div>

                                <div className="rounded-lg bg-slate-900/80 border border-slate-800/80 p-2.5">
                                    <div className="flex items-start gap-2">
                                        <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-emerald-400" />
                                        <p className="text-[8.5px] leading-relaxed text-slate-300">{receiptEffect}</p>
                                    </div>
                                </div>

                                {displayedAmount > ZERO_BALANCE_THRESHOLD && (
                                    <div className="grid grid-cols-2 gap-2 text-[8px]">
                                        <div className="rounded-lg bg-slate-900/50 border border-slate-800/70 p-2 flex items-center justify-between">
                                            <span className="font-semibold text-slate-400">Abate no Capital:</span>
                                            <span className="font-bold text-blue-300">
                                                {formatMoney(
                                                    quickMode === 'PRINCIPAL_REDUCTION' && isDirectCapitalReduction
                                                        ? Math.min(principal, displayedAmount)
                                                        : Math.max(0, Math.min(principal, displayedAmount - chargesAmount)),
                                                    isStealthMode
                                                )}
                                            </span>
                                        </div>
                                        <div className="rounded-lg bg-slate-900/50 border border-slate-800/70 p-2 flex items-center justify-between">
                                            <span className="font-semibold text-slate-400">Quita Encargos:</span>
                                            <span className="font-bold text-amber-300">
                                                {formatMoney(
                                                    quickMode === 'PRINCIPAL_REDUCTION' && isDirectCapitalReduction
                                                        ? 0
                                                        : Math.min(chargesAmount, displayedAmount),
                                                    isStealthMode
                                                )}
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {hasActiveOffer && isPartialPayment && (
                                <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-[10px] font-bold text-emerald-300">O saldo da condição continuará reservado até a data combinada, sem renovação de juros nem nova negociação.</p>
                            )}
                            {needsBusinessChoice && (
                                <ReceiptRemainderDecision
                                    remainingInterest={missingInterestAmount}
                                    value={businessAction}
                                    onChange={setBusinessAction}
                                    isOnline={isOnline}
                                    isStealthMode={isStealthMode}
                                />
                            )}

                             {isReviewReady && (
                                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.08] p-3.5">
                                    <div className="flex items-center gap-2 text-emerald-300">
                                        <CheckCircle2 size={16} />
                                        <p className="text-[10px] font-black uppercase tracking-wide">Confira antes de registrar</p>
                                    </div>
                                    <div className="mt-3 grid grid-cols-2 gap-2">
                                        <div className="rounded-lg bg-slate-950/70 p-2.5">
                                            <p className="text-[8px] font-bold uppercase text-slate-500">Valor recebido</p>
                                            <p className="mt-1 text-sm font-black text-emerald-400">{formatMoney(reviewPreview?.amount_received ?? displayedAmount, isStealthMode)}</p>
                                        </div>
                                        <div className="rounded-lg bg-slate-950/70 p-2.5">
                                            <p className="text-[8px] font-bold uppercase text-slate-500">Saldo depois</p>
                                            <p className="mt-1 text-sm font-black text-white">{reviewPreview ? formatMoney(Number((reviewPreview.after as any)?.total || 0), isStealthMode) : 'Conforme a condição'}</p>
                                        </div>
                                        {reviewPreview && (
                                            <>
                                                <div className="rounded-lg bg-slate-950/70 p-2.5">
                                                    <p className="text-[8px] font-bold uppercase text-slate-500">Capital abatido</p>
                                                    <p className="mt-1 text-xs font-black text-blue-300">{formatMoney(reviewPreview.principal_paid, isStealthMode)}</p>
                                                </div>
                                                <div className="rounded-lg bg-slate-950/70 p-2.5">
                                                    <p className="text-[8px] font-bold uppercase text-slate-500">Encargos recebidos</p>
                                                    <p className="mt-1 text-xs font-black text-amber-300">{formatMoney(reviewPreview.interest_paid + reviewPreview.late_fee_paid, isStealthMode)}</p>
                                                </div>
                                                {(reviewPreview.principal_forgiven + reviewPreview.interest_forgiven + reviewPreview.late_fee_forgiven) > ZERO_BALANCE_THRESHOLD && (
                                                    <div className="col-span-2 rounded-lg border border-rose-500/20 bg-rose-500/10 p-2.5">
                                                        <p className="text-[8px] font-bold uppercase text-rose-300">Desconto aplicado</p>
                                                        <p className="mt-1 text-xs font-black text-rose-200">{formatMoney(reviewPreview.principal_forgiven + reviewPreview.interest_forgiven + reviewPreview.late_fee_forgiven, isStealthMode)}</p>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>

                                </div>
                            )}
                            {receiptError && (
                                <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-[10px] font-bold leading-4 text-rose-200" role="alert">
                                    {receiptError}
                                </p>
                            )}
                        </div>
                        <div className="flex flex-col gap-2">
                            {isReviewReady && (
                                <button
                                    type="button"
                                    disabled={isSubmittingReceipt}
                                    onClick={() => {
                                        setIsReviewReady(false);
                                        setReviewPreview(null);
                                        setReceiptError(null);
                                    }}
                                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 py-2.5 text-[10px] font-black uppercase text-slate-300 transition-all hover:bg-slate-800 disabled:opacity-50"
                                >
                                    <ArrowLeft size={13} /> Voltar e ajustar
                                </button>
                            )}
                            <button
                                disabled={isPreparingReview || isSubmittingReceipt || displayedAmount <= 0.05 || (hasActiveOffer && displayedAmount > activeOfferAmount + ZERO_BALANCE_THRESHOLD) || (quickMode === 'PRINCIPAL_REDUCTION' && displayedAmount > principal + ZERO_BALANCE_THRESHOLD)}
                                onClick={async () => {
                                    const amount = quickMode === 'CUSTOM' || quickMode === 'PRINCIPAL_REDUCTION'
                                        ? Number(receiptAmount)
                                        : displayedAmount;
                                    if (!Number.isFinite(amount) || amount <= 0.05 || (hasActiveOffer && amount > activeOfferAmount + ZERO_BALANCE_THRESHOLD)) return;
                                    if (quickMode === 'PRINCIPAL_REDUCTION' && amount > principal + ZERO_BALANCE_THRESHOLD) {
                                        setReceiptError('O valor a abater não pode ser maior que o capital em aberto.');
                                        return;
                                    }
                                    const finalDecision = quickMode === 'PRINCIPAL_REDUCTION'
                                        ? resolveReceiptDecision({
                                            amountReceived: amount,
                                            principal,
                                            interest,
                                            lateFee: effectiveLateFee,
                                            billingCycle: loan.billingCycle,
                                            businessAction: 'PRINCIPAL_REDUCTION',
                                        })
                                        : needsBusinessChoice
                                            ? resolveReceiptDecision({
                                                amountReceived: amount,
                                                principal,
                                                interest,
                                                lateFee: effectiveLateFee,
                                                billingCycle: loan.billingCycle,
                                                businessAction,
                                            })
                                            : automaticDecision;
                                    const effectiveOperation = hasActiveOffer ? 'KEEP_PENDING' : finalDecision.operationType;
                                    const preferredMethod = String(loan.preferredPaymentMethod || 'OTHER').toUpperCase();
                                    const paymentMethod = (['PIX', 'CASH', 'BANK_TRANSFER', 'CREDIT_CARD', 'BOLETO'].includes(preferredMethod)
                                        ? preferredMethod
                                        : 'OTHER') as FinancialPaymentMethod;
                                    setReceiptError(null);
                                    if (!isReviewReady) {
                                        setIsPreparingReview(true);
                                        try {
                                            if (!hasActiveOffer) {
                                                const preview = await previewFinancialOperation({
                                                    loanId: String(loan.id),
                                                    installmentId: String(selectedInst.id),
                                                     operationType: effectiveOperation,
                                                    amountReceived: amount,
                                                    paymentMethod,
                                                    paymentDate: toISODateOnlyUTC(new Date()),
                                                    forgivenessMode,
                                                    requestedLateFeeForgiven: appliedLateFeeForgiveness,
                                                });
                                                setReviewPreview(preview);
                                            }
                                            setIsReviewReady(true);
                                        } catch (error: any) {
                                            setReceiptError(error?.message || 'Não foi possível revisar este recebimento. Tente novamente.');
                                        } finally {
                                            setIsPreparingReview(false);
                                        }
                                        return;
                                    }
                                    const paymentOptions: QuickPaymentOptions = {
                                        forgivenessMode,
                                        lateFeeForgiven: appliedLateFeeForgiveness,
                                        operationType: effectiveOperation,
                                        paymentMethod,
                                        expectedPreview: reviewPreview || undefined,
                                    };
                                    setIsSubmittingReceipt(true);
                                    try {
                                        const succeeded = await onInstallmentPayment?.(loan, selectedInst, selectedDebt, amount, paymentOptions);
                                        if (succeeded !== false) resetSelection();
                                    } finally {
                                        setIsSubmittingReceipt(false);
                                    }
                                }}
                                className="w-full py-2.5 rounded-lg text-[10px] font-black uppercase bg-blue-600 hover:bg-blue-500 text-white transition-all disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                {isPreparingReview || isSubmittingReceipt ? (
                                    <span className="flex items-center justify-center gap-2"><Loader2 size={14} className="animate-spin" /> {isPreparingReview ? 'Preparando revisão' : 'Registrando'}</span>
                                ) : isReviewReady ? 'Registrar recebimento' : 'Revisar recebimento'}
                            </button>

                        </div>
                    </div>
                </Modal>
                );
                return modalContent;
            })()}

            {offerInstallment && typeof document !== 'undefined' && createPortal(
                <PaymentOfferModal
                    loan={loan}
                    installment={offerInstallment}
                    onClose={() => setOfferInstallment(null)}
                    onSaved={async () => {
                        await onRefresh?.();
                    }}
                />,
                document.body
            )}
        </>
    );
};
