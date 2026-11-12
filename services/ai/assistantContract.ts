export type StructuredAIResponse = {
  intent: string;
  feedback: string;
  analysis?: string;
  data?: unknown;
  suggestions?: string[];
  riskScore?: number;
};

export const STRUCTURED_AI_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    intent: { type: 'STRING' },
    feedback: { type: 'STRING' },
    analysis: { type: 'STRING' },
    data: {
      type: 'OBJECT',
      properties: {
        name: { type: 'STRING' },
        phone: { type: 'STRING' },
        amount: { type: 'NUMBER' },
        description: { type: 'STRING' },
        date: { type: 'STRING' },
      },
    },
    suggestions: { type: 'ARRAY', items: { type: 'STRING' } },
    riskScore: { type: 'NUMBER' },
  },
  required: ['intent', 'feedback'],
} as const;

const MAX_PROMPT_CHARS = 12_000;
const MAX_FEEDBACK_CHARS = 4_000;
const MAX_ANALYSIS_CHARS = 8_000;
const MAX_SUGGESTIONS = 8;

function cleanText(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text ? text.slice(0, max) : undefined;
}

function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('Resposta de IA inválida.');
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      throw new Error('Resposta de IA inválida.');
    }
  }
}

export function parseStructuredAIResponse(raw: string): StructuredAIResponse {
  const parsed = extractJsonObject(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Resposta de IA inválida.');
  }
  const value = parsed as Record<string, unknown>;
  const intent = cleanText(value.intent, 120);
  const feedback = cleanText(value.feedback, MAX_FEEDBACK_CHARS);
  if (!intent || !feedback) throw new Error('Resposta de IA incompleta.');

  const result: StructuredAIResponse = { intent, feedback };
  const analysis = cleanText(value.analysis, MAX_ANALYSIS_CHARS);
  if (analysis) result.analysis = analysis;
  if (Array.isArray(value.suggestions)) {
    const suggestions = value.suggestions
      .map(item => cleanText(item, 300))
      .filter((item): item is string => Boolean(item))
      .slice(0, MAX_SUGGESTIONS);
    if (suggestions.length) result.suggestions = suggestions;
  }
  if (typeof value.riskScore === 'number' && Number.isFinite(value.riskScore)) {
    result.riskScore = Math.min(100, Math.max(0, Math.round(value.riskScore)));
  }
  if (value.data !== undefined) result.data = value.data;
  return result;
}

export function buildStructuredAssistantPrompt(
  persona: string,
  text: string,
  context: unknown,
): string {
  const contextText = JSON.stringify(context ?? {}).slice(0, 7_000);
  return [
    `Perfil operacional: ${persona}.`,
    'Responda em português do Brasil. Não invente fatos, valores, pagamentos ou saldos.',
    'Não execute mutações financeiras e não trate sugestão como confirmação.',
    'Retorne somente JSON puro, sem Markdown, com este formato:',
    '{"intent":"...","feedback":"...","analysis":"...","data":{},"suggestions":["..."],"riskScore":0}',
    `Comando do usuário: ${text.trim().slice(0, 3_000)}`,
    `Dados autorizados fornecidos pelo sistema: ${contextText}`,
  ].join('\n').slice(0, MAX_PROMPT_CHARS);
}
