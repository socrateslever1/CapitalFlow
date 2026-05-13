
import { Loan, Installment } from '../../../types';
import { calculateTotalDue } from '../../../domain/finance/calculations';
import { normalizeLoanForCalc, normalizeInstallmentForCalc } from './portalAdapters';
import { getDaysDiff } from '../../../utils/dateHelpers';
import { isDev } from '../../../utils/isDev';

// Tipos de Retorno
export interface PortalDebtSummary {
    totalDue: number;
    nextDueDate: Date | null;
    pendingCount: number;
    hasLateInstallments: boolean;
    maxDaysLate: number; // Novo: para notificações
}

export interface InstallmentDebtDetail {
    total: number; // Valor Cheio (Principal + Juros + Multa)
    principal: number;
    interest: number;
    lateFee: number;
    isLate: boolean;
    daysLate: number;
    dueDateISO: string;
    statusLabel: string;
    statusColor: string;
}

export interface PaymentOptions {
    totalToPay: number;       // Quitação (Capital + Juros + Multa)
    renewToPay: number;       // Renovação (Juros + Multa)
    breakdown: {
        principal: number;
        interest: number;
        fine: number;
    };
    canRenew: boolean;
    // Novos campos para UI correta
    daysLate: number;
    dueDateISO: string;
}

const PAID_STATUSES = new Set(['PAID', 'PAGO', 'QUITADO', 'QUITADA', 'FINALIZADO', 'CLOSED', 'ENCERRADO']);
const SETTLED_EPSILON = 0.05;

export const isPortalInstallmentPaid = (inst: any): boolean => {
    if (!inst) return true;

    const status = String(inst.status ?? '').trim().toUpperCase();
    if (PAID_STATUSES.has(status)) return true;

    if (inst.agreementId || inst.acordo_id || inst.agreement_id) {
        const amount = Number(inst.amount ?? inst.valor ?? inst.valor_parcela ?? 0);
        const paidAmount = Number(inst.paidAmount ?? inst.paid_amount ?? inst.valor_pago ?? 0);
        return amount > 0 && amount - paidAmount <= SETTLED_EPSILON;
    }

    const hasBalanceFields =
        inst.principalRemaining !== undefined ||
        inst.principal_remaining !== undefined ||
        inst.interestRemaining !== undefined ||
        inst.interest_remaining !== undefined ||
        inst.lateFeeAccrued !== undefined ||
        inst.late_fee_accrued !== undefined;

    if (!hasBalanceFields) return false;

    const principalRemaining = Number(inst.principalRemaining ?? inst.principal_remaining ?? 0);
    const interestRemaining = Number(inst.interestRemaining ?? inst.interest_remaining ?? 0);
    const lateFeeAccrued = Number(inst.lateFeeAccrued ?? inst.late_fee_accrued ?? 0);

    return principalRemaining + interestRemaining + lateFeeAccrued <= SETTLED_EPSILON;
};

/**
 * HELPER DE LABEL DE VENCIMENTO (Regra Centralizada)
 */
export const getPortalDueLabel = (daysLate: number, dueDateISO: string) => {
    // 1. Atrasado real (multa aplicável ou passado)
    if (daysLate > 0) {
        return { 
            label: `Vencido há ${daysLate} dia${daysLate === 1 ? '' : 's'}`, 
            detail: '(+ Taxas e Multas inclusas)',
            variant: 'OVERDUE' 
        };
    }

    // Calcula diferença real (negativo = futuro) para labels de "Vence em..."
    const rawDiff = -getDaysDiff(dueDateISO); // getDaysDiff retorna (hoje - data). Invertemos para (data - hoje).

    // 2. Vence Hoje
    if (rawDiff === 0) {
        return { 
            label: 'Vence hoje', 
            detail: '',
            variant: 'DUE_TODAY' 
        };
    }

    // 3. Futuro
    if (rawDiff > 0) {
        return { 
            label: `Vence em ${rawDiff} dia${rawDiff === 1 ? '' : 's'}`, 
            detail: '',
            variant: 'DUE_SOON' 
        };
    }

    // Fallback (passado mas sem daysLate > 0, ex: pago ou tolerância)
    return { label: 'Em dia', detail: '', variant: 'OK' };
};

