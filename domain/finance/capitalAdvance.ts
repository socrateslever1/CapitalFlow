const money = (value: number) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export const calculateAdditionalCapital = (requestedPrincipal: number, currentPrincipal: number): number => {
  const requested = money(requestedPrincipal);
  const current = money(currentPrincipal);
  return requested > current + 0.005 ? money(requested - current) : 0;
};

export const isPrincipalReduction = (requestedPrincipal: number, currentPrincipal: number): boolean =>
  money(requestedPrincipal) < money(currentPrincipal) - 0.005;
