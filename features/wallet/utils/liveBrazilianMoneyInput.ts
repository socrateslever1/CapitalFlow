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


import { parseWalletMoney, parseWalletRate, parseWalletSignedMoney } from './parseWalletMoney';

/**
 * A colagem é uma quantia declarada, NÃO uma sequência de teclas.
 * "700" colado representa R$ 700,00; "880" digitado tecla a tecla dá R$ 8,80.
 */
export function formatPastedBrazilianMoney(raw: string, rate = false, signed = false): string {
  const cleaned = raw.trim().replace(/^R\$\s*/i, '').trim();
  const amount = rate ? parseWalletRate(cleaned, 'taxa') : signed ? parseWalletSignedMoney(cleaned, 'valor') : parseWalletMoney(cleaned, 'valor');
  return amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: rate ? 6 : 2 });
}

/** Formata o operando corrente de uma expressão, preservando os anteriores. */
export function formatMoneyExpressionOperand(raw: string, caret: number, centsEntry = true): LiveBrazilianMoney | null {
  if (!/^[\d.,+\-×÷*/%()\s]*$/.test(raw)) return null;
  const before = raw.slice(0, caret);
  const start = Math.max(0, ...[...before.matchAll(/[+\-×÷*/%()]/g)].map(match => (match.index ?? 0) + 1));
  const end = raw.slice(caret).search(/[+\-×÷*/%()]/);
  const stop = end < 0 ? raw.length : caret + end;
  const operand = raw.slice(start, stop);
  if (!operand || !/[\d]/.test(operand)) return { value: raw, caret };
  const formatted = centsEntry ? formatLiveBrazilianCents(operand) : formatLiveBrazilianMoney(operand, caret - start);
  if (!formatted) return null;
  return { value: raw.slice(0, start) + formatted.value + raw.slice(stop), caret: start + formatted.caret };
}

/** Um operador divide uma quantia já exibida em duas quantias declaradas. */
export function insertMoneyExpressionOperator(current: string, operator: string, selectionStart: number, selectionEnd = selectionStart): LiveBrazilianMoney | null {
  if (!/^[+\-×÷*/]$/.test(operator)) return null;
  if (!/^[\d.,+\-×÷*/%()]*$/.test(current)) return null;
  const selectedAll = current.length > 0 && selectionStart === 0 && selectionEnd === current.length;
  const start = selectedAll ? current.length : selectionStart;
  const end = selectedAll ? current.length : selectionEnd;
  if (start < 0 || end < start || end > current.length) return null;
  const leftBoundary = Math.max(0, ...[...current.slice(0, start).matchAll(/[+\-×÷*/%()]/g)].map(match => (match.index ?? 0) + 1));
  const rightOffset = current.slice(end).search(/[+\-×÷*/%()]/);
  const rightBoundary = rightOffset < 0 ? current.length : end + rightOffset;
  const prefix = current.slice(0, leftBoundary);
  const suffix = current.slice(rightBoundary);
  const formatFragment = (fragment: string): string => {
    if (!fragment) return '';
    const amount = fragment.replace(/[.,]$/, '').replace(/^\./, '').replace(/^,/, '0,');
    return formatPastedBrazilianMoney(amount);
  };
  try {
    const left = formatFragment(current.slice(leftBoundary, start));
    const right = formatFragment(current.slice(end, rightBoundary));
    if (!left && !right) return null;
    const value = prefix + left + operator + right + suffix;
    return { value, caret: (prefix + left + operator).length };
  } catch {
    return null;
  }
}

/** Backspace atua apenas no último operando, sem consumir a expressão anterior. */
export function backspaceMoneyExpressionOperand(raw: string): LiveBrazilianMoney {
  if (/[+\-×÷*/%()]$/.test(raw)) {
    const value = raw.slice(0, -1);
    return { value, caret: value.length };
  }
  const match = raw.match(/^(.*[+\-×÷*/(])([\d.,]+)$/);
  if (!match) return backspaceLiveBrazilianCents(raw);
  const next = backspaceLiveBrazilianCents(match[2]);
  const value = match[1] + next.value;
  return { value, caret: value.length };
}

export function normalizePastedMoneyExpression(raw: string): string {
  const cleaned = raw.replace(/R\$\s*/gi, '').trim();
  if (!cleaned || /[^\d.,+\-×÷*/%()\s]/.test(cleaned)) throw new Error('Valor colado inválido.');
  return cleaned.replace(/\d[\d.,]*/g, amount => formatPastedBrazilianMoney(amount));
}

/**
 * Digitação monetária por centavos: cada algarismo desloca a vírgula.
 * Ex.: 8 -> 0,08; 88 -> 0,88; 880 -> 8,80.
 *
 * A entrada pode conter separadores de formatação; somente algarismos
 * representam a quantia, e o cursor permanece ao final para digitação
 * contínua no teclado móvel.
 */
export function formatLiveBrazilianCents(raw: string): LiveBrazilianMoney | null {
  if (raw === '') return { value: '', caret: 0 };
  if (raw.length > 40 || !/^[\d.,]+$/.test(raw)) return null;
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  const cents = BigInt(digits);
  // Mesmo limite monetário do parser financeiro canônico.
  if (cents > 999_999_999_999n) return null;
  const integer = (cents / 100n).toLocaleString('pt-BR');
  const fraction = (cents % 100n).toString().padStart(2, '0');
  const value = `${integer},${fraction}`;
  return { value, caret: value.length };
}

/** Remove o último algarismo da quantia por centavos, sem deixar vírgula presa. */
export function backspaceLiveBrazilianCents(current: string): LiveBrazilianMoney {
  const digits = current.replace(/\D/g, '');
  if (!digits) return { value: '', caret: 0 };
  const remaining = BigInt(digits) / 10n;
  if (remaining === 0n) return { value: '', caret: 0 };
  return formatLiveBrazilianCents(remaining.toString()) ?? { value: '', caret: 0 };
}

/**
 * Normaliza mudanças de um input monetário controlado, inclusive Backspace
 * do teclado virtual Android, sem confundir centavos com reais.
 */
export function resolveLiveBrazilianCentsChange(
  raw: string, previous: string, inputType?: string | null,
): LiveBrazilianMoney | null {
  if (raw === '') return { value: '', caret: 0 };
  if (inputType === 'deleteContentBackward' && previous && raw.length < previous.length
      && previous.length - raw.length <= 1) {
    return backspaceLiveBrazilianCents(previous);
  }
  return formatLiveBrazilianCents(raw);
}

/** Extratos permitem sinal, sem perder o deslocamento decimal: -880 => -8,80. */
export function formatLiveBrazilianSignedCents(raw: string): LiveBrazilianMoney | null {
  if (raw === '-' || raw === '') return { value: raw, caret: raw.length };
  const negative = raw.startsWith('-');
  const next = formatLiveBrazilianCents(negative ? raw.slice(1) : raw);
  if (!next) return null;
  const value = (negative ? '-' : '') + next.value;
  return { value, caret: value.length };
}
export function backspaceLiveBrazilianSignedCents(raw: string): LiveBrazilianMoney {
  const negative = raw.startsWith('-');
  const next = backspaceLiveBrazilianCents(negative ? raw.slice(1) : raw);
  if (!next.value) return { value: '', caret: 0 };
  const value = (negative ? '-' : '') + next.value;
  return { value, caret: value.length };
}
