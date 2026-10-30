import { classifyStatementDescription, ParsedStatementRow, StatementParseResult, parseStatementPdf } from './walletStatementPdf';
import { getGeminiApiKey } from './geminiConfig';
import { GoogleGenAI, Type } from '@google/genai';

export type SmartSourceType = 'OFX' | 'PDF_NATIVE' | 'IMAGE_AI' | 'PDF_AI';

export interface SmartStatementParseResult extends StatementParseResult {
  sourceType: SmartSourceType;
  costLabel: string;
  institutionDetected?: string;
  totalIdentifiedAmount?: number;
  previewUrl?: string;
  metadata?: {
    isReceipt?: boolean;
    payerOrPayee?: string;
    dueDate?: string;
    accountOrCardInfo?: string;
  };
}

/**
 * Normaliza datas provenientes de formatos OFX (ex: 20261025120000 ou 20261025)
 */
function normalizeOfxDate(raw: string): string | null {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (!/^\d{8}$/.test(digits)) return null;
  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6));
  const day = Number(digits.slice(6, 8));
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month - 1 && candidate.getUTCDate() === day
    ? digits.slice(0, 4) + '-' + digits.slice(4, 6) + '-' + digits.slice(6, 8) : null;
}

/**
 * Extrai número e total de parcelas de descrições brasileiras (ex: COMPRA 02/10 ou PARC 3/5)
 */
function extractInstallmentFromText(text: string): { number: number; total: number } | null {
  const match = text.match(/\b(?:parc(?:ela)?|compra)?\s*(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})\b/i);
  if (match) {
    const number = Number(match[1]);
    const total = Number(match[2]);
    if (number >= 1 && total >= 2 && number <= total && total <= 99) {
      return { number, total };
    }
  }
  return null;
}

/** Extract OFX SGML 1.x or XML 2.x fields without interpreting markup as HTML. */
function ofxField(block: string, name: string): string {
  const match = new RegExp('<' + name + '(?:\\s[^>]*)?>\\s*([^<\\r\\n]*)', 'i').exec(block);
  return (match?.[1] || '').trim().replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>');
}

function ofxAmount(raw: string): number {
  const value = raw.replace(/\s/g, '').replace(/^\+/, '');
  // OFX spec uses a dot decimal. Some Brazilian exports use a comma
  // decimal and grouped thousands; never guess for ambiguous fractions.
  if (!/^-?(?:\d+(?:[.,]\d{1,2})?|\d{1,3}(?:[.,]\d{3})+[.,]\d{2})$/.test(value)) return NaN;
  const comma = value.lastIndexOf(',');
  const dot = value.lastIndexOf('.');
  const decimal = comma > dot ? ',' : '.';
  const normalized = value.includes(',') && value.includes('.')
    ? value.replace(decimal === ',' ? /\./g : /,/g, '').replace(decimal, '.')
    : value.replace(',', '.');
  const number = Number(normalized);
  return Number.isFinite(number) && Math.abs(number) <= 9999999999.99
    ? Math.round(number * 100) / 100 : NaN;
}

function isCardCredit(type: string, description: string): boolean {
  // Bank-issued refunds and invoice payments must never become purchases.
  return /^(CREDIT|DEP|DIRECTDEP|DIV|INT)$/.test(type)
    || /\b(estorno|reembolso|devolu[cç][aã]o|cashback|pagamento\s+(?:da\s+)?fatura|cr[eé]dito\s+na\s+fatura)\b/i.test(description);
}

/**
 * Parse OFX 1.x SGML and OFX 2.x XML from local bytes only.
 * A credit on a card is NOT a purchase and cannot increase the invoice.
 */
