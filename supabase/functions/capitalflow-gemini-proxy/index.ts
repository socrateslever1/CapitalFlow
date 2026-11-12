import { createClient } from 'npm:@supabase/supabase-js@2.110.7';

const MODEL_IDS = new Set(['gemini-2.5-flash', 'gemini-3.8-flash', 'gemini-3.1-flash-lite']);
const MAX_BODY_BYTES = 9 * 1024 * 1024;
const MAX_INLINE_BYTES = 5 * 1024 * 1024;
const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
  'cache-control': 'no-store',
};
const json = (value: unknown, status: number) => new Response(JSON.stringify(value), {
  status, headers: { ...cors, 'content-type': 'application/json; charset=utf-8' },
});
const windows = new Map<string, { start: number; count: number }>();
function rateLimit(userId: string): boolean {
  const now = Date.now();
  if (windows.size > 5000) {
    for (const [key, value] of windows) if (now - value.start >= 60_000) windows.delete(key);
  }
  const current = windows.get(userId);
  if (!current || now - current.start >= 60_000) {
    windows.set(userId, { start: now, count: 1 });
    return true;
  }
  if (current.count >= 12) return false;
  current.count++;
  return true;
}
function validateContents(value: unknown): unknown {
  if (typeof value === 'string') {
    if (!value.trim() || value.length > 50_000) throw new Error('Solicitação de IA inválida.');
    return [{ role: 'user', parts: [{ text: value }] }];
  }
  if (!Array.isArray(value) || value.length < 1 || value.length > 8) {
    throw new Error('Conteúdo de IA inválido.');
  }
  for (const item of value) {
    if (!item || typeof item !== 'object' || !Array.isArray(item.parts) || item.parts.length > 8) {
      throw new Error('Formato de conteúdo inválido.');
    }
    for (const part of item.parts) {
      if (typeof part.text === 'string') {
        if (part.text.length > 50_000) throw new Error('Texto de IA muito extenso.');
      } else if (part.inlineData) {
        const mime = part.inlineData.mimeType;
        const data = part.inlineData.data;
        if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(mime)
          || typeof data !== 'string' || data.length > Math.ceil(MAX_INLINE_BYTES * 4 / 3) + 4
          || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) {
          throw new Error('Arquivo inválido ou excede o limite de 5 MB.');
        }
      } else {
        throw new Error('Parte de conteúdo não suportada.');
      }
    }
  }
  return value;
}
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);
  const authorization = req.headers.get('authorization') || '';
  if (!/^Bearer [^\s]+$/.test(authorization)) return json({ error: 'Autenticação necessária.' }, 401);
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !anonKey) return json({ error: 'Serviço indisponível.' }, 503);
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error: authError } = await client.auth.getUser(authorization.substring(7));
  if (authError || !auth.user) return json({ error: 'Sessão inválida.' }, 401);
  if (!rateLimit(auth.user.id)) return json({ error: 'Limite temporário de solicitações.' }, 429);

  const declaredLength = Number(req.headers.get('content-length') || 0);
  if (declaredLength > MAX_BODY_BYTES) return json({ error: 'Documento muito extenso.' }, 413);
  let body: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) return json({ error: 'Documento muito extenso.' }, 413);
    body = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Formato inválido.');
  } catch { return json({ error: 'Solicitação inválida.' }, 400); }

  const apiKey = Deno.env.get('GEMINI_API_KEY') || Deno.env.get('GOOGLE_API_KEY');
  if (!apiKey) return json({ error: 'O provedor de IA ainda não está configurado no servidor.' }, 503);
  try {
    const model = typeof body.model === 'string' && MODEL_IDS.has(body.model) ? body.model : 'gemini-2.5-flash';
    const contents = validateContents(body.contents);
    const conf = body.config && typeof body.config === 'object' && !Array.isArray(body.config)
      ? body.config as Record<string, unknown> : {};
    const generationConfig: Record<string, unknown> = {
      maxOutputTokens: 3072,
      temperature: 0,
    };
    if (conf.responseMimeType === 'application/json') generationConfig.responseMimeType = 'application/json';
    if (conf.responseSchema && typeof conf.responseSchema === 'object'
      && JSON.stringify(conf.responseSchema).length <= 15000) {
      generationConfig.responseSchema = conf.responseSchema;
    }
    const systemInstruction = typeof conf.systemInstruction === 'string'
      ? { parts: [{ text: conf.systemInstruction.slice(0, 12000) }] } : undefined;
    const upstream = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({ contents, generationConfig, ...(systemInstruction ? { systemInstruction } : {}) }),
        signal: AbortSignal.timeout(28_000),
      },
    );
    if (!upstream.ok) {
      // Only categorical provider status is logged. No prompts, credentials,
      // personal documents or raw upstream response are ever logged.
      const failure: unknown = await upstream.json().catch(() => null);
      const envelope = (failure && typeof failure === 'object' && 'error' in failure)
        ? (failure as { error?: { status?: unknown; details?: Array<{ reason?: unknown }> } }).error
        : null;
      const code = typeof envelope?.status === 'string' && /^[A-Z_]{1,50}$/.test(envelope.status)
        ? envelope.status : 'UNKNOWN';
      const reason = typeof envelope?.details?.[0]?.reason === 'string'
        && /^[A-Z_]{1,60}$/.test(envelope.details[0].reason)
        ? envelope.details[0].reason : 'UNSPECIFIED';
      console.error('[gemini-proxy]', JSON.stringify({
        event: 'upstream_rejected', model, status: upstream.status, code, reason,
      }));
      if (upstream.status === 429)
        return json({ error: 'A IA atingiu seu limite temporário de utilização.' }, 429);
      if (upstream.status === 400 || upstream.status === 401 || upstream.status === 402
          || upstream.status === 403 || upstream.status === 404)
        return json({ error: 'O provedor de IA recusou a solicitação. Verifique acesso ao modelo, chave e faturamento.' }, 503);
      return json({ error: 'O provedor de IA está indisponível. Tente novamente.' }, 502);
    }
    const payload = await upstream.json();
    const answer = payload?.candidates?.[0]?.content?.parts
      ?.map((part: { text?: unknown }) => typeof part.text === 'string' ? part.text : '').join('') || '';
    if (!answer || answer.length > 150_000) {
      console.error('[gemini-proxy]', JSON.stringify({ event: 'empty_or_oversized_response', model }));
      return json({ error: 'O provedor não retornou uma resposta utilizável.' }, 502);
    }
    return json({ text: answer }, 200);
  } catch (cause) {
    const kind = cause instanceof Error && cause.name === 'TimeoutError' ? 'TIMEOUT' : 'FETCH_FAILURE';
    console.error('[gemini-proxy]', JSON.stringify({ event: 'request_failed', kind }));
    return json({ error: 'Não foi possível concluir a análise.' }, 502);
  }
});
