import { GoogleGenAI, Type } from "@google/genai";

/**
 * Tipos e Interfaces existentes para manter compatibilidade com o sistema atual.
 */
export type AIPersona =
  | 'OPERATOR_CRO'
  | 'TEAM_LEADER'
  | 'CLIENT_MENTOR';

export interface AIResponse {
  ok?: boolean;
  intent: string;
  feedback: string;
  analysis?: string;
  data?: any;
  suggestions?: string[];
  riskScore?: number;
}

function resolvePersona(context: any): AIPersona {
  if (context?.type === 'PORTAL_CLIENT') return 'CLIENT_MENTOR';
  if (context?.type === 'TEAM_PAGE') return 'TEAM_LEADER';
  return 'OPERATOR_CRO';
}

function getSystemInstruction(persona: AIPersona): string {
  const baseInstruction = `Você é um assistente especializado em operações financeiras e cobrança do sistema CapitalFlow.
Regras de Comportamento:
- Responda sempre em português claro e profissional.
- Seja direto e objetivo.
- Nunca invente dados.
- Baseie sugestões em boas práticas de gestão financeira.
- Priorize negociação amigável e manutenção do relacionamento.

Formato de Resposta Obrigatório:
1. Situação: Resumo do que foi identificado.
2. Análise: Avaliação técnica do risco ou oportunidade.
3. Sugestão: Ação prática recomendada.
4. Mensagem ao cliente: Texto pronto para envio (se aplicável).`;

  switch (persona) {
    case 'CLIENT_MENTOR':
      return `${baseInstruction}\nSua persona: Mentor financeiro para clientes. Foco em educação e encorajamento.`;
    case 'TEAM_LEADER':
      return `${baseInstruction}\nSua persona: Líder de equipe. Foco em performance de vendas e gestão de cobrança.`;
    case 'OPERATOR_CRO':
    default:
      return `${baseInstruction}\nSua persona: Chief Risk Officer (CRO). Foco em análise de carteira, score de saúde e mitigação de inadimplência.`;
  }
}

/**
 * Função existente utilizada pelo Dashboard e outras áreas do sistema.
 * Mantida para garantir que o sistema não quebre.
 */
