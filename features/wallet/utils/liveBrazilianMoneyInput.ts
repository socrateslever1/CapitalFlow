/**
 * Máscara monetária pt-BR para digitação de reais (não de centavos).
 * Inteiros crescem à esquerda da vírgula; as duas casas decimais não migram.
 * Mantém a posição lógica do cursor quando surgem pontos de milhar.
 * Uma entrada ambígua nunca é convertida silenciosamente em outro valor.
 */
export type LiveBrazilianMoney = Readonly<{ value: string; caret: number }>;

export function formatLiveBrazilianMoney(raw: string, selectionStart: number): LiveBrazilianMoney | null {
  if (raw === '') return { value: '', caret: 0 };
  if (raw.length > 32 || !/^[\d.,]+$/.test(raw)) return null;
  const firstComma = raw.indexOf(',');
  if (firstComma !== raw.lastIndexOf(',')) return null;
  // Um ponto seguido de 1–2 dígitos, sem vírgula, pode significar centavos.
  // Não transformar 123.45 silenciosamente em R$ 12.345,00.
  if (firstComma < 0 && /^\d+\.\d{1,2}$/.test(raw)) return null;
  const rawIntegerPart = firstComma < 0 ? raw : raw.slice(0, firstComma);
  // Existing grouping dots may become temporarily misplaced while inserting a digit.
  // Normalize the integer part and reapply grouping atomically; never reinterpret cents.
  if (rawIntegerPart.includes('.') && firstComma < 0 && !/^\d{1,3}(?:\.\d{3})+$/.test(rawIntegerPart)) return null;
  const integerRaw = (firstComma < 0 ? raw : raw.slice(0, firstComma)).replace(/\./g, '');
  const fractionRaw = firstComma < 0 ? '' : raw.slice(firstComma + 1);
  if (!/^\d+$/.test(integerRaw) || !/^\d{0,2}$/.test(fractionRaw)) return null;

  const integer = integerRaw.replace(/^0+(?=\d)/, '');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const value = grouped + ',' + fractionRaw.padEnd(2, '0');
  const safeStart = Math.max(0, Math.min(Math.trunc(selectionStart) || 0, raw.length));
  const comma = value.indexOf(',');

  if (firstComma >= 0 && safeStart > firstComma) {
    const decimalsBeforeCaret = raw.slice(firstComma + 1, safeStart).length;
    return { value, caret: Math.min(value.length, comma + 1 + decimalsBeforeCaret) };
  }
  const integerDigitsBeforeCaret = raw.slice(0, firstComma < 0 ? safeStart : Math.min(safeStart, firstComma))
    .replace(/\D/g, '').length;
  const discardedLeadingZeros = integerRaw.length - integer.length;
  const retainedDigitsBeforeCaret = Math.max(0, integerDigitsBeforeCaret - discardedLeadingZeros);
  if (!retainedDigitsBeforeCaret) return { value, caret: 0 };
  let seen = 0;
  for (let i = 0; i < comma; i++) {
    if (/\d/.test(value[i]) && ++seen === retainedDigitsBeforeCaret) {
      return { value, caret: i + 1 };
    }
  }
  return { value, caret: comma };
}
