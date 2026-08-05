import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import webpush from 'npm:web-push@3.6.7';

const appOrigin = (Deno.env.get('APP_ORIGIN') || 'https://capflow.pages.dev').replace(/\/$/, '');
const allowedOrigins = new Set([
  appOrigin,
  'https://capflow.pages.dev',
  'https://capitalflow.pages.dev',
  'https://capitalflow.app',
  'https://www.capitalflow.app',
  'http://localhost:3000',
  'http://localhost:3001',
]);
const allowedTypes = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const allowedPhotoTypes = new Set(['image/jpeg', 'image/png']);
const portalStatuses = new Set(['ATIVO', 'ACTIVE', 'EM_DIA', 'ATRASADO', 'PENDING', 'PENDENTE', 'RENEGOCIADO', 'EM_ACORDO']);

const corsFor = (req: Request) => ({
  'Access-Control-Allow-Origin': allowedOrigins.has(req.headers.get('origin') || '') ? req.headers.get('origin')! : appOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-retry-count, x-region',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
});
const digest = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))).map((part) => part.toString(16).padStart(2, '0')).join('');
const clean = (value: unknown, max: number) => String(value || '').trim().slice(0, max);
const digits = (value: unknown) => clean(value, 30).replace(/\D/g, '');
const tenantRoot = (profile: any) => profile?.owner_profile_id || profile?.supervisor_id || profile?.id || '';
const isValidCpf = (cpf: string) => {
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (base: string, factor: number) => {
    let sum = 0;
    for (let index = 0; index < base.length; index += 1) sum += Number(base[index]) * (factor - index);
    const result = (sum * 10) % 11;
    return result === 10 ? 0 : result;
  };
  return cpf === `${cpf.slice(0, 9)}${digit(cpf.slice(0, 9), 10)}${digit(cpf.slice(0, 10), 11)}`;
};
const hasValidImageSignature = async (file: File) => {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (file.type === 'image/png') {
    return bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  }
  return file.type === 'image/jpeg' && bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
};
const hasValidDocumentSignature = async (file: File) => {
  if (file.type.startsWith('image/')) return hasValidImageSignature(file);
  const bytes = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  return file.type === 'application/pdf' && bytes.length === 5 && String.fromCharCode(...bytes) === '%PDF-';
};

const sendRegistrationPush = async (
  admin: ReturnType<typeof createClient>,
  profileId: string,
  notificationId: string,
  clientId: string,
  clientName: string,
) => {
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY') || '';
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY') || '';
  if (!publicKey || !privateKey) return;

  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') || appOrigin, publicKey, privateKey);
  const { data: subscriptions, error } = await admin
    .from('push_subscriptions')
    .select('id,endpoint,p256dh,auth')
    .eq('profile_id', profileId);
  if (error || !subscriptions?.length) return;

  const payload = JSON.stringify({
    title: 'Novo cadastro para análise',
    body: `${clientName} enviou o cadastro e aguarda sua análise.`,
    url: `/clientes?highlight=${clientId}`,
    tag: `client-registration-${clientId}`,
    notification_id: notificationId,
  });

  await Promise.allSettled(subscriptions.map(async (subscription: any) => {
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      }, payload, { TTL: 60 * 60 * 24, urgency: 'high' });
    } catch (cause: any) {
      if (cause?.statusCode === 404 || cause?.statusCode === 410) {
        await admin.from('push_subscriptions').delete().eq('id', subscription.id);
        return;
      }
      console.warn('client-registration push', cause?.message || 'delivery_failed');
    }
  }));
};

