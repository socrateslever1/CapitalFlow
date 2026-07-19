import { AgreementInstallment, Installment, Loan } from '../../types';
import { hasActiveAgreement, isInstallmentPaid } from './calculations';
import { getDaysDiff, parseDateOnlyUTC } from '../../utils/dateHelpers';

export type RiskLevel = 'BAIXO' | 'MODERADO' | 'ALTO' | 'CRITICO';
export type RiskCategory = 'REGULAR' | 'PAGAMENTO' | 'COBRANCA' | 'HISTORICO' | 'DOCUMENTAL';

export interface RiskProfile {
  score: number;
  level: RiskLevel;
  category: RiskCategory;
  label: string;
  flags: string[];
  daysLate: number;
  isCurrentlyLate: boolean;
  isPotentialDefaulter: boolean;
  isHighRisk: boolean;
}

type RiskInstallment = Installment | AgreementInstallment;

const getCurrentSchedule = (loan: Loan): RiskInstallment[] => {
  if (hasActiveAgreement(loan) && Array.isArray(loan.activeAgreement?.installments)) {
    return loan.activeAgreement.installments;
  }

  return Array.isArray(loan.installments) ? loan.installments : [];
};

const getCurrentDaysLate = (loan: Loan): number => {
  const overdueDays = getCurrentSchedule(loan)
    .filter((installment) => !isInstallmentPaid(installment, loan.status))
    .map((installment) => ({
      dueDate: installment.dueDate,
      daysLate: Math.max(0, getDaysDiff(installment.dueDate)),
    }))
    .filter(({ dueDate, daysLate }) => Number.isFinite(parseDateOnlyUTC(dueDate).getTime()) && daysLate > 0)
    .map(({ daysLate }) => daysLate);

  return overdueDays.length > 0 ? Math.max(...overdueDays) : 0;
};

/**
 * Classifica risco operacional sem confundir fragilidade documental ou
 * historico de renegociacao com inadimplencia atual.
 */
export const calculateRiskProfile = (loan: Loan): RiskProfile => {
  const flags: string[] = [];
  const daysLate = getCurrentDaysLate(loan);
  const isCurrentlyLate = daysLate > 0;
  const billingCount = Math.max(0, Number(loan.billing_count) || 0);
  const agreementIsActive = hasActiveAgreement(loan);
  let score = 0;
  let category: RiskCategory = 'REGULAR';
  let label = 'Regular';

  if (daysLate > 0) {
    score += Math.min(55, daysLate * 1.5);
    category = 'PAGAMENTO';
    label = daysLate >= 30 ? 'Atraso crítico' : daysLate >= 8 ? 'Atraso relevante' : 'Atenção ao vencimento';
    flags.push(`Parcela atual vencida ha ${daysLate} dia${daysLate === 1 ? '' : 's'}`);
  }

  // Cobrancas antigas sao contexto, nao prova de inadimplencia presente.
  if (isCurrentlyLate && billingCount > 0) {
    score += Math.min(20, billingCount * 2);
    if (billingCount >= 5) {
      flags.push(`${billingCount} tentativas de cobranca registradas`);
      if (daysLate < 8) {
        category = 'COBRANCA';
        label = 'Cobrança recorrente';
      }
    }
  }

  if (agreementIsActive) {
    if (isCurrentlyLate) {
      score += 10;
      flags.push('Acordo ativo com parcela vencida');
    } else {
      flags.push('Acordo ativo em dia');
    }
  } else {
    const totalRenewals = (loan.installments || []).reduce(
      (total, installment) => total + Math.max(0, Number(installment.renewalCount) || 0),
      0,
    );

    if (totalRenewals > 3) {
      score += 10;
      flags.push('Historico de renovacoes somente com juros');
      if (!isCurrentlyLate) {
        category = 'HISTORICO';
        label = 'Histórico de risco';
      }
    }
  }

  const brokenAgreements = (loan.pastAgreements || []).filter((agreement) =>
    ['BROKEN', 'QUEBRADO'].includes(String(agreement.status || '').toUpperCase()),
  ).length;

  if (brokenAgreements > 0) {
    score += isCurrentlyLate ? 20 : 10;
    flags.push(`${brokenAgreements} acordo${brokenAgreements === 1 ? '' : 's'} quebrado${brokenAgreements === 1 ? '' : 's'} no historico`);
    if (!isCurrentlyLate) {
      category = 'HISTORICO';
      label = 'Histórico de risco';
    }
  }

  // Ausencia de formalizacao e uma frente propria, nunca um sinal de calote.
  const agreementMissingDocument = agreementIsActive && !loan.activeAgreement?.legalDocumentId;
  if (agreementMissingDocument) {
    flags.push('Acordo sem documento formal vinculado');
    if (!isCurrentlyLate && category === 'REGULAR') {
      score += 10;
      category = 'DOCUMENTAL';
      label = 'Risco documental';
    }
  }

  // Alerta grave exige atraso atual prolongado e cobranca persistente.
  const isPotentialDefaulter = daysLate >= 30 && billingCount >= 8;
  if (isPotentialDefaulter) {
    score = Math.max(score, 85);
    category = 'PAGAMENTO';
    label = 'Inadimplência crítica';
    flags.push('Atraso prolongado com cobranca persistente');
  }

  const normalizedScore = Math.min(100, Math.round(score));
  let level: RiskLevel = 'BAIXO';
  if (normalizedScore >= 80) level = 'CRITICO';
  else if (normalizedScore >= 50) level = 'ALTO';
  else if (normalizedScore >= 20) level = 'MODERADO';

  return {
    score: normalizedScore,
    level,
    category,
    label,
    flags,
    daysLate,
    isCurrentlyLate,
    isPotentialDefaulter,
    isHighRisk: level === 'ALTO' || level === 'CRITICO',
  };
};
