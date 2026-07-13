import { AgreementInstallment, Installment, Loan, LoanPolicy, LoanStatus } from "../../types";
import { getDaysDiff as getDaysDiffHelper } from "../../utils/dateHelpers";
import { financeDispatcher } from "./dispatch";
import { CalculationResult } from "./modalities/types";
import { isCapitalOnlyRecoveryLoan } from "../../utils/capitalOnlyRecovery";

const round = (num: number): number => Math.round((num + Number.EPSILON) * 100) / 100;

const AGREEMENT_ACTIVE_STATUSES = new Set(["ACTIVE", "ATIVO"]);
const AGREEMENT_PAID_STATUSES = new Set(["PAID", "PAGO", "QUITADO", "QUITADA", "FINALIZADO"]);
const LOAN_PAID_STATUSES = new Set(["PAID", "PAGO", "QUITADO", "QUITADA", "FINALIZADO", "ARQUIVADO"]);
export const ZERO_BALANCE_THRESHOLD = 0.5; // Ignora resíduos abaixo de 50 centavos

export type ForgivenessMode =
  | "NONE"
  | "FINE_ONLY"
  | "MORA_ONLY"
  | "FINE_AND_MORA"
  | "TOTAL_CHARGES"
  | "CAPITAL_ONLY"
  | "INTEREST_ONLY"
  | "BOTH";

export interface RemainingBalance {
  totalRemaining: number;
  principalRemaining: number;
  interestRemaining: number;
  lateFeeRemaining: number;
}

export interface PaymentBuckets {
  principal: number;
  interest: number;
  lateFee: number;
  total: number;
}

export interface InstallmentPaymentPlan {
  paidPrincipal: number;
  paidInterest: number;
  paidLateFee: number;
  avGenerated: number;
  forgivenLateFee: number;
  totalDueBeforeForgiveness: number;
  totalDueAfterForgiveness: number;
  remainingAfterPayment: number;
  finePart: number;
  moraPart: number;
}

const isPaymentLikeLedgerType = (type: unknown): boolean => {
  const value = String(type || '').toUpperCase();
  return value.includes('PAYMENT') || value === 'ESTORNO';
};

export const getLoanPrincipalReconciliationDelta = (loan: Partial<Loan> | null | undefined): number => {
  if (!loan) return 0;

  const contractPrincipal = round(Number(loan.principal || 0));
  if (contractPrincipal <= ZERO_BALANCE_THRESHOLD) return 0;

  const paidPrincipal = (loan.ledger || []).reduce((sum, entry: any) => {
    if (!isPaymentLikeLedgerType(entry?.type)) return sum;
    return round(sum + Number(entry?.principalDelta ?? entry?.principal_delta ?? 0));
  }, 0);

  const openPrincipalInInstallments = (loan.installments || []).reduce((sum, inst: any) => {
    const status = String(inst?.status || '').toUpperCase();
    if (status === 'RENEGOCIADO' || status === 'CANCELADO') return sum;
    return round(sum + Math.max(0, Number(inst?.principalRemaining ?? inst?.principal_remaining ?? 0)));
  }, 0);

  const expectedOpenPrincipal = round(Math.max(0, contractPrincipal - paidPrincipal));
  return round(Math.max(0, expectedOpenPrincipal - openPrincipalInInstallments));
};

export const getLoanInterestReconciliationDelta = (loan: Partial<Loan> | null | undefined): number => {
  const principalDelta = getLoanPrincipalReconciliationDelta(loan);
  const rate = Number(loan?.interestRate || 0);
  if (principalDelta <= ZERO_BALANCE_THRESHOLD || rate <= 0) return 0;
  return round(principalDelta * (rate / 100));
};

export const getDaysDiff = (dueDateStr: string): number => getDaysDiffHelper(dueDateStr);

export const add30Days = (dateStr: string): string => {
  const [y, m, d] = dateStr.split('T')[0].split('-').map(Number);
  const date = new Date(y, m - 1, d, 12, 0, 0);
  date.setDate(date.getDate() + 30);
  return date.toISOString();
};

// --- FUNÇÕES DE STATUS (CORRIGIDAS) ---

