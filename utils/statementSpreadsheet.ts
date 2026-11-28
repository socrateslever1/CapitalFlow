import { classifyStatementDescription, type ParsedStatementRow, type StatementParseResult } from './walletStatementPdf';

/**
 * Leitura local de extratos e faturas exportados em planilha (CSV ou XLSX).
 * Identifica as colunas de data, descrição e valor pelo cabeçalho; nada é enviado ao servidor.
 * Cartão: compra positiva, crédito/estorno/pagamento negativo (mesma regra do OFX).
 * Conta: valor com sinal do banco (saída negativa, entrada positiva).
 */

type Cell = unknown;

const MAX_BYTES = 10 * 1024 * 1024;

const normalizeHeader = (value: Cell) => String(value ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/\s+/g, ' ').trim();

function isoFromParts(year: number, month: number, day: number): string | null {
  if (year < 100) year += 2000;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    : null;
}

export function parseSpreadsheetDate(value: Cell): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return isoFromParts(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }
  if (typeof value === 'number' && value > 20000 && value < 80000) {
    // Número de série do Excel (dias desde 30/12/1899).
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000);
    return isoFromParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }
  const text = String(value ?? '').trim();
  let match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (match) return isoFromParts(Number(match[1]), Number(match[2]), Number(match[3]));
  match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/.exec(text);
  if (match) return isoFromParts(Number(match[3]), Number(match[2]), Number(match[1]));
  return null;
}

export function parseSpreadsheetMoney(value: Cell): number {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value * 100) / 100 : NaN;
  let text = String(value ?? '').trim();
  if (!text) return NaN;
  let negative = false;
  if (/^\(.*\)$/.test(text)) { negative = true; text = text.slice(1, -1); }
  if (/\bD$/i.test(text)) { negative = true; text = text.replace(/\s*D$/i, ''); }
  text = text.replace(/\s*C$/i, '');
  text = text.replace(/R\$|\s| /g, '');
  if (text.startsWith('-')) { negative = !negative; text = text.slice(1); }
  if (text.endsWith('-')) { negative = !negative; text = text.slice(0, -1); }
  text = text.replace(/^\+/, '');
  if (!/^[\d.,]+$/.test(text)) return NaN;
  const comma = text.lastIndexOf(',');
  const dot = text.lastIndexOf('.');
  let normalized: string;
  if (comma >= 0 && dot >= 0) {
    normalized = comma > dot ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '');
  } else if (comma >= 0) {
    normalized = /^\d{1,3}(,\d{3})+$/.test(text) ? text.replace(/,/g, '') : text.replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(text)) {
    normalized = text.replace(/\./g, '');
  } else {
    normalized = text;
  }
  const number = Number(normalized);
  if (!Number.isFinite(number) || Math.abs(number) > 9999999999.99) return NaN;
  return Math.round((negative ? -number : number) * 100) / 100;
}

