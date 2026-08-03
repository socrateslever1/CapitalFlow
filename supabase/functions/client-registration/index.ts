import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const appOrigin = (Deno.env.get('APP_ORIGIN') || 'https://capflow.pages.dev').replace(/\/$/, '');
const allowedOrigins = new Set([appOrigin, 'https://capflow.pages.dev', 'http://localhost:3000']);
const allowedTypes = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const portalStatuses = new Set(['ATIVO', 'ACTIVE', 'EM_DIA', 'ATRASADO', 'PENDING', 'PENDENTE', 'RENEGOCIADO', 'EM_ACORDO']);

const corsFor = (req: Request) => ({
  'Access-Control-Allow-Origin': allowedOrigins.has(req.headers.get('origin') || '') ? req.headers.get('origin')! : appOrigin,
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
});
const digest = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))).map((part) => part.toString(16).padStart(2, '0')).join('');
const clean = (value: unknown, max: number) => String(value || '').trim().slice(0, max);
const digits = (value: unknown) => clean(value, 30).replace(/\D/g, '');
const tenantRoot = (profile: any) => profile?.owner_profile_id || profile?.supervisor_id || profile?.id || '';

Deno.serve(async (req) => {
  const cors = corsFor(req);
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'Metodo nao permitido.' }, 405);

  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const contentType = req.headers.get('content-type') || '';
    const input: any = contentType.includes('multipart/form-data') ? await req.formData() : await req.json();
    const value = (key: string) => input instanceof FormData ? input.get(key) : input[key];
    const action = clean(value('action'), 30);

    if (action === 'create_link') {
      const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
      const { data: authData, error: authError } = await admin.auth.getUser(bearer);
      if (authError || !authData.user) return reply({ error: 'Sessao expirada. Entre novamente.' }, 401);

      const profileId = clean(value('profile_id'), 50);
      const [{ data: target }, { data: requesters }] = await Promise.all([
        admin.from('perfis').select('id,owner_profile_id,supervisor_id').eq('id', profileId).maybeSingle(),
        admin.from('perfis').select('id,owner_profile_id,supervisor_id').eq('user_id', authData.user.id),
      ]);
      const authorized = !!target && (requesters || []).some((profile: any) => profile.id === profileId || tenantRoot(profile) === tenantRoot(target));
      if (!authorized) return reply({ error: 'Perfil nao autorizado para criar inscricoes.' }, 403);

      for (let attempt = 0; attempt < 2; attempt += 1) {
        const token = `${crypto.randomUUID()}${crypto.randomUUID().replaceAll('-', '')}`;
        const inserted = await admin.from('client_registration_links').insert({ profile_id: profileId, token_hash: await digest(token), created_by: authData.user.id });
        if (!inserted.error) return reply({ token, url: `${appOrigin}/?cadastro=${encodeURIComponent(token)}` });
        if (inserted.error.code !== '23505') throw inserted.error;
      }
      return reply({ error: 'Nao foi possivel gerar um token unico.' }, 503);
    }

    const token = clean(value('token'), 100);
    if (token.length < 50) return reply({ error: 'Link invalido.' }, 400);
    const { data: link } = await admin.from('client_registration_links')
      .select('id,profile_id,client_id,submitted_at,active,expires_at')
      .eq('token_hash', await digest(token))
      .maybeSingle();
    if (!link?.active || (link.expires_at && new Date(link.expires_at) <= new Date())) return reply({ error: 'Link invalido ou expirado.' }, 404);

    if (action === 'get_link') {
      if (link.client_id) {
        const { data: contracts } = await admin.from('contratos')
          .select('owner_id,profile_id,status,portal_token,portal_shortcode')
          .eq('client_id', link.client_id)
          .not('portal_token', 'is', null)
          .not('portal_shortcode', 'is', null)
          .limit(20);
        const contract = (contracts || []).find((item: any) =>
          (item.owner_id === link.profile_id || item.profile_id === link.profile_id) && portalStatuses.has(String(item.status || '').toUpperCase())
        );
        if (contract) {
          const portalUrl = `${appOrigin}/?portal=${encodeURIComponent(contract.portal_token)}&portal_code=${encodeURIComponent(contract.portal_shortcode)}`;
          return reply({ valid: true, state: 'PORTAL', portalUrl });
        }
        return reply({ valid: true, state: 'SUBMITTED' });
      }
      return reply({ valid: true, state: 'REGISTRATION' });
    }

    if (action !== 'submit' || !(input instanceof FormData)) return reply({ error: 'Acao invalida.' }, 400);
    if (link.client_id) return reply({ error: 'Esta inscricao ja foi enviada.' }, 409);

    const name = clean(value('name'), 120);
    const phone = digits(value('phone'));
    const document = digits(value('document'));
    if (name.length < 3 || phone.length < 10 || ![11, 14].includes(document.length)) return reply({ error: 'Confira nome, WhatsApp com DDD e CPF/CNPJ.' }, 400);
    const files = input.getAll('documents').filter((item): item is File => item instanceof File);
    if (files.length > 5 || files.some((file) => file.size <= 0 || file.size > 5 * 1024 * 1024 || !allowedTypes.has(file.type))) {
      return reply({ error: 'Envie ate 5 arquivos PDF, JPG ou PNG, com no maximo 5 MB cada.' }, 400);
    }

    const unknownDocument = /^0+$/.test(document);
    let existingClient: any = null;
    if (!unknownDocument) {
      const found = await admin.from('clientes').select('id').eq('owner_id', link.profile_id).or(`document.eq.${document},cpf.eq.${document},cnpj.eq.${document}`).limit(1).maybeSingle();
      existingClient = found.data;
    }
    const payload = {
      owner_id: link.profile_id,
      name,
      phone,
      document,
      cpf: document.length === 11 ? document : null,
      cnpj: document.length === 14 ? document : null,
      email: clean(value('email'), 160) || null,
      address: clean(value('address'), 200) || null,
      city: clean(value('city'), 100) || null,
      state: clean(value('state'), 2).toUpperCase() || null,
      registration_status: 'PENDING_REVIEW',
      registration_submitted_at: new Date().toISOString(),
      registration_document_count: files.length,
    };
    const saved = existingClient
      ? await admin.from('clientes').update(payload).eq('id', existingClient.id).select('id').single()
      : await admin.from('clientes').insert(payload).select('id').single();
    if (saved.error) throw saved.error;
    const clientId = saved.data.id;

    for (const file of files) {
      const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || (file.type === 'application/pdf' ? 'pdf' : 'jpg');
      const path = `${link.profile_id}/${clientId}/${crypto.randomUUID()}.${extension}`;
      const upload = await admin.storage.from('client-registrations').upload(path, file, { contentType: file.type, upsert: false });
      if (upload.error) throw upload.error;
      const inserted = await admin.from('client_registration_documents').insert({ profile_id: link.profile_id, client_id: clientId, registration_link_id: link.id, document_type: 'OUTRO', storage_path: path, original_name: clean(file.name, 180), mime_type: file.type, size_bytes: file.size });
      if (inserted.error) throw inserted.error;
    }

    const now = new Date().toISOString();
    const linked = await admin.from('client_registration_links').update({ client_id: clientId, submitted_at: now, last_used_at: now }).eq('id', link.id).is('client_id', null);
    if (linked.error) throw linked.error;
    return reply({ success: true, state: 'SUBMITTED' });
  } catch (error) {
    console.error('client-registration', error instanceof Error ? error.message : 'unknown');
    return reply({ error: 'Nao foi possivel concluir o cadastro agora.' }, 500);
  }
});