export interface InstallmentDueLabel {
  label: string;
  detail: string;
  variant: 'OVERDUE' | 'DUE_TODAY' | 'DUE_SOON' | 'OK';
  daysLate: number;
}

export const getInstallmentDueLabel = (dueDateStr: string): InstallmentDueLabel => {
  const daysLate = getDaysDiff(dueDateStr);
  
  if (daysLate > 0) {
    return {
      label: `Vencido há ${daysLate} dia${daysLate === 1 ? '' : 's'}`,
      detail: '(+ Taxas e Multas inclusas)',
      variant: 'OVERDUE',
      daysLate
    };
  }

  const daysToDue = -daysLate;

  if (daysToDue === 0) {
    return {
      label: 'Vence hoje',
      detail: '',
      variant: 'DUE_TODAY',
      daysLate: 0
    };
  }

  if (daysToDue > 0) {
    return {
      label: `Vence em ${daysToDue} dia${daysToDue === 1 ? '' : 's'}`,
      detail: '',
      variant: 'DUE_SOON',
      daysLate: 0
    };
  }

  return {
    label: 'Em dia',
    detail: '',
    variant: 'OK',
    daysLate: 0
  };
};

// Define o status lógico interno da parcela
export const getInstallmentStatusLogic = (inst: any, parentLoanStatus?: string): LoanStatus => {
  if (isInstallmentPaid(inst, parentLoanStatus)) return LoanStatus.PAID;
  
  const dueDate = inst.dueDate ?? inst.due_date ?? inst.data_vencimento;
  if (dueDate && getDaysDiff(String(dueDate)) > 0) return LoanStatus.LATE;
  
  const paidTotal = Number(inst.paidTotal ?? inst.paid_total ?? inst.valor_pago ?? inst.paidAmount ?? inst.paid_amount ?? 0);
  if (paidTotal > ZERO_BALANCE_THRESHOLD) return LoanStatus.PARTIAL;
  
  return LoanStatus.PENDING;
};

// Define o texto de status que o usuário vê na interface
export const deriveUserFacingStatus = (inst: any, parentLoanStatus?: string): string => {
  if (isInstallmentPaid(inst, parentLoanStatus)) {
    return "Quitado";
  }

  const dueDate = inst.dueDate ?? inst.due_date ?? inst.data_vencimento;
  if (!dueDate) return "Em dia";

  const info = getInstallmentDueLabel(String(dueDate));
  
  if (info.variant === 'OVERDUE') {
    return `${info.daysLate} dias vencidos`;
  }
  return info.label;
};

export const calculateAgreementInstallmentLateFee = (inst: Partial<AgreementInstallment>): number => {
  if (!inst || !inst.dueDate) return 0;
  const daysLate = Math.max(0, getDaysDiff(inst.dueDate));
  if (daysLate <= 0) return 0;
  const paidAmount = Number(inst.paidAmount) || 0;
  const amount = Number(inst.amount) || 0;
  const remainingPrincipal = Math.max(0, amount - paidAmount);
  return round(remainingPrincipal * 0.01 * daysLate);
};

// --- FACHADA DE CÁLCULO DE DÍVIDA ---

export const calculateTotalDue = (loan: Loan, inst: Installment): CalculationResult => {
  if (isCapitalOnlyRecoveryLoan(loan)) {
    const principal = round(Number(inst.principalRemaining || 0));
    return {
      total: principal,
      principal,
      interest: 0,
      lateFee: 0,
      finePart: 0,
      moraPart: 0,
    } as CalculationResult;
  }

  const policy: LoanPolicy = loan.policiesSnapshot || {
    interestRate: loan.interestRate,
    finePercent: loan.finePercent,
    dailyInterestPercent: loan.dailyInterestPercent
  };
  
  const rawCalc = financeDispatcher.calculate(loan, inst, policy);
  return rawCalc;
};

export const hasActiveAgreement = (loan: Loan): boolean => {
  const status = String(loan?.activeAgreement?.status || "").toUpperCase().trim();
  return !!loan?.activeAgreement && AGREEMENT_ACTIVE_STATUSES.has(status);
};

