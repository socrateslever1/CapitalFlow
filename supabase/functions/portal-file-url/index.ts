import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.0';

const APP_ORIGIN = Deno.env.get('APP_ORIGIN') || 'https://capflow.pages.dev';

function corsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return {
    'Access-Control-Allow-Origin': origin === APP_ORIGIN || isLocal ? origin : APP_ORIGIN,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function json(req: Request, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}

function parseReference(value: string): { bucket: string; path: string } | null {
  if (value.startsWith('storage://')) {
    const [bucket, ...parts] = value.slice('storage://'.length).split('/');
    return bucket && parts.length ? { bucket, path: parts.join('/') } : null;
  }
  const match = value.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?|$)/);
  return match ? { bucket: decodeURIComponent(match[1]), path: decodeURIComponent(match[2]) } : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, 405, { error: 'Metodo nao permitido.' });

  try {
    const body = await req.json();
    const token = String(body?.portal_token || '').trim();
    const shortcode = String(body?.portal_code || '').trim();
    const loanId = String(body?.loan_id || '').trim();
    const fileId = String(body?.file_id || '').trim();
    if (!token || !shortcode || !loanId || !fileId) return json(req, 400, { error: 'Dados invalidos.' });

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) return json(req, 500, { error: 'Servico nao configurado.' });
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const { data: authorized, error: authError } = await admin.rpc('portal_support_authorize', {
      p_token: token,
      p_shortcode: shortcode,
      p_loan_id: loanId,
    });
    const hasContract = Array.isArray(authorized) ? authorized.length > 0 : Boolean(authorized);
    if (authError || !hasContract) return json(req, 403, { error: 'Acesso negado.' });

    const { data: file, error: fileError } = await admin
      .from('portal_files')
      .select('file_url, direction, status')
      .eq('id', fileId)
      .eq('loan_id', loanId)
      .maybeSingle();
    if (fileError || !file) return json(req, 404, { error: 'Arquivo nao encontrado.' });

    const status = String(file.status || '').toUpperCase();
    if (file.direction === 'OPERATOR_TO_CLIENT' && !['VISIBLE', 'APPROVED'].includes(status)) {
      return json(req, 403, { error: 'Arquivo indisponivel.' });
    }

    const reference = parseReference(String(file.file_url || ''));
    if (!reference || !['documentos', 'comprovantes'].includes(reference.bucket)) {
      return json(req, 400, { error: 'Referencia de arquivo invalida.' });
    }

    const { data, error } = await admin.storage.from(reference.bucket).createSignedUrl(reference.path, 300);
    if (error || !data?.signedUrl) return json(req, 404, { error: 'Arquivo indisponivel.' });
    return json(req, 200, { ok: true, signed_url: data.signedUrl, expires_in: 300 });
  } catch (error) {
    console.error('[portal-file-url]', error);
    return json(req, 500, { error: 'Falha ao abrir arquivo.' });
  }
});
