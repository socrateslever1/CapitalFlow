import { useState, useEffect, useCallback, useMemo } from 'react';
import { Agreement, AgreementInstallment } from "../../../types";
import { agreementService } from "../services/agreementService";

interface UseAgreementViewProps {
    agreement: Agreement;
    onUpdate: () => void;
}

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

    const openInstallments = useMemo(() => {
        return (agreement.installments || [])
            .filter(inst => {
                const paidAmount = Number((inst as any)?.paidAmount ?? (inst as any)?.paid_amount ?? 0) || 0;
                const amount = Number(inst?.amount || 0) || 0;
                const status = String(inst?.status || '').toUpperCase();
                return !['PAID', 'PAGO', 'QUITADO', 'QUITADA'].includes(status) && paidAmount + 0.05 < amount;
            })
            .sort((a, b) => (a?.number || 0) - (b?.number || 0));
    }, [agreement.installments]);

    useEffect(() => {
        const rawFrequency = String((agreement as any)?.frequency || '').toUpperCase();
        const normalizedFrequency =
            rawFrequency === 'WEEKLY' || rawFrequency === 'SEMANAL' ? 'WEEKLY' :
            rawFrequency === 'BIWEEKLY' || rawFrequency === 'QUINZENAL' ? 'BIWEEKLY' :
            'MONTHLY';
        setScheduleFrequency(normalizedFrequency);
        setFirstOpenDueDate(openInstallments[0]?.dueDate ? String(openInstallments[0].dueDate).slice(0, 10) : '');
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
        setIsProcessing(true);
        try {
            await agreementService.updateAgreementSchedule(agreement.id, scheduleFrequency, firstOpenDueDate);
            setIsEditingSchedule(false);
            onUpdate();
        } catch (e) {
            console.error("Erro ao atualizar acordo:", e);
        } finally {
            setIsProcessing(false);
        }
    }, [agreement.id, scheduleFrequency, firstOpenDueDate, onUpdate]);

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
        openInstallments,
        handleBreak,
        handleActivate,
        handleScheduleUpdate,
    };
};
