import { GoogleGenAI, Type } from '@google/genai';
import { getGeminiApiKey } from './geminiConfig';

export interface RecognizedCardData {
  nickname: string;
  issuer: string;
  brand: string;
  last_four: string;
  credit_limit?: number;
  closing_day?: number;
  due_day?: number;
  primary_color?: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

function normalizeBrand(raw: string): string {
  const lower = (raw || '').toLowerCase();
  if (lower.includes('master')) return 'Mastercard';
  if (lower.includes('visa')) return 'Visa';
  if (lower.includes('elo')) return 'Elo';
  if (lower.includes('amex') || lower.includes('american')) return 'American Express';
  if (lower.includes('hiper')) return 'Hipercard';
  return raw.trim() || 'Mastercard';
}

function detectDefaultColor(issuer: string): string {
  const lower = issuer.toLowerCase();
  if (lower.includes('nubank')) return '#820AD1';
  if (lower.includes('inter')) return '#FF7A00';
  if (lower.includes('itau') || lower.includes('itaú')) return '#EC7000';
  if (lower.includes('bradesco')) return '#CC092F';
  if (lower.includes('santander')) return '#EA1D2C';
  if (lower.includes('c6')) return '#242424';
  if (lower.includes('picpay')) return '#11C76F';
  if (lower.includes('mercado')) return '#009EE3';
  if (lower.includes('caixa')) return '#005CA9';
  if (lower.includes('brasil') || lower.includes('bb')) return '#FAF000';
  return '#1E293B';
}

/**
 * Converte arquivo ou dataUrl para base64 limpo
 */
async function toBase64(input: File | string): Promise<{ base64: string; mimeType: string }> {
  if (typeof input === 'string') {
    if (input.startsWith('data:')) {
      const [header, base64] = input.split(',');
      const mimeType = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
      return { base64, mimeType };
    }
    return { base64: input, mimeType: 'image/jpeg' };
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1] || '';
      resolve({ base64, mimeType: input.type || 'image/jpeg' });
    };
    reader.onerror = reject;
    reader.readAsDataURL(input);
  });
}

/**
 * Reconhece dados de um cartão de crédito físico através de IA Gemini Multimodal Vision.
 * Extrai Emissor, Apelido, Bandeira, Últimos 4 dígitos e dados complementares.
 */
export async function recognizeCardFromImage(
  imageInput: File | string
): Promise<RecognizedCardData> {
  const apiKey = getGeminiApiKey();
  const { base64, mimeType } = await toBase64(imageInput);

  if (!apiKey) {
    throw new Error(
      'Para utilizar o reconhecimento automático de cartão via câmera/imagem com IA, configure sua chave da API Gemini em VITE_GOOGLE_API_KEY.'
    );
  }

  const ai = new GoogleGenAI({ apiKey });

  const prompt = `Você é um especialista em visão computacional financeira no Brasil. Analise esta foto de um cartão de crédito ou débito (frente ou verso).
Sua tarefa é extrair com precisão os dados para cadastro do cartão na carteira digital do usuário:
1. Instituição/Banco emissor (ex: Nubank, Inter, Itaú, Bradesco, Santander, C6 Bank, Caixa, Banco do Brasil, PicPay, Mercado Pago, XP, BTG Pactual, etc.)
2. Apelido sugerido para o cartão (ex: "Nubank Roxo", "Inter Black", "Itaú Click", "Bradesco Neo")
3. Bandeira (Mastercard, Visa, Elo, American Express, Hipercard)
4. Os 4 últimos dígitos do cartão (se houver número completo visível, capture APENAS os 4 últimos dígitos por segurança)
5. Dia de vencimento da fatura (due_day, de 1 a 31), se estiver visível no verso ou documento anexo
6. Dia de fechamento (closing_day, de 1 a 31), se visível
7. Limite de crédito estimado (credit_limit), se visível

Retorne estritamente o JSON com os dados reconhecidos.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
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
            issuer: { type: Type.STRING },
            nickname: { type: Type.STRING },
            brand: { type: Type.STRING },
            last_four: { type: Type.STRING },
            credit_limit: { type: Type.NUMBER, nullable: true },
            closing_day: { type: Type.INTEGER, nullable: true },
            due_day: { type: Type.INTEGER, nullable: true },
            primary_color: { type: Type.STRING, nullable: true },
            confidence: { type: Type.STRING },
          },
          required: ['issuer', 'brand'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    const issuer = String(parsed.issuer || 'Banco').trim();
    const brand = normalizeBrand(parsed.brand || 'Mastercard');
    const rawLastFour = String(parsed.last_four || '').replace(/\D/g, '').slice(-4);
    const color = parsed.primary_color || detectDefaultColor(issuer);

    return {
      issuer,
      nickname: parsed.nickname || `${issuer} ${brand}`,
      brand,
      last_four: rawLastFour,
      credit_limit: Number(parsed.credit_limit) || undefined,
      closing_day: Number(parsed.closing_day) || undefined,
      due_day: Number(parsed.due_day) || undefined,
      primary_color: color,
      confidence: parsed.confidence === 'LOW' ? 'LOW' : 'HIGH',
    };
  } catch (error: any) {
    const msg = String(error?.message || error || '');
    if (msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
      throw new Error('Limite momentâneo da IA atingido. Preencha os campos manualmente ou tente novamente.');
    }
    throw new Error(`Não foi possível reconhecer o cartão: ${msg}`);
  }
}
