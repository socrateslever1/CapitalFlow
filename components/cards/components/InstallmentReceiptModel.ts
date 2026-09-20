import type { Loan, Installment } from '../../../types';
import { ZERO_BALANCE_THRESHOLD } from '../../../domain/finance/calculations';
import { getDaysDiff } from '../../../utils/dateHelpers';

export type PartialBalanceAction = 'KEEP_PENDING' | 'CAPITALIZE' | 'RENEW_KEEP_PENDING' | 'SETTLE';
export type QuickMode = 'TOTAL' | 'CUSTOM' | 'INTEREST_ONLY' | 'CHARGES_ONLY';
export type QuickPaymentOptions = {
    forgivenessMode?: 'NONE' | 'FINE_ONLY' | 'MORA_ONLY' | 'FINE_AND_MORA' | 'TOTAL_CHARGES' | 'CAPITAL_ONLY' | 'INTEREST_ONLY' | 'BOTH';
    lateFeeForgiven?: number;
    partialBalanceAction?: PartialBalanceAction;
};

/** Preparação pura da janela rápida: não movimenta caixa nem altera parcelas. */
export function buildInstallmentReceiptModel(params: {
    loan: Loan;
    selectedInst: Installment;
    selectedDebt: any;
    lateFeeForgiven: number;
    quickMode: QuickMode;
    receiptAmount: string;
}) {
    const { loan, selectedInst, selectedDebt, lateFeeForgiven, quickMode, receiptAmount } = params;
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
                const displayedAmount = quickMode === 'CUSTOM'
                    ? (Number(receiptAmount) || 0)
                    : quickMode === 'INTEREST_ONLY'
                        ? interest
                        : quickMode === 'CHARGES_ONLY'
                            ? chargesAmount
                            : totalAmount;
                const canReceiveInterestOnly = interest > 0.05 && principal > 0.05;
                const canReceiveChargesOnly = chargesAmount > 0.05 && principal > 0.05;
                const hasActiveOffer = activeOfferAmount > 0.05;
                const forgivenessMode = 'NONE' as const;
                const isPartialPayment = displayedAmount > 0.05
                    && displayedAmount < totalAmount - ZERO_BALANCE_THRESHOLD;
                const canRenewWithPending = ['MONTHLY', 'GIRO', 'REVOLVING'].includes(String(loan.billingCycle || '').toUpperCase());
                const isOnline = typeof navigator === 'undefined' || navigator.onLine;
                const remainingAfterInput = Math.max(0, totalAmount - displayedAmount);
                const dueDate = String((selectedInst as any).dueDate ?? (selectedInst as any).due_date ?? (selectedInst as any).data_vencimento ?? '');
                const daysLate = dueDate ? Math.max(0, getDaysDiff(dueDate)) : 0;
                const cycle = String(loan.billingCycle || '').toUpperCase();
                const modalityRule = cycle === 'MONTHLY' || cycle === 'GIRO' || cycle === 'REVOLVING'
                    ? { name: 'Mensal', rule: 'Juros vencidos pagos: +30 dias desde o vencimento anterior. Só juros + multa/mora integralmente pagos reiniciam +30 dias da data do pagamento. Saldo não vira capital sem sua escolha.' }
                    : cycle === 'INSTALLMENT_FIXED'
                        ? { name: 'Parcelado', rule: 'Cada parcela mantém capital e juros contratados. Pagamento abate a parcela; não cria novo ciclo mensal nem capitaliza encargos automaticamente.' }
                        : cycle === 'DAILY_FREE' || cycle === 'DAILY_FIXED'
                            ? { name: 'Diária Livre', rule: 'Juros são proporcionais aos dias em aberto. Recebimento abate os componentes devidos sem transformar juros em capital automaticamente.' }
                            : cycle === 'DAILY_FIXED_TERM'
                                ? { name: 'Prazo Fixo', rule: 'Parcela e vencimento seguem o prazo contratado. O recebimento não recalcula a obrigação como Mensal.' }
                                : { name: 'Legada', rule: 'Modalidade antiga mantida por compatibilidade. O recebimento preserva os componentes existentes e não capitaliza saldo sem ordem explícita.' };

                const partialChoices: Array<{
                    value: PartialBalanceAction;
                    title: string;
                    detail: string;
                    activeClass: string;
                    disabled?: boolean;
                }> = [
                    {
                        value: 'KEEP_PENDING',
                        title: 'Deixar pendente',
                        detail: 'Mantém o saldo e o vencimento para quitação depois.',
                        activeClass: 'bg-blue-600/20 text-blue-300 border-blue-500/50'
                    },
                    {
                        value: 'CAPITALIZE',
                        title: 'Capitalizar saldo',
                        detail: 'Juros/encargos restantes viram capital em aberto.',
                        activeClass: 'bg-violet-600/20 text-violet-300 border-violet-500/50'
                    },
                    {
                        value: 'RENEW_KEEP_PENDING',
                        title: 'Renovar mesmo parcial',
                        detail: 'Avança 30 dias desde o vencimento anterior e mantém o saldo pendente sem gerar outro juro cheio.',
                        activeClass: 'bg-amber-600/20 text-amber-300 border-amber-500/50',
                        disabled: !canRenewWithPending
                    },
                    {
                        value: 'SETTLE',
                        title: 'Quitar por acordo',
                        detail: 'Aceita este valor e registra o restante como desconto de quitação.',
                        activeClass: 'bg-emerald-600/20 text-emerald-300 border-emerald-500/50',
                        disabled: !isOnline
                    }
                ];


    return { principal, interest, lateFee, appliedLateFeeForgiveness, effectiveLateFee, activeOfferAmount, totalAmount, chargesAmount, displayedAmount, canReceiveInterestOnly, canReceiveChargesOnly, hasActiveOffer, forgivenessMode, isPartialPayment, canRenewWithPending, isOnline, remainingAfterInput, daysLate, modalityRule, partialChoices };
}
