/**
 * CALCULADORA UNIFICADA DE EMPRÉSTIMO
 * Usada por: Simulador + payments.service.ts
 * Garante consistência de cálculo em todo o sistema
 */

export interface LoanCalculationInput {
  principal: number;
  dailyRate: number; // Taxa diária (ex: 0.05 para 5% ao dia)
  startDate: Date;
  dueDate: Date;
  lateFeeFixed?: number; // Multa fixa (ex: 50)
  lateFeeDaily?: number; // Mora diária (ex: 0.02 para 2% ao dia)
  forgiveness?: 'FINE_ONLY' | 'INTEREST_ONLY' | 'BOTH' | 'NONE';
  currentDate?: Date; // Data de cálculo (default: hoje)
  calculationMode?: 'NORMAL' | 'REVERSE'; // NORMAL: Principal -> Parcela | REVERSE: Parcela -> Principal/Prazo
  targetInstallmentValue?: number; // Usado apenas no modo REVERSE
}

export interface LoanCalculationOutput {
  principal: number;
  interest: number;
  lateFee: number;
  total: number;
  daysElapsed: number;
  isDueToday: boolean;
  isOverdue: boolean;
  daysOverdue: number;
  breakdown: {
    principal: number;
    interest: number;
    lateFee: number;
  };
  nextDueDate?: Date;
}

export interface SimulatorInput extends LoanCalculationInput {
  paymentAmount?: number;
  paymentType?: 'PARTIAL' | 'FULL' | 'RENEWAL';
}

export interface SimulatorOutput extends LoanCalculationOutput {
  paymentAmount?: number;
  remainingAfterPayment?: number;
  nextInstallmentDate?: Date;
}

