import { useState, useEffect, useCallback, useMemo } from 'react';
import { Agreement, AgreementInstallment } from "../../../types";
import { agreementService } from "../services/agreementService";

interface UseAgreementViewProps {
    agreement: Agreement;
    onUpdate: () => void;
}

const getPaidAmount = (inst: any) => Number(inst?.paidAmount ?? inst?.paid_amount ?? inst?.valor_pago ?? 0) || 0;
const getAmount = (inst: any) => Number(inst?.amount ?? inst?.valor ?? 0) || 0;

export const useAgreementView = ({ agreement, onUpdate }: UseAgreementViewProps) => {
    const [isProcessing, setIsProcessing] = useState(false);
    const [confirmAction, setConfirmAction] = useState<'BREAK' | 'ACTIVATE' | 'PAY' | 'REVERSE' | null>(null);
    const [selectedInst, setSelectedInst] = useState<AgreementInstallment | null>(null);
    const [forgiveLateFee, setForgiveLateFee] = useState<boolean>(false);
    const [paymentAmount, setPaymentAmount] = useState('');
    const [showCustomAmount, setShowCustomAmount] = useState(false);
    const [isEditingSchedule, setIsEditingSchedule] = useState(false);
    const [scheduleFrequency, setScheduleFrequency] = useState<'WEEKLY' | 'BIWEEKLY' | 'MONTHLY'>('MONTHLY');
    const [firstOpenDueDate, setFirstOpenDueDate] = useState('');
    const [scheduleInstallmentValue, setScheduleInstallmentValue] = useState('');

    const paidInstallments = useMemo(() => {
        return (agreement.installments || [])
            .filter(inst => {
                const paidAmount = getPaidAmount(inst);
                const amount = getAmount(inst);
                const status = String(inst?.status || '').toUpperCase();
                return ['PAID', 'PAGO', 'QUITADO', 'QUITADA'].includes(status) || paidAmount + 0.05 >= amount;
            })
            .sort((a, b) => (a?.number || 0) - (b?.number || 0));
    }, [agreement.installments]);

    const openInstallments = useMemo(() => {
        return (agreement.installments || [])
            .filter(inst => {
                const paidAmount = getPaidAmount(inst);
                const amount = getAmount(inst);
                const status = String(inst?.status || '').toUpperCase();
                return !['PAID', 'PAGO', 'QUITADO', 'QUITADA'].includes(status) && paidAmount + 0.05 < amount;
            })
            .sort((a, b) => (a?.number || 0) - (b?.number || 0));
    }, [agreement.installments]);

    const paidTotal = useMemo(() => {
        return (agreement.installments || []).reduce((sum, inst: any) => sum + Math.min(getAmount(inst), getPaidAmount(inst)), 0);
    }, [agreement.installments]);

    const outstandingBalance = useMemo(() => {
        return (agreement.installments || []).reduce((sum, inst: any) => {
            return sum + Math.max(0, getAmount(inst) - getPaidAmount(inst));
        }, 0);
    }, [agreement.installments]);

    const projectedInstallments = useMemo(() => {
        const installmentValue = Number(String(scheduleInstallmentValue).replace(',', '.')) || 0;
        if (installmentValue <= 0 || outstandingBalance <= 0) return 0;
        return Math.ceil((outstandingBalance - 0.000001) / installmentValue);
    }, [scheduleInstallmentValue, outstandingBalance]);

    const projectedLastInstallment = useMemo(() => {
        const installmentValue = Number(String(scheduleInstallmentValue).replace(',', '.')) || 0;
        if (installmentValue <= 0 || projectedInstallments <= 0) return 0;
        const previous = installmentValue * Math.max(0, projectedInstallments - 1);
        return Math.max(0, Number((outstandingBalance - previous).toFixed(2)));
    }, [scheduleInstallmentValue, projectedInstallments, outstandingBalance]);

    useEffect(() => {
        const rawFrequency = String((agreement as any)?.frequency || '').toUpperCase();
        const normalizedFrequency =
            rawFrequency === 'WEEKLY' || rawFrequency === 'SEMANAL' ? 'WEEKLY' :
            rawFrequency === 'BIWEEKLY' || rawFrequency === 'QUINZENAL' ? 'BIWEEKLY' :
            'MONTHLY';
        setScheduleFrequency(normalizedFrequency);
        setFirstOpenDueDate(openInstallments[0]?.dueDate ? String(openInstallments[0].dueDate).slice(0, 10) : '');
        const currentValue = openInstallments[0] ? Math.max(0, getAmount(openInstallments[0]) - getPaidAmount(openInstallments[0])) : 0;
        setScheduleInstallmentValue(currentValue > 0 ? String(currentValue) : '');
    }, [agreement?.id, agreement?.frequency, agreement?.installments?.length, openInstallments]);

    const handleBreak = useCallback(async () => {
        setIsProcessing(true);
        try {
            await agreementService.breakAgreement(agreement.id);
            onUpdate();
            setConfirmAction(null);
        } catch (e) {
            console.error("Erro ao quebrar acordo:", e);
        } finally {
            setIsProcessing(false);
        }
    }, [agreement.id, onUpdate]);

    const handleActivate = useCallback(async () => {
        setIsProcessing(true);
        try {
            await agreementService.activateAgreement(agreement.id);
            onUpdate();
            setConfirmAction(null);
        } catch (e) {
            console.error("Erro ao reativar acordo:", e);
        } finally {
            setIsProcessing(false);
        }
    }, [agreement.id, onUpdate]);

    const handleScheduleUpdate = useCallback(async () => {
        if (!firstOpenDueDate) return;
        const installmentValue = Number(String(scheduleInstallmentValue).replace(',', '.')) || 0;
        if (installmentValue <= 0) return;
        setIsProcessing(true);
        try {
            await agreementService.updateAgreementSchedule(agreement.id, scheduleFrequency, firstOpenDueDate, installmentValue);
            setIsEditingSchedule(false);
            onUpdate();
        } catch (e) {
            console.error("Erro ao atualizar acordo:", e);
        } finally {
            setIsProcessing(false);
        }
    }, [agreement.id, scheduleFrequency, firstOpenDueDate, scheduleInstallmentValue, onUpdate]);

    return {
        isProcessing,
        confirmAction,
        setConfirmAction,
        selectedInst,
        setSelectedInst,
        forgiveLateFee,
        setForgiveLateFee,
        paymentAmount,
        setPaymentAmount,
        showCustomAmount,
        setShowCustomAmount,
        isEditingSchedule,
        setIsEditingSchedule,
        scheduleFrequency,
        setScheduleFrequency,
        firstOpenDueDate,
        setFirstOpenDueDate,
        scheduleInstallmentValue,
        setScheduleInstallmentValue,
        paidInstallments,
        openInstallments,
        paidTotal,
        outstandingBalance,
        projectedInstallments,
        projectedLastInstallment,
        handleBreak,
        handleActivate,
        handleScheduleUpdate,
    };
};
