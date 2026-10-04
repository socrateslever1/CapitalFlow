export type FundingAllocationInput = {
  sourceId: string;
  amount: number;
};

export type FundingAllocation = FundingAllocationInput & {
  percentage: number;
};

export type FundingValidation =
  | { ok: true; allocations: FundingAllocation[]; total: number }
  | { ok: false; error: string };

const CENT = 0.01;

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function validateFundingAllocations(
  principal: number,
  inputs: FundingAllocationInput[],
): FundingValidation {
  const target = money(Number(principal));
  if (!Number.isFinite(target) || target <= 0) return { ok: false, error: 'O capital do contrato deve ser maior que zero.' };
  if (!Array.isArray(inputs) || inputs.length === 0) return { ok: false, error: 'Selecione ao menos uma fonte de capital.' };

  const merged = new Map<string, number>();
  for (const input of inputs) {
    const sourceId = String(input?.sourceId || '').trim();
    const amount = money(Number(input?.amount));
    if (!sourceId) return { ok: false, error: 'Existe uma fonte de capital inválida.' };
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: 'Os valores das fontes devem ser maiores que zero.' };
    merged.set(sourceId, money((merged.get(sourceId) || 0) + amount));
  }

  const total = money([...merged.values()].reduce((sum, amount) => sum + amount, 0));
  if (Math.abs(total - target) >= CENT / 2) {
    return { ok: false, error: `A distribuição deve totalizar ${target.toFixed(2)}.` };
  }

  const allocations = [...merged.entries()].map(([sourceId, amount]) => ({
    sourceId,
    amount,
    percentage: money((amount / target) * 100),
  }));

  return { ok: true, allocations, total };
}

export function distributeRecoveredPrincipal(
  amount: number,
  allocations: FundingAllocation[],
): FundingAllocation[] {
  const recovered = money(Math.max(0, Number(amount) || 0));
  if (recovered === 0 || allocations.length === 0) return allocations.map((allocation) => ({ ...allocation, amount: 0 }));

  const ordered = [...allocations].sort((a, b) => a.sourceId.localeCompare(b.sourceId));
  const shares = ordered.map((allocation) => ({
    ...allocation,
    amount: money(recovered * allocation.percentage / 100),
  }));
  const assigned = money(shares.reduce((sum, share) => sum + share.amount, 0));
  const remainder = money(recovered - assigned);
  if (remainder !== 0) shares[shares.length - 1].amount = money(shares[shares.length - 1].amount + remainder);
  return shares;
}
