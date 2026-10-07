import type { Loan, Installment } from '../../../types';
import { ZERO_BALANCE_THRESHOLD } from '../../../domain/finance/calculations';
import { formatMoney } from '../../../utils/formatters';
import type { FinancialOperationResult, FinancialPaymentMethod } from '../../../services/payments/paymentEngineV4';
import { resolveReceiptDecision } from '../../../services/payments/receiptDecision';
import { getDaysDiff } from '../../../utils/dateHelpers';

export type PartialBalanceAction = 'KEEP_PENDING' | 'CAPITALIZE' | 'RENEW_KEEP_PENDING' | 'SETTLE' | 'PRINCIPAL_REDUCTION';
export type QuickMode = 'TOTAL' | 'CUSTOM' | 'INTEREST_ONLY' | 'CHARGES_ONLY' | 'PRINCIPAL_REDUCTION';
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
                    : quickMode === 'CUSTOM' || quickMode === 'PRINCIPAL_REDUCTION'
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
                    ? { name: 'Mensal · Ciclo de 30 dias', rule: 'Cobrança mensal com apuração a cada 30 dias. O recebimento pode quitar a parcela inteira, amortizar o capital emprestado ou renovar os encargos para o mês seguinte.' }
                    : cycle === 'INSTALLMENT_FIXED'
                        ? { name: 'Parcelado · Parcelas fixas', rule: 'Cronograma com parcelas e datas pré-fixadas. O pagamento quita ou amortiza a parcela selecionada sem alterar os vencimentos futuros.' }
                        : cycle === 'DAILY_FREE' || cycle === 'DAILY_FIXED'
                            ? { name: 'Diária · Dias corridos', rule: 'Cobrança diária calculada por dias corridos. O valor recebido quita os encargos acumulados e amortiza o capital devedor sem juros ocultos.' }
                            : cycle === 'DAILY_FIXED_TERM'
                                ? { name: 'Prazo fixo · Término determinado', rule: 'Contrato com prazo fixo e término determinado. O valor recebido amortiza a dívida ativa dentro da vigência contratada.' }
                                : { name: 'Contrato padrão', rule: 'Valores apurados com base no saldo devedor atualizado. Confira a discriminação detalhada antes de efetivar o recebimento.' };

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


    const hasPaidInterest = Number(selectedInst.paidInterest || 0) > ZERO_BALANCE_THRESHOLD || interest <= ZERO_BALANCE_THRESHOLD;
    const interestDate = (hasPaidInterest && (selectedInst.paidDate || (selectedInst as any).last_payment_date || (selectedInst as any).lastPaymentDate))
        ? (selectedInst.paidDate || (selectedInst as any).last_payment_date || (selectedInst as any).lastPaymentDate)
        : selectedInst.dueDate;
    const daysFromInterestDate = interestDate ? getDaysDiff(interestDate) : 0;
    const isDirectCapitalReduction = daysFromInterestDate <= 10;
    const canAbatePrincipal = principal > ZERO_BALANCE_THRESHOLD;

    const receiptEffect = quickMode === 'PRINCIPAL_REDUCTION'
        ? (displayedAmount > 0
            ? (isDirectCapitalReduction
                ? `Este valor abate ${formatMoney(Math.min(principal, displayedAmount))} diretamente do capital sem alterar vencimento nem ciclo.`
                : (interest > ZERO_BALANCE_THRESHOLD
                    ? (displayedAmount <= interest + ZERO_BALANCE_THRESHOLD
                        ? `Este valor abate ${formatMoney(displayedAmount)} dos juros em aberto.`
                        : `Este valor quita os juros (${formatMoney(interest)}) e abate ${formatMoney(Math.min(principal, displayedAmount - interest))} do capital.`)
                    : `Este valor abate ${formatMoney(Math.min(principal, displayedAmount))} diretamente do capital sem alterar vencimento nem ciclo.`))
            : (isDirectCapitalReduction
                ? 'Informe o valor para abatimento direto no capital (período de até 10 dias).'
                : 'Informe o valor para quitar os juros e abater o excedente do capital.'))
        : displayedAmount >= totalAmount - ZERO_BALANCE_THRESHOLD
        ? (principal > 0 && chargesAmount > 0
            ? `Liquidação integral: quita ${formatMoney(principal)} de capital e ${formatMoney(chargesAmount)} de encargos, zerando totalmente esta parcela.`
            : `Liquidação integral: quita o saldo de ${formatMoney(totalAmount)}, encerrando esta parcela com saldo zerado.`)
        : displayedAmount <= ZERO_BALANCE_THRESHOLD
            ? 'Selecione uma opção de recebimento ou informe o valor pago pelo cliente.'
            : displayedAmount < interest - ZERO_BALANCE_THRESHOLD
                ? `Amortização parcial de juros: quita ${formatMoney(displayedAmount)} dos encargos. Restam ${formatMoney(interest - displayedAmount)} em juros pendentes neste ciclo.`
                : displayedAmount <= interest + ZERO_BALANCE_THRESHOLD
                    ? `Quitação de encargos: liquida integralmente os juros (${formatMoney(interest)}). O capital devedor (${formatMoney(principal)}) permanece em aberto para o próximo ciclo.`
                    : `Liquidação mista: quita todos os encargos (${formatMoney(chargesAmount)}) e amortiza ${formatMoney(Math.min(principal, displayedAmount - chargesAmount))} do capital principal.`;

    const automaticDecision = resolveReceiptDecision({ amountReceived: displayedAmount, principal, interest, lateFee: effectiveLateFee, billingCycle: loan.billingCycle });
    return { principal, interest, lateFee, appliedLateFeeForgiveness, effectiveLateFee, activeOfferAmount, totalAmount, chargesAmount, displayedAmount, canReceiveInterestOnly, canReceiveChargesOnly, hasActiveOffer, forgivenessMode, isPartialPayment, canRenewWithPending, isOnline, remainingAfterInput, modalityRule, partialChoices, receiptEffect, automaticDecision, canAbatePrincipal, isDirectCapitalReduction, hasPaidInterest, daysFromInterestDate };
}
