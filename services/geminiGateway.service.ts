import { requestGemini, type GeminiProxyRequest } from './secureGemini.service';

/** The provider credentials never leave the authenticated server function. */
export const geminiGatewayService = {
  getClient() {
    return { models: { generateContent: (input: GeminiProxyRequest) => requestGemini(input) } };
  },
  async testGenerateContent(prompt: string) {
    try {
      const response = await requestGemini({ contents: prompt, model: 'gemini-3.8-flash' });
      return { success: true, text: response.text };
    } catch {
      return { success: false, error: 'Não foi possível acessar a IA. Verifique a configuração do servidor.' };
    }
  },
};
