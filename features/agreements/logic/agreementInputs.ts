/**
 * Interpreta valores informados em reais sem perder centavos.
 * Aceita 200, 200,00, 1.000,00, 1000,00, 1000.00 e 1.000.
 * Retorna null em campos vazios ou ambíguos; nunca converte erro em zero.
 */
export function parseAgreementMoney(value: string): number | null {
  const text = value.trim().replace(/^R\$\s*/i, '').replace(/\s/g, '');
  if (!text || !/^[0-9.,]+$/.test(text)) return null;

  let normalized: string;
  if (text.includes(',')) {
    const parts = text.split(',');
    if (parts.length !== 2) return null;
    const [integer, fraction] = parts;
    if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)$/.test(integer) || !/^\d{1,2}$/.test(fraction)) {
      return null;
    }
    normalized = integer.replace(/\./g, '') + '.' + fraction.padEnd(2, '0');
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(text)) {
    normalized = text.replace(/\./g, '');
  } else if (/^\d+(?:\.\d{1,2})?$/.test(text)) {
    normalized = text;
  } else {
    return null;
  }

  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0 || !Number.isSafeInteger(Math.round(amount * 100))) {
    return null;
  }
  return Math.round(amount * 100) / 100;
}

export function parseAgreementInteger(value: string, max: number): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const number = Number(value.trim());
  return Number.isSafeInteger(number) && number >= 0 && number <= max ? number : null;
}

export function parseAgreementRate(value: string): number | null {
  if (!/^\d+(?:[,.]\d{1,4})?$/.test(value.trim())) return null;
  const rate = Number(value.trim().replace(',', '.'));
  return Number.isFinite(rate) && rate >= 0 && rate <= 100 ? rate : null;
}

/** A entrada é recebida à parte; parcelas compõem o restante da proposta. */
export function buildAgreementBreakdown(
  currentDebt: number,
  principalDebt: number,
  installmentsTotal: number,
  downPayment: number,
) {
  const cents = (amount: number) => Math.round(amount * 100);
  const currentCents = cents(currentDebt);
  const principalCents = cents(principalDebt);
  const agreedCents = cents(installmentsTotal) + cents(downPayment);
  return {
    agreedTotal: agreedCents / 100,
    waivedCharges: Math.max(0, currentCents - principalCents) / 100,
    reducedPrincipal: Math.max(0, principalCents - agreedCents) / 100,
    totalReduction: Math.max(0, currentCents - agreedCents) / 100,
    exceedsPrincipal: agreedCents > principalCents,
  };
}
