/**
 * Hook customizado useContractDetailsState.
 * Responsável por gerenciar o estado interno, cálculos financeiros de atraso,
 * agrupamento de extratos (ledger) e regras de validação para a visualização
 * de detalhes do contrato e registro de pagamentos.
 */

import { useState, useMemo, useEffect } from 'react';
import { Loan, Installment, LedgerEntry } from '../../types';
import { loanEngine } from '../../domain/loanEngine';
import {
    getLoanInterestReconciliationDelta,
    getLoanPrincipalReconciliationDelta,
    hasActiveAgreement,
    isAgreementInstallmentPaid,
    calculateAgreementInstallmentLateFee,
    isInstallmentPaid
} from '../../domain/finance/calculations';
import { usePaymentManagerState, ForgivenessMode, InterestHandling } from '../../components/modals/payment/hooks/usePaymentManagerState';
import { formatBRDate, parseDateOnlyUTC, todayDateOnlyUTC } from '../../utils/dateHelpers';
import { isInstallmentOpen, isPaidStatus } from '../../utils/loanStatus';
import { getLedgerDisplayEvents } from '../../utils/ledgerPresentation';

interface UseContractDetailsStateProps {
    loanId: string;
    loans: Loan[];
    onPayment: (
        forgivePenalty: ForgivenessMode,
        manualDate?: Date | null,
        amountPaid?: number,
        realDate?: Date | null,
        interestHandling?: InterestHandling,
        contextOverride?: { loan: Loan; inst: Installment; calculations: any },
        lateFeeForgiven?: number
    ) => Promise<void>;
    onAgreementPayment?: (loan: Loan, agreement: any, inst: any, amount?: number, forgiveLateFee?: boolean) => void;
}

