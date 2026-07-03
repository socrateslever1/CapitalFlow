
import { useMemo } from 'react';
import { Loan, CapitalSource, LoanStatus, Installment } from '../../../types';
import { parseDateOnlyUTC, addDaysUTC, getDaysDiff } from '../../../utils/dateHelpers';
import { hasActiveAgreement as hasActiveAgreementData, rebuildLoanStateFromLedger, ZERO_BALANCE_THRESHOLD } from '../../../domain/finance/calculations';
import { loanEngine } from '../../../domain/loanEngine';
import { modalityRegistry } from '../../../domain/finance/modalities/registry';
import { resolveLoanVisualClassification } from '../../../utils/loanFilterResolver';
import { calculateRiskProfile } from '../../../domain/finance/riskAnalysis';

export const useLoanCardComputed = (loanRaw: Loan, sources: CapitalSource[], isStealthMode: boolean = false) => {
  // 1. Reconstrói o estado financeiro do contrato para garantir que parciais sejam abatidos
  const loan = useMemo(() => rebuildLoanStateFromLedger(loanRaw), [loanRaw]);

  const strategy = useMemo(() => modalityRegistry.get(loan.billingCycle), [loan.billingCycle]);
  const showProgress = strategy.card.showProgress;

  // LÓGICA CENTRALIZADA
  const classification = useMemo(() => resolveLoanVisualClassification(loan), [loan]);

  const isPaid = classification === 'QUITADO';
  const isLate = classification === 'ATRASADO' || classification === 'CRITICO';
  const isCritical = classification === 'CRITICO';
  const isRenegotiated = classification === 'RENEGOCIADO';
  const isFullyFinalized = classification === 'QUITADO';
  
  const riskProfile = useMemo(() => calculateRiskProfile(loan), [loan]);

  const hasNotes = useMemo(() => loan.notes && loan.notes.trim().length > 0, [loan.notes]);

  const isDailyFree = loan.billingCycle === 'DAILY_FREE';
  const isFixedTerm = loan.billingCycle === 'DAILY_FIXED_TERM';

  const agreement = loan.activeAgreement;
  const hasActiveAgreement = hasActiveAgreementData(loan);

  // O totalDebt agora usa o motor de cálculo que já respeita o acordo
  const totalDebt = useMemo(() => 
    loanEngine.computeRemainingBalance(loan).totalRemaining, 
  [loan]);
  
  const isZeroBalance = totalDebt <= ZERO_BALANCE_THRESHOLD;

  // Cálculo do próximo vencimento e dias de atraso (Respeitando Acordos)
  const { nextDueDate, daysUntilDue } = useMemo(() => {
    const sourceInstallments = (hasActiveAgreement && agreement?.installments) 
      ? agreement.installments 
      : loan.installments;

    const nextInst = [...(sourceInstallments || [])]
      .filter(i => {
        const status = String(i.status || "").toUpperCase();
        return status !== 'PAID' && status !== 'PAGO';
      })
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];

    const dueDate = nextInst?.dueDate || null;
    const days = dueDate ? -getDaysDiff(dueDate) : 0;

    return { nextDueDate: dueDate, daysUntilDue: days };
  }, [loan.installments, agreement?.installments, hasActiveAgreement]);

  const fixedTermStats = useMemo(() => {
      if (!isFixedTerm) return null;
      const start = parseDateOnlyUTC(loan.startDate);
      const end = parseDateOnlyUTC(loan.installments[0].dueDate);
      const msPerDay = 1000 * 60 * 60 * 24;
      const totalDays = Math.round((end.getTime() - start.getTime()) / msPerDay);
      const dailyValue = (loan.totalToReceive || 0) / (totalDays || 1);
      const currentDebt = (loan.installments[0].principalRemaining || 0) + (loan.installments[0].interestRemaining || 0);
      const amountPaid = Math.max(0, (loan.totalToReceive || 0) - currentDebt);
      const paidDays = dailyValue > 0 ? Math.floor((amountPaid + 0.1) / dailyValue) : 0;
      const paidUntilDate = addDaysUTC(start, paidDays);
      const progressPercent = Math.min(100, Math.max(0, (paidDays / totalDays) * 100));
      return { totalDays, paidDays, dailyValue, progressPercent, paidUntilDate };
  }, [isFixedTerm, loan]);

  // Estilos
  let cardStyle = "bg-slate-900 border-slate-800";
  let iconStyle = "bg-slate-800 text-slate-400";

  if (isRenegotiated) {
      cardStyle = "bg-indigo-950/20 border-indigo-500/30";
      iconStyle = "bg-indigo-600 text-white";
  } else if (hasNotes) { 
      cardStyle = "bg-amber-950/20 border-amber-500/30"; 
      iconStyle = "bg-amber-600 text-white";
  }
  
  if (isFullyFinalized) {
    cardStyle = "bg-emerald-950/40 border-emerald-500/60 shadow-emerald-900/20";
    iconStyle = "bg-emerald-600 text-white";
  }
  else if (isLate) {
    cardStyle = isCritical 
      ? "bg-rose-950/40 border-rose-600/60 shadow-rose-900/20" 
      : "bg-rose-950/30 border-rose-500/50 shadow-rose-900/10";
    iconStyle = "bg-rose-600 text-white";
  }
  else if (classification === 'EM_DIA') {
    const nextInst = loan.installments.find(i => i.status !== LoanStatus.PAID);
    const daysUntilDue = nextInst ? -getDaysDiff(nextInst.dueDate) : 999;

    if (daysUntilDue >= 0 && daysUntilDue <= 3) {
      cardStyle = "bg-orange-950/30 border-orange-500/50 shadow-orange-900/10";
      iconStyle = "bg-orange-600 text-white";
    }
    else {
      if (!hasNotes) {
        cardStyle = "bg-blue-950/20 border-blue-500/30 shadow-blue-900/5";
      }
      iconStyle = "bg-blue-600 text-white";
    }
  }

  const allLedger = useMemo(() => {
    if (!loan.ledger || !Array.isArray(loan.ledger)) return [];
    return [...loan.ledger].sort((a, b) => {
      const tA = new Date(a.date).getTime();
      const tB = new Date(b.date).getTime();
      return (isNaN(tB) ? 0 : tB) - (isNaN(tA) ? 0 : tA);
    });
  }, [loan.ledger]);

  const orderedInstallments = useMemo(() => {
    const installmentNumber = (inst: any, fallback: number) => {
      const parsed = Number(inst?.number ?? inst?.numero_parcela ?? inst?.installmentNumber);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    };

    const installmentDueTime = (inst: any) => {
      const time = new Date(inst?.dueDate).getTime();
      return Number.isFinite(time) ? time : 0;
    };

    const isInstallmentSettled = (inst: any) => {
      const status = String(inst?.status || '').toUpperCase();
      const remaining =
        (Number(inst?.principalRemaining) || 0) +
        (Number(inst?.interestRemaining) || 0) +
        (Number(inst?.lateFeeAccrued) || 0);
      return status === LoanStatus.PAID || status === 'PAGO' || remaining <= ZERO_BALANCE_THRESHOLD;
    };

    let all: Installment[];

    if (loan.billingCycle === 'INSTALLMENT_FIXED') {
      all = [...loan.installments]
        .sort((a, b) => {
          const byNumber = installmentNumber(a, 0) - installmentNumber(b, 0);
          return byNumber !== 0 ? byNumber : installmentDueTime(a) - installmentDueTime(b);
        })
        .map((inst, scheduleIndex) => ({ ...inst, __scheduleIndex: scheduleIndex } as Installment))
        .sort((a: any, b: any) => {
          const bySettlement = Number(isInstallmentSettled(a)) - Number(isInstallmentSettled(b));
          return bySettlement !== 0 ? bySettlement : Number(a.__scheduleIndex) - Number(b.__scheduleIndex);
        });
    } else {
      all = [...loan.installments].sort((a, b) => installmentDueTime(a) - installmentDueTime(b));
    }

    if (showProgress) {
      if (!isPaid) {
        all = all.filter(i => i.status !== LoanStatus.PAID && Math.round(i.principalRemaining) > 0);
      }
    }
    return all;
  }, [loan.billingCycle, loan.installments, showProgress, isPaid]);

  return {
    strategy,
    showProgress,
    isPaid,
    isLate,
    isCritical,
    hasNotes,
    isDailyFree,
    isFixedTerm,
    totalDebt,
    isZeroBalance,
    hasActiveAgreement,
    isAgreementPaid: isPaid && !!agreement,
    isFullyFinalized,
    fixedTermStats,
    cardStyle,
    iconStyle,
    allLedger,
    orderedInstallments,
    activeAgreement: agreement,
    classification,
    nextDueDate,
    daysUntilDue,
    riskProfile
  };
};
