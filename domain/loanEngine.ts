// domain/loanEngine.ts
import { Loan } from '../types';
import {
  allocatePaymentFromBuckets,
  calculateInstallmentPaymentPlan,
  computeLoanRemainingBalance,
  hasActiveAgreement,
  InstallmentPaymentPlan,
  isAgreementInstallmentPaid,
  ZERO_BALANCE_THRESHOLD,
} from './finance/calculations';
import { parseDateOnlyUTC, todayDateOnlyUTC } from '../utils/dateHelpers';

/**
 * HARDENING (HMR/imports):
 * Alguns ambientes (Vite/HMR + importacoes inconsistentes) podem deixar este modulo
 * em estado "parcial" durante hot-reload, gerando erros do tipo:
 *   "loanEngine.isLegallyActionable is not a function"
 *
 * Para blindar:
 * 1) Mantemos export named (`loanEngine`) e default.
 * 2) Exportamos `isLegallyActionable` tambem como funcao isolada.
 */

type RemainingBalance = {
  totalRemaining: number;
  principalRemaining: number;
  interestRemaining: number;
  lateFeeRemaining: number;
};

type Amortization = {
  paidPrincipal: number;
  paidInterest: number;
  paidLateFee: number;
};

const n = (v: any) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

const getInstallments = (loan: any): any[] =>
  Array.isArray(loan?.installments) ? loan.installments : [];

const getAgreementInstallments = (loan: any): any[] =>
  Array.isArray(loan?.activeAgreement?.installments) ? loan.activeAgreement.installments : [];

const getDueDate = (inst: any): Date | null => {
  const raw = inst?.data_vencimento ?? inst?.dueDate ?? inst?.due_date;
  if (!raw) return null;
  const d = parseDateOnlyUTC(raw);
  return Number.isNaN(d.getTime()) ? null : d;
};

const engine = {
  /**
   * Status do contrato para UI:
   * - PAID: saldo total ~ 0
   * - OVERDUE: existe parcela vencida nao paga
   * - ACTIVE: caso contrario
   */
  computeLoanStatus(loan: Loan): 'PAID' | 'ACTIVE' | 'OVERDUE' {
    const bal = engine.computeRemainingBalance(loan);
    if (n(bal.totalRemaining) <= ZERO_BALANCE_THRESHOLD) return 'PAID';

    const today = todayDateOnlyUTC();
    const useAgreement = hasActiveAgreement(loan);
    const schedule = useAgreement ? getAgreementInstallments(loan) : getInstallments(loan);

    const overdue = schedule.some((inst) => {
      if (useAgreement) {
        if (isAgreementInstallmentPaid(inst)) return false;
      } else {
        const status = String(inst?.status || '').toUpperCase();
        // Ignora parcelas que foram movidas para acordo ou canceladas
        if (status === 'RENEGOCIADO' || status === 'CANCELADO') return false;

        const principalOpen = n(inst?.principal_remaining ?? inst?.principalRemaining);
        const interestOpen = n(inst?.interest_remaining ?? inst?.interestRemaining);
        const lateFeeOpen = n(inst?.late_fee_accrued ?? inst?.lateFeeAccrued);
        if (principalOpen + interestOpen + lateFeeOpen <= ZERO_BALANCE_THRESHOLD) return false;

        if (status === 'PAID' || status === 'PAGO' || status === 'QUITADO') return false;
      }

      const due = getDueDate(inst);
      if (!due) return false;
      return due.getTime() < today.getTime();
    });

    return overdue ? 'OVERDUE' : 'ACTIVE';
  },

  /**
   * Soma tudo o que ainda falta receber no contrato.
   */
  computeRemainingBalance(loan: Loan): RemainingBalance {
    return computeLoanRemainingBalance(loan);
  },

  /**
   * Amortizacao seletiva por contrato inteiro:
   * multa -> juros -> principal
   */
  calculateAmortization(amount: number, loan: Loan): Amortization {
    const balance = engine.computeRemainingBalance(loan);
    if (n(amount) <= 0) {
      return { paidPrincipal: 0, paidInterest: 0, paidLateFee: 0 };
    }

    const allocation = allocatePaymentFromBuckets({
      paymentAmount: amount,
      principal: balance.principalRemaining,
      interest: balance.interestRemaining,
      lateFee: balance.lateFeeRemaining,
    });

    return {
      paidPrincipal: allocation.paidPrincipal,
      paidInterest: allocation.paidInterest,
      paidLateFee: allocation.paidLateFee,
    };
  },

  /**
   * Amortizacao seletiva da parcela atual:
   * multa -> juros -> principal
   */
  calculateInstallmentAmortization(
    amount: number,
    loan: Loan,
    installment: any,
    forgivenessMode: 'NONE' | 'FINE_ONLY' | 'MORA_ONLY' | 'FINE_AND_MORA' | 'TOTAL_CHARGES' | 'CAPITAL_ONLY' | 'INTEREST_ONLY' | 'BOTH' = 'NONE'
  ): InstallmentPaymentPlan {
    return calculateInstallmentPaymentPlan({
      loan,
      installment,
      paymentAmount: amount,
      forgivenessMode,
    });
  },

  /**
   * Renovacao: paga apenas juros + multa
   */
  calculateRenewal(loan: Loan): Amortization {
    const balance = engine.computeRemainingBalance(loan);
    return {
      paidPrincipal: 0,
      paidInterest: balance.interestRemaining,
      paidLateFee: balance.lateFeeRemaining,
    };
  },

  // Compat: mantem no objeto
  isLegallyActionable(loan: Loan): boolean {
    return isLegallyActionable(loan);
  },
};

/**
 * Regra de acionamento juridico (isolada):
 * - true se ainda existe saldo em aberto
 * - false para contratos quitados ou sem saldo devedor
 */
export function isLegallyActionable(loan: Loan): boolean {
  if (!loan) return false;

  const bal = engine.computeRemainingBalance(loan);
  return n(bal.totalRemaining) > ZERO_BALANCE_THRESHOLD;
}

export const loanEngine = engine;
export default engine;