/**
 * 1. RESUMO GERAL DA DÍVIDA (Card Principal)
 */
export const resolveDebtSummary = (loan: Loan, installments: Installment[]): PortalDebtSummary => {
    if (!loan) return { totalDue: 0, nextDueDate: null, pendingCount: 0, hasLateInstallments: false, maxDaysLate: 0 };

    // Se houver acordo ativo, a dívida é baseada nos termos do acordo (Suporta ACTIVE e ATIVO)
    if (loan.activeAgreement && (loan.activeAgreement.status === 'ACTIVE' || loan.activeAgreement.status === 'ATIVO')) {
        const agreementInsts = loan.activeAgreement.installments || [];
        const pending = agreementInsts.filter(i => !isPortalInstallmentPaid(i));
        const totalDue = pending.reduce((acc, i) => acc + (Number(i.amount) - Number(i.paidAmount || 0)), 0);
        
        let maxDaysLate = 0;
        pending.forEach(inst => {
            const daysLate = getDaysDiff(inst.dueDate);
            if (daysLate > maxDaysLate) maxDaysLate = daysLate;
        });

        return {
            totalDue,
            nextDueDate: pending.length > 0 ? new Date(pending[0].dueDate) : null,
            pendingCount: pending.length,
            hasLateInstallments: maxDaysLate > 0,
            maxDaysLate
        };
    }

    if (!installments) return { totalDue: 0, nextDueDate: null, pendingCount: 0, hasLateInstallments: false, maxDaysLate: 0 };

    const pending = installments.filter(i => !isPortalInstallmentPaid(i));

    const loanCalc = normalizeLoanForCalc(loan);
    let maxDaysLate = 0;
    let totalDue = 0;
    pending.forEach(inst => {
        const instCalc = normalizeInstallmentForCalc(inst);
        const debt = calculateTotalDue(loanCalc, instCalc);
        totalDue += Number(debt.total || 0);
        if (debt.daysLate > maxDaysLate) maxDaysLate = debt.daysLate;
    });

    return {
        totalDue,
        nextDueDate: pending.length > 0 ? new Date(pending[0].dueDate) : null,
        pendingCount: pending.length,
        hasLateInstallments: maxDaysLate > 0,
        maxDaysLate
    };
};

/**
 * 2. DETALHE DA PARCELA (Lista e Badges)
 */
