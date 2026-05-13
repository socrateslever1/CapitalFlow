
import { GoogleGenAI } from "@google/genai";

/**
 * Serviço isolado para integração com Google Gemini via Cloudflare AI Gateway.
 */
export const geminiGatewayService = {
  /**
   * Inicializa o cliente Gemini configurado com o AI Gateway da Cloudflare.
   */
  getClient() {
    const accountId = import.meta.env.VITE_CLOUDFLARE_ACCOUNT_ID;
    const gatewayName = import.meta.env.VITE_GATEWAY_NAME;
    const googleApiKey = import.meta.env.VITE_GOOGLE_API_KEY || process.env.GEMINI_API_KEY;

    const isGatewayConfigured = accountId && gatewayName && 
                               !accountId.includes('SEU_') && 
                               !gatewayName.includes('GATEWAY');

    if (!isGatewayConfigured) {
      console.warn("Cloudflare AI Gateway não configurado ou com valores padrão. Usando endpoint direto.");
      return new GoogleGenAI({ apiKey: googleApiKey || "" });
    }

    // A URL base segue o padrão solicitado: https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_name}/google-ai-studio
    const baseUrl = `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayName}/google-ai-studio`;
    const aigToken = import.meta.env.VITE_CF_AIG_TOKEN;

    return new GoogleGenAI({
      apiKey: googleApiKey || "",
      httpOptions: isGatewayConfigured ? {
        baseUrl: baseUrl,
        headers: aigToken ? {
          "cf-aig-authorization": `Bearer ${aigToken}`
        } : undefined
      } : undefined
    });
  },

  /**
   * Função de teste para gerar conteúdo.
   * Modelo: gemini-3-flash-preview
   */
  /**
   * Função de teste para gerar conteúdo com fallback.
   * Modelo: gemini-3-flash-preview
   */
  async testGenerateContent(prompt: string) {
    const accountId = import.meta.env.VITE_CLOUDFLARE_ACCOUNT_ID;
    const gatewayName = import.meta.env.VITE_GATEWAY_NAME;
    const googleApiKey = import.meta.env.VITE_GOOGLE_API_KEY || process.env.GEMINI_API_KEY;

    const isGatewayConfigured = !!(accountId && gatewayName && 
                               !accountId.includes('SEU_') && 
                               !gatewayName.includes('GATEWAY'));

    const generate = async (useGateway: boolean) => {
      const ai = new GoogleGenAI({ 
        apiKey: googleApiKey || "", 
        httpOptions: useGateway ? {
          baseUrl: `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayName}/google-ai-studio`,
          headers: import.meta.env.VITE_CF_AIG_TOKEN ? {
            "cf-aig-authorization": `Bearer ${import.meta.env.VITE_CF_AIG_TOKEN}`
          } : undefined
        } : undefined
      });
      
      // Retry logic for the SDK call
      let lastErr: any;
      for (let i = 0; i < 3; i++) {
        try {
          const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: prompt,
          });
          return response.text;
        } catch (err: any) {
          lastErr = err;
          const msg = err.message || String(err);
          if (msg.includes('429') || msg.includes('fetch') || msg.includes('xhr')) {
            const delay = 2000 * Math.pow(2, i);
            console.warn(`testGenerateContent: Erro recuperável. Tentativa ${i+1}. Retentando em ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          throw err;
        }
      }
      throw lastErr;
    };

    try {
      let text: string;
      if (isGatewayConfigured) {
        try {
          text = await generate(true);
        } catch (e) {
          console.warn("testGenerateContent: Gateway falhou, tentando conexão direta...", e);
          text = await generate(false);
        }
      } else {
        text = await generate(false);
      }

      return {
        success: true,
        text: text,
      };
    } catch (error: any) {
      console.error("Erro ao chamar Gemini:", error);
      return {
        success: false,
        error: error.message || "Erro desconhecido na geração de conteúdo",
      };
    }
  }
};
