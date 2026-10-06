import type { Loan, Installment } from '../../../types';
import { ZERO_BALANCE_THRESHOLD } from '../../../domain/finance/calculations';
import { formatMoney } from '../../../utils/formatters';
import type { FinancialOperationResult, FinancialPaymentMethod } from '../../../services/payments/paymentEngineV4';
import { resolveReceiptDecision } from '../../../services/payments/receiptDecision';

export type PartialBalanceAction = 'KEEP_PENDING' | 'CAPITALIZE' | 'RENEW_KEEP_PENDING' | 'SETTLE' | 'PRINCIPAL_REDUCTION';
export type QuickMode = 'TOTAL' | 'CUSTOM' | 'INTEREST_ONLY' | 'CHARGES_ONLY';
export type QuickPaymentOptions = {
    forgivenessMode?: 'NONE' | 'FINE_ONLY' | 'MORA_ONLY' | 'FINE_AND_MORA' | 'TOTAL_CHARGES' | 'CAPITAL_ONLY' | 'INTEREST_ONLY' | 'BOTH';
    lateFeeForgiven?: number;
    partialBalanceAction?: PartialBalanceAction;
    operationType?: import('../../../services/payments/paymentEngineV4').FinancialOperationType;
    paymentMethod?: FinancialPaymentMethod;
    expectedPreview?: FinancialOperationResult;
};
export type InstallmentPaymentHandler = (
    loan: Loan,
    inst: Installment,
    debt: any,
    amount?: number,
    options?: QuickPaymentOptions
) => boolean | void | Promise<boolean | void>;

export function inferReceiptMode(amount: number, totalAmount: number, interest: number): QuickMode {
    if (amount >= totalAmount - ZERO_BALANCE_THRESHOLD) return 'TOTAL';
    if (Math.abs(amount - interest) <= ZERO_BALANCE_THRESHOLD && interest > ZERO_BALANCE_THRESHOLD) return 'INTEREST_ONLY';
    return 'CUSTOM';
}

