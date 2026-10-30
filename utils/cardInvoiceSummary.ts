/**
 * Facts reported by a bank invoice. These are observations, never ledger events.
 * A PDF does not prove that a payment has settled or a credit limit is current.
 */
export type CardInvoiceSummary = {
  institution: 'Nubank' | 'Mercado Pago' | 'Itaú' | null;
  invoiceTotal: number | null;
  minimumPayment: number | null;
  creditLimit: number | null;
  usedLimit: number | null;
  availableLimit: number | null;
  futureInstallments: number | null;
  dueDate: string | null;
  warnings: string[];
};

const moneyPattern = String.raw`(?:R\$\s*)?-?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}`;
const moneyRx = new RegExp(moneyPattern, 'gi');
const amount = (token: string): number | null => {
  const stripped = token.replace(/R\$\s*/gi, '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const parsed = Number(stripped);
  return Number.isFinite(parsed) && Math.abs(parsed) <= 1e9 ? Math.round(parsed * 100) / 100 : null;
};
const values = (text: string): number[] => [...text.matchAll(moneyRx)]
  .map(match => amount(match[0])).filter((value): value is number => value !== null);
const normalize = (line: string): string => line.normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

function matchValue(lines: string[], pattern: RegExp): number | null {
  for (let index = 0; index < lines.length; index++) {
    const plain = normalize(lines[index]);
    const match = pattern.exec(plain);
    if (!match) continue;
    const rest = plain.slice(match.index + match[0].length);
    const inline = values(rest);
    if (inline.length) return inline[0];
    // Column-oriented bank statements may put the amount on the next line.
    const next = lines[index + 1] || '';
    if (values(next).length === 1 && !/\b(?:limite|pagamento|juros|fatura|encargos|total)\b/i.test(normalize(next)))
      return values(next)[0];
  }
  return null;
}

const isoDate = (raw: string): string | null => {
  const m = /^(\d{2})[\/.](\d{2})[\/.](\d{4})$/.exec(raw);
  if (!m) return null;
  const d = Number(m[1]), mo = Number(m[2]), y = Number(m[3]);
  const check = new Date(Date.UTC(y, mo - 1, d));
  return check.getUTCFullYear() === y && check.getUTCMonth() === mo - 1 && check.getUTCDate() === d
    ? [y, String(mo).padStart(2, '0'), String(d).padStart(2, '0')].join('-') : null;
};
function matchDate(lines: string[], pattern: RegExp): string | null {
  for (let i = 0; i < lines.length; i++) {
    const plain = normalize(lines[i]);
    if (!pattern.test(plain)) continue;
    const matched = (plain + ' ' + (lines[i + 1] || '')).match(/\b\d{2}[\/.]\d{2}[\/.]\d{4}\b/);
    if (matched) return isoDate(matched[0]);
    const named = (plain + ' ' + (lines[i + 1] || '')).match(/\b(\d{1,2})\s+(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\s+(\d{4})\b/i);
    if (named) {
      const months: Record<string, number> = { jan:1, fev:2, mar:3, abr:4, mai:5, jun:6, jul:7, ago:8, set:9, out:10, nov:11, dez:12 };
      return isoDate(String(named[1]).padStart(2,'0') + '/' + String(months[named[2].toLowerCase()]).padStart(2,'0') + '/' + named[3]);
    }
  }
  return null;
}

export function parseCardInvoiceSummary(lines: readonly string[]): CardInvoiceSummary {
  const body = lines.slice(0, 100).map(normalize).join(' ');
  const institution = /\bmercado\s+pago\b/.test(body) ? 'Mercado Pago'
    : /\bnubank\b|\bnucel\b/.test(body) ? 'Nubank'
      : /\bitau\b/.test(body) ? 'Itaú' : null;
  const documentLines = [...lines];
  const invoiceTotal = matchValue(documentLines, /\btotal\s+(?:a\s+pagar|desta\s+fatura)\b/)
    ?? (institution === 'Mercado Pago' ? matchValue(documentLines, /^total\s*(?=r\$|\d)/) : null);
  const minimumPayment = matchValue(documentLines, /\bpagamento\s+minimo\b(?:\s*:)?/);
  let creditLimit = matchValue(documentLines, /\blimite\s+total(?:\s+de\s+credito|\s+do\s+cartao\s+de\s+credito)?\b(?!\s+utilizado)(?=\s|:)/);
  let usedLimit = matchValue(documentLines, /\blimite\s+(?:total\s+)?utilizado\b/);
  let availableLimit = matchValue(documentLines, /\blimite\s+disponivel\b/);
  let futureInstallments = matchValue(documentLines, /\b(?:compras\s+parceladas|total\s+para\s+proximas\s+faturas)\b/);
  const dueDate = matchDate(documentLines, /\b(?:vencimento|vence\s+em)\b/);
  const warnings: string[] = [];
  if (creditLimit === null && institution === 'Mercado Pago' && usedLimit !== null && availableLimit !== null) {
    creditLimit = Math.round((usedLimit + availableLimit) * 100) / 100;
    warnings.push('Limite total inferido da soma utilizado + disponível; confirme no aplicativo bancário.');
  }
  // In some Nubank layouts "Limite total" contains two table columns:
  // "Utilizado" and "Disponível". Never interpret the second as a fresh limit.
  if (institution === 'Nubank') {
    for (let index = 0; index < documentLines.length; index++) {
      if (!/^limite total\b/i.test(normalize(documentLines[index]))) continue;
      const row = values(documentLines[index]);
      if (row.length >= 2) {
        usedLimit = row[0];
        availableLimit = row[1];
        break;
      }
    }
    if (futureInstallments === null)
      futureInstallments = matchValue(documentLines, /\bsaldo\s+em\s+aberto\s+total\b/);
  }
  if (institution === 'Itaú' && futureInstallments === null)
    futureInstallments = matchValue(documentLines, /\btotal\s+para\s+proximas\s+faturas\b/);
  if (creditLimit !== null && usedLimit !== null && usedLimit > creditLimit + 0.01)
    warnings.push('O limite utilizado supera o limite total declarado; confira as modalidades de limite.');
  if (creditLimit !== null && usedLimit !== null && availableLimit !== null
      && Math.abs(creditLimit - usedLimit - availableLimit) > 0.01)
    warnings.push('Os limites informados pelo banco não fecham pela subtração simples. Preserve os valores declarados e confirme no aplicativo bancário.');
  if (usedLimit !== null && invoiceTotal !== null && futureInstallments !== null) {
    const residual = Math.round((usedLimit - invoiceTotal - futureInstallments) * 100) / 100;
    if (Math.abs(residual) > 0.01)
      warnings.push('Há diferença entre limite usado, fatura e compromissos futuros; ela não será transformada em compra.');
  }
  if (!institution) warnings.push('Instituição não identificada com confiança. Confirme o cartão de destino antes de importar.');
  if (invoiceTotal === null) warnings.push('Total da fatura não identificado; confira o valor diretamente no banco.');
  return { institution, invoiceTotal, minimumPayment, creditLimit, usedLimit,
    availableLimit, futureInstallments, dueDate, warnings };
}

export function reconcileCardInvoice(input: {
  invoiceTotal: number | null;
  paymentsConfirmed: number | null;
  creditLimit: number | null;
  usedLimit: number | null;
  availableLimit: number | null;
}) {
  const cents = (value: number): number => {
    if (!Number.isFinite(value) || value < 0 || value > 1e9 || Math.abs(value * 100 - Math.round(value * 100)) > 0.00001)
      throw new Error('Valores monetários inválidos.');
    return Math.round(value * 100);
  };
  const total = input.invoiceTotal === null ? null : cents(input.invoiceTotal);
  const payments = input.paymentsConfirmed === null ? null : cents(input.paymentsConfirmed);
  const remaining = total === null || payments === null ? null : Math.max(0, total - payments) / 100;
  const available = input.availableLimit !== null ? cents(input.availableLimit) / 100
    : input.creditLimit !== null && input.usedLimit !== null
      ? Math.max(0, cents(input.creditLimit) - cents(input.usedLimit)) / 100 : null;
  return { remaining, available, availableIsDeclared: input.availableLimit !== null,
    overpaid: total !== null && payments !== null ? Math.max(0, payments - total) / 100 : null };
}
