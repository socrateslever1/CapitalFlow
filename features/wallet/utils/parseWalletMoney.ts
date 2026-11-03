/**
 * Entrada monetária: aceita pt-BR, valores agrupados copiados de bancos e
 * centavos exatos. Não transforma o texto enquanto o usuário digita.
 *
 * "1.234" representa 1234, não 1,234; "1.234.56" representa 1234,56.
 * Valores ambíguos e separadores em posições inválidas são rejeitados.
 */
const MAX_CENTS = 999_999_999_999;
function parseMoneyCents(raw: string, field: string, allowNegative: boolean): number {
  let text = String(raw ?? '').replace(/[\u00a0\u202f]/g, ' ').trim();
  // Permite colar "R$ 1.234,56", sem aceitar texto arbitrário.
  let negative = false;
  if (text.startsWith('-')) { negative = true; text = text.slice(1).trim(); }
  if (text.startsWith('+')) text = text.slice(1).trim();
  text = text.replace(/^R\$\s*/i, '').replace(/\s/g, '');
  if (!text || (negative && !allowNegative)) {
    throw new Error('Informe ' + field + ' válido, com até duas casas decimais.');
  }
  const formats: ReadonlyArray<{pattern: RegExp; grouping: string}> = [
    {pattern: /^(\d{1,3}(?:\.\d{3})+)(?:,(\d{1,2}))?$/, grouping: '.'},
    {pattern: /^(\d+)(?:,(\d{1,2}))?$/, grouping: ''},
    {pattern: /^(\d+)(?:\.(\d{1,2}))?$/, grouping: ''},
    // Alguns extratos utilizam "00.000.00" para 0,00.
    {pattern: /^(\d{1,3}(?:\.\d{3})+)\.(\d{1,2})$/, grouping: '.'},
    {pattern: /^(\d{1,3}(?:,\d{3})+)\.(\d{1,2})$/, grouping: ','},
  ];
  let cents: number | null = null;
  for (const {pattern, grouping} of formats) {
    const match = text.match(pattern);
    if (!match) continue;
    const wholeText = grouping ? match[1].split(grouping).join('') : match[1];
    const whole = wholeText.replace(/^0+(?=\d)/, '');
    const decimal = (match[2] ?? '').padEnd(2, '0');
    // R$ 9.999.999.999,99 é o máximo admitido pelo módulo.
    if (whole.length > 10) break;
    const value = Number(whole) * 100 + Number(decimal || '0');
    if (Number.isSafeInteger(value) && value <= MAX_CENTS) cents = value;
    break;
  }
  if (cents === null) {
    throw new Error('Informe ' + field + ' válido, com até duas casas decimais.');
  }
  return negative ? -cents : cents;
}
export function parseWalletMoney(raw: string, field = 'valor'): number {
  return parseMoneyCents(raw, field, false) / 100;
}
export function parseWalletSignedMoney(raw: string, field = 'valor'): number {
  return parseMoneyCents(raw, field, true) / 100;
}
export function tryParseWalletMoney(raw: string): number | null {
  try { return parseWalletMoney(raw); } catch { return null; }
}
export function tryParseWalletSignedMoney(raw: string): number | null {
  try { return parseWalletSignedMoney(raw); } catch { return null; }
}