export const isLoanSettledByStatus = (loan: Partial<Loan> | null | undefined): boolean => {
  const status = String(loan?.status || "").toUpperCase().trim();
  return LOAN_PAID_STATUSES.has(status);
};

export const isAgreementSettledByStatus = (loan: Partial<Loan> | null | undefined): boolean => {
  const status = String(loan?.activeAgreement?.status || "").toUpperCase().trim();
  return !!loan?.activeAgreement && AGREEMENT_PAID_STATUSES.has(status);
};

export const isInstallmentPaid = (inst: any, parentLoanStatus?: string): boolean => {
  if (!inst) return true;

  const pStatus = String(parentLoanStatus || "").toUpperCase().trim();
  if (pStatus && LOAN_PAID_STATUSES.has(pStatus)) return true;

  const status = String(inst.status || "").toUpperCase().trim();
  if (AGREEMENT_PAID_STATUSES.has(status)) return true;

  const isAgreement = !!(inst.agreementId || inst.acordo_id || inst.agreement_id);

  if (isAgreement) {
    const amount = Number(inst.amount ?? inst.valor ?? inst.valor_parcela ?? 0);
    const paidAmount = Number(inst.paidAmount ?? inst.paid_amount ?? inst.valor_pago ?? 0);
    const remaining = round(amount - paidAmount);
    return remaining <= ZERO_BALANCE_THRESHOLD;
  }

  // Check normal installment balance fields
  const hasBalanceFields =
    inst.principalRemaining !== undefined ||
    inst.principal_remaining !== undefined ||
    inst.interestRemaining !== undefined ||
    inst.interest_remaining !== undefined ||
    inst.lateFeeAccrued !== undefined ||
    inst.late_fee_accrued !== undefined;

  if (!hasBalanceFields) {
    return ["PAID", "PAGO", "QUITADO", "QUITADA", "FINALIZADO"].includes(status);
  }

  const principal = Number(inst.principalRemaining ?? inst.principal_remaining ?? 0);
  const interest = Number(inst.interestRemaining ?? inst.interest_remaining ?? 0);
  const lateFee = Number(inst.lateFeeAccrued ?? inst.late_fee_accrued ?? 0);
  const total = round(principal + interest + lateFee);

  return total <= ZERO_BALANCE_THRESHOLD;
};

export const isAgreementInstallmentPaid = (inst: Partial<AgreementInstallment> | null | undefined, parentLoanStatus?: string): boolean => {
  return isInstallmentPaid(inst, parentLoanStatus);
};

export const isInstallmentSettled = (inst: Partial<Installment> | null | undefined, parentLoanStatus?: string): boolean => {
  return isInstallmentPaid(inst, parentLoanStatus);
};