Deno.serve(async (req) => {
  const cors = corsFor(req);
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'Método não permitido.' }, 405);

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
      if (!authorized) return reply({ error: 'Perfil não autorizado para criar inscrições.' }, 403);

      for (let attempt = 0; attempt < 2; attempt += 1) {
        const token = `${crypto.randomUUID()}${crypto.randomUUID().replaceAll('-', '')}`;
        const inserted = await admin.from('client_registration_links').insert({ profile_id: profileId, token_hash: await digest(token), created_by: authData.user.id });
        if (!inserted.error) return reply({ token, url: `${appOrigin}/?cadastro=${encodeURIComponent(token)}` });
        if (inserted.error.code !== '23505') throw inserted.error;
      }
      return reply({ error: 'Não foi possível gerar um token único.' }, 503);
    }

    if (action === 'create_client_link') {
      const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
      const { data: authData, error: authError } = await admin.auth.getUser(bearer);
      if (authError || !authData.user) return reply({ error: 'Sessao expirada. Entre novamente.' }, 401);

      const clientId = clean(value('client_id'), 50);
      const { data: client } = await admin
        .from('clientes')
        .select('id,owner_id,profile_id,name')
        .eq('id', clientId)
        .maybeSingle();
      if (!client) return reply({ error: 'Cliente nao encontrado.' }, 404);

      const profileId = client.owner_id || client.profile_id;
      const [{ data: target }, { data: requesters }] = await Promise.all([
        admin.from('perfis').select('id,owner_profile_id,supervisor_id').eq('id', profileId).maybeSingle(),
        admin.from('perfis').select('id,owner_profile_id,supervisor_id').eq('user_id', authData.user.id),
      ]);
      const authorized = !!target && (requesters || []).some((profile: any) => profile.id === profileId || tenantRoot(profile) === tenantRoot(target));
      if (!authorized) return reply({ error: 'Perfil nao autorizado para este cliente.' }, 403);

      for (let attempt = 0; attempt < 2; attempt += 1) {
        const newToken = `${crypto.randomUUID()}${crypto.randomUUID().replaceAll('-', '')}`;
        const inserted = await admin
          .from('client_registration_links')
          .insert({
            profile_id: profileId,
            client_id: client.id,
            token_hash: await digest(newToken),
            submitted_at: new Date().toISOString(),
            created_by: authData.user.id,
          })
          .select('id')
          .single();
        if (!inserted.error) return reply({ token: newToken, linkId: inserted.data.id, url: `${appOrigin}/?cadastro=${encodeURIComponent(newToken)}` });
        if (inserted.error.code !== '23505') throw inserted.error;
      }
      return reply({ error: 'Nao foi possivel gerar um token unico.' }, 503);
    }

    const token = clean(value('token'), 100);
    if (token.length < 50) return reply({ error: 'Link inválido.' }, 400);
    const { data: link } = await admin.from('client_registration_links')
      .select('id,profile_id,client_id,submitted_at,active,expires_at')
      .eq('token_hash', await digest(token))
      .maybeSingle();
    if (!link?.active || (link.expires_at && new Date(link.expires_at) <= new Date())) return reply({ error: 'Link inválido ou expirado.' }, 404);

    if (action === 'get_link') {
      if (link.client_id) {
        const { data: registeredClient } = await admin.from('clientes')
          .select('registration_status')
          .eq('id', link.client_id)
          .maybeSingle();
        const registrationApproved = ['APPROVED', 'REVIEWED'].includes(String(registeredClient?.registration_status || '').toUpperCase());
        const { data: documents } = await admin
          .from('documentos_juridicos')
          .select('id,tipo,status_assinatura,created_at,view_token,public_access_token')
          .eq('client_id', link.client_id)
          .order('created_at', { ascending: false });
        const publicDocuments = (documents || []).map((document: any) => {
          const docToken = document.view_token || document.public_access_token;
          return {
            id: document.id,
            tipo: document.tipo || 'DOCUMENTO',
            status_assinatura: document.status_assinatura || 'PENDENTE',
            created_at: document.created_at,
            sign_url: docToken ? `${appOrigin}/?legal_sign=${encodeURIComponent(docToken)}&role=DEBTOR` : '',
            view_url: docToken ? `${appOrigin}/?legal_sign=${encodeURIComponent(docToken)}&role=DEBTOR` : '',
          };
        });
        const { data: contracts } = await admin.from('contratos')
          .select('owner_id,profile_id,status,portal_token,portal_shortcode')
          .eq('client_id', link.client_id)
          .not('portal_token', 'is', null)
          .not('portal_shortcode', 'is', null)
          .limit(20);
        const contract = (contracts || []).find((item: any) =>
          (item.owner_id === link.profile_id || item.profile_id === link.profile_id) && portalStatuses.has(String(item.status || '').toUpperCase())
        );
        if (registrationApproved && contract) {
          const portalUrl = `${appOrigin}/?portal=${encodeURIComponent(contract.portal_token)}&portal_code=${encodeURIComponent(contract.portal_shortcode)}`;
          return reply({ valid: true, state: 'PORTAL', portalUrl });
        }
        if (registrationApproved) {
          return reply({ valid: true, state: 'APPROVED', documents: publicDocuments });
        }
        return reply({ valid: true, state: 'SUBMITTED' });
      }
      return reply({ valid: true, state: 'REGISTRATION' });
    }

    if (action !== 'submit' || !(input instanceof FormData)) return reply({ error: 'Acao invalida.' }, 400);
    if (link.client_id) return reply({ error: 'Esta inscrição já foi enviada.' }, 409);

    const name = clean(value('name'), 120);
    const phone = digits(value('phone'));
    const document = digits(value('document'));
    const email = clean(value('email'), 160);
    const address = clean(value('address'), 200);
    const city = clean(value('city'), 100);
    const state = clean(value('state'), 2).toUpperCase();
    const cpfInIdentity = clean(value('cpf_in_identity'), 5).toLowerCase() === 'true';
    if (name.length < 3 || phone.length < 10 || phone.length > 13 || !isValidCpf(document) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || address.length < 5 || city.length < 2 || !/^[A-Z]{2}$/.test(state)) {
      return reply({ error: 'Preencha todos os campos e informe um CPF verdadeiro.' }, 400);
    }
    const requiredDocuments = [
      { field: 'rg_document', type: cpfInIdentity ? 'RG_CPF' : 'RG' },
      ...(cpfInIdentity ? [] : [{ field: 'cpf_document', type: 'CPF' }]),
      { field: 'residence_document', type: 'COMPROVANTE_RESIDENCIA' },
    ].map(({ field, type }) => {
      const item = input.get(field);
      return { type, file: item instanceof File && item.size > 0 ? item : null };
    });
    const files = requiredDocuments.map((item) => item.file).filter((file): file is File => file !== null);
    const profilePhotoValue = input.get('profile_photo');
    const profilePhoto = profilePhotoValue instanceof File && profilePhotoValue.size > 0 ? profilePhotoValue : null;
    const expectedDocumentCount = cpfInIdentity ? 2 : 3;
    if (files.length !== expectedDocumentCount) return reply({ error: 'Envie RG, CPF e comprovante de residência, ou indique que o CPF consta no novo RG.' }, 400);
    if (files.some((file) => file.size > 5 * 1024 * 1024 || !allowedTypes.has(file.type))) {
      return reply({ error: 'Os documentos devem ser PDF, JPG ou PNG, com no maximo 5 MB cada.' }, 400);
    }
    if (!(await Promise.all(files.map(hasValidDocumentSignature))).every(Boolean)) {
      return reply({ error: 'Um ou mais documentos possuem formato inválido.' }, 400);
    }
    if (!profilePhoto) return reply({ error: 'A foto de perfil é obrigatória.' }, 400);
    if (profilePhoto.size > 5 * 1024 * 1024 || !allowedPhotoTypes.has(profilePhoto.type) || !(await hasValidImageSignature(profilePhoto))) {
      return reply({ error: 'A foto de perfil deve ser JPG ou PNG e ter no maximo 5 MB.' }, 400);
    }

    let existingClient: any = null;
    const found = await admin.from('clientes').select('id').eq('owner_id', link.profile_id).or(`document.eq.${document},cpf.eq.${document}`).limit(1).maybeSingle();
    existingClient = found.data;
    const payload = {
      owner_id: link.profile_id,
      name,
      phone,
      document,
      cpf: document.length === 11 ? document : null,
      cnpj: null,
      email,
      address,
      city,
      state,
      registration_status: 'PENDING_REVIEW',
      registration_submitted_at: new Date().toISOString(),
      registration_document_count: files.length,
      cpf_in_identity: cpfInIdentity,
    };
    const saved = existingClient
      ? await admin.from('clientes').update(payload).eq('id', existingClient.id).select('id').single()
      : await admin.from('clientes').insert(payload).select('id').single();
    if (saved.error) throw saved.error;
    const clientId = saved.data.id;

    if (profilePhoto) {
      const extension = profilePhoto.type === 'image/png' ? 'png' : 'jpg';
      const photoPath = `clientes/${clientId}/${crypto.randomUUID()}.${extension}`;
      const uploadedPhoto = await admin.storage.from('avatars').upload(photoPath, profilePhoto, {
        contentType: profilePhoto.type,
        upsert: false,
      });
      if (uploadedPhoto.error) throw uploadedPhoto.error;
      const { data: publicPhoto } = admin.storage.from('avatars').getPublicUrl(photoPath);
      const updatedPhoto = await admin.from('clientes').update({ foto_url: publicPhoto.publicUrl }).eq('id', clientId);
      if (updatedPhoto.error) {
        await admin.storage.from('avatars').remove([photoPath]);
        throw updatedPhoto.error;
      }
    }

    for (const { file, type } of requiredDocuments) {
      if (!file) continue;
      const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || (file.type === 'application/pdf' ? 'pdf' : 'jpg');
      const path = `${link.profile_id}/${clientId}/${crypto.randomUUID()}.${extension}`;
      const upload = await admin.storage.from('client-registrations').upload(path, file, { contentType: file.type, upsert: false });
      if (upload.error) throw upload.error;
      const inserted = await admin.from('client_registration_documents').insert({ profile_id: link.profile_id, client_id: clientId, registration_link_id: link.id, document_type: type, storage_path: path, original_name: clean(file.name, 180), mime_type: file.type, size_bytes: file.size });
      if (inserted.error) throw inserted.error;
    }

    const now = new Date().toISOString();
    const linked = await admin.from('client_registration_links')
      .update({ client_id: clientId, submitted_at: now, last_used_at: now })
      .eq('id', link.id)
      .is('client_id', null)
      .select('id')
      .maybeSingle();
    if (linked.error) throw linked.error;
    if (!linked.data) return reply({ success: true, state: 'SUBMITTED' });

    const notification = await admin.from('notificacoes').insert({
      profile_id: link.profile_id,
      titulo: 'Novo cadastro para análise',
      mensagem: `${name} enviou o cadastro e aguarda sua análise.`,
      action_url: `/clientes?highlight=${clientId}`,
      item_type: 'cliente',
      item_id: clientId,
      metadata: {
        client_id: clientId,
        registration_link_id: link.id,
        registration_status: 'PENDING_REVIEW',
        source: 'client_registration',
      },
    }).select('id').single();
    if (notification.error) {
      console.warn('client-registration notification', notification.error.message);
    } else {
      await sendRegistrationPush(admin, link.profile_id, notification.data.id, clientId, name);
    }

    return reply({ success: true, state: 'SUBMITTED' });
  } catch (error) {
    console.error('client-registration', error instanceof Error ? error.message : 'unknown');
    return reply({ error: 'Não foi possível concluir o cadastro agora.' }, 500);
  }
});
