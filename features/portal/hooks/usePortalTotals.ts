
import { useMemo } from 'react';
import { calculateTotalDue } from '../../../domain/finance/calculations';
import { normalizeLoanForCalc, normalizeInstallmentForCalc } from '../mappers/portalAdapters';
import { isPortalInstallmentPaid } from '../mappers/portalDebtRules';

export const usePortalTotals = (loan: any, installments: any[]) => {
    
    const { totalJuridicoDevido, nextDueDate } = useMemo(() => {
        const pending = (installments || []).filter((i: any) => !isPortalInstallmentPaid(i));
        
        // Se não houver contrato carregado, retorna zerado
        if (!loan) {
            return { 
                totalJuridicoDevido: pending.reduce((acc: number, i: any) => acc + Number(i.valor_parcela || 0), 0),
                nextDueDate: pending.length > 0 ? new Date(pending[0].data_vencimento) : null
            };
        }

        const loanCalc = normalizeLoanForCalc(loan);

        const total = pending.reduce((acc: number, inst: any) => {
            const instCalc = normalizeInstallmentForCalc(inst);
            const debt = calculateTotalDue(loanCalc, instCalc);
            return acc + Number(debt.total || 0);
        }, 0);

        const nextDate = pending.length > 0 ? new Date(pending[0].data_vencimento) : null;

        return { totalJuridicoDevido: total, nextDueDate: nextDate };
    }, [loan, installments]);

    const pendingInstallments = useMemo(() => 
        (installments || []).filter((i: any) => !isPortalInstallmentPaid(i)), 
    [installments]);

    return {
        totalJuridicoDevido,
        nextDueDate,
        pendingInstallments,
        pendingCount: pendingInstallments.length
    };
};