export const useContractDetailsState = ({ loanId, loans, onPayment, onAgreementPayment }: UseContractDetailsStateProps) => {
    const loan = useMemo(() => loans.find(l => l.id === loanId), [loans, loanId]);

    const [avAmount, setAvAmount] = useState('');
    const [lateFeeForgiven, setLateFeeForgiven] = useState(0);
    useEffect(() => { setLateFeeForgiven(0); }, [loanId]);
    const [paymentType, setPaymentType] = useState<any>('RENEW_AV');

    const hasActiveAgr = loan ? hasActiveAgreement(loan) : false;
    const activeAgreementInst = (hasActiveAgr && Array.isArray(loan?.activeAgreement?.installments))
        ? (loan.activeAgreement.installments.find(i => !isAgreementInstallmentPaid(i, loan?.status)) || loan.activeAgreement.installments[0])
        : null;

    const data = useMemo(() => {
        if (!loan) return null;
        const bal = loanEngine.computeRemainingBalance(loan);

        if (hasActiveAgr && activeAgreementInst) {
            const amount = Number(activeAgreementInst.amount || 0);
            const paidAmount = Number(activeAgreementInst.paidAmount || 0);
            const principalRemaining = Math.max(0, amount - paidAmount);
            const lateFee = isAgreementInstallmentPaid(activeAgreementInst, loan.status) ? 0 : calculateAgreementInstallmentLateFee(activeAgreementInst);
            const agrInst = {
                id: activeAgreementInst.id,
                agreementId: activeAgreementInst.agreementId,
                loanId: loan.id,
                number: activeAgreementInst.number,
                dueDate: activeAgreementInst.dueDate,
                amount: amount,
                principalRemaining: principalRemaining,
                scheduledPrincipal: amount,
                interestRemaining: 0,
                scheduledInterest: 0,
                lateFeeAccrued: lateFee,
                paidLateFee: 0,
                status: activeAgreementInst.status,
                paidAmount: paidAmount
            } as unknown as Installment;

            return {
                loan,
                inst: agrInst,
                calculations: {
                    total: bal.totalRemaining,
                    principal: bal.principalRemaining,
                    interest: bal.interestRemaining,
                    lateFee: bal.lateFeeRemaining
                }
            };
        }

        const principalDelta = getLoanPrincipalReconciliationDelta(loan);
        const interestDelta = getLoanInterestReconciliationDelta(loan);
        const baseInst = loan.installments.find(isInstallmentOpen) || loan.installments[0] || {} as Installment;
        const adjustedInst = principalDelta > 0.5 || interestDelta > 0.5
            ? {
                ...baseInst,
                principalRemaining: Number((baseInst as any).principalRemaining || 0) + principalDelta,
                scheduledPrincipal: Number((baseInst as any).scheduledPrincipal || 0) + principalDelta,
                interestRemaining: Number((baseInst as any).interestRemaining || 0) + interestDelta,
                scheduledInterest: Number((baseInst as any).scheduledInterest || 0) + interestDelta,
                amount: Number((baseInst as any).amount || 0) + principalDelta + interestDelta,
            } as Installment
            : baseInst;
        return {
            loan,
            inst: adjustedInst,
            calculations: {
                total: bal.totalRemaining,
                principal: bal.principalRemaining,
                interest: bal.interestRemaining,
                lateFee: bal.lateFeeRemaining
            }
        };
    }, [loan, hasActiveAgr, activeAgreementInst]);

    const delayDetails = useMemo(() => {
        if (!loan) return null;
        const today = todayDateOnlyUTC();
        const installments = (hasActiveAgreement(loan) && Array.isArray(loan.activeAgreement?.installments))
            ? loan.activeAgreement.installments
            : (loan.installments || []);
        const lateInstallments = installments.filter((inst: any) => {
            const due = parseDateOnlyUTC(inst.dueDate);
            const isPaid = isInstallmentPaid(inst, loan.status);
            return !isPaid && due.getTime() < today.getTime();
        }).sort((a: any, b: any) => parseDateOnlyUTC(a.dueDate).getTime() - parseDateOnlyUTC(b.dueDate).getTime());
        if (lateInstallments.length === 0) return null;
        const maxDaysLate = lateInstallments.reduce((max: number, inst: any) => {
            const daysLate = Math.max(0, Math.floor((today.getTime() - parseDateOnlyUTC(inst.dueDate).getTime()) / 86400000));
            return Math.max(max, daysLate);
        }, 0);

        return {
            totalDaysLate: maxDaysLate,
            items: lateInstallments.map((inst: any) => {
                const isAgr = !!(inst.agreementId || inst.acordo_id || hasActiveAgreement(loan));
                const paidAmt = Number(inst.paidAmount ?? inst.paid_amount ?? 0);
                const prin = isAgr
                    ? Math.max(0, Number(inst.amount || 0) - paidAmt)
                    : (inst.principalRemaining || inst.amount || 0);
                const lateFee = isAgr
                    ? calculateAgreementInstallmentLateFee(inst)
                    : ((inst.lateFeeAccrued || 0) + (inst.interestRemaining || 0));
                return {
                    number: inst.number || 0,
                    dueDate: inst.dueDate,
                    total: prin + lateFee,
                    principal: prin,
                    interest: lateFee
                };
            })
        };
    }, [loan]);

    const {
        manualDateStr, setManualDateStr, manualDateEdited,
        realPaymentDateStr, setRealPaymentDateStr,
        forgivenessMode, setForgivenessMode,
        interestHandling, setInterestHandling,
        debtBreakdown,
        resolvedBillingCycle,
        subMode, setSubMode
    } = usePaymentManagerState({
        data,
        paymentType,
        setPaymentType,
        avAmount,
        setAvAmount,
        lateFeeForgiven
    });

    const groupedLedger: Record<string, LedgerEntry[]> = useMemo(() => {
        if (!loan || !loan.ledger) return {};
        const groups: Record<string, LedgerEntry[]> = {};
        // Consistent with the card: group only payments with the same persisted key.
        // Preserve accounting date literally (UTC midnight must not become the previous day).
        const sorted = getLedgerDisplayEvents(loan.ledger);
        sorted.forEach(entry => {
            const dateKey = formatBRDate(entry.date);
            if (!groups[dateKey]) groups[dateKey] = [];
            groups[dateKey].push(entry);
        });
        return groups;
    }, [loan?.ledger]);

    const safeParse = (val: string) => {
        if (!val) return 0;
        const str = String(val).trim();
        if (str.includes('.') && str.includes(',')) return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
        if (str.includes(',')) return parseFloat(str.replace(',', '.')) || 0;
        return parseFloat(str) || 0;
    };

    const totalInterestDue = debtBreakdown.interest + debtBreakdown.fine + debtBreakdown.dailyMora;
    const amountEntering = safeParse(avAmount);
    const showInterestDecision = Math.max(0, totalInterestDue - amountEntering) > 0.05;

    const handleConfirm = () => {
        const val = safeParse(avAmount);
        if (val <= 0) return;
        if (hasActiveAgr && loan?.activeAgreement && activeAgreementInst && onAgreementPayment) {
            const forgiveLateFee = lateFeeForgiven > 0 || forgivenessMode === 'FINE_ONLY' || forgivenessMode === 'MORA_ONLY' || forgivenessMode === 'FINE_AND_MORA' || forgivenessMode === 'TOTAL_CHARGES' || forgivenessMode === 'BOTH';
            onAgreementPayment(loan, loan.activeAgreement, activeAgreementInst, val, forgiveLateFee);
            return;
        }
        const nextDueDate = manualDateEdited && manualDateStr ? parseDateOnlyUTC(manualDateStr) : null;
        const realPaymentDate = realPaymentDateStr ? parseDateOnlyUTC(realPaymentDateStr) : new Date();
        onPayment(forgivenessMode, nextDueDate, val, realPaymentDate, interestHandling, data || undefined, lateFeeForgiven);
    };

    const status = loan ? loanEngine.computeLoanStatus(loan) : 'ACTIVE';
    const statusColor = status === 'PAID' ? 'bg-emerald-500' : status === 'OVERDUE' ? 'bg-rose-500' : 'bg-blue-500';

    const nextDueDateDisplay = useMemo(() => {
        if (!loan) return 'N/A';
        if (loan.activeAgreement && loan.activeAgreement.installments) {
            const nextAgreementInst = loan.activeAgreement.installments.find(i => !isPaidStatus(i.status));
            if (nextAgreementInst) return formatBRDate(nextAgreementInst.dueDate);
        }
        const nextLoanInst = loan.installments.find(isInstallmentOpen);
        if (nextLoanInst) return formatBRDate(nextLoanInst.dueDate);
        return 'N/A';
    }, [loan]);

    return {
        loan,
        avAmount,
        setAvAmount,
        lateFeeForgiven,
        setLateFeeForgiven,
        paymentType,
        setPaymentType,
        data,
        delayDetails,
        groupedLedger,
        manualDateStr,
        setManualDateStr,
        realPaymentDateStr,
        setRealPaymentDateStr,
        forgivenessMode,
        setForgivenessMode,
        interestHandling,
        setInterestHandling,
        debtBreakdown,
        resolvedBillingCycle,
        subMode,
        setSubMode,
        safeParse,
        totalInterestDue,
        amountEntering,
        showInterestDecision,
        handleConfirm,
        status,
        statusColor,
        nextDueDateDisplay
    };
};