/** CSV com aspas, separador detectado (; , ou tab). */
export function parseCsvText(text: string): string[][] {
  const clean = text.replace(/^﻿/, '');
  const firstLines = clean.split(/\r?\n/).slice(0, 10).join('\n');
  const count = (sep: string) => firstLines.split(sep).length - 1;
  const separator = [';', '\t', ','].reduce((best, sep) => count(sep) > count(best) ? sep : best, ';');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    if (quoted) {
      if (char === '"' && clean[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field === '') quoted = true;
    else if (char === separator) { row.push(field); field = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && clean[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(cell => cell.trim())) rows.push(row);
      row = [];
    } else field += char;
  }
  row.push(field);
  if (row.some(cell => cell.trim())) rows.push(row);
  return rows;
}

interface Columns {
  date: number;
  description: number;
  amount: number;
  credit: number;
  debit: number;
  installment: number;
}

const findColumn = (headers: string[], patterns: RegExp[], exclude?: RegExp) => {
  for (const pattern of patterns) {
    const index = headers.findIndex(header => header && pattern.test(header) && !(exclude && exclude.test(header)));
    if (index >= 0) return index;
  }
  return -1;
};

export function detectSpreadsheetColumns(headerRow: Cell[]): Columns | null {
  const headers = headerRow.map(normalizeHeader);
  const date = findColumn(headers, [/^data (de )?(compra|lancamento|movimento|transacao)/, /^data$/, /^date$/, /^data\b/, /\bdata\b/],
    /vencimento|pagamento da fatura/);
  const description = findColumn(headers, [/^descricao/, /^estabelecimento/, /^historico/, /^title$|^titulo$/, /^lancamento$/, /descricao|historico|detalhe|memo/],
    /nome no cartao|categoria/);
  const amount = findColumn(headers, [/^valor \(em r\$\)/, /^valor em r\$/, /^valor$/, /^amount$/, /^quantia$/, /^valor\b/],
    /us\$|usd|dolar|saldo|cotacao|limite|original/);
  const credit = findColumn(headers, [/^(valor )?credito/, /^entrada/]);
  const debit = findColumn(headers, [/^(valor )?debito/, /^saida/]);
  const installment = findColumn(headers, [/^parcela/, /^installment/]);
  if (date < 0 || description < 0 || (amount < 0 && credit < 0 && debit < 0)) return null;
  return { date, description, amount, credit, debit, installment };
}

const CARD_CREDIT = /\b(estorno|reembolso|devolu[cç][aã]o|cashback|pagamento\s+(?:da\s+)?fatura|pagamento\s+(?:em\s+\d{1,2}|pix|recebido|efetuado)|cr[eé]dito\s+na\s+fatura|inclusao de pagamento)\b/i;
const SUMMARY_ROW = /^(saldo|total|subtotal)\b/i;

function installmentFrom(text: string): { number: number; total: number } | null {
  const match = /(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})/i.exec(text);
  if (!match) return null;
  const number = Number(match[1]);
  const total = Number(match[2]);
  return number >= 1 && total >= 2 && number <= total && total <= 99 ? { number, total } : null;
}

export function parseStatementTable(table: Cell[][], kind: 'ACCOUNT' | 'CARD', hash: string): StatementParseResult {
  const headerIndex = table.slice(0, 20).findIndex(row => detectSpreadsheetColumns(row) !== null);
  if (headerIndex < 0) {
    throw new Error('Não encontrei as colunas de data, descrição e valor na planilha. Confira se o arquivo tem cabeçalho (ex.: Data; Descrição; Valor).');
  }
  const columns = detectSpreadsheetColumns(table[headerIndex])!;
  type Draft = { date: string; description: string; amount: number; installment: string };
  const drafts: Draft[] = [];
  let skipped = 0;
  for (const row of table.slice(headerIndex + 1)) {
    if (!row.some(cell => String(cell ?? '').trim())) continue;
    const description = String(row[columns.description] ?? '').replace(/\s+/g, ' ').trim().slice(0, 240);
    const date = parseSpreadsheetDate(row[columns.date]);
    let amount = columns.amount >= 0 ? parseSpreadsheetMoney(row[columns.amount]) : NaN;
    if (!Number.isFinite(amount) && (columns.credit >= 0 || columns.debit >= 0)) {
      const credit = columns.credit >= 0 ? parseSpreadsheetMoney(row[columns.credit]) : NaN;
      const debit = columns.debit >= 0 ? parseSpreadsheetMoney(row[columns.debit]) : NaN;
      amount = (Number.isFinite(credit) ? Math.abs(credit) : 0) - (Number.isFinite(debit) ? Math.abs(debit) : 0);
    }
    if (SUMMARY_ROW.test(description) && !date) continue;
    if (!date || !description || !Number.isFinite(amount) || amount === 0) { skipped++; continue; }
    drafts.push({ date, description, amount, installment: columns.installment >= 0 ? String(row[columns.installment] ?? '') : '' });
  }
  // Faturas que exportam compras como valores negativos: a maioria define o sentido.
  const invertCard = kind === 'CARD'
    && drafts.filter(d => d.amount < 0 && !CARD_CREDIT.test(d.description)).length
      > drafts.filter(d => d.amount > 0).length;
  const usedKeys = new Map<string, number>();
  const rows: ParsedStatementRow[] = drafts.map(draft => {
    let amount = draft.amount;
    let credit = false;
    if (kind === 'CARD') {
      const signed = invertCard ? -amount : amount;
      credit = signed < 0 || CARD_CREDIT.test(draft.description);
      amount = credit ? -Math.abs(signed) : Math.abs(signed);
    }
    const rawKey = 'sheet-' + [draft.date, Math.round(draft.amount * 100), draft.description].join('-').slice(0, 160);
    const repeat = usedKeys.get(rawKey) || 0;
    usedKeys.set(rawKey, repeat + 1);
    const installment = installmentFrom(draft.installment) || installmentFrom(draft.description);
    return {
      rowKey: repeat ? `${rawKey}-${repeat}` : rawKey,
      date: draft.date,
      description: draft.description,
      amount,
      category: classifyStatementDescription(draft.description),
      confidence: credit ? 'REVIEW' : 'HIGH',
      selected: kind === 'CARD' ? amount > 0 : true,
      installmentNumber: installment?.number || null,
      installmentTotal: installment?.total || null,
    } as ParsedStatementRow;
  });
  return { hash, rows, skipped, pages: 1 };
}

