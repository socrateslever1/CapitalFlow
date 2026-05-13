
import { useState, useMemo, useEffect } from 'react';
import { Loan, Installment } from '../../../../types';
import { parseDateOnlyUTC, addDaysUTC, addMonthsUTC, todayDateOnlyUTC, toISODateOnlyUTC, getDaysDiff } from '../../../../utils/dateHelpers';
import { paymentModalityDispatcher } from '../../../../features/payments/modality/index';
import { modalityRegistry } from '../../../../domain/finance/modalities/registry';
import { formatMoney } from '../../../../utils/formatters';
import { calculateTotalDue } from '../../../../domain/finance/calculations';

interface UsePaymentManagerProps {
    data: {loan: Loan, inst: Installment, calculations: any} | null;
    paymentType: string;
    setPaymentType: (t: any) => void;
    avAmount: string;
    setAvAmount: (v: string) => void;
}

export type ForgivenessMode = 'NONE' | 'FINE_ONLY' | 'INTEREST_ONLY' | 'BOTH';

export const usePaymentManagerState = ({ data, paymentType, setPaymentType, avAmount, setAvAmount }: UsePaymentManagerProps) => {
    const [customAmount, setCustomAmount] = useState('');
    const [manualDateStr, setManualDateStr] = useState(''); 
    const [realPaymentDateStr, setRealPaymentDateStr] = useState(toISODateOnlyUTC(new Date()));
    const [subMode, setSubMode] = useState<'DAYS' | 'AMORTIZE'>('DAYS');

    const [forgivenessMode, setForgivenessMode] = useState<ForgivenessMode>('NONE');
    const [interestHandling, setInterestHandling] = useState<'CAPITALIZE' | 'KEEP_PENDING'>('KEEP_PENDING');

    const resolvedBillingCycle = useMemo(() => {
        if (!data?.loan) return null;
        return modalityRegistry.get(data.loan.billingCycle).key;
    }, [data?.loan?.billingCycle]);

    const debtBreakdown = useMemo(() => {
        if (!data) return { principal: 0, interest: 0, fine: 0, dailyMora: 0, total: 0 };
        
        // Recalcula usando a função corrigida que separa os baldes
        const freshCalc = calculateTotalDue(data.loan, data.inst);

        let finalFine = freshCalc.finePart || 0; // Multa Fixa Pura
        let finalMora = freshCalc.moraPart || 0; // Mora Diária Pura
        
        // Se a estratégia não retornou partes (fallback), tenta usar lateFee como multa fixa se não houver mora explícita
        if (finalFine === 0 && finalMora === 0 && freshCalc.lateFee > 0) {
            finalFine = freshCalc.lateFee;
        }

        // Aplica perdão visual se selecionado
        if (forgivenessMode === 'FINE_ONLY') {
            finalFine = 0;
        } else if (forgivenessMode === 'INTEREST_ONLY') {
            finalMora = 0;
        } else if (forgivenessMode === 'BOTH') {
            finalFine = 0;
            finalMora = 0;
        }

        // ✅ FALLBACK UI: Se o cálculo retornar zero absoluto mas há principal no contrato
        if (freshCalc.total <= 0 && (Number(data.loan.principal) || 0) > 0) {
            const headPrincipal = Number(data.loan.principal);
            const rate = (Number(data.loan.interestRate) || 0) / 100;
            freshCalc.interest = Math.round(headPrincipal * rate * 100) / 100;
            freshCalc.principal = 0; // Assume renovação de juros num primeiro momento
        }

        return {
            principal: freshCalc.principal,
            interest: freshCalc.interest,
            fine: finalFine,
            dailyMora: finalMora,
            total: (freshCalc.principal || 0) + (freshCalc.interest || 0) + (finalFine || 0) + (finalMora || 0)
        };
    }, [data, forgivenessMode]);

    // Lógica Visual de Ciclos (Regra: Atraso pertence ao próximo ciclo)
    const virtualSchedule = useMemo(() => {
        if (!data) return [];
        const { inst, loan } = data;
        const today = todayDateOnlyUTC();
        
        const dueDate = parseDateOnlyUTC(inst.dueDate);
        const currentInterestDebt = Number(inst.interestRemaining);
        const fullMonthlyInterest = (Number(inst.scheduledPrincipal) * Number(loan.interestRate)) / 100;

        // Dias de atraso reais da parcela atual
        const realDaysLate = Math.max(0, getDaysDiff(inst.dueDate));

        const schedule = [];
        
        for (let i = 0; i < 3; i++) {
            const date = addDaysUTC(dueDate, i * 30);
            
            let label = '';
            let status = 'OPEN';
            
            const monthName = date.toLocaleDateString('pt-BR', { month: 'long' });
            const year = date.getFullYear();
            const dateStr = `${monthName}/${year}`;
            const fullDate = date.toLocaleDateString('pt-BR');

            if (i === 0) {
                // CICLO ATUAL
                label = `[30 Dias Contrato]`;
                status = realDaysLate > 0 ? 'LATE' : 'OPEN';

                // Se parcial
                const isPartial = currentInterestDebt < (fullMonthlyInterest - 1) && currentInterestDebt > 0.1;
                if (isPartial) {
                    label += ` • Restam ${formatMoney(currentInterestDebt)}`;
                    status = 'PARTIAL';
                }
            } else if (i === 1) {
                // PRÓXIMO CICLO (Herda atraso)
                if (realDaysLate > 0) {
                    label = `[${realDaysLate} Dias Atraso]`; 
                    status = 'LATE';
                } else {
                    label = `[em aberto]`;
                    status = 'FUTURE';
                }
            } else {
                // FUTUROS
                label = `[em aberto]`;
                status = 'FUTURE';
            }

            schedule.push({
                dateStr,
                label,
                fullDate,
                status,
                originalDate: date
            });
        }

        return schedule;
    }, [data?.inst?.dueDate, data?.inst?.interestRemaining, data?.inst?.principalRemaining, data?.inst?.paidLateFee]);

    const fixedTermData = useMemo(() => {
        if (data?.loan?.billingCycle === 'DAILY_FIXED_TERM' && data.inst) {
            try {
                const start = parseDateOnlyUTC(data.loan.startDate);
                const due = parseDateOnlyUTC(data.inst.dueDate);
                const startMs = start.getTime();
                const dueMs = due.getTime();
                const days = Math.round((dueMs - startMs) / 86400000);
                const safeDays = days > 0 ? days : 1; 
                const dailyVal = (data.loan.totalToReceive || 0) / safeDays;
                const currentDebt = (Number(data.inst.principalRemaining) || 0) + (Number(data.inst.interestRemaining) || 0);
                const amountPaid = Math.max(0, (data.loan.totalToReceive || 0) - currentDebt);
                const paidDays = dailyVal > 0 ? Math.floor((amountPaid + 0.1) / dailyVal) : 0;
                const paidUntil = addDaysUTC(start, paidDays);
                return { dailyVal, paidUntil, totalDays: safeDays, paidDays, currentDebt };
            } catch (e) { console.error(e); }
        }
        return { dailyVal: 0, paidUntil: todayDateOnlyUTC(), totalDays: 0, paidDays: 0, currentDebt: 0 };
    }, [data?.loan?.id, data?.inst?.id]);

    useEffect(() => {
        if (data) {
            setForgivenessMode('NONE');
            setInterestHandling('KEEP_PENDING');
            setRealPaymentDateStr(toISODateOnlyUTC(new Date()));

            if (resolvedBillingCycle === 'DAILY_FREE') {
                setPaymentType('CUSTOM');
                setSubMode('DAYS');
            } else if (resolvedBillingCycle === 'DAILY_FIXED_TERM') {
                setPaymentType('RENEW_AV');
                const start = parseDateOnlyUTC(data.loan.startDate);
                const due = parseDateOnlyUTC(data.inst.dueDate);
                const days = Math.max(1, Math.round((due.getTime() - start.getTime()) / 86400000));
                const dailyVal = (data.loan.totalToReceive || 0) / days;
                if (dailyVal > 0) setAvAmount(dailyVal.toFixed(2));
            } else {
                setPaymentType(paymentModalityDispatcher.getConfig(data.loan).defaultAction);
            }

            if (resolvedBillingCycle !== 'DAILY_FIXED_TERM') setAvAmount('');
            setCustomAmount('');
        }
    }, [data?.loan?.id, data?.inst?.id, resolvedBillingCycle]);

    // Sugestão de próxima data baseada na data de recebimento
    useEffect(() => {
        if (data && realPaymentDateStr) {
            const paymentDate = parseDateOnlyUTC(realPaymentDateStr);
            const isDaily =
                resolvedBillingCycle === 'DAILY_FREE' ||
                resolvedBillingCycle === 'DAILY_FIXED_TERM';

            let nextDate: Date;
            if (isDaily) {
                nextDate = addDaysUTC(paymentDate, 1);
            } else {
                // Pedido do usuário: +30 dias a partir da data de recebimento
                nextDate = addDaysUTC(paymentDate, 30);
            }

            setManualDateStr(toISODateOnlyUTC(nextDate));
        }
    }, [data?.loan?.id, data?.inst?.id, realPaymentDateStr, resolvedBillingCycle]);

    return {
        customAmount, setCustomAmount,
        manualDateStr, setManualDateStr, 
        realPaymentDateStr, setRealPaymentDateStr,
        subMode, setSubMode,
        fixedTermData,
        forgivenessMode, setForgivenessMode,
        interestHandling, setInterestHandling,
        debtBreakdown,
        virtualSchedule,
        resolvedBillingCycle
    };
};
