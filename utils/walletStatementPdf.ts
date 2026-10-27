// PDF statements are extracted locally in the browser; never send full PDFs to servers.
export type ParsedStatementRow = {
  rowKey: string;
  date: string;
  description: string;
  amount: number; // signed BRL; positive credit, negative debit
  category: string;
  confidence: 'HIGH' | 'REVIEW';
  selected: boolean;
};
export type StatementParseResult = {
  hash: string;
  rows: ParsedStatementRow[];
  skipped: number;
  pages: number;
};

function brlAmount(raw: string): number {
  const cleaned = raw.replace(/R\$|\s/g, '').replace(/\./g, '').replace(',', '.');
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : NaN;
}
function normalizeDate(raw: string): string | null {
  let day: number, month: number, year: number;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    [year, month, day] = raw.split('-').map(Number);
  } else {
    const parts = raw.split('/');
    day = Number(parts[0]); month = Number(parts[1]);
    year = parts.length === 3 ? Number(parts[2]) : new Date().getFullYear();
    if (year < 100) year += 2000;
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

const moneyRx = /(?:-\s*)?(?:R\$\s*)?\d{1,3}(?:\.\d{3})*,\d{2}(?:\s*[-+])?|(?:-\s*)?(?:R\$\s*)?\d{4,},\d{2}(?:\s*[-+])?/g;
const dateRx = /(?:\b\d{2}\/\d{2}(?:\/\d{2,4})?\b|\b\d{4}-\d{2}-\d{2}\b)/;
const notTransactionRx = /^(saldo|total|resumo|limite|vencimento|pagina|página|fatura|lançamentos futuros|crédito disponível|valor mínimo|taxa efetiva)/i;

/** Conservative extractor: ambiguous entries are left unselected for review. */
export function parseStatementLines(lines: {key:string;text:string}[], kind: 'ACCOUNT' | 'CARD'): { rows: ParsedStatementRow[]; skipped: number } {
  const rows: ParsedStatementRow[] = [];
  let skipped = 0;
  for (const line of lines) {
    const raw = line.text.replace(/\s+/g, ' ').trim();
    const matchedDate = raw.match(dateRx);
    if (!matchedDate) continue;
    const date = normalizeDate(matchedDate[0]);
    if (!date) { skipped++; continue; }
    const valueMatches = [...raw.matchAll(moneyRx)];
    if (valueMatches.length === 0) { skipped++; continue; }
    const last = valueMatches[valueMatches.length - 1];
    const value = brlAmount(last[0]);
    const description = raw.slice(matchedDate.index! + matchedDate[0].length, last.index)
      .replace(/^[\s:;|\-–]+|[\s:;|\-–]+$/g, '').trim();
    if (!description || notTransactionRx.test(description) || !Number.isFinite(value) || value===0) { skipped++; continue; }
    const context = raw.toLowerCase();
    const incoming = /recebid|entrada|crédito|credito|deposit|sal[aá]rio|estorno|reembols/.test(context);
    const outgoing = /pago|pagamento|compra|débito|debito|sa[ií]da|enviado|tarifa|saque/.test(context);
    const signed = /\-|\(/.test(last[0]) ? -Math.abs(value) : incoming && !outgoing ? Math.abs(value) : -Math.abs(value);
    // PDF lines containing multiple amounts / sign uncertainty must be explicitly reviewed.
    const classified = classifyStatementDescriptionEnhanced(description);
    const confidence: 'HIGH' | 'REVIEW' = valueMatches.length===1
      && classified !== 'Outros' && (kind==='CARD' || incoming!==outgoing) ? 'HIGH' : 'REVIEW';
    rows.push({
      rowKey: line.key, date, description: description.slice(0,240),
      amount: Math.round(signed*100)/100,
      category: classified, confidence,
      selected: false,
    });
  }
  return { rows, skipped };
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
    const {rows,skipped}=parseStatementLines(lines,kind);
    return {hash,rows,skipped,pages:document.numPages};
  } catch (error:any) {
    throw new Error(error?.message?.includes('password') ? 'PDF protegido por senha. Exporte uma versão desbloqueada.' :
      error?.message||'Não foi possível ler o PDF. PDFs digitalizados sem texto não são reconhecidos.');
  } finally {
    await document?.destroy();
  }
}