export async function parseStatementOfx(file: File, kind: 'ACCOUNT' | 'CARD'): Promise<SmartStatementParseResult> {
  if (file.size > 10 * 1024 * 1024) throw new Error('Limite de OFX: 10 MB.');
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const preview = new TextDecoder('ascii').decode(bytes.subarray(0, Math.min(bytes.length, 800)));
  const legacy = /CHARSET:\s*(?:1252|ISO-8859-1)|encoding=["'](?:windows-1252|ISO-8859-1)/i.test(preview);
  const text = new TextDecoder(legacy ? 'windows-1252' : 'utf-8').decode(bytes).replace(/^\uFEFF/, '');
  if (!/<OFX(?:\s|>)/i.test(text)) throw new Error('Arquivo OFX inválido: estrutura OFX não encontrada.');
  const hashBytes = await crypto.subtle.digest('SHA-256', buffer);
  const hash = [...new Uint8Array(hashBytes)].map(b => b.toString(16).padStart(2, '0')).join('');
  const institution = ofxField(text, 'ORG') || ofxField(text, 'FID') || ofxField(text, 'BANKID');
  const matches = [...text.matchAll(/<STMTTRN(?:\s[^>]*)?>([\s\S]*?)(?=<\/STMTTRN>|<STMTTRN(?:\s|>)|<\/BANKTRANLIST>|<\/CCSTMTRS>|$)/gi)];
  const rows: ParsedStatementRow[] = [];
  const usedKeys = new Map<string, number>();
  let skipped = 0;
  for (const match of matches) {
    const block = match[1];
    const type = ofxField(block, 'TRNTYPE').toUpperCase();
    const date = normalizeOfxDate(ofxField(block, 'DTPOSTED'));
    const amount = ofxAmount(ofxField(block, 'TRNAMT'));
    const description = [ofxField(block, 'NAME'), ofxField(block, 'MEMO')]
      .filter(Boolean).join(' - ').replace(/\s+/g, ' ').trim().slice(0, 240) || type;
    if (!date || !Number.isFinite(amount) || amount === 0 || !description) { skipped++; continue; }
    const credit = kind === 'CARD' && isCardCredit(type, description);
    // Debit/card purchases are positive in CapitalFlow; refunds/payments
    // remain negative and cannot be accidentally applied as purchases.
    const finalAmount = kind === 'CARD' ? (credit ? -Math.abs(amount) : Math.abs(amount)) : amount;
    const fitid = ofxField(block, 'FITID');
    const rawKey = fitid
      ? 'ofx-' + fitid.slice(0, 140)
      : 'ofx-' + [date, Math.round(amount * 100), description].join('-').slice(0, 160);
    const repeat = usedKeys.get(rawKey) || 0;
    usedKeys.set(rawKey, repeat + 1);
    const installment = extractInstallmentFromText(description);
    rows.push({
      rowKey: repeat ? rawKey + '-' + repeat : rawKey,
      date,
      description,
      amount: finalAmount,
      category: classifyStatementDescription(description),
      confidence: credit ? 'REVIEW' : 'HIGH',
      selected: kind === 'CARD' ? finalAmount > 0 : true,
      installmentNumber: installment?.number || null,
      installmentTotal: installment?.total || null,
    });
  }
  if (!matches.length) throw new Error('O arquivo OFX não contém transações STMTTRN. Exporte o extrato detalhado pelo banco.');
  return {
    hash, rows, skipped, pages: 1, sourceType: 'OFX',
    costLabel: 'R$ 0,00 (Processamento Local)',
    institutionDetected: institution || undefined,
  };
}

/**
 * Converte um arquivo de imagem em Base64 e Data URL
 */
function fileToBase64(file: File): Promise<{ base64: string; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1] || '';
      resolve({ base64, dataUrl });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Parser de Faturas, Extratos e Comprovantes via Imagem/Print usando IA Gemini Multimodal Vision
 * Custo aproximado: Frações de centavo (< R$ 0,01) ou R$ 0,00 no Free Tier da Google AI Studio.
 */
export async function parseStatementImageWithAi(
  file: File,
  kind: 'ACCOUNT' | 'CARD'
): Promise<SmartStatementParseResult> {
  const apiKey = getGeminiApiKey();
  const buffer = await file.arrayBuffer();
  const hashBytes = await crypto.subtle.digest('SHA-256', buffer.slice(0));
  const hash = [...new Uint8Array(hashBytes)].map(b => b.toString(16).padStart(2, '0')).join('');
  const { base64, dataUrl } = await fileToBase64(file);

  if (!apiKey) {
    throw new Error(
      'Para ler imagens, prints de faturas ou fotos de comprovantes com IA, configure sua chave gratuita do Google Gemini em VITE_GOOGLE_API_KEY. Alternativamente, você pode importar faturas em PDF ou arquivos OFX com custo R$ 0,00 e sem necessidade de chave de API.'
    );
  }

  const ai = new GoogleGenAI({ apiKey });

  const promptText = `Você é um perito em análise fiscal e bancária do Brasil. Analise rigorosamente este documento financeiro (imagem/print de fatura de cartão de crédito, extrato bancário ou comprovante de pagamento/Pix/TED).
Tipo de destino no sistema: ${kind === 'CARD' ? 'CARTÃO DE CRÉDITO (Faturas e compras)' : 'CONTA BANCÁRIA (Extrato de movimentações)'}.

Retorne ESTRITAMENTE um JSON com as informações extraídas:
{
  "institution": "Nome do Banco ou Emissor (ex: Nubank, Inter, Itaú, Bradesco, C6, PicPay, Mercado Pago)",
  "documentType": "INVOICE" | "STATEMENT" | "RECEIPT",
  "summary": {
    "totalAmount": 0.00,
    "dueDate": "YYYY-MM-DD",
    "periodOrDate": "Texto ou data",
    "payerOrPayee": "Nome do pagador ou beneficiário se for comprovante"
  },
  "rows": [
    {
      "date": "YYYY-MM-DD",
      "description": "Nome limpo do estabelecimento ou transação (ex: Uber Trip, Mercado Livre)",
      "amount": 0.00,
      "category": "Alimentação | Transporte | Saúde | Contas da casa | Lazer | Educação | Serviços | Compras | Salário | Transferências | Outros",
      "installmentNumber": 1,
      "installmentTotal": 10,
      "confidence": "HIGH" | "REVIEW"
    }
  ]
}

Regras Cruciais:
1. Para cada lançamento encontrado, extraia data precisa no formato YYYY-MM-DD (se o ano não estiver explícito na imagem, deduza pelo ano atual ou recente).
2. Se o documento for CARTÃO DE CRÉDITO: Cada compra/gasto deve ter valor POSITIVO (ex: 45.90). Pagamentos de fatura ou estornos devem vir com valor NEGATIVO.
3. Se o documento for CONTA BANCÁRIA: Entradas/Pix recebidos devem ser POSITIVOS (+), Saídas/Pix enviados/contas pagas devem ser NEGATIVOS (-).
4. Se o documento for um COMPROVANTE ÚNICO (Pix, TED, Boleto): Gere 1 único item no array 'rows' correspondente ao valor pago com o nome do favorecido/descrição.
5. Indique parcelas se houver (ex: '01/03' -> installmentNumber: 1, installmentTotal: 3). Se não for parcelado, preencha null.
6. Não invente transações não visíveis. Retorne apenas JSON válido sem markdown adicional.`;

  try {
    const mimeType = file.type || 'image/jpeg';
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: promptText },
            {
              inlineData: {
                mimeType,
                data: base64,
              },
            },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            institution: { type: Type.STRING },
            documentType: { type: Type.STRING },
            summary: {
              type: Type.OBJECT,
              properties: {
                totalAmount: { type: Type.NUMBER },
                dueDate: { type: Type.STRING },
                periodOrDate: { type: Type.STRING },
                payerOrPayee: { type: Type.STRING },
              },
            },
            rows: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  date: { type: Type.STRING },
                  description: { type: Type.STRING },
                  amount: { type: Type.NUMBER },
                  category: { type: Type.STRING },
                  installmentNumber: { type: Type.INTEGER, nullable: true },
                  installmentTotal: { type: Type.INTEGER, nullable: true },
                  confidence: { type: Type.STRING },
                },
                required: ['date', 'description', 'amount', 'category'],
              },
            },
          },
          required: ['rows'],
        },
      },
    });

    const parsedJson = JSON.parse(response.text || '{}');
    const rawRows = Array.isArray(parsedJson.rows) ? parsedJson.rows : [];

    const rows: ParsedStatementRow[] = rawRows.map((item: any, idx: number) => {
      const amt = Number(item.amount) || 0;
      return {
        rowKey: `ai-img-${idx}-${Date.now()}`,
        date: item.date || new Date().toISOString().slice(0, 10),
        description: String(item.description || 'Lançamento identificado').slice(0, 240),
        amount: Math.round(amt * 100) / 100,
        category: item.category || classifyStatementDescription(item.description || ''),
        confidence: item.confidence === 'REVIEW' ? 'REVIEW' : 'HIGH',
        selected: kind === 'CARD' ? amt > 0 : true,
        installmentNumber: item.installmentNumber ? Number(item.installmentNumber) : null,
        installmentTotal: item.installmentTotal ? Number(item.installmentTotal) : null,
      };
    });

    return {
      hash,
      rows,
      skipped: 0,
      pages: 1,
      sourceType: 'IMAGE_AI',
      costLabel: 'IA Gemini (consulte os custos da API)',
      institutionDetected: parsedJson.institution || undefined,
      totalIdentifiedAmount: parsedJson.summary?.totalAmount,
      previewUrl: dataUrl,
      metadata: {
        isReceipt: parsedJson.documentType === 'RECEIPT',
        payerOrPayee: parsedJson.summary?.payerOrPayee,
        dueDate: parsedJson.summary?.dueDate,
      },
    };
  } catch (err: any) {
    const errorMsg = String(err?.message || err || '');
    if (errorMsg.includes('429') || errorMsg.includes('quota') || errorMsg.includes('RESOURCE_EXHAUSTED')) {
      throw new Error('Limite momentâneo da IA atingido. Tente novamente em alguns segundos ou use arquivo OFX/PDF nativo.');
    }
    throw new Error(`Não foi possível ler o documento com IA: ${errorMsg}`);
  }
}