export const computeLoanRemainingBalance = (loan: Loan): RemainingBalance => {
  if (!loan) {
    return {
      totalRemaining: 0,
      principalRemaining: 0,
      interestRemaining: 0,
      lateFeeRemaining: 0,
    };
  }

  if (isAgreementSettledByStatus(loan)) {
    return {
      totalRemaining: 0,
      principalRemaining: 0,
      interestRemaining: 0,
      lateFeeRemaining: 0,
    };
  }

  if (hasActiveAgreement(loan) && Array.isArray(loan.activeAgreement?.installments)) {
    const agreement = loan.activeAgreement;
    const pendingInstallments = agreement.installments.filter((inst) => !isAgreementInstallmentPaid(inst));
    
    let principalRemaining = 0;
    let lateFeeRemaining = 0;
    
    pendingInstallments.forEach(inst => {
      principalRemaining += Math.max(0, Number(inst.amount || 0) - Number(inst.paidAmount || 0));
      lateFeeRemaining += calculateAgreementInstallmentLateFee(inst);
    });
    
    principalRemaining = round(principalRemaining);
    lateFeeRemaining = round(lateFeeRemaining);
    const totalRemaining = round(principalRemaining + lateFeeRemaining);

    return {
      totalRemaining,
      principalRemaining,
      interestRemaining: 0,
      lateFeeRemaining,
    };
  }

  const installments = Array.isArray(loan.installments) ? loan.installments : [];
  if (installments.length === 0) {
    return {
      totalRemaining: 0,
      principalRemaining: 0,
      interestRemaining: 0,
      lateFeeRemaining: 0,
    };
  }

  let principalRemaining = 0;
  let interestRemaining = 0;
  let lateFeeRemaining = 0;

  for (const inst of installments) {
    // Ignora parcelas que foram movidas para acordo ou canceladas
    const status = String(inst.status || "").toUpperCase();
    if (status === 'RENEGOCIADO' || status === 'CANCELADO') continue;

    const rawOpen = round(
      Number(inst.principalRemaining || 0) +
      Number(inst.interestRemaining || 0) +
      Number(inst.lateFeeAccrued || 0)
    );
    if ((status === 'PAID' || status === 'PAGO' || status === 'QUITADO' || status === 'QUITADA' || status === 'FINALIZADO') && rawOpen <= ZERO_BALANCE_THRESHOLD) continue;

    const debt = calculateTotalDue(loan, inst);
    principalRemaining += Math.max(0, Number(debt.principal || 0));
    interestRemaining += Math.max(0, Number(debt.interest || 0));
    lateFeeRemaining += Math.max(0, Number(debt.lateFee || 0));
  }

  principalRemaining = round(principalRemaining);
  interestRemaining = round(interestRemaining);
  lateFeeRemaining = round(lateFeeRemaining);

  const principalReconciliationDelta = getLoanPrincipalReconciliationDelta(loan);
  if (principalReconciliationDelta > ZERO_BALANCE_THRESHOLD) {
    principalRemaining = round(principalRemaining + principalReconciliationDelta);
  }

  const interestReconciliationDelta = getLoanInterestReconciliationDelta(loan);
  if (interestReconciliationDelta > ZERO_BALANCE_THRESHOLD) {
    interestRemaining = round(interestRemaining + interestReconciliationDelta);
  }

  return {
    totalRemaining: round(principalRemaining + interestRemaining + lateFeeRemaining),
    principalRemaining,
    interestRemaining,
    lateFeeRemaining,
  };
};

export const resolveForgivenLateFee = (
  calc: CalculationResult,
  forgivenessMode: ForgivenessMode = "NONE"
): { forgivenLateFee: number; finePart: number; moraPart: number } => {
  const finePart = round(Number(calc.finePart ?? calc.lateFee ?? 0));
  const moraPart = round(Number(calc.moraPart ?? 0));

  let forgivenLateFee = 0;
  if (forgivenessMode === "FINE_ONLY") forgivenLateFee = finePart;
  if (forgivenessMode === "MORA_ONLY" || forgivenessMode === "INTEREST_ONLY") forgivenLateFee = moraPart;
  if (
    forgivenessMode === "FINE_AND_MORA" ||
    forgivenessMode === "BOTH" ||
    forgivenessMode === "TOTAL_CHARGES" ||
    forgivenessMode === "CAPITAL_ONLY"
  ) {
    forgivenLateFee = round(finePart + moraPart);
  }

  return {
    forgivenLateFee: round(Math.min(Number(calc.lateFee || 0), forgivenLateFee)),
    finePart,
    moraPart,
  };
};

export const resolveInstallmentPaymentBuckets = (
  loan: Loan,
  installment: Installment,
  forgivenessMode: ForgivenessMode = "NONE"
): PaymentBuckets & { forgivenLateFee: number; finePart: number; moraPart: number; totalBeforeForgiveness: number } => {
  const calc = calculateTotalDue(loan, installment);
  const { forgivenLateFee, finePart, moraPart } = resolveForgivenLateFee(calc, forgivenessMode);

  const principal = round(Number(calc.principal || 0));
  const forgivesAllCharges = forgivenessMode === "CAPITAL_ONLY" || forgivenessMode === "TOTAL_CHARGES";
  const interest = forgivesAllCharges ? 0 : round(Number(calc.interest || 0));
  const lateFee = forgivesAllCharges ? 0 : round(Math.max(0, Number(calc.lateFee || 0) - forgivenLateFee));
  const total = round(principal + interest + lateFee);

  return {
    principal,
    interest,
    lateFee,
    total,
    forgivenLateFee,
    finePart,
    moraPart,
    totalBeforeForgiveness: round(Number(calc.total || 0)),
  };
};

