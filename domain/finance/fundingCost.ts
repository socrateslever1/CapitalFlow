/**
 * Apuração do custo da origem do capital.
 * O principal do devedor não inclui taxas pagas pelo credor.
 * Todos os cálculos monetários são normalizados em centavos.
 */
const toCents = (value: number, label: string): number => {
  if (!Number.isFinite(value) || value < 0 || value > 1_000_000_000) {
    throw new RangeError(`${label} deve ser um valor não negativo e finito.`);
  }
  return Math.round((value + Number.EPSILON) * 100);
};

export const roundMoney = (value: number): number =>
  toCents(value, 'Valor') / 100;

export type FundingSummaryInput = {
  principal: number;
  customerTotal: number;
  /** Valor total da obrigação com o financiador (inclui principal). */
  fundingTotal?: number | null;
  /** Custo explícito, usado quando não há total informado. */
  fundingCost?: number | null;
};

export type FundingSummary = {
  principal: number;
  customerTotal: number;
  fundingTotal: number;
  fundingCost: number;
  grossProfit: number;
  netProfit: number;
  netReturnPercent: number;
};

/** Exige consistência entre o custo informado e o total ao financiador. */
export function calculateFundingSummary(input: FundingSummaryInput): FundingSummary {
  const principalCents = toCents(input.principal, 'Principal');
  const customerCents = toCents(input.customerTotal, 'Total do cliente');
  if (principalCents <= 0) throw new RangeError('O principal deve ser maior que zero.');
  const hasTotal = input.fundingTotal !== undefined && input.fundingTotal !== null;
  const hasCost = input.fundingCost !== undefined && input.fundingCost !== null;
  const totalCents = hasTotal
    ? toCents(input.fundingTotal as number, 'Total do financiador')
    : principalCents + (hasCost ? toCents(input.fundingCost as number, 'Custo') : 0);
  if (totalCents < principalCents) {
    throw new RangeError('O total cobrado pelo financiador não pode ser menor que o principal.');
  }
  const costCents = totalCents - principalCents;
  if (hasCost && Math.abs(toCents(input.fundingCost as number, 'Custo') - costCents) > 1) {
    throw new RangeError('Custo e total do financiamento não conferem.');
  }
  const grossCents = customerCents - principalCents;
  return {
    principal: principalCents / 100,
    customerTotal: customerCents / 100,
    fundingTotal: totalCents / 100,
    fundingCost: costCents / 100,
    grossProfit: grossCents / 100,
    netProfit: (grossCents - costCents) / 100,
    netReturnPercent: Math.round((grossCents - costCents) / principalCents * 10000) / 100,
  };
}

/** Prioriza custo explícito nos dados antigos, sem inventar pagamentos. */
export function readLoanFundingCost(loan: {
  principal?: number | null;
  fundingTotalPayable?: number | null;
  fundingCost?: number | null;
}): number {
  const cost = Number(loan.fundingCost);
  if (loan.fundingCost !== undefined && loan.fundingCost !== null
      && Number.isFinite(cost) && cost >= 0) {
    return Math.round((cost + Number.EPSILON) * 100) / 100;
  }
  const principal = Number(loan.principal);
  const total = Number(loan.fundingTotalPayable);
  if (!Number.isFinite(principal) || principal < 0 ||
      !Number.isFinite(total) || total <= principal) return 0;
  return Math.round((total - principal + Number.EPSILON) * 100) / 100;
}
