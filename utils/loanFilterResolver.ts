import { Loan, LoanStatus } from '../types';
import { loanEngine } from '../domain/loanEngine';
import { getDaysDiff } from './dateHelpers';
import { ZERO_BALANCE_THRESHOLD } from '../domain/finance/calculations';

export type LoanVisualClassification =
  | 'EM_DIA'
  | 'ATRASADO'
  | 'CRITICO'
  | 'QUITADO'
  | 'RENEGOCIADO'
  | 'ARQUIVADO'
  | 'IGNORAR';

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
    loan.installments.length > 0 && loan.installments.every((i) => i.status === LoanStatus.PAID);
  const totalRemaining = loanEngine.computeRemainingBalance(loan).totalRemaining;
  const isZeroBalance = totalRemaining <= ZERO_BALANCE_THRESHOLD;
  const isAgreementFinalized =
    !!loan.activeAgreement && ['PAID', 'PAGO', 'FINALIZADO'].includes(loan.activeAgreement.status);

  if (hasPaidStatus || allInstallmentsPaid || isZeroBalance || isAgreementFinalized) {
    return 'QUITADO';
  }

  // Atraso para contratos normais
  const engineStatus = loanEngine.computeLoanStatus(loan);
  if (engineStatus === 'OVERDUE') {
    const maxDelay = Math.max(
      0,
      ...loan.installments.map((i) => {
        if (i.status === LoanStatus.PAID || i.status === LoanStatus.RENEGOCIADO) return 0;
        return getDaysDiff(i.dueDate);
      })
    );
    return maxDelay >= 30 ? 'CRITICO' : 'ATRASADO';
  }

  return 'EM_DIA';
};
