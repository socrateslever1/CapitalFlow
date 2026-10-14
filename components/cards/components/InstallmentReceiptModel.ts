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
    manualDate?: Date | null;
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

export function calculateReceiptForTargetBalance(totalAmount: number, targetBalance: number): number | null {
    const total = Math.max(0, Number(totalAmount) || 0);
    const target = Number(targetBalance);
    if (!Number.isFinite(target) || target < 0 || target > total + ZERO_BALANCE_THRESHOLD) return null;
    return Math.max(0, Math.round((total - target + Number.EPSILON) * 100) / 100);
}

/** Prepara a janela de recebimento sem movimentar caixa ou alterar parcelas. */
export function buildInstallmentReceiptModel(params: {
    loan: Loan;
    selectedInst: Installment;
    selectedDebt: any;
    lateFeeForgiven: number;
    quickMode: QuickMode;
    receiptAmount: string;
    showCustomAmount?: boolean;
}) {
    const {
        loan,
        selectedInst,
        selectedDebt,
        lateFeeForgiven,
        quickMode,
        receiptAmount,
        showCustomAmount = false,
    } = params;

    const principal = Math.max(0, Number(selectedDebt?.principal ?? selectedInst.principalRemaining ?? 0) || 0);
    const interest = Math.max(0, Number(selectedDebt?.interest ?? selectedInst.interestRemaining ?? 0) || 0);
    const lateFee = Math.max(0, Number(selectedDebt?.lateFee ?? selectedInst.lateFeeAccrued ?? 0) || 0);
    const appliedLateFeeForgiveness = Math.min(lateFee, Math.max(0, lateFeeForgiven));
    const effectiveLateFee = Math.max(0, lateFee - appliedLateFeeForgiveness);

    const activeOfferAmount = String(selectedInst.paymentOfferStatus || '') === 'ACTIVE'
        && String(selectedInst.paymentOfferValidUntil || '') >= new Date().toISOString().slice(0, 10)
        ? Number(selectedInst.paymentOfferAmount || 0)
        : 0;
    const hasActiveOffer = activeOfferAmount > ZERO_BALANCE_THRESHOLD;

    const totalAmount = hasActiveOffer
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

    const canReceiveInterestOnly = interest > ZERO_BALANCE_THRESHOLD && principal > ZERO_BALANCE_THRESHOLD;
    // Só há um segundo atalho quando existe atraso efetivo. Após dispensar todo o atraso,
    // "juros + atraso" seria idêntico a "somente juros" e portanto fica oculto.
    const canReceiveChargesOnly = effectiveLateFee > ZERO_BALANCE_THRESHOLD
        && chargesAmount > interest + ZERO_BALANCE_THRESHOLD
        && principal > ZERO_BALANCE_THRESHOLD;

    const forgivenessMode = appliedLateFeeForgiveness > ZERO_BALANCE_THRESHOLD
        ? 'FINE_AND_MORA' as const
        : 'NONE' as const;
    const isPartialPayment = displayedAmount > ZERO_BALANCE_THRESHOLD
        && displayedAmount < totalAmount - ZERO_BALANCE_THRESHOLD;
    const isOnline = typeof navigator === 'undefined' || navigator.onLine;
    const remainingAfterInput = Math.max(0, totalAmount - displayedAmount);
    const missingInterestAmount = Math.max(0, interest - displayedAmount);

    const cycle = String(loan.billingCycle || '').toUpperCase();
    const modalityRule = cycle === 'MONTHLY' || cycle === 'GIRO' || cycle === 'REVOLVING'
        ? { name: 'Mensal · 30 dias', rule: 'O sistema distribui o valor recebido entre juros, atraso e capital. Só pede uma decisão extra quando o valor não cobre nem os juros do ciclo.' }
        : cycle === 'INSTALLMENT_FIXED'
            ? { name: 'Parcelado · datas fixas', rule: 'Cada parcela é tratada separadamente e os vencimentos futuros não mudam com o recebimento desta parcela.' }
            : cycle === 'DAILY_FREE' || cycle === 'DAILY_FIXED'
                ? { name: 'Diária', rule: 'O recebimento segue os dias configurados no contrato e o saldo é atualizado pelo motor financeiro.' }
                : cycle === 'DAILY_FIXED_TERM'
                    ? { name: 'Diária · prazo fixo', rule: 'O contrato tem término definido e o recebimento reduz a obrigação em aberto sem criar cobrança paralela.' }
                    : { name: 'Contrato', rule: 'O valor é distribuído automaticamente conforme a composição atual da dívida.' };

    const hasPaidInterest = Number(selectedInst.paidInterest || 0) > ZERO_BALANCE_THRESHOLD
        || interest <= ZERO_BALANCE_THRESHOLD;
    const interestDate = (hasPaidInterest && (selectedInst.paidDate || (selectedInst as any).last_payment_date || (selectedInst as any).lastPaymentDate))
        ? (selectedInst.paidDate || (selectedInst as any).last_payment_date || (selectedInst as any).lastPaymentDate)
        : selectedInst.dueDate;
    const daysFromInterestDate = interestDate ? getDaysDiff(interestDate) : 0;
    const isDirectCapitalReduction = daysFromInterestDate <= 10;
    const canAbatePrincipal = principal > ZERO_BALANCE_THRESHOLD;

    const automaticDecision = resolveReceiptDecision({
        amountReceived: displayedAmount,
        principal,
        interest,
        lateFee: effectiveLateFee,
        billingCycle: loan.billingCycle,
    });
    const needsBusinessChoice = !hasActiveOffer
        && quickMode !== 'PRINCIPAL_REDUCTION'
        && automaticDecision.needsBusinessChoice;

    let receiptEffect = 'Informe o valor recebido para ver o efeito antes de registrar.';
    if (quickMode === 'PRINCIPAL_REDUCTION') {
        if (displayedAmount <= ZERO_BALANCE_THRESHOLD) {
            receiptEffect = isDirectCapitalReduction
                ? 'Informe quanto será abatido diretamente do capital, sem mudar vencimento ou ciclo.'
                : 'Informe o valor. O sistema quita os encargos em aberto e aplica o excedente ao capital.';
        } else if (isDirectCapitalReduction) {
            receiptEffect = `Abate ${formatMoney(Math.min(principal, displayedAmount))} diretamente do capital, sem mudar vencimento ou ciclo.`;
        } else if (displayedAmount <= interest + ZERO_BALANCE_THRESHOLD) {
            receiptEffect = `Recebe ${formatMoney(displayedAmount)} dos juros em aberto; o capital não é reduzido.`;
        } else {
            receiptEffect = `Quita os juros e abate ${formatMoney(Math.min(principal, Math.max(0, displayedAmount - interest)))} do capital.`;
        }
    } else if (displayedAmount >= totalAmount - ZERO_BALANCE_THRESHOLD && totalAmount > ZERO_BALANCE_THRESHOLD) {
        receiptEffect = principal > 0 && chargesAmount > 0
            ? `Quita esta parcela: ${formatMoney(principal)} de capital + ${formatMoney(chargesAmount)} de encargos.`
            : `Quita o saldo de ${formatMoney(totalAmount)} desta parcela.`;
    } else if (displayedAmount > ZERO_BALANCE_THRESHOLD && displayedAmount < interest - ZERO_BALANCE_THRESHOLD) {
        receiptEffect = `Recebe ${formatMoney(displayedAmount)} dos juros. Ainda faltam ${formatMoney(missingInterestAmount)} de juros; escolha abaixo o que fazer com essa diferença.`;
    } else if (
        effectiveLateFee > ZERO_BALANCE_THRESHOLD
        && displayedAmount >= interest - ZERO_BALANCE_THRESHOLD
        && displayedAmount < chargesAmount - ZERO_BALANCE_THRESHOLD
    ) {
        const latePaid = Math.max(0, displayedAmount - interest);
        const lateRemaining = Math.max(0, effectiveLateFee - latePaid);
        receiptEffect = latePaid <= ZERO_BALANCE_THRESHOLD
            ? `Quita os juros. O atraso de ${formatMoney(lateRemaining)} continua pendente no vencimento atual.`
            : `Quita os juros e recebe ${formatMoney(latePaid)} do atraso. Ainda ficam ${formatMoney(lateRemaining)} de atraso no vencimento atual.`;
    } else if (displayedAmount <= chargesAmount + ZERO_BALANCE_THRESHOLD && chargesAmount > ZERO_BALANCE_THRESHOLD) {
        receiptEffect = automaticDecision.operationType === 'RENEW_KEEP_PENDING'
            ? `Quita os encargos do ciclo e renova o vencimento. O capital de ${formatMoney(principal)} permanece em aberto.`
            : `Quita os encargos cobertos pelo valor informado. O capital de ${formatMoney(principal)} permanece em aberto.`;
    } else if (displayedAmount > chargesAmount + ZERO_BALANCE_THRESHOLD) {
        const capitalReduction = Math.min(principal, Math.max(0, displayedAmount - chargesAmount));
        receiptEffect = `Quita os encargos e abate ${formatMoney(capitalReduction)} do capital. O sistema aplica o restante automaticamente.`;
    }

    return {
        principal,
        interest,
        lateFee,
        appliedLateFeeForgiveness,
        effectiveLateFee,
        activeOfferAmount,
        totalAmount,
        chargesAmount,
        displayedAmount,
        canReceiveInterestOnly,
        canReceiveChargesOnly,
        hasActiveOffer,
        forgivenessMode,
        isPartialPayment,
        isOnline,
        remainingAfterInput,
        missingInterestAmount,
        needsBusinessChoice,
        modalityRule,
        receiptEffect,
        automaticDecision,
        canAbatePrincipal,
        isDirectCapitalReduction,
        hasPaidInterest,
        daysFromInterestDate,
    };
}