// Calcular dias entre datas (normalizando para meia-noite UTC para evitar problemas de fuso horário/horário de verão)
function getDaysBetween(start: Date, end: Date): number {
  const s = new Date(start.getTime());
  s.setHours(0, 0, 0, 0);
  const e = new Date(end.getTime());
  e.setHours(0, 0, 0, 0);
  
  const diffTime = e.getTime() - s.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

// Calcular juros do período
function calculateInterest(
  principal: number,
  dailyRate: number,
  daysElapsed: number
): number {
  return principal * dailyRate * daysElapsed;
}

// Calcular multa por atraso
function calculateLateFee(
  principal: number,
  daysOverdue: number,
  lateFeeFixed: number = 0,
  lateFeeDaily: number = 0
): number {
  if (daysOverdue <= 0) return 0;

  const fixedPart = lateFeeFixed;
  const dailyPart = principal * lateFeeDaily * daysOverdue;
  return fixedPart + dailyPart;
}

// Aplicar perdão (FINE_ONLY / INTEREST_ONLY / BOTH)
function applyForgiveness(
  interest: number,
  lateFee: number,
  forgiveness?: string
): { interest: number; lateFee: number } {
  if (!forgiveness || forgiveness === 'NONE') {
    return { interest, lateFee };
  }

  if (forgiveness === 'FINE_ONLY') {
    return { interest, lateFee: 0 };
  }

  if (forgiveness === 'INTEREST_ONLY') {
    return { interest: 0, lateFee };
  }

  if (forgiveness === 'BOTH') {
    return { interest: 0, lateFee: 0 };
  }

  return { interest, lateFee };
}

// FUNÇÃO PRINCIPAL: Calcular empréstimo
export function calculateLoan(input: LoanCalculationInput): LoanCalculationOutput {
  const {
    dailyRate,
    startDate,
    dueDate,
    lateFeeFixed = 0,
    lateFeeDaily = 0,
    forgiveness = 'NONE',
    currentDate = new Date(),
    calculationMode = 'NORMAL',
    targetInstallmentValue = 0,
  } = input;

  let { principal } = input;

  // Validações
  if (dailyRate < 0 || startDate >= dueDate) {
    return {
      principal: 0,
      interest: 0,
      lateFee: 0,
      total: 0,
      daysElapsed: 0,
      isDueToday: false,
      isOverdue: false,
      daysOverdue: 0,
      breakdown: { principal: 0, interest: 0, lateFee: 0 },
      nextDueDate: new Date()
    };
  }

  // Calcular dias
  const daysElapsed = Math.max(0, getDaysBetween(startDate, currentDate));
  const daysToExpiry = getDaysBetween(currentDate, dueDate);
  const daysOverdue = Math.max(0, getDaysBetween(dueDate, currentDate));
  const isDueToday = daysToExpiry === 0;
  const isOverdue = daysOverdue > 0;

  // Modo REVERSE: Calcula o principal a partir da parcela desejada
  if (calculationMode === 'REVERSE' && targetInstallmentValue > 0) {
    // total = principal * (1 + dailyRate * daysElapsed)
    // principal = total / (1 + dailyRate * daysElapsed)
    principal = targetInstallmentValue / (1 + dailyRate * daysElapsed);
  }

  if (principal <= 0) {
    return {
      principal: 0,
      interest: 0,
      lateFee: 0,
      total: 0,
      daysElapsed: 0,
      isDueToday: false,
      isOverdue: false,
      daysOverdue: 0,
      breakdown: { principal: 0, interest: 0, lateFee: 0 },
      nextDueDate: new Date()
    };
  }

  // Calcular juros
  let interest = calculateInterest(principal, dailyRate, daysElapsed);

  // Calcular multa
  let lateFee = calculateLateFee(principal, daysOverdue, lateFeeFixed, lateFeeDaily);

  // Aplicar perdão
  const forgiven = applyForgiveness(interest, lateFee, forgiveness);
  interest = forgiven.interest;
  lateFee = forgiven.lateFee;

  // Total
  const total = principal + interest + lateFee;

  // Próximo vencimento (se renovar)
  // CORREÇÃO: Garantir que o próximo vencimento não seja no passado
  const today = new Date();
  const baseDate = dueDate < today ? today : dueDate;
  const nextDueDate = new Date(baseDate);
  nextDueDate.setDate(nextDueDate.getDate() + 30); // +30 dias a partir da base válida

  return {
    principal: Math.round(principal * 100) / 100,
    interest: Math.round(interest * 100) / 100,
    lateFee: Math.round(lateFee * 100) / 100,
    total: Math.round(total * 100) / 100,
    daysElapsed,
    isDueToday,
    isOverdue,
    daysOverdue,
    breakdown: {
      principal: Math.round(principal * 100) / 100,
      interest: Math.round(interest * 100) / 100,
      lateFee: Math.round(lateFee * 100) / 100,
    },
    nextDueDate,
  };
}

// SIMULADOR: Projetar pagamento
export function simulatePayment(input: SimulatorInput): SimulatorOutput {
  const { paymentAmount = 0, paymentType = 'PARTIAL', ...calculationInput } = input;

  // Calcular valores atuais
  const current = calculateLoan(calculationInput);

  // Aplicar pagamento (late_fee → interest → principal)
  let remaining = paymentAmount;
  let paidLateFee = Math.min(remaining, current.lateFee);
  remaining -= paidLateFee;

  let paidInterest = Math.min(remaining, current.interest);
  remaining -= paidInterest;

  let paidPrincipal = Math.min(remaining, current.principal);
  remaining -= paidPrincipal;

  // Calcular saldo
  const remainingAfterPayment = current.total - paymentAmount;

  // Próxima data de vencimento
  let nextInstallmentDate: Date | undefined;
  if (paymentType === 'FULL' && remainingAfterPayment <= 0) {
    // Quitação: sem próximo vencimento
    nextInstallmentDate = undefined;
  } else if (paymentType === 'RENEWAL') {
    // Renovação: +30 dias
    // CORREÇÃO: Garantir que a próxima data não seja no passado
    const today = new Date();
    const baseDate = calculationInput.dueDate < today ? today : calculationInput.dueDate;
    nextInstallmentDate = new Date(baseDate);
    nextInstallmentDate.setDate(nextInstallmentDate.getDate() + 30);
  } else {
    // Parcial: mesmo vencimento
    nextInstallmentDate = calculationInput.dueDate;
  }

  return {
    ...current,
    paymentAmount,
    remainingAfterPayment: Math.max(0, remainingAfterPayment),
    nextInstallmentDate,
  };
}

// HELPER: Formatar para exibição
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

// HELPER: Formatar data
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR').format(date);
}
