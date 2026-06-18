
import { Loan, Installment, LoanStatus } from '../../../types';
import { getDaysDiff, formatBRDate, parseDateOnlyUTC, todayDateOnlyUTC } from '../../../utils/dateHelpers';
import { calculateTotalDue, getInstallmentStatusLogic } from '../../../domain/finance/calculations';

export interface InstallmentViewModel {
    originalInst: Installment;
    realIndex: number;
    debt: ReturnType<typeof calculateTotalDue>;
    displayDueDate: string;
    paidUntilDate: string;
    daysDiff: number;
    isLateInst: boolean;
    isPaid: boolean;
    isPrepaid: boolean;
    isFixedTermDone: boolean;
    isActionDisabled: boolean;
    isZeroBalance: boolean;
    isFullyFinalized: boolean;
    daysPrepaid: number;
    statusText: string;
    statusColor: string;
    showProgress: boolean;
    isDailyFree: boolean;
    isFixedTerm: boolean;
}

export const prepareInstallmentViewModel = (
    loan: Loan,
    inst: Installment,
    index: number,
    context: {
        fixedTermStats: any;
        isPaid: boolean;
        isZeroBalance: boolean;
        isFullyFinalized: boolean;
        showProgress: boolean;
        strategy: any;
        isDailyFree: boolean;
        isFixedTerm: boolean;
    }
): InstallmentViewModel => {
    const { isDailyFree, isFixedTerm, fixedTermStats, isPaid, isZeroBalance, isFullyFinalized, showProgress, strategy } = context;

    const isSettledContract = context.isFullyFinalized || context.isPaid || context.isZeroBalance;
    
    // VÍNCULO DIRETO COM O CONTRATO: A data exibida é a data real da parcela no banco
    const displayDueDate = inst.dueDate;

    // Diferença em relação a HOJE (Positivo = Atrasado)
    const daysDiff = getDaysDiff(displayDueDate);
    
    const totalRemaining =
        (Number(inst.principalRemaining) || 0) +
        (Number(inst.interestRemaining) || 0) +
        (Number(inst.lateFeeAccrued) || 0);
    const isRenegotiated = inst.status === LoanStatus.RENEGOCIADO;
    const isInstPaid = inst.status === LoanStatus.PAID || totalRemaining <= 0.05;
    const rawDebt = calculateTotalDue(loan, inst);
    const debt = isSettledContract || isInstPaid
        ? { ...rawDebt, principal: 0, interest: 0, lateFee: 0, total: 0 }
        : rawDebt;
    
    // Status de Atraso real: Se a data passou e não está pago nem renegociado
    const isLateInst = daysDiff > 0 && !isInstPaid && !isRenegotiated;
    
    const isFixedTermDone = isFixedTerm && fixedTermStats && fixedTermStats.paidDays >= fixedTermStats.totalDays;
    const isActionDisabled = isInstPaid || isFullyFinalized || isRenegotiated;

    let isPrepaid = false;
    let daysPrepaid = 0;
    
    if (isDailyFree && !isRenegotiated) {
        if (daysDiff < 0) { 
            isPrepaid = true; 
            daysPrepaid = Math.abs(daysDiff); 
        }
    }

    let statusText = '';
    let statusColor = '';

    // LÓGICA DE STATUS - MODO FOCO
    if (isRenegotiated) {
        statusText = 'RENEGOCIADA (CONGELADA)';
        statusColor = 'text-slate-500 font-black';
    }
    else if (isInstPaid || isZeroBalance) { 
        statusText = 'CONTRATO FINALIZADO'; 
        statusColor = 'text-emerald-500 font-black'; 
    }
    else if (isLateInst) {
        statusText = `VENCIDO HÁ ${daysDiff} ${daysDiff === 1 ? 'DIA' : 'DIAS'}`; 
        statusColor = 'text-rose-500 font-black animate-pulse'; 
    }
    else if (isPrepaid) { 
        statusText = `ADIANTADO (${daysPrepaid} DIAS)`; 
        statusColor = 'text-emerald-400 font-black'; 
    }
    else if (isFixedTerm) { 
        const paidUntil = fixedTermStats?.paidUntilDate; 
        if (isFixedTermDone) { 
            statusText = 'CONTRATO FINALIZADO'; 
            statusColor = 'text-emerald-500 font-black'; 
        } else if (paidUntil) {
            const diff = getDaysDiff(paidUntil);
            if (diff <= 0) { 
                statusText = `EM DIA (Até ${formatBRDate(paidUntil)})`; 
                statusColor = 'text-emerald-400 font-black'; 
            } else { 
                statusText = `ATRASADO (${Math.abs(diff)} dias)`; 
                statusColor = 'text-rose-500 font-black animate-pulse'; 
            }
        } else { 
            statusText = 'EM ABERTO'; 
            statusColor = 'text-blue-400'; 
        }
    }
    else {
        if (daysDiff === 0) { 
            statusText = 'VENCE HOJE'; 
            statusColor = 'text-amber-400 animate-pulse font-black'; 
        }
        else { 
            statusText = `FALTAM ${Math.abs(daysDiff)} DIAS`; 
            statusColor = 'text-blue-400 font-bold'; 
        }
    }

    const realIndex = showProgress ? loan.installments.findIndex(original => original.id === inst.id) + 1 : index + 1;

    return {
        originalInst: inst,
        realIndex,
        debt,
        displayDueDate,
        paidUntilDate: displayDueDate,
        daysDiff,
        isLateInst,
        isPaid: isInstPaid,
        isPrepaid,
        isFixedTermDone: !!isFixedTermDone,
        isActionDisabled,
        isZeroBalance,
        isFullyFinalized,
        daysPrepaid,
        statusText,
        statusColor,
        showProgress,
        isDailyFree,
        isFixedTerm
    };
};