/** Preparação pura da janela rápida: não movimenta caixa nem altera parcelas. */
export function buildInstallmentReceiptModel(params: {
    loan: Loan;
    selectedInst: Installment;
    selectedDebt: any;
    lateFeeForgiven: number;
    quickMode: QuickMode;
    receiptAmount: string;
    showCustomAmount?: boolean;
}) {
    const { loan, selectedInst, selectedDebt, lateFeeForgiven, quickMode, receiptAmount, showCustomAmount = false } = params;
                const principal = Math.max(0, Number(selectedDebt?.principal ?? selectedInst.principalRemaining ?? 0) || 0);
                const interest = Math.max(0, Number(selectedDebt?.interest ?? selectedInst.interestRemaining ?? 0) || 0);
                const lateFee = Math.max(0, Number(selectedDebt?.lateFee ?? selectedInst.lateFeeAccrued ?? 0) || 0);
                const appliedLateFeeForgiveness = Math.min(lateFee, Math.max(0, lateFeeForgiven));
                const effectiveLateFee = Math.max(0, lateFee - appliedLateFeeForgiveness);
                const activeOfferAmount = String(selectedInst.paymentOfferStatus || '') === 'ACTIVE'
                    && String(selectedInst.paymentOfferValidUntil || '') >= new Date().toISOString().slice(0, 10)
                    ? Number(selectedInst.paymentOfferAmount || 0)
                    : 0;
                const totalAmount = activeOfferAmount > 0.05
                    ? activeOfferAmount
                    : Math.max(0, Number(selectedDebt?.total || 0) - appliedLateFeeForgiveness);
                const chargesAmount = Math.max(0, interest + effectiveLateFee);
                const displayedAmount = showCustomAmount
                    ? (Number(receiptAmount) || 0)
                    : quickMode === 'CUSTOM'
                    ? (Number(receiptAmount) || 0)
                    : quickMode === 'INTEREST_ONLY'
                        ? interest
                        : quickMode === 'CHARGES_ONLY'
                            ? chargesAmount
                            : totalAmount;
                const canReceiveInterestOnly = interest > 0.05 && principal > 0.05;
                const canReceiveChargesOnly = chargesAmount > 0.05 && principal > 0.05;
                const hasActiveOffer = activeOfferAmount > 0.05;
                const forgivenessMode = appliedLateFeeForgiveness > ZERO_BALANCE_THRESHOLD
                    ? 'FINE_AND_MORA' as const
                    : 'NONE' as const;
                const isPartialPayment = displayedAmount > 0.05
                    && displayedAmount < totalAmount - ZERO_BALANCE_THRESHOLD;
                const canRenewWithPending = ['MONTHLY', 'GIRO', 'REVOLVING'].includes(String(loan.billingCycle || '').toUpperCase());
                const isOnline = typeof navigator === 'undefined' || navigator.onLine;
                const remainingAfterInput = Math.max(0, totalAmount - displayedAmount);
                const cycle = String(loan.billingCycle || '').toUpperCase();
                const modalityRule = cycle === 'MONTHLY' || cycle === 'GIRO' || cycle === 'REVOLVING'
                    ? { name: 'Mensal · ciclo de 30 dias', rule: 'O saldo permanece ligado ao vencimento atual. A data só avança quando você escolher criar um novo ciclo; sem essa escolha, um atraso existente continua contando.' }
                    : cycle === 'INSTALLMENT_FIXED'
                        ? { name: 'Parcelado · datas definidas', rule: 'Cada parcela tem seu próprio valor e vencimento. Este recebimento reduz apenas a parcela selecionada e não altera automaticamente as demais.' }
                        : cycle === 'DAILY_FREE' || cycle === 'DAILY_FIXED'
                            ? { name: 'Diária · cobrança por dia', rule: 'Os encargos acompanham os dias em aberto. O valor recebido reduz a dívida de hoje; encargos restantes não viram capital automaticamente.' }
                            : cycle === 'DAILY_FIXED_TERM'
                                ? { name: 'Prazo fixo · data contratada', rule: 'O contrato vence na data combinada. Um recebimento parcial reduz o saldo, mas não muda o prazo nem cria uma nova cobrança automaticamente.' }
                                : { name: 'Contrato anterior', rule: 'O sistema preserva os valores e datas já registrados. Confira o resultado da revisão antes de concluir o recebimento.' };

                const partialChoices: Array<{
                    value: PartialBalanceAction;
                    title: string;
                    detail: string;
                    activeClass: string;
                    disabled?: boolean;
                }> = [
                    {
                        value: 'CAPITALIZE',
                        title: 'Somar restante ao capital',
                        detail: 'O que faltar dos juros entra no saldo principal e o próximo ciclo é calculado sobre o novo valor.',
                        activeClass: 'bg-blue-600/20 text-blue-300 border-blue-500/50'
                    },
                    {
                        value: 'KEEP_PENDING',
                        title: 'Manter restante pendente',
                        detail: 'O valor que faltar continua separado para cobrança posterior, sem virar capital.',
                        activeClass: 'bg-violet-600/20 text-violet-300 border-violet-500/50'
                    },
                    {
                        value: 'SETTLE',
                        title: 'Renovar com desconto',
                        detail: 'Aceita o valor recebido, registra o restante como desconto e inicia o próximo ciclo.',
                        activeClass: 'bg-amber-600/20 text-amber-300 border-amber-500/50',
                        disabled: !canRenewWithPending || !isOnline
                    },
                ];

                if (showCustomAmount && chargesAmount <= ZERO_BALANCE_THRESHOLD && principal > ZERO_BALANCE_THRESHOLD) {
                    partialChoices.push({
                        value: 'PRINCIPAL_REDUCTION',
                        title: 'Abater capital',
                        detail: 'O valor informado reduz diretamente o principal, sem criar outro vencimento.',
                        activeClass: 'bg-violet-600/20 text-violet-300 border-violet-500/50',
                    });
                }


    const receiptEffect = displayedAmount >= totalAmount - ZERO_BALANCE_THRESHOLD
        ? 'Este valor encerra a parcela.'
        : displayedAmount <= ZERO_BALANCE_THRESHOLD
            ? 'Informe um valor para ver como ele será aplicado.'
            : displayedAmount < interest - ZERO_BALANCE_THRESHOLD
                ? `Este valor abate parte dos juros. Ainda faltam ${formatMoney(interest - displayedAmount)} em juros.`
                : displayedAmount <= interest + ZERO_BALANCE_THRESHOLD
                    ? 'Este valor cobre os juros. O capital continua aberto.'
                    : `Este valor cobre os encargos e abate ${formatMoney(Math.min(principal, displayedAmount - interest))} do capital.`;

    const automaticDecision = resolveReceiptDecision({ amountReceived: displayedAmount, principal, interest, lateFee: effectiveLateFee, billingCycle: loan.billingCycle });
    return { principal, interest, lateFee, appliedLateFeeForgiveness, effectiveLateFee, activeOfferAmount, totalAmount, chargesAmount, displayedAmount, canReceiveInterestOnly, canReceiveChargesOnly, hasActiveOffer, forgivenessMode, isPartialPayment, canRenewWithPending, isOnline, remainingAfterInput, modalityRule, partialChoices, receiptEffect, automaticDecision };
}
