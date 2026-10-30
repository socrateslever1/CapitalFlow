import { parseCardInvoiceSummary, type CardInvoiceSummary } from './cardInvoiceSummary';

// PDF statements are extracted locally in the browser; never send full PDFs to servers.
export type ParsedStatementRow = {
  rowKey: string;
  date: string;
  description: string;
  amount: number; // signed BRL; positive credit, negative debit
  category: string;
  confidence: 'HIGH' | 'REVIEW';
  selected: boolean;
  installmentNumber: number | null;
  installmentTotal: number | null;
};
export type StatementParseResult = {
  hash: string;
  rows: ParsedStatementRow[];
  skipped: number;
  pages: number;
  invoiceSummary?: CardInvoiceSummary;
};

function brlAmount(raw: string): number {
  const clean = raw.replace(/R\$/gi, '').replace(/\s/g, '').replace(/[CD]$/i, '').replace(/[+-]$/, '');
  const negative = /^-/.test(clean) || /-$/.test(raw.trim()) || /D$/i.test(raw.trim());
  const amount = clean.replace(/^-/, '');
  // Handle Brazilian grouping/decimal notation and dot decimal exports.
  const normalized = /^\d{1,3}(?:\.\d{3})+,\d{2}$/.test(amount)
    ? amount.replace(/\./g, '').replace(',', '.')
    : /^\d+(?:,\d{2})$/.test(amount) ? amount.replace(',', '.') : amount;
  if (!/^\d+(?:\.\d{2})?$/.test(normalized)) return NaN;
  const value = Number(normalized);
  return negative ? -value : value;
}
function normalizeDate(raw: string): string | null {
  const months: Record<string, number> = {jan:1,fev:2,mar:3,abr:4,mai:5,jun:6,jul:7,ago:8,set:9,out:10,nov:11,dez:12};
  let day: number, month: number, year: number;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    [year, month, day] = raw.split('-').map(Number);
  } else {
    const named = /^(\d{1,2})\s+(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)(?:\s+(\d{4}))?$/i.exec(raw);
    if (named) {
      day = Number(named[1]); month = months[named[2].toLowerCase()]; year = named[3] ? Number(named[3]) : new Date().getFullYear();
    } else {
      const parts = raw.split(/[./-]/);
      if (parts.length < 2) return null;
      day = Number(parts[0]); month = Number(parts[1]);
      year = parts.length === 3 ? Number(parts[2]) : new Date().getFullYear();
      if (year < 100) year += 2000;
    }
  }
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null;
  return [year,String(month).padStart(2,'0'),String(day).padStart(2,'0')].join('-');
}
export function classifyStatementDescription(description: string): string {
  const label = description.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/salario|provento|remunera|folha|holerite/.test(label)) return 'Salário';
  if (/pix|transfer|ted\b|doc\b|pagamento recebido|deposit/.test(label)) return 'Transferências';
  if (/lanch|rappi|delivery|acougue|hortifruti/.test(label)) return 'Alimentação';
  if (/etanol|pedagio|onibus|metro|mobilidade/.test(label)) return 'Transporte';
  if (/drogaria|laborat|medic|odont|unimed|hapvida|amil/.test(label)) return 'Saúde';
  if (/saneamento|enel|cemig|sabesp|vivo|claro|tim/.test(label)) return 'Contas da casa';
  if (/cinema|teatro|parque|spotify|netflix|disney|prime video|steam|ingresso|bar\b|show|viagem|hotel|turismo/.test(label)) return 'Lazer';
  if (/escola|faculdade|universidade|curso|udemy|livraria|educa|mensalidade escolar/.test(label)) return 'Educação';
  if (/seguro|tarifa|taxa|assinatura|manutenc|oficina|contador|advoc|servico/.test(label)) return 'Serviços';
  if (/amazon|mercado livre|magazine|kabum|shopping|loja|varejo|compra/.test(label)) return 'Compras';
  if (/mercad|supermerc|atacad|padaria|aliment|restaurante|ifood/.test(label)) return 'Alimentação';
  if (/uber|99\b|posto|combust|gasolina|estacionamento|transporte/.test(label)) return 'Transporte';
  if (/farmac|hospital|clinica|saude/.test(label)) return 'Saúde';
  if (/energia|internet|agua|telefone|aluguel|condomin/.test(label)) return 'Contas da casa';
  if (/salario|provento|remunera/.test(label)) return 'Salário';
  if (/pix|transfer/.test(label)) return 'Transferências';
  if (/salario|provento|remunera|folha|holerite/.test(label)) return 'Salário';
  if (/pix|transfer|ted\b|doc\b|pagamento recebido|deposit/.test(label)) return 'Transferências';
  if (/lanch|rappi|delivery|acougue|hortifruti/.test(label)) return 'Alimentação';
  if (/etanol|pedagio|onibus|metro|mobilidade/.test(label)) return 'Transporte';
  if (/drogaria|laborat|medic|odont|unimed|hapvida|amil/.test(label)) return 'Saúde';
  if (/saneamento|enel|cemig|sabesp|vivo|claro|tim/.test(label)) return 'Contas da casa';
  if (/cinema|teatro|parque|spotify|netflix|disney|prime video|steam|ingresso|bar\b|show|viagem|hotel|turismo/.test(label)) return 'Lazer';
  if (/escola|faculdade|universidade|curso|udemy|livraria|educa|mensalidade escolar/.test(label)) return 'Educação';
  if (/seguro|tarifa|taxa|assinatura|manutenc|oficina|contador|advoc|servico/.test(label)) return 'Serviços';
  if (/amazon|mercado livre|magazine|kabum|shopping|loja|varejo|compra/.test(label)) return 'Compras';
  return 'Outros';
}
function classifyStatementDescriptionEnhanced(description: string): string {
  const label = description.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const rules: Array<[RegExp, string]> = [
    [/salario|provento|remunera|folha|holerite/, 'Sal\u00e1rio'],
    [/pix|transfer|ted\b|doc\b|pagamento recebido|deposit/, 'Transfer\u00eancias'],
    [/supermerc|atacad|padaria|aliment|restaurante|lanch|ifood|rappi|delivery|acougue|hortifruti/, 'Alimenta\u00e7\u00e3o'],
    [/uber|99\b|posto|combust|gasolina|etanol|estacionamento|pedagio|onibus|metro|transporte|mobilidade/, 'Transporte'],
    [/farmac|drogaria|hospital|clinica|laborat|medic|odont|saude|unimed|hapvida|amil/, 'Sa\u00fade'],
    [/energia|internet|agua|saneamento|telefone|aluguel|condomin|enel|cemig|sabesp|vivo|claro|tim/, 'Contas da casa'],
    [/cinema|teatro|parque|spotify|netflix|disney|prime video|steam|ingresso|bar\b|show|viagem|hotel|turismo/, 'Lazer'],
    [/escola|faculdade|universidade|curso|udemy|livraria|educa|mensalidade escolar/, 'Educa\u00e7\u00e3o'],
    [/seguro|tarifa|taxa|assinatura|manutenc|oficina|contador|advoc|servico/, 'Servi\u00e7os'],
    [/amazon|mercado livre|mercad livre|magazine|kabum|shopping|loja|varejo|compra/, 'Compras'],
  ];
  return rules.find(([pattern]) => pattern.test(label))?.[1] || 'Outros';
}

