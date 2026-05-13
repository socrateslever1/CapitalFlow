
import { Loan, LoanStatus } from "../../types";
import { getDaysDiff } from "../../utils/dateHelpers";

export type RiskLevel = 'BAIXO' | 'MODERADO' | 'ALTO' | 'CRITICO';

export interface RiskProfile {
  score: number; // 0-100
  level: RiskLevel;
  flags: string[];
  isPotentialDefaulter: boolean;
  isHighRisk: boolean;
}

/**
 * Calcula o perfil de risco de um contrato baseado em comportamento financeiro
 */
export const calculateRiskProfile = (loan: Loan): RiskProfile => {
  let score = 0;
  const flags: string[] = [];
  
  // 1. Analisa Atraso Atual
  const firstLateInst = [...(loan.installments || [])]
    .filter(i => i.status !== LoanStatus.PAID && i.status !== LoanStatus.PAGO)
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];

  const daysLate = firstLateInst ? Math.max(0, getDaysDiff(firstLateInst.dueDate)) : 0;
  
  if (daysLate > 0) {
    score += Math.min(40, daysLate * 2);
    if (daysLate > 15) flags.push("Atraso Severo (>15 dias)");
    else if (daysLate > 5) flags.push("Atraso Recorrente");
  }

  // 2. Analisa Esforço de Cobrança
  const billingCount = loan.billing_count || 0;
  if (billingCount > 0) {
    score += Math.min(30, billingCount * 3);
    if (billingCount > 10) flags.push("Cobrança Intensiva");
    else if (billingCount > 5) flags.push("Dificuldade de Contato");
  }

  // 3. Analisa Histórico de Pagamento e Amortização
  const hasInstallments = loan.installments && loan.installments.length > 0;
  if (hasInstallments) {
    const totalRenewals = loan.installments.reduce((acc, i) => acc + (i.renewalCount || 0), 0);
    if (totalRenewals > 3) {
      score += 15;
      flags.push("Ciclo de Renovação (Apenas Juros)");
    }
  }

  // 4. Analisa Acordos e Renegociações
  if (loan.activeAgreement) {
    score += 10;
    flags.push("Em Acordo de Inadimplência");
  }
  
  if (loan.pastAgreements && loan.pastAgreements.length > 0) {
    const brokenAgreements = loan.pastAgreements.filter(a => a.status === 'BROKEN' || a.status === 'QUEBRADO');
    if (brokenAgreements.length > 0) {
      score += 20;
      flags.push("Histórico de Acordos Quebrados");
    }
  }

  // 5. Identificação de "Potencial Calote"
  // Critério: Cobrado mais de 7 vezes e está com atraso > 7 dias sem nenhum pagamento parcial recente
  const isPotentialDefaulter = billingCount > 7 && daysLate > 7;
  if (isPotentialDefaulter) {
    score = Math.max(score, 85);
    flags.push("ALERTA DE CALOTE");
  }

  // Determina Nível
  let level: RiskLevel = 'BAIXO';
  if (score >= 80) level = 'CRITICO';
  else if (score >= 50) level = 'ALTO';
  else if (score >= 20) level = 'MODERADO';

  return {
    score: Math.min(100, score),
    level,
    flags,
    isPotentialDefaulter,
    isHighRisk: level === 'ALTO' || level === 'CRITICO'
  };
};