export const allocatePaymentFromBuckets = (params: {
  paymentAmount: number;
  principal: number;
  interest: number;
  lateFee: number;
}): PaymentResult & { totalDue: number; remainingAfterPayment: number } => {
  const totalDue = round(
    Math.max(0, Number(params.principal || 0)) +
    Math.max(0, Number(params.interest || 0)) +
    Math.max(0, Number(params.lateFee || 0))
  );

  let remaining = round(params.paymentAmount);

  const payLateFee = Math.min(remaining, Math.max(0, Number(params.lateFee || 0)));
  remaining = round(remaining - payLateFee);

  const payInterest = Math.min(remaining, Math.max(0, Number(params.interest || 0)));
  remaining = round(remaining - payInterest);

  const payPrincipal = Math.min(remaining, Math.max(0, Number(params.principal || 0)));
  remaining = round(remaining - payPrincipal);

  return {
    paidPrincipal: round(payPrincipal),
    paidInterest: round(payInterest),
    paidLateFee: round(payLateFee),
    avGenerated: round(Math.max(0, remaining)),
    totalDue,
    remainingAfterPayment: round(
      Math.max(0, totalDue - round(payPrincipal + payInterest + payLateFee))
    ),
  };
};

export const calculateInstallmentPaymentPlan = (params: {
  loan: Loan;
  installment: Installment;
  paymentAmount: number;
  forgivenessMode?: ForgivenessMode;
}): InstallmentPaymentPlan => {
  const buckets = resolveInstallmentPaymentBuckets(
    params.loan,
    params.installment,
    params.forgivenessMode || "NONE"
  );

  const allocation = allocatePaymentFromBuckets({
    paymentAmount: params.paymentAmount,
    principal: buckets.principal,
    interest: buckets.interest,
    lateFee: buckets.lateFee,
  });

  return {
    paidPrincipal: allocation.paidPrincipal,
    paidInterest: allocation.paidInterest,
    paidLateFee: allocation.paidLateFee,
    avGenerated: allocation.avGenerated,
    forgivenLateFee: buckets.forgivenLateFee,
    totalDueBeforeForgiveness: buckets.totalBeforeForgiveness,
    totalDueAfterForgiveness: buckets.total,
    remainingAfterPayment: allocation.remainingAfterPayment,
    finePart: buckets.finePart,
    moraPart: buckets.moraPart,
  };
};

// --- ALOCAÇÃO DE PAGAMENTO ---

export interface PaymentResult {
  paidPrincipal: number;
  paidInterest: number;
  paidLateFee: number;
  avGenerated: number;
}

export const allocatePayment = (params: {
  installment: Installment,
  paymentAmount: number,
  paymentPriority?: 'INTEREST_FIRST' | 'PRINCIPAL_FIRST'
}): PaymentResult => {
  const { installment, paymentAmount } = params;
  const allocation = allocatePaymentFromBuckets({
    paymentAmount,
    principal: Number(installment.principalRemaining) || 0,
    interest: Number(installment.interestRemaining) || 0,
    lateFee: Number(installment.lateFeeAccrued) || 0,
  });

  return {
    paidPrincipal: allocation.paidPrincipal,
    paidInterest: allocation.paidInterest,
    paidLateFee: allocation.paidLateFee,
    avGenerated: allocation.avGenerated,
  };
};

// --- RECONSTRUÇÃO DE ESTADO ---