// Common Brazilian invoices use comma decimals, including a trailing D/C marker.
// Dot decimals are also encountered in digital bank exports.
const moneyRx = /(?:-\s*)?(?:R\$\s*)?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}(?:\s*[-+CD])?|(?:-\s*)?(?:R\$\s*)?\d+\.\d{2}(?:\s*[-+CD])?/gi;
const dateRx = /(?:\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?\b|\b\d{1,2}\s+(?:jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)(?:\s+\d{4})?\b)/i;
/** Mask transaction dates before matching dot-decimal amounts. Date 15.10.2026 is never R$ 15,10. */
function findMoneyTokens(raw: string): RegExpMatchArray[] {
  const date = dateRx.exec(raw);
  const masked = date ? raw.slice(0, date.index) + ' '.repeat(date[0].length) + raw.slice(date.index + date[0].length) : raw;
  return [...masked.matchAll(moneyRx)];
}
const notTransactionRx = /^(saldo|total|resumo|limite|vencimento|pagina|página|fatura|lançamentos futuros|crédito disponível|valor mínimo|taxa efetiva)/i;

const historyStartRx = /compras\s+no\s+app|outros\s+lan[cç]amentos|transa[cç][oõ]es\s+do\s+cart[aã]o\s+principal|detalhes?\s+de\s+consumo|(?:detalhamento|detalhe|discriminacao)\s+(?:da\s+)?fatura|(?:compras\s+e\s+saques)|(?:lancamentos|lan[cç]amentos)\s+(?:do\s+cartao|do\s+cartão)|hist[oó]rico\s+de\s+(?:lan[cç]amentos|movimenta[cç][oõ]es)|lan[cç]amentos\s+(?:do\s+per[ií]odo|realizados|da\s+fatura)|movimenta[cç][oõ]es\s+do\s+per[ií]odo|transa[cç][oõ]es/i;
const historyEndRx = /^(resumo|totais?|total\s+(?:da|fatura)|limite|cr[eé]dito\s+dispon[ií]vel|vencimento|pagamento\s+m[ií]nimo|anualidade|observa[cç][oõ]es|legenda|lan[cç]amentos\s+futuros)/i;

