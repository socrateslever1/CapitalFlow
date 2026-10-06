import React from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, CheckCircle2, Loader2, WalletCards } from 'lucide-react';
import { Modal } from '../../ui/Modal';
import { LateFeeWaiverOptions } from '../../modals/payment/LateFeeWaiverOptions';
import { toISODateOnlyUTC } from '../../../utils/dateHelpers';
import { formatMoney } from '../../../utils/formatters';
import { Loan, Installment, Agreement, AgreementInstallment } from '../../../types';
import { InstallmentCard } from './InstallmentCard';
import { prepareInstallmentViewModel } from './InstallmentGrid.logic';
import { PaymentOfferModal } from './PaymentOfferModal';
import { getInstallmentsPaidAmount } from '../../../utils/loanStatus';
import { computeLoanRemainingBalance, ZERO_BALANCE_THRESHOLD } from '../../../domain/finance/calculations';
import { buildInstallmentReceiptModel, inferReceiptMode, type PartialBalanceAction, type QuickPaymentOptions, type QuickMode } from './InstallmentReceiptModel';
import { previewFinancialOperation, type FinancialOperationResult, type FinancialPaymentMethod } from '../../../services/payments/paymentEngineV4';
import { resolveReceiptDecision } from '../../../services/payments/receiptDecision';

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
    const [partialBalanceAction, setPartialBalanceAction] = React.useState<PartialBalanceAction>('CAPITALIZE');
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
    }, [selectedInst?.id, receiptAmount, quickMode, lateFeeForgiven, partialBalanceAction]);

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
                                setPartialBalanceAction('KEEP_PENDING');
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
                    principal, interest, lateFee, appliedLateFeeForgiveness, effectiveLateFee, activeOfferAmount, totalAmount, chargesAmount, displayedAmount, canReceiveInterestOnly, canReceiveChargesOnly, hasActiveOffer, forgivenessMode, isPartialPayment, canRenewWithPending, isOnline, remainingAfterInput, modalityRule, partialChoices, receiptEffect, canAbatePrincipal, isDirectCapitalReduction
                } = buildInstallmentReceiptModel({ loan, selectedInst, selectedDebt, lateFeeForgiven, quickMode, receiptAmount, showCustomAmount });

                const resetSelection = () => {
                    setSelectedInst(null);
                    setSelectedDebt(null);
                    setQuickMode('TOTAL');
                    setManualReceiptMode(false);
                    setLateFeeForgiven(0);
                    setPartialBalanceAction('CAPITALIZE');
                    setReviewPreview(null);
                    setIsReviewReady(false);
                    setReceiptError(null);
                };

                const modalContent = (
                <Modal onClose={resetSelection} title="Registrar recebimento" subtitle="Escolha o valor recebido e confira o resultado antes de concluir" size="sm">
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <div className="rounded-lg border border-slate-700/70 bg-slate-950/60 px-3 py-2">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-[8px] font-black uppercase tracking-widest text-slate-500">Forma de cobrança</span>
                                    <span className="text-[9px] font-black uppercase text-blue-300">{modalityRule.name}</span>
                                </div>
                                <p className="mt-1 text-[8px] leading-3.5 text-slate-400">{modalityRule.rule}</p>
                            </div>
                            {hasActiveOffer ? (
                                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-center">
                                    <p className="text-[9px] font-black uppercase text-emerald-400">Condição especial ativa</p>
                                    <p className="mt-0.5 text-[9px] text-slate-400">O valor fica reservado até a data combinada. É possível receber parte sem desfazer a condição; o restante continua disponível.</p>
                                </div>
                            ) : <div className="grid grid-cols-2 gap-2">
                                <button
                                    onClick={() => {
                                        setQuickMode('TOTAL');
                                        setManualReceiptMode(true);
                                        setShowCustomAmount(false);
                                        setLateFeeForgiven(0);
                                        setReceiptAmount(String(totalAmount.toFixed(2)));
                                        setPartialBalanceAction('KEEP_PENDING');
                                    }}
                                    className={`py-2 rounded-lg text-[10px] font-black uppercase border flex items-center justify-center gap-1.5 ${quickMode === 'TOTAL' && !showCustomAmount ? 'bg-emerald-600/20 text-emerald-400 border-emerald-500/30' : 'bg-slate-950 text-slate-400 border-slate-700'}`}
                                >
                                    <CheckCircle2 size={12}/>
                                    <span>
                                        <span className="block">Quitar esta parcela</span>
                                        <span className="mt-0.5 block text-[8px] normal-case opacity-70">Recebe todo o saldo e encerra a parcela</span>
                                    </span>
                                </button>
                                <button
                                    onClick={() => {
                                        setQuickMode('CUSTOM');
                                        setManualReceiptMode(false);
                                        setShowCustomAmount(true);
                                        setLateFeeForgiven(0);
                                        setReceiptAmount('');
                                        setPartialBalanceAction('KEEP_PENDING');
                                    }}
                                    className={`py-2 rounded-lg text-[10px] font-black uppercase border ${quickMode === 'CUSTOM' || showCustomAmount ? 'bg-blue-600/20 text-blue-400 border-blue-500/40' : 'bg-slate-950 text-slate-400 border-slate-700'}`}
                                >
                                    <span className="block">Receber outro valor</span>
                                    <span className="mt-0.5 block text-[8px] normal-case opacity-70">Você informa quanto entrou</span>
                                </button>
                            </div>}
                            {hasActiveOffer && String(selectedInst.paymentOfferType || '').toUpperCase() !== 'INTEREST_RENEWAL' && (
                                <button type="button"
                                    onClick={() => { setQuickMode('CUSTOM'); setShowCustomAmount(true); setReceiptAmount(''); }}
                                    className="w-full rounded-lg border border-blue-500/40 bg-blue-500/10 py-2 text-[10px] font-black uppercase text-blue-300">
                                    Receber parte da condição
                                </button>
                            )}
                            {!hasActiveOffer && canReceiveInterestOnly && (
                                <button
                                    onClick={() => {
                                        setQuickMode('INTEREST_ONLY');
                                        setManualReceiptMode(true);
                                        setShowCustomAmount(false);
                                        setReceiptAmount(String(interest.toFixed(2)));
                                        setPartialBalanceAction('KEEP_PENDING');
                                    }}
                                    className={`w-full py-2 rounded-lg text-[10px] font-black uppercase border ${quickMode === 'INTEREST_ONLY' ? 'bg-blue-600/20 text-blue-300 border-blue-500/50' : 'bg-slate-950 text-slate-400 border-slate-700'}`}
                                >
                                    <span className="block">Receber somente juros</span>
                                    <span className="mt-0.5 block text-[8px] normal-case opacity-70">Não abate capital nem muda o vencimento</span>
                                </button>
                            )}
                            {!hasActiveOffer && canReceiveChargesOnly && (
                                <button
                                    onClick={() => {
                                        setQuickMode('CHARGES_ONLY');
                                        setManualReceiptMode(true);
                                        setShowCustomAmount(false);
                                        setReceiptAmount(String(chargesAmount.toFixed(2)));
                                        setPartialBalanceAction('KEEP_PENDING');
                                    }}
                                    className={`w-full py-2 rounded-lg text-[10px] font-black uppercase border ${quickMode === 'CHARGES_ONLY' ? 'bg-orange-600/20 text-orange-400 border-orange-500/50' : 'bg-slate-950 text-slate-400 border-slate-700'}`}
                                >
                                    <span className="block">Receber juros e atraso</span>
                                    <span className="mt-0.5 block text-[8px] normal-case opacity-70">Quita juros, multa e mora; não abate capital</span>
                                </button>
                            )}
                            {!hasActiveOffer && canAbatePrincipal && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setQuickMode('PRINCIPAL_REDUCTION');
                                        setManualReceiptMode(true);
                                        setShowCustomAmount(true);
                                        setLateFeeForgiven(0);
                                        setReceiptAmount('');
                                        setPartialBalanceAction('PRINCIPAL_REDUCTION');
                                    }}
                                    className={`w-full py-2 rounded-lg text-[10px] font-black uppercase border transition-all ${quickMode === 'PRINCIPAL_REDUCTION' ? 'bg-purple-600/20 text-purple-300 border-purple-500/50' : 'bg-slate-950 text-slate-400 border-slate-700 hover:border-slate-600'}`}
                                >
                                    <span className="block">Abater valor</span>
                                    <span className="mt-0.5 block text-[8px] normal-case opacity-70">
                                        {isDirectCapitalReduction
                                            ? 'Abatimento direto no capital (período de até 10 dias)'
                                            : 'Quita juros em aberto e abate o excedente no capital (+10 dias)'}
                                    </span>
                                </button>
                            )}
                            {!hasActiveOffer && (
                                <LateFeeWaiverOptions
                                    loan={loan}
                                    installment={selectedInst}
                                    lateFee={lateFee}
                                    referenceDate={toISODateOnlyUTC(new Date())}
                                    value={appliedLateFeeForgiveness}
                                    onChange={setLateFeeForgiven}
                                    isStealthMode={isStealthMode}
                                />
                            )}
                            {showCustomAmount && (
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0.01"
                                    max={quickMode === 'PRINCIPAL_REDUCTION' ? principal : undefined}
                                    placeholder={quickMode === 'PRINCIPAL_REDUCTION' ? `Valor a abater (máx. ${formatMoney(principal, isStealthMode)})` : "Digite o valor"}
                                    value={receiptAmount}
                                    onChange={e => {
                                        const nextAmount = e.target.value;
                                        setReceiptAmount(nextAmount);
                                        if (!manualReceiptMode) {
                                            setQuickMode(inferReceiptMode(Number(nextAmount) || 0, totalAmount, interest));
                                        }
                                    }}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white font-bold outline-none focus:border-blue-500"
                                    autoFocus
                                />
                            )}
                            <div className="grid grid-cols-3 gap-1 text-center">
                                <span className="rounded-md bg-slate-950/70 border border-slate-800 px-1.5 py-1 text-[8px] font-black uppercase text-slate-500">Cap. {formatMoney(principal, isStealthMode)}</span>
                                <span className="rounded-md bg-slate-950/70 border border-slate-800 px-1.5 py-1 text-[8px] font-black uppercase text-blue-400">Jur. {formatMoney(interest, isStealthMode)}</span>
                                <span className="rounded-md bg-slate-950/70 border border-slate-800 px-1.5 py-1 text-[8px] font-black uppercase text-rose-400">Atr. {formatMoney(effectiveLateFee, isStealthMode)}</span>
                            </div>
                            <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg text-center">
                                <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">
                                    {activeOfferAmount > 0.05 ? 'Valor da condição especial' : 'Valor a receber'}
                                </p>
                                <p className="text-base font-black text-emerald-400">{formatMoney(displayedAmount, isStealthMode)}</p>
                                <p className="mt-1 text-[9px] leading-4 text-slate-400">{receiptEffect}</p>
                            </div>

                            {hasActiveOffer && isPartialPayment && (
                                <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-[10px] font-bold text-emerald-300">O saldo da condição continuará reservado até a data combinada, sem renovação de juros nem nova negociação.</p>
                            )}
                            {isPartialPayment && !hasActiveOffer && quickMode !== 'PRINCIPAL_REDUCTION' && partialBalanceAction !== 'PRINCIPAL_REDUCTION' && (
                                <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.05] p-3 space-y-2">
                                    <div>
                                        <p className="text-[9px] font-black uppercase tracking-wide text-amber-300">Recebimento parcial</p>
                                        <p className="mt-0.5 text-[9px] leading-4 text-slate-400">
                                            Restam {formatMoney(remainingAfterInput, isStealthMode)}. Escolha exatamente o que o sistema deve fazer com esse saldo.
                                        </p>
                                    </div>
                                    <div className="grid grid-cols-1 gap-1.5">
                                        {partialChoices.map((choice) => (
                                            <button
                                                key={choice.value}
                                                type="button"
                                                disabled={choice.disabled}
                                                onClick={() => setPartialBalanceAction(choice.value)}
                                                className={`rounded-lg border p-2.5 text-left transition-all disabled:cursor-not-allowed disabled:opacity-35 ${partialBalanceAction === choice.value ? choice.activeClass : 'border-slate-700 bg-slate-950 text-slate-300'}`}
                                            >
                                                <span className="block text-[9px] font-black uppercase">{choice.title}</span>
                                                <span className="mt-0.5 block text-[8px] leading-3.5 opacity-75">{choice.detail}</span>
                                            </button>
                                        ))}
                                    </div>
                                    {partialBalanceAction === 'SETTLE' && (
                                        <p className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-2 text-[8px] font-bold leading-3.5 text-emerald-200">
                                            Quitação por acordo exige internet e registra o saldo dispensado como desconto auditável. Se houver outras parcelas abertas, elas não serão apagadas automaticamente.
                                        </p>
                                    )}
                                    {partialBalanceAction === 'RENEW_KEEP_PENDING' && !canRenewWithPending && (
                                        <p className="text-[8px] font-bold text-amber-300">Renovação parcial está disponível apenas para contratos mensais ou de giro.</p>
                                    )}
                                </div>
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
                                    {isPartialPayment && !hasActiveOffer && (
                                        <p className="mt-3 text-[9px] leading-4 text-slate-300">
                                            <span className="font-black text-white">Saldo restante:</span>{' '}
                                            {partialChoices.find(choice => choice.value === partialBalanceAction)?.title}.
                                        </p>
                                    )}
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
                    const automaticDecision = resolveReceiptDecision({
                        amountReceived: amount,
                        principal,
                        interest,
                        lateFee: effectiveLateFee,
                        billingCycle: loan.billingCycle,
                        businessAction: (quickMode === 'PRINCIPAL_REDUCTION' || partialBalanceAction === 'PRINCIPAL_REDUCTION') ? 'PRINCIPAL_REDUCTION' : undefined,
                    });
                    const effectivePartialAction = (isPartialPayment || quickMode === 'PRINCIPAL_REDUCTION') && !hasActiveOffer ? partialBalanceAction : undefined;
                    const effectiveOperation = !hasActiveOffer
                        ? (quickMode === 'PRINCIPAL_REDUCTION' || partialBalanceAction === 'PRINCIPAL_REDUCTION' || automaticDecision.operationType === 'PRINCIPAL_REDUCTION'
                            ? 'PRINCIPAL_REDUCTION'
                            : isPartialPayment && effectivePartialAction === 'CAPITALIZE'
                            ? 'CAPITALIZE_RENEWAL'
                            : isPartialPayment && effectivePartialAction === 'SETTLE'
                                ? 'DISCOUNT_RENEWAL'
                                : automaticDecision.operationType)
                        : 'KEEP_PENDING';
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
                                        partialBalanceAction: effectivePartialAction,
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