export const processNaturalLanguageCommand = async (
  text: string,
  context: any
): Promise<AIResponse> => {
  try {
    const persona = resolvePersona(context);
    const systemInstruction = getSystemInstruction(persona);

    const googleApiKey = import.meta.env.VITE_GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    if (!googleApiKey) {
      return {
        intent: 'ERROR',
        feedback: 'Chave da API do Gemini não configurada (VITE_GOOGLE_API_KEY ou process.env.GEMINI_API_KEY).',
      };
    }

    const callWithRetry = async (maxRetries = 5, initialDelay = 3000) => {
      let lastError: any;
      const models = ["gemini-3-flash-preview", "gemini-3.1-flash-lite-preview", "gemini-3.1-pro-preview"];
      
      const accountId = import.meta.env.VITE_CLOUDFLARE_ACCOUNT_ID;
      const gatewayName = import.meta.env.VITE_GATEWAY_NAME;
      const aigToken = import.meta.env.VITE_CF_AIG_TOKEN;
      
      const isGatewayConfigured = !!(accountId && gatewayName && 
                                 !accountId.includes('SEU_') && 
                                 !gatewayName.includes('GATEWAY'));

      const generate = async (useGateway: boolean, modelIndex: number) => {
        const ai = new GoogleGenAI({ 
          apiKey: googleApiKey,
          httpOptions: useGateway ? {
            baseUrl: `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayName}/google-ai-studio`,
            headers: aigToken ? { "cf-aig-authorization": `Bearer ${aigToken}` } : undefined
          } : undefined
        });

        return await ai.models.generateContent({
          model: models[modelIndex % models.length],
          contents: `Comando: ${text}\n\nContexto dos dados:\n${JSON.stringify(context, null, 2)}`,
          config: {
            systemInstruction,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                intent: {
                  type: Type.STRING,
                  description: "A intenção ou status principal da análise (ex: 'Risco Alto', 'Saudável', 'Atenção')",
                },
                feedback: {
                  type: Type.STRING,
                  description: "Um resumo rápido ou feedback direto.",
                },
                analysis: {
                  type: Type.STRING,
                  description: "A análise detalhada do contexto fornecido.",
                },
                suggestions: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.STRING,
                  },
                  description: "Lista de sugestões acionáveis.",
                },
                riskScore: {
                  type: Type.NUMBER,
                  description: "Uma pontuação de risco ou saúde de 0 a 100.",
                },
              },
              required: ["intent", "feedback", "analysis", "suggestions", "riskScore"],
            },
          },
        });
      };

      // Tenta primeiro com Gateway se configurado
      if (isGatewayConfigured) {
        try {
          return await generate(true, 0);
        } catch (err: any) {
          console.debug("AI Gateway falhou (provável bloqueio de rede ou CSP). Tentando conexão direta...", err);
          // Se falhar, continua para a tentativa direta abaixo
        }
      }

      // Loop de retentativas para conexão direta
      for (let i = 0; i < maxRetries; i++) {
        try {
          // Alterna entre modelos se houver erro de quota
          const modelIdx = i >= 2 ? (i - 1) : 0; 
          return await generate(false, modelIdx);
        } catch (err: any) {
          lastError = err;
          const errorMessage = err.message || String(err);
          const isQuotaError = errorMessage.includes('429') || err.status === 429 || errorMessage.includes('RESOURCE_EXHAUSTED');
          const isNetworkError = errorMessage.includes('Rpc failed') || errorMessage.includes('xhr error') || errorMessage.includes('Failed to fetch');

          if (isQuotaError || isNetworkError) {
            // Backoff exponencial com jitter
            const jitter = Math.random() * 1000;
            const delay = (initialDelay * Math.pow(2, i)) + jitter;
            console.warn(`Erro recuperável na conexão direta (${isQuotaError ? 'Quota' : 'Rede'}). Tentativa ${i + 1} de ${maxRetries}. Retentando em ${Math.round(delay)}ms com modelo ${models[((i >= 2 ? (i - 1) : 0) + 1) % models.length]}...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          throw err;
        }
      }
      throw lastError;
    };

    const response = await callWithRetry();
    const responseText = response.text;
    if (!responseText) throw new Error("Resposta vazia da IA");
    const parsedData = JSON.parse(responseText);

    return {
      ok: true,
      intent: parsedData.intent,
      feedback: parsedData.feedback,
      analysis: parsedData.analysis,
      suggestions: parsedData.suggestions,
      riskScore: parsedData.riskScore,
    };
  } catch (e: any) {
    console.error("Erro no processNaturalLanguageCommand:", e);
    const errorMessage = e.message || String(e);
    const isQuotaError = errorMessage.includes('429') || e.status === 429 || errorMessage.includes('RESOURCE_EXHAUSTED');
    const isNetworkError = errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError') || errorMessage.includes('Rpc failed');

    let feedback = 'Falha inesperada ao processar IA.';
    if (isQuotaError) {
      feedback = 'Limite de uso da IA atingido (Quota). Por favor, aguarde um momento e tente novamente.';
    } else if (isNetworkError) {
      feedback = 'Erro de conexão com o serviço de IA. Verifique sua internet ou configurações de rede.';
    }

    return {
      intent: 'ERROR',
      feedback,
    };
  }
};

// =============================================================================
// NOVA INTEGRAÇÃO: CLOUDFLARE AI GATEWAY + GEMINI (FETCH NATIVO)
// =============================================================================

import { fetchWithRetry } from "../utils/fetchWithRetry";

/**
 * Nova função solicitada para integração direta via Cloudflare AI Gateway.
 * Utiliza fetch nativo e variáveis de ambiente do Vite.
 * 
 * @param prompt Texto a ser enviado para a IA
 * @returns Resposta em texto da IA ou mensagem de erro
 */
export async function askGemini(prompt: string): Promise<string> {
  const accountId = import.meta.env.VITE_CLOUDFLARE_ACCOUNT_ID;
  const gatewayName = import.meta.env.VITE_GATEWAY_NAME;
  const googleApiKey = import.meta.env.VITE_GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  const cfAigToken = import.meta.env.VITE_CF_AIG_TOKEN;

  const isGatewayConfigured = !!(accountId && gatewayName && 
                             !accountId.includes('SEU_') && 
                             !gatewayName.includes('GATEWAY'));

  const performFetch = async (useGateway: boolean, modelIndex: number) => {
    const models = ["gemini-3-flash-preview", "gemini-3.1-flash-lite-preview", "gemini-3.1-pro-preview"];
    const selectedModel = models[modelIndex % models.length];

    const endpoint = useGateway 
      ? `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayName}/google-ai-studio/v1/models/${selectedModel}:generateContent?key=${googleApiKey}`
      : `https://generativelanguage.googleapis.com/v1/models/${selectedModel}:generateContent?key=${googleApiKey}`;


    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (useGateway && cfAigToken) {
      headers['cf-aig-authorization'] = `Bearer ${cfAigToken}`;
    }

    const response = await fetchWithRetry(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      }),
      maxRetries: 3,
      initialDelay: 2000
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== 'string') throw new Error("Resposta da IA não contém texto");
    return text;
  };

  try {
    if (isGatewayConfigured) {
      try {
        return await performFetch(true, 0);
      } catch (e) {
        console.warn("askGemini: Gateway falhou, tentando conexão direta...", e);
      }
    }

    if (!googleApiKey) throw new Error("API Key não configurada");
    
    // Retry logic for askGemini
    let lastError: any;
    for (let i = 0; i < 5; i++) {
      try {
        const modelIdx = i >= 2 ? (i - 1) : 0;
        return await performFetch(false, modelIdx);
      } catch (err: any) {
        lastError = err;
        const errorMessage = err.message || String(err);
        const isQuotaError = errorMessage.includes('429') || errorMessage.includes('RESOURCE_EXHAUSTED');
        
        if (isQuotaError && i < 4) {
          const jitter = Math.random() * 1000;
          const delay = (3000 * Math.pow(2, i)) + jitter;
          console.warn(`askGemini: Quota atingida. Tentativa ${i + 1} de 5. Retentando em ${Math.round(delay)}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        throw err;
      }
    }
    throw lastError;
  } catch (error: any) {
    console.error("Erro ao consultar Gemini:", error);
    const isNetworkError = error.message?.includes('Failed to fetch') || error.name === 'TypeError';
    return "Erro ao consultar IA: " + (isNetworkError ? "Falha na conexão de rede" : (error.message || "Falha desconhecida"));
  }
}