function normalizePdfLabel(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function extractInstallment(raw: string, dateToken: string): { number: number; total: number } | null {
  const candidates = [
    /\bparcela\s*(\d{1,2})\s*(?:de|\/)\s*(\d{1,2})\b/i,
    /\b(\d{1,2})\s*[ªa]\s*(?:de|\/)\s*(\d{1,2})\b/i,
    /\b(\d{1,2})\s+de\s+(\d{1,2})\b/i,
  ];
  for (const pattern of candidates) {
    const match = raw.match(pattern);
    if (!match) continue;
    const number = Number(match[1]);
    const total = Number(match[2]);
    if (number >= 1 && total > 1 && number <= total) return { number, total };
  }
  const datePrefix = dateToken.slice(0, 5);
  const compact = [...raw.matchAll(/\b(\d{1,2})\/(\d{1,2})\b/g)].find(match =>
    match[0] !== dateToken && match[0] !== datePrefix && Number(match[1]) >= 1 && Number(match[2]) > 1 && Number(match[1]) <= Number(match[2]),
  );
  return compact ? { number: Number(compact[1]), total: Number(compact[2]) } : null;
}

/** Conservative extractor: ambiguous entries are left unselected for review. */
/** Conservative extractor: values, dates and uncertain credits remain editable before saving. */
export function parseStatementLines(lines: {key:string;text:string}[], kind: 'ACCOUNT' | 'CARD'): { rows: ParsedStatementRow[]; skipped: number } {
  const rows: ParsedStatementRow[] = [];
  let skipped = 0;
  const recargaPayLayout = lines.some(line => /compras\s+no\s+app/i.test(line.text));
  // Some PDF renderers split amounts into a separate line. Join only if
  // that continuation has no date and is not a summary/footer.
  const combined = lines.map((line, index) => {
    const here = line.text.replace(/\s+/g, ' ').trim();
    const next = (lines[index + 1]?.text || '').replace(/\s+/g, ' ').trim();
    const afterNext = (lines[index + 2]?.text || '').replace(/\s+/g, ' ').trim();
    const safeContinuation = (part: string) => Boolean(part) && !dateRx.test(part)
      && !historyEndRx.test(normalizePdfLabel(part)) && !notTransactionRx.test(part);
    if (dateRx.test(here) && !findMoneyTokens(here).length && safeContinuation(next)) {
      if (findMoneyTokens(next).length > 0) return {key:line.key, text:here + ' ' + next};
      if (safeContinuation(afterNext) && findMoneyTokens(afterNext).length > 0)
        return {key:line.key, text:here + ' ' + next + ' ' + afterNext};
    }
    return line;
  });
  const hasHistoryMarker = combined.some(line => historyStartRx.test(normalizePdfLabel(line.text)));
  let inHistory = !hasHistoryMarker;
  let lastCardDate: string | null = null;
  for (const line of combined) {
    let raw = line.text.replace(/\s+/g, ' ').trim();
    const normalized = normalizePdfLabel(raw);
    if (historyStartRx.test(normalized)) { inHistory = true; lastCardDate = null; continue; }
    if (hasHistoryMarker && inHistory && historyEndRx.test(normalized)) { inHistory = false; lastCardDate = null; continue; }
    if (!inHistory || notTransactionRx.test(raw)) continue;
    let matchedDate = raw.match(dateRx);
    // RecargaPay prints a date only on the first line of several purchases.
    // Its following same-date rows must keep their own amount, including repeated merchants.
    if (kind === 'CARD' && recargaPayLayout && !matchedDate && lastCardDate &&
        /recargapay\s+/i.test(raw) && findMoneyTokens(raw).length === 1) {
      raw = lastCardDate + ' ' + raw;
      matchedDate = raw.match(dateRx);
    }
    if (kind === 'CARD' && recargaPayLayout && matchedDate) lastCardDate = matchedDate[0];
    if (!matchedDate) continue;
    const date = normalizeDate(matchedDate[0]);
    if (!date) { skipped++; continue; }
    const valueMatches = findMoneyTokens(raw);
    if (valueMatches.length === 0) { skipped++; continue; }
    const last = valueMatches[valueMatches.length - 1];
    const value = brlAmount(last[0]);
    // Brazilian issuers vary the order of merchant, date and amount.
    const beforeDate = raw.slice(0, matchedDate.index).replace(/^[\s:;|\-–]+|[\s:;|\-–]+$/g, '').trim();
    const afterDate = raw.slice(matchedDate.index! + matchedDate[0].length, last.index)
      .replace(/^[\s:;|\-–]+|[\s:;|\-–]+$/g, '').trim();
    const description = [beforeDate, afterDate].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    if (!description || notTransactionRx.test(description) || !Number.isFinite(value) || value === 0) { skipped++; continue; }
    const context = normalizePdfLabel(description);
    const incoming = /recebid|entrada|credito|deposit|salario|estorno|reembols|devolu[cç]/.test(context) || /C$/i.test(last[0].trim());
    const outgoing = /pago|pagamento|compra|debito|saida|enviado|tarifa|saque/.test(context) || /D$/i.test(last[0].trim());
    // A charge on a credit-card PDF is positive. Payments/refunds are
    // negative and cannot be imported as new purchases. Accounts retain
    // the opposite sign convention for expenses.
    const markedDebit = /D$/i.test(last[0].trim());
    const markedCredit = /C$/i.test(last[0].trim());
    // Invoice settlement is a credit even if the bank prints it without a
    // trailing "C". Do not confuse it with "Pix no Crédito" (a card charge).
    const invoicePayment = /\b(?:inclusao\s+de\s+pagamento|pagamento\s+(?:da\s+)?fatura|pagamento\s+(?:em\s+\d{1,2}|pix|recebido|efetuado)|pagamentos?\s+efetuados?|credito\s+na\s+fatura|estorno|reembolso|devolucao|cashback)\b/.test(context)
      && !/\b(?:no\s+credito|com\s+cartao)\b/.test(context);
    const signed = kind === 'CARD'
      ? (invoicePayment || markedCredit || (incoming && !outgoing) ? -Math.abs(value)
          : recargaPayLayout ? Math.abs(value)
            : markedDebit || outgoing ? Math.abs(value) : value < 0 ? -Math.abs(value) : Math.abs(value))
      : (markedCredit || (incoming && !outgoing) ? Math.abs(value) : -Math.abs(value));
    const category = classifyStatementDescriptionEnhanced(description);
    const installment = extractInstallment(raw, matchedDate[0]);
    const confidence: 'HIGH' | 'REVIEW' =
      valueMatches.length === 1 && category !== 'Outros' && (kind === 'CARD' ? signed > 0 : incoming !== outgoing)
        ? 'HIGH' : 'REVIEW';
    rows.push({
      rowKey:line.key, date, description:description.slice(0,240),
      amount:Math.round(signed * 100) / 100, category, confidence,
      selected: false, // PDF layout/sign requires explicit confirmation
      installmentNumber:installment?.number || null,
      installmentTotal:installment?.total || null,
    });
  }
  return {rows,skipped};
}
export async function parseStatementPdf(file: File, kind: 'ACCOUNT' | 'CARD'): Promise<StatementParseResult> {
  if (file.type && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    throw new Error('Selecione um arquivo PDF.');
  }
  if (file.size > 10*1024*1024) throw new Error('Limite de PDF: 10 MB.');
  const buffer = await file.arrayBuffer();
  const hashBytes = await crypto.subtle.digest('SHA-256', buffer.slice(0));
  const hash = [...new Uint8Array(hashBytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const worker = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const loading = pdfjs.getDocument({data:new Uint8Array(buffer)});
  let document: Awaited<typeof loading.promise> | null = null;
  try {
    document = await loading.promise;
    if (document.numPages > 30) throw new Error('PDF extenso: envie até 30 páginas por arquivo.');
    const lines: {key:string;text:string}[] = [];
    for (let p=1;p<=document.numPages;p++) {
      const page = await document.getPage(p);
      const text = await page.getTextContent();
      const grouped: {y:number;items:{x:number;str:string}[]}[]=[];
      for (const item of text.items) {
        if (!('str' in item) || !item.str.trim()) continue;
        const y = Math.round(item.transform[5]*2)/2;
        let row=grouped.find(g=>Math.abs(g.y-y)<2.5);
        if (!row) {row={y,items:[]};grouped.push(row);}
        row.items.push({x:item.transform[4],str:item.str});
      }
      grouped.sort((a,b)=>b.y-a.y);
      grouped.forEach((g,i)=>lines.push({
        key:`p${p}-l${i}`,
        text:g.items.sort((a,b)=>a.x-b.x).map(it=>it.str).join(' '),
      }));
      page.cleanup();
    }
    if (!lines.length) throw new Error('PDF sem texto selecionável. Para faturas digitalizadas, use a opção Ler PDF com IA.');
    const {rows,skipped}=parseStatementLines(lines,kind);
    return {hash,rows,skipped,pages:document.numPages,
      invoiceSummary: kind === 'CARD' ? parseCardInvoiceSummary(lines.map(line => line.text)) : undefined};
  } catch (error:any) {
    throw new Error(error?.message?.includes('password') ? 'PDF protegido por senha. Exporte uma versão desbloqueada.' :
      error?.message||'Não foi possível ler o PDF. PDFs digitalizados sem texto não são reconhecidos.');
  } finally {
    await document?.destroy();
  }
}
