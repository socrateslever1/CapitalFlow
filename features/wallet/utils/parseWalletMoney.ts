/**
 * Calculadora monetária pt-BR, sem eval ou execução dinâmica.
 * Aritmética intermediária fixa em 8 casas e arredondamento apenas no resultado.
 */
const SCALE = 100_000_000n;
const CENT = 1_000_000n;
const MAX_CENTS = 999_999_999_999n;
const MAX_INTERMEDIATE = 100_000_000_000_000n * SCALE;
type Operator = '+' | '-' | '*' | '/' | '(' | ')' | '%';
type Token = { kind: 'number'; value: bigint } | { kind: Operator };
type EvalValue = { value: bigint; percent: boolean };

function invalid(field: string): never {
  throw new Error('Informe ' + field + ' válido. Use números e operações como 700+4,99%.');
}
function bounded(value: bigint, field: string): bigint {
  if (value > MAX_INTERMEDIATE || value < -MAX_INTERMEDIATE) {
    throw new Error('Informe ' + field + ' dentro do limite permitido.');
  }
  return value;
}
function decimalToFixed(raw: string, field: string, isPercent: boolean, precision: number): bigint {
  const maxFraction = isPercent ? 8 : precision;
  const grouped = new RegExp('^\\d{1,3}(?:\\.\\d{3})+(?:,\\d{1,' + maxFraction + '})?$').test(raw);
  const br = new RegExp('^\\d+(?:,\\d{1,' + maxFraction + '})?$').test(raw);
  const dot = new RegExp('^\\d+(?:\\.\\d{1,' + maxFraction + '})?$').test(raw);
  if (!grouped && !br && !dot) invalid(field);
  const normalized = grouped || raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.') : raw;
  const parts = normalized.split('.');
  return bounded(BigInt(parts[0]) * SCALE + BigInt((parts[1] || '').padEnd(8, '0') || '0'), field);
}
function tokenize(input: string, field: string, precision: number): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    if (/\s/.test(input[i])) { i++; continue; }
    const char = input[i];
    if ('+-*/()%×÷'.includes(char)) {
      tokens.push({ kind: char === '×' ? '*' : char === '÷' ? '/' : char as Operator });
      i++;
      continue;
    }
    if (/\d/.test(char)) {
      const start = i;
      while (i < input.length && /[\d.,]/.test(input[i])) i++;
      tokens.push({ kind: 'number', value: decimalToFixed(input.slice(start, i), field, input[i] === '%', precision) });
      continue;
    }
    invalid(field);
  }
  if (tokens.length > 128) invalid(field);
  return tokens;
}
function calculate(input: string, field: string, precision = 2): bigint {
  const tokens = tokenize(input, field, precision);
  let pos = 0;
  let depth = 0;
  const peek = () => tokens[pos]?.kind;
  const consume = () => tokens[pos++];

  const primary = (): EvalValue => {
    if (++depth > 32) invalid(field);
    try {
      let result: EvalValue;
      const kind = peek();
      if (kind === '+' || kind === '-') {
        consume();
        const next = primary();
        result = { value: kind === '-' ? -next.value : next.value, percent: next.percent };
      } else if (kind === '(') {
        consume();
        result = expression();
        if (peek() !== ')') invalid(field);
        consume();
      } else if (kind === 'number') {
        const token = consume();
        result = { value: (token as Extract<Token, { kind: 'number' }>).value, percent: false };
      } else {
        invalid(field);
      }
      if (peek() === '%') {
        consume();
        result = { value: result.value / 100n, percent: true };
      }
      return result;
    } finally { depth--; }
  };
  const term = (): EvalValue => {
    let left = primary();
    while (peek() === '*' || peek() === '/') {
      const op = consume().kind;
      const right = primary();
      if (op === '/' && right.value === 0n) throw new Error('Não é possível dividir por zero.');
      left = {
        value: bounded(op === '*' ? (left.value * right.value) / SCALE : (left.value * SCALE) / right.value, field),
        percent: false,
      };
    }
    return left;
  };
  const expression = (): EvalValue => {
    let left = term();
    while (peek() === '+' || peek() === '-') {
      const op = consume().kind;
      const right = term();
      const adjustment = right.percent ? (left.value * right.value) / SCALE : right.value;
      left = { value: bounded(op === '+' ? left.value + adjustment : left.value - adjustment, field), percent: false };
    }
    return left;
  };

  if (!tokens.length) invalid(field);
  const result = expression();
  if (pos !== tokens.length) invalid(field);
  return result.value;
}

/** Interpreta quantias e expressões; mantém as validações de domínio existentes. */
export function parseWalletMoney(raw: string, field = 'valor'): number {
  const value = String(raw ?? '').trim();
  if (!value || value.length > 256) invalid(field);
  const fixed = calculate(value, field);
  if (fixed < 0n) throw new Error('Informe ' + field + ' válido, maior ou igual a zero.');
  const cents = (fixed + CENT / 2n) / CENT;
  if (cents > MAX_CENTS) throw new Error('Informe ' + field + ' dentro do limite permitido.');
  return Number(cents) / 100;
}

/** Conclui o cálculo no blur sem introduzir zero em entradas vazias. */
export function formatWalletMoneyInput(raw: string): string {
  if (String(raw ?? '').trim() === '') return '';
  return parseWalletMoney(raw).toLocaleString('pt-BR', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

/** Calcula taxas até seis casas decimais sem arredondar operandos para centavos. */
export function parseWalletRate(raw: string, field = 'taxa'): number {
  const value = String(raw ?? '').trim();
  if (!value || value.length > 256) invalid(field);
  const fixed = calculate(value, field, 6);
  if (fixed < 0n) throw new Error('Informe ' + field + ' válido, maior ou igual a zero.');
  const rounded = (fixed + 50n) / 100n;
  if (rounded > 999_999_999_999n) throw new Error('Informe ' + field + ' dentro do limite permitido.');
  return Number(rounded) / 1_000_000;
}

/** Ajuste manual de saldo operacional; permite resultado negativo quando o domínio aceita. */
export function parseWalletSignedMoney(raw: string, field = 'saldo'): number {
  const value = String(raw ?? '').trim();
  if (!value || value.length > 256) invalid(field);
  const fixed = calculate(value, field);
  const negative = fixed < 0n;
  const absolute = negative ? -fixed : fixed;
  const cents = (absolute + CENT / 2n) / CENT;
  if (cents > MAX_CENTS) throw new Error('Informe ' + field + ' dentro do limite permitido.');
  return (negative ? -1 : 1) * Number(cents) / 100;
}