export const rebuildLoanStateFromLedger = (loan: Loan): Loan => {
  if (loan.isArchived && (!loan.ledger || loan.ledger.length === 0)) return loan;

  const hasPersistedFinancialState = loan.installments.some(inst => {
    const scheduledPrincipal = round(Number(inst.scheduledPrincipal) || Number(inst.amount) || 0);
    const scheduledInterest = round(Number(inst.scheduledInterest) || 0);
    const principalRemaining = round(Number(inst.principalRemaining) || 0);
    const interestRemaining = round(Number(inst.interestRemaining) || 0);

    return (
      Number(inst.paidTotal || 0) > ZERO_BALANCE_THRESHOLD ||
      Number(inst.paidPrincipal || 0) > ZERO_BALANCE_THRESHOLD ||
      Number(inst.paidInterest || 0) > ZERO_BALANCE_THRESHOLD ||
      Number(inst.paidLateFee || 0) > ZERO_BALANCE_THRESHOLD ||
      Math.abs(principalRemaining - scheduledPrincipal) > ZERO_BALANCE_THRESHOLD ||
      Math.abs(interestRemaining - scheduledInterest) > ZERO_BALANCE_THRESHOLD ||
      Number(inst.lateFeeAccrued || 0) > ZERO_BALANCE_THRESHOLD
    );
  });

  if (hasPersistedFinancialState) {
    return {
      ...loan,
      installments: loan.installments.map(inst => ({
        ...inst,
        status: getInstallmentStatusLogic(inst, loan.status),
      })),
    };
  }

  const rebuiltInstallments = loan.installments.map(inst => ({
    ...inst,
    principalRemaining: round(Number(inst.scheduledPrincipal) || Number(inst.amount) || 0), 
    interestRemaining: round(Number(inst.scheduledInterest) || 0),
    lateFeeAccrued: 0, avApplied: 0, paidPrincipal: 0, paidInterest: 0, 
    paidLateFee: 0, paidTotal: 0, status: LoanStatus.PENDING, logs: [] as string[],
    renewalCount: 0, paidDate: undefined as string | undefined
  }));

  const sortedLedger = [...(loan.ledger || [])].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  sortedLedger.forEach(entry => {
    const entryInstId = entry.installmentId ? String(entry.installmentId).trim() : null;
    if (entryInstId) {
      const inst = rebuiltInstallments.find(i => String(i.id).trim() === entryInstId);
      if (inst) {
        inst.paidPrincipal = round(inst.paidPrincipal + (Number(entry.principalDelta) || 0));
        inst.paidInterest = round(inst.paidInterest + (Number(entry.interestDelta) || 0));
        inst.paidLateFee = round(inst.paidLateFee + (Number(entry.lateFeeDelta) || 0));
        inst.paidTotal = round(inst.paidTotal + (Number(entry.amount) || 0));
        
        const pDelta = Number(entry.principalDelta) || 0;
        const iDelta = Number(entry.interestDelta) || 0;

        inst.principalRemaining = Math.max(0, round(inst.principalRemaining - pDelta));
        inst.interestRemaining = round(inst.interestRemaining - iDelta);
        
        if (['PAYMENT_PARTIAL', 'PAYMENT_INTEREST_ONLY', 'PAYMENT_FULL'].includes(entry.type || '')) {
            if (iDelta > 0 && pDelta === 0) {
                 inst.renewalCount = (inst.renewalCount || 0) + 1;
            }
        }
        if (entry.notes) inst.logs?.push(entry.notes);
      }
    }
  });

  rebuiltInstallments.forEach(inst => {
    // A lógica de status agora é chamada aqui, após o ledger ser processado
    inst.status = getInstallmentStatusLogic(inst, loan.status);
    if (inst.status === LoanStatus.PAID && !inst.paidDate) {
       const instId = String(inst.id).trim();
       const lastPayment = sortedLedger.filter(e => String(e.installmentId).trim() === instId).pop();
       if (lastPayment) inst.paidDate = lastPayment.date;
    }
  });

  return { ...loan, installments: rebuiltInstallments };
};

// --- ATUALIZAÇÃO EM LOTE ---

export const refreshAllLateFees = (loans: Loan[]): Loan[] => {
  return loans.map(loan => {
    const rebuiltLoan = rebuildLoanStateFromLedger(loan);
    const updatedInstallments = rebuiltLoan.installments.map(inst => {
      const debt = calculateTotalDue(rebuiltLoan, inst);
      return { ...inst, lateFeeAccrued: debt.lateFee };
    });
    return { ...rebuiltLoan, installments: updatedInstallments };
  });
};