/**
 * Função central unificada para leitura de qualquer documento financeiro:
 * - OFX / QFX (Custo R$ 0,00 nativo)
 * - PDF (Custo R$ 0,00 nativo ou IA se digitalizado)
 * - Imagens / Prints / Fotos de Faturas e Comprovantes (IA Multimodal Vision)
 */
export async function parseSmartFinancialDocument(
  file: File,
  kind: 'ACCOUNT' | 'CARD',
  options?: { forceAi?: boolean }
): Promise<SmartStatementParseResult> {
  const fileName = file.name.toLowerCase();
  const fileType = file.type.toLowerCase();

  // 1. Arquivos OFX / QFX (Padrão Bancário Universal)
  if (fileName.endsWith('.ofx') || fileName.endsWith('.qfx') || fileType.includes('ofx')) {
    return parseStatementOfx(file, kind);
  }

  // 2. Arquivos de Imagem (Prints de Fatura, Fotos, Comprovantes)
  if (
    fileType.startsWith('image/') ||
    fileName.endsWith('.png') ||
    fileName.endsWith('.jpg') ||
    fileName.endsWith('.jpeg') ||
    fileName.endsWith('.webp')
  ) {
    return parseStatementImageWithAi(file, kind);
  }

  // 3. Arquivos PDF (Faturas e Extratos)
  if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
    if (options?.forceAi) {
      if (file.size > 10 * 1024 * 1024) throw new Error('Limite de PDF para leitura com IA: 10 MB.');
      // PDF cloud processing requires explicit confirmation in the importer UI.
      const cloud = await parseStatementImageWithAi(
        file.type === 'application/pdf' ? file : new File([file], file.name, {type: 'application/pdf'}),
        kind,
      );
      return {...cloud, sourceType: 'PDF_AI', previewUrl: undefined,
        costLabel: 'IA Gemini (consulte os custos da API)'};
    }
    const nativeResult = await parseStatementPdf(file, kind);
    return {
      ...nativeResult,
      sourceType: 'PDF_NATIVE',
      costLabel: 'R$ 0,00 (Extração Local)',
    };
  }

  throw new Error('Formato não suportado. Envie arquivos OFX, PDF, ou imagens de faturas/comprovantes (PNG, JPG, WEBP).');
}
