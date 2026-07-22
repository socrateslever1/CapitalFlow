import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.0';

const APP_ORIGIN = Deno.env.get('APP_ORIGIN') || 'https://capflow.pages.dev';
const MAX_FILE_SIZE = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['application/pdf', 'pdf'],
]);

function corsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  const allowedOrigin = origin === APP_ORIGIN || isLocal ? origin : APP_ORIGIN;
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, 405, { error: 'Metodo nao permitido.' });

  try {
    const form = await req.formData();
    const token = String(form.get('portal_token') || '').trim();
    const shortcode = String(form.get('portal_code') || '').trim();
    const loanId = String(form.get('loan_id') || '').trim();
    const file = form.get('file');

    if (!token || !shortcode || !/^[0-9a-f-]{36}$/i.test(loanId) || !(file instanceof File)) {
      return json(req, 400, { error: 'Dados do comprovante invalidos.' });
    }
    if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
      return json(req, 413, { error: 'O comprovante deve ter no maximo 8 MB.' });
    }

    const extension = ALLOWED_TYPES.get(file.type);
    if (!extension) {
      return json(req, 415, { error: 'Envie uma imagem JPG, PNG, WEBP ou um PDF.' });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) return json(req, 500, { error: 'Servico nao configurado.' });

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authorized, error: authError } = await admin.rpc('portal_support_authorize', {
      p_token: token,
      p_shortcode: shortcode,
      p_loan_id: loanId,
    });
    const hasContract = Array.isArray(authorized) ? authorized.length > 0 : Boolean(authorized);
    if (authError || !hasContract) return json(req, 403, { error: 'Acesso ao contrato negado.' });

    const path = `${loanId}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await admin.storage.from('comprovantes').upload(path, file, {
      upsert: false,
      contentType: file.type,
      cacheControl: '3600',
    });
    if (uploadError) throw uploadError;

    return json(req, 200, {
      ok: true,
      file_ref: `storage://comprovantes/${path}`,
    });
  } catch (error) {
    console.error('[portal-receipt-upload]', error);
    return json(req, 500, { error: 'Falha ao armazenar comprovante.' });
  }
});
