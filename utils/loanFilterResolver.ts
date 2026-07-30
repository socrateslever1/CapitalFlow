import { Installment, Loan, LoanStatus } from '../types';
import { loanEngine } from '../domain/loanEngine';
import { getDaysDiff } from './dateHelpers';
import { ZERO_BALANCE_THRESHOLD, isInstallmentPaid } from '../domain/finance/calculations';

export type LoanVisualClassification =
  | 'EM_DIA'
  | 'ATRASADO'
  | 'CRITICO'
  | 'QUITADO'
  | 'RENEGOCIADO'
  | 'ARQUIVADO'
  | 'IGNORAR';

const hasValidPaymentOffer = (installment: Installment | any) =>
  String(installment?.paymentOfferStatus || '').toUpperCase() === 'ACTIVE'
  && String(installment?.paymentOfferValidUntil || '').slice(0, 10) >= new Date().toISOString().slice(0, 10)
  && Number(installment?.paymentOfferAmount || 0) > ZERO_BALANCE_THRESHOLD;

export const getLoanNextDueDate = (loan: Loan): string => {
  const hasActiveAgreement = !!loan.activeAgreement && ['ACTIVE', 'ATIVO'].includes(loan.activeAgreement.status);
  const installments = (hasActiveAgreement && Array.isArray(loan.activeAgreement?.installments))
    ? loan.activeAgreement.installments
    : loan.installments;
    
  const nextInst = [...(installments || [])]
    .filter(i => !isInstallmentPaid(i, loan.status))
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];
    
  return nextInst?.dueDate || '9999-12-31';
};

/**
 * Funcao unica para classificar contratos para fins de filtro visual.
 * Centraliza a regra de negocio do CapitalFlow.
 */
export const resolveLoanVisualClassification = (loan: Loan): LoanVisualClassification => {
  // Arquivamento explicito precisa ter classificacao propria para o filtro dedicado funcionar.
  if (loan.isArchived || loan.status === LoanStatus.ARQUIVADO) {
    return 'ARQUIVADO';
  }

  // Renegociacao.
  const hasActiveAgreement =
    !!loan.activeAgreement && ['ACTIVE', 'ATIVO'].includes(loan.activeAgreement.status);

  if (loan.status === LoanStatus.RENEGOCIADO || loan.status === LoanStatus.EM_ACORDO || hasActiveAgreement) {
    return 'RENEGOCIADO';
  }

  // Verificacoes de quitacao.
  const hasPaidStatus = [LoanStatus.QUITADO, LoanStatus.PAGO, LoanStatus.PAID].includes(loan.status);
  const allInstallmentsPaid =
    loan.installments.length > 0 && loan.installments.every((i) => isInstallmentPaid(i, loan.status));
  const totalRemaining = loanEngine.computeRemainingBalance(loan).totalRemaining;
  const isZeroBalance = totalRemaining <= ZERO_BALANCE_THRESHOLD;
  const isAgreementFinalized =
    !!loan.activeAgreement && ['PAID', 'PAGO', 'FINALIZADO'].includes(loan.activeAgreement.status);

  if (hasPaidStatus || allInstallmentsPaid || isZeroBalance || isAgreementFinalized) {
    return 'QUITADO';
  }

  // Atraso para acordos ativos
  if (hasActiveAgreement && Array.isArray(loan.activeAgreement?.installments)) {
    const pendingInsts = loan.activeAgreement.installments.filter(i => !isInstallmentPaid(i, loan.status));

    let maxDelay = 0;
    pendingInsts.forEach(i => {
      const delay = getDaysDiff(i.dueDate);
      if (delay > maxDelay) maxDelay = delay;
    });

    if (maxDelay > 0) {
      return maxDelay >= 30 ? 'CRITICO' : 'ATRASADO';
    }
    return 'RENEGOCIADO';
  }

  // Atraso para contratos normais
  const engineStatus = loanEngine.computeLoanStatus(loan);
  if (engineStatus === 'OVERDUE') {
    const maxDelay = Math.max(
      0,
      ...loan.installments.map((i) => {
        if (isInstallmentPaid(i, loan.status) || i.status === LoanStatus.RENEGOCIADO || hasValidPaymentOffer(i)) return 0;
        return getDaysDiff(i.dueDate);
      })
    );
    if (maxDelay <= 0) return 'EM_DIA';
    return maxDelay >= 30 ? 'CRITICO' : 'ATRASADO';
  }

  return 'EM_DIA';
};