async function sha256(buffer: ArrayBuffer) {
  const bytes = await crypto.subtle.digest('SHA-256', buffer.slice(0));
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export const isSpreadsheetFile = (file: File) => {
  const name = file.name.toLowerCase();
  return /\.(csv|xlsx|xls)$/.test(name)
    || /text\/csv|spreadsheetml|ms-excel/.test(file.type.toLowerCase());
};

export async function parseStatementSpreadsheet(file: File, kind: 'ACCOUNT' | 'CARD'): Promise<StatementParseResult> {
  if (file.size > MAX_BYTES) throw new Error('Limite de planilha: 10 MB.');
  const name = file.name.toLowerCase();
  if (name.endsWith('.xls') && !name.endsWith('.xlsx')) {
    throw new Error('Formato .xls antigo não é suportado. Abra no Excel ou Planilhas e salve como .xlsx ou .csv.');
  }
  const buffer = await file.arrayBuffer();
  const hash = await sha256(buffer);
  let table: Cell[][];
  if (name.endsWith('.xlsx') || /spreadsheetml/.test(file.type.toLowerCase())) {
    const { default: ExcelJS } = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    try { await workbook.xlsx.load(buffer); }
    catch { throw new Error('Não foi possível abrir a planilha. Se ela tiver senha, remova a proteção e salve de novo.'); }
    const sheet = workbook.worksheets.find(ws => ws.rowCount > 1) || workbook.worksheets[0];
    table = [];
    sheet?.eachRow({ includeEmpty: false }, row => {
      const values = Array.isArray(row.values) ? row.values.slice(1) : [];
      table.push(values.map(value => {
        if (value && typeof value === 'object' && !(value instanceof Date)) {
          const cell = value as { result?: unknown; text?: string; richText?: { text?: string }[] };
          if (cell.result !== undefined) return cell.result;
          if (typeof cell.text === 'string') return cell.text;
          if (Array.isArray(cell.richText)) return cell.richText.map(part => part.text || '').join('');
        }
        return value;
      }));
    });
  } else {
    const bytes = new Uint8Array(buffer);
    let text = new TextDecoder('utf-8').decode(bytes);
    if (text.includes('�')) text = new TextDecoder('windows-1252').decode(bytes);
    table = parseCsvText(text);
  }
  return parseStatementTable(table, kind, hash);
}
