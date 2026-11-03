import { supabase } from '../lib/supabase';

export interface GeminiProxyRequest {
  model?: 'gemini-2.5-flash' | 'gemini-3.8-flash' | 'gemini-3.1-flash-lite';
  contents: unknown;
  config?: Record<string, unknown>;
}

export interface GeminiProxyResponse { text: string }

/**
 * One authorized server-side gateway for AI. The browser never receives
 * provider keys, Cloudflare AI Gateway tokens, or privileged Supabase keys.
 */
export async function requestGemini(input: GeminiProxyRequest): Promise<GeminiProxyResponse> {
  const session = await supabase.auth.getSession();
  if (session.error || !session.data.session?.access_token) {
    throw new Error('Entre na sua conta para usar a análise com IA.');
  }
  const { data, error } = await supabase.functions.invoke<GeminiProxyResponse>('capitalflow-gemini-proxy', {
    body: input,
  });
  if (error || !data || typeof data.text !== 'string') {
    throw new Error('O serviço de análise com IA está indisponível. Tente novamente ou use a leitura local.');
  }
  return { text: data.text };
}
