
import { Loan, Installment } from '../../../types';

export const normalizeLoanForCalc = (loan: any): Loan => {
  if (!loan) return loan;

  return {
    ...loan,
    // principais
    principal: Number(loan.principal ?? 0),
    totalToReceive: Number(loan.total_to_receive ?? loan.totalToReceive ?? 0),

    // taxas
    interestRate: Number(loan.interest_rate ?? loan.interestRate ?? 0),
    finePercent: Number(loan.fine_percent ?? loan.finePercent ?? 0),
    dailyInterestPercent: Number(loan.daily_interest_percent ?? loan.dailyInterestPercent ?? 0),

    // modalidade
    billingCycle: loan.billing_cycle ?? loan.billingCycle,
    amortizationType: loan.amortization_type ?? loan.amortizationType,

    // datas
    startDate: loan.start_date ?? loan.startDate,

    // snapshot
    policiesSnapshot: loan.policies_snapshot ?? loan.policiesSnapshot ?? null
  } as Loan;
};

export const normalizeInstallmentForCalc = (inst: any): Installment => {
  if (!inst) return inst;

  return {
    ...inst,
    id: inst.id,
    loanId: inst.loan_id ?? inst.loanId,
    profileId: inst.profile_id ?? inst.profileId,
    number: inst.numero_parcela ?? inst.number ?? 0,

    // datas/valores
    dueDate: inst.data_vencimento ?? inst.dueDate,
    amount: Number(inst.valor_parcela ?? inst.amount ?? 0),

    // campos que o motor financeiro usa
    scheduledPrincipal: Number(inst.scheduled_principal ?? inst.scheduledPrincipal ?? 0),
    scheduledInterest: Number(inst.scheduled_interest ?? inst.scheduledInterest ?? 0),
    principalRemaining: Number(inst.principal_remaining ?? inst.principalRemaining ?? 0),
    interestRemaining: Number(inst.interest_remaining ?? inst.interestRemaining ?? 0),
    lateFeeAccrued: Number(inst.late_fee_accrued ?? inst.lateFeeAccrued ?? 0),
    paidTotal: Number(inst.paid_total ?? inst.paidTotal ?? 0),

    status: inst.status
  } as Installment;
};
