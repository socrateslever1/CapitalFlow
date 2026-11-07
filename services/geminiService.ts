import { requestGemini } from './secureGemini.service';
import { buildInternalAIText, processInternalAICommand } from './internalAI.service';

export type AIPersona = 'OPERATOR_CRO' | 'CLIENT_MENTOR';
export interface AIResponse {
  ok?: boolean;
  intent: string;
  feedback: string;
  analysis?: string;
  data?: unknown;
  suggestions?: string[];
  riskScore?: number;
}
const SYSTEM_INSTRUCTION = `Você é um assistente de gestão financeira do CapitalFlow.
Responda em português do Brasil. Não invente fatos, valores, pagamentos ou saldos.
Não decida crédito nem realize mutações financeiras.
Forneça situação, análise, sugestão e mensagem ao cliente, quando aplicável.`;

export async function processNaturalLanguageCommand(text: string, context: unknown): Promise<AIResponse> {
  if (!text.trim()) return { intent: 'ERROR', feedback: 'Informe uma pergunta.' };
  try {
    const persona: AIPersona = (context as {type?: string})?.type === 'PORTAL_CLIENT'
      ? 'CLIENT_MENTOR' : 'OPERATOR_CRO';
    const response = await requestGemini({
      model: 'gemini-3.8-flash',
      contents: `Perfil: ${persona}\nComando: ${text}\nDados informados: ${JSON.stringify(context)}`,
      config: { systemInstruction: SYSTEM_INSTRUCTION, responseMimeType: 'application/json' },
    });
    const parsed: unknown = JSON.parse(response.text);
    if (!parsed || typeof parsed !== 'object') throw new Error('Resposta inválida.');
    const data = parsed as Record<string, unknown>;
    if (typeof data.feedback !== 'string' || typeof data.intent !== 'string') {
      throw new Error('Resposta inválida.');
    }
    return {
      ok: true,
      intent: data.intent,
      feedback: data.feedback,
      analysis: typeof data.analysis === 'string' ? data.analysis : undefined,
      suggestions: Array.isArray(data.suggestions)
        ? data.suggestions.filter((value): value is string => typeof value === 'string') : undefined,
      riskScore: typeof data.riskScore === 'number' ? data.riskScore : undefined,
    };
  } catch {
    return processInternalAICommand(text, context);
  }
}

export async function askGemini(prompt: string): Promise<string> {
  if (!prompt.trim()) return '';
  try {
    const response = await requestGemini({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: { systemInstruction: SYSTEM_INSTRUCTION },
    });
    return response.text;
  } catch {
    return buildInternalAIText(prompt);
  }
}