export const resolveInstallmentDebt = (loan: Loan, inst: any): InstallmentDebtDetail => {
    // Se for uma parcela de acordo (AgreementInstallment)
    if (inst.agreementId) {
        const amount = Number(inst.amount || 0);
        const paidAmount = Number(inst.paidAmount || 0);
        const remaining = amount - paidAmount;
        const isPaidOff = isPortalInstallmentPaid(inst);
        const daysLate = isPaidOff ? 0 : getDaysDiff(inst.dueDate);
        const isLate = !isPaidOff && daysLate > 0;
        const dueInfo = getPortalDueLabel(daysLate, inst.dueDate);

        let statusLabel = dueInfo.label;
        let statusColor = 'text-slate-500';

        if (isPaidOff) {
            statusLabel = 'Quitada';
            statusColor = 'text-emerald-500';
        } else if (dueInfo.variant === 'OVERDUE') {
            statusColor = 'text-rose-500 font-bold';
        } else if (dueInfo.variant === 'DUE_TODAY') {
            statusColor = 'text-amber-500 font-bold animate-pulse';
        } else if (dueInfo.variant === 'DUE_SOON') {
            statusColor = 'text-amber-500';
        }

        return {
            total: isPaidOff ? 0 : remaining,
            principal: isPaidOff ? 0 : remaining,
            interest: 0,
            lateFee: 0,
            isLate,
            daysLate,
            dueDateISO: inst.dueDate,
            statusLabel,
            statusColor
        };
    }

    // Lógica original para parcelas normais
    const loanCalc = normalizeLoanForCalc(loan);
    const instCalc = normalizeInstallmentForCalc(inst);
    const debt = calculateTotalDue(loanCalc, instCalc);

    // CORREÇÃO: Verificar se parcela está realmente quitada (status OU saldo zerado)
    const isPaidOff = isPortalInstallmentPaid(inst);

    const daysLate = isPaidOff ? 0 : debt.daysLate;
    const isLate = !isPaidOff && daysLate > 0;
    const dueInfo = getPortalDueLabel(daysLate, inst.dueDate);

    let statusLabel = dueInfo.label;
    let statusColor = 'text-slate-500';

    if (isPaidOff) {
        statusLabel = 'Quitada';
        statusColor = 'text-emerald-500';
    } else if (dueInfo.variant === 'OVERDUE') {
        statusColor = 'text-rose-500 font-bold';
    } else if (dueInfo.variant === 'DUE_TODAY') {
        statusColor = 'text-amber-500 font-bold animate-pulse';
    } else if (dueInfo.variant === 'DUE_SOON') {
        statusColor = 'text-amber-500';
    }

    return {
        total: isPaidOff ? 0 : debt.total,
        principal: isPaidOff ? 0 : debt.principal,
        interest: isPaidOff ? 0 : debt.interest,
        lateFee: isPaidOff ? 0 : debt.lateFee,
        isLate,
        daysLate,
        dueDateISO: inst.dueDate,
        statusLabel,
        statusColor
    };
};

/**
 * 3. OPÇÕES DE PAGAMENTO (Modal)
 * Define exatamente quanto cobrar em cada cenário.
 */
export const resolvePaymentOptions = (loan: Loan, inst: any): PaymentOptions => {
    // Se for uma parcela de acordo
    if (inst.agreementId) {
        const amount = Number(inst.amount || 0);
        const paidAmount = Number(inst.paidAmount || 0);
        const remaining = amount - paidAmount;
        const daysLate = getDaysDiff(inst.dueDate);

        return {
            totalToPay: remaining,
            renewToPay: 0, // Acordos geralmente não permitem renovação da parcela individual
            breakdown: {
                principal: remaining,
                interest: 0,
                fine: 0
            },
            canRenew: false,
            daysLate,
            dueDateISO: inst.dueDate
        };
    }

    const loanCalc = normalizeLoanForCalc(loan);
    const instCalc = normalizeInstallmentForCalc(inst);
    const debt = calculateTotalDue(loanCalc, instCalc);

    // Total a Pagar = Tudo
    const totalToPay = debt.total;

    // Renovação = Juros + Multa/Mora (Capital fica para depois)
    const renewToPay = debt.interest + debt.lateFee;

    return {
        totalToPay,
        renewToPay,
        breakdown: {
            principal: debt.principal,
            interest: debt.interest,
            fine: debt.lateFee
        },
        // Só permite renovar se houver juros ou multa a pagar. Se for só principal, é quitação.
        canRenew: (debt.interest + debt.lateFee) > 0,
        daysLate: debt.daysLate,
        dueDateISO: inst.dueDate
    };
};

// DEV ONLY
export const debugDebtCheck = (loan: Loan, inst: Installment) => {
    if (isDev) {
        const res = resolvePaymentOptions(loan, inst);
        console.group('💰 Debt Check');
        console.log('Loan:', loan.debtorName);
        console.log('Inst:', inst.number);
        console.log('Total (Principal+Interest+Fine):', res.totalToPay);
        console.log('Renew (Interest+Fine):', res.renewToPay);
        console.log('Breakdown:', res.breakdown);
        console.groupEnd();
    }
};
