/**
 * Hook customizado useContractDetailsState.
 * Responsável por gerenciar o estado interno, cálculos financeiros de atraso,
 * agrupamento de extratos (ledger) e regras de validação para a visualização
 * de detalhes do contrato e registro de pagamentos.
 */

import { useState, useMemo } from 'react';
import { Loan, Installment, LedgerEntry } from '../../types';
import { loanEngine } from '../../domain/loanEngine';
import { getLoanInterestReconciliationDelta, getLoanPrincipalReconciliationDelta } from '../../domain/finance/calculations';
import { usePaymentManagerState, ForgivenessMode } from '../../components/modals/payment/hooks/usePaymentManagerState';
import { formatBRDate, parseDateOnlyUTC, todayDateOnlyUTC } from '../../utils/dateHelpers';
import { isInstallmentOpen, isPaidStatus } from '../../utils/loanStatus';

interface UseContractDetailsStateProps {
    loanId: string;
    loans: Loan[];
    onPayment: (
        forgivePenalty: ForgivenessMode,
        manualDate?: Date | null,
        amountPaid?: number,
        realDate?: Date | null,
        interestHandling?: 'CAPITALIZE' | 'KEEP_PENDING',
        contextOverride?: { loan: Loan; inst: Installment; calculations: any }
    ) => Promise<void>;
}

export const useContractDetailsState = ({ loanId, loans, onPayment }: UseContractDetailsStateProps) => {
    const loan = useMemo(() => loans.find(l => l.id === loanId), [loans, loanId]);

    const [avAmount, setAvAmount] = useState('');
    const [paymentType, setPaymentType] = useState<any>('RENEW_AV');

    // Cálculos para o hook usePaymentManagerState
    const data = useMemo(() => {
        if (!loan) return null;
        const bal = loanEngine.computeRemainingBalance(loan);
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
    }, [loan]);

    const delayDetails = useMemo(() => {
        if (!loan) return null;
        const today = todayDateOnlyUTC();
        const installments = loan.installments || [];

        const lateInstallments = installments.filter(inst => {
            const due = parseDateOnlyUTC(inst.dueDate);
            return isInstallmentOpen(inst) && due.getTime() < today.getTime();
        }).sort((a, b) => parseDateOnlyUTC(a.dueDate).getTime() - parseDateOnlyUTC(b.dueDate).getTime());

        if (lateInstallments.length === 0) return null;

        return {
            totalMonths: lateInstallments.length,
            items: lateInstallments.map(inst => ({
                number: inst.number || 0,
                dueDate: inst.dueDate,
                total: (inst.principalRemaining || inst.amount || 0) + (inst.lateFeeAccrued || 0) + (inst.interestRemaining || 0),
                principal: inst.principalRemaining || inst.amount || 0,
                interest: (inst.lateFeeAccrued || 0) + (inst.interestRemaining || 0)
            }))
        };
    }, [loan]);

    const {
        manualDateStr, setManualDateStr,
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
        setAvAmount
    });

    const groupedLedger: Record<string, LedgerEntry[]> = useMemo(() => {
        if (!loan || !loan.ledger) return {};
        const groups: Record<string, LedgerEntry[]> = {};
        const sorted = [...loan.ledger].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        sorted.forEach(entry => {
            const date = new Date(entry.date);
            const dateKey = date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
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
        const nextDueDate = manualDateStr ? parseDateOnlyUTC(manualDateStr) : null;
        const realPaymentDate = realPaymentDateStr ? parseDateOnlyUTC(realPaymentDateStr) : new Date();
        onPayment(forgivenessMode, nextDueDate, val, realPaymentDate, interestHandling, data || undefined);
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
