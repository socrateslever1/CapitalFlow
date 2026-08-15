import { supabase } from '../lib/supabase';
import { supabasePortal } from '../lib/supabasePortal';

async function request(body: FormData | Record<string, unknown>, authenticated = false) {
  if (authenticated) {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw new Error('Não foi possível validar sua sessão. Entre novamente.');
    if (!data.session?.access_token) throw new Error('Sessao expirada. Entre novamente.');
  }

  const client = authenticated ? supabase : supabasePortal;
  try {
    const { data, error } = await client.functions.invoke('client-registration', { body });

    if (error) {
      const context = (error as { context?: Response }).context;
      const payload = context instanceof Response
        ? await context.clone().json().catch(() => null) as { error?: string } | null
        : null;
      throw new Error(payload?.error || error.message || 'Não foi possível concluir o cadastro.');
    }

    return data;
  } catch (error) {
    if (error instanceof Error && /Failed to send a request to the Edge Function/i.test(error.message)) {
      throw new Error('Não foi possível acessar o cadastro. Verifique sua conexão e tente novamente.');
    }
    if (error instanceof Error && error.message) throw error;
    throw new Error('Sem conexão com o cadastro. Verifique a internet e tente novamente.');
  }
}

export function normalizeOriginUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (typeof window === 'undefined') return url;

  try {
    const parsed = new URL(url);
    const currentOrigin = window.location.origin;
    return `${currentOrigin}${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return url;
  }
}

export const clientRegistrationService = {
  async createLink(profileId: string) {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData.session?.access_token) {
      throw new Error('Sessao expirada. Entre novamente.');
    }

    const { data, error } = await supabase.rpc('create_client_registration_link', {
      p_profile_id: profileId,
    });
    if (error) throw new Error(error.message || 'Não foi possível gerar o link de cadastro.');

    const token = String(data?.token || '');
    if (!token) throw new Error('O banco não retornou o token de cadastro.');
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://capflow.pages.dev';
    return { token, url: `${origin}/?cadastro=${encodeURIComponent(token)}` };
  },

  async getLink(token: string) {
    const result = await request({ action: 'get_link', token });
    if (result && typeof result === 'object') {
      if (result.portalUrl) {
        result.portalUrl = normalizeOriginUrl(result.portalUrl);
      }
      if (Array.isArray(result.documents)) {
        result.documents = result.documents.map((doc: any) => ({
          ...doc,
          sign_url: normalizeOriginUrl(doc.sign_url) || doc.sign_url,
          view_url: normalizeOriginUrl(doc.view_url) || doc.view_url,
        }));
      }
    }
    return result;
  },

  submit: (
    token: string,
    fields: Record<string, string>,
    documents: { rg: File; cpf: File | null; residence: File; cpfInIdentity: boolean },
    profilePhoto: File,
  ) => {
    const form = new FormData();
    form.set('action', 'submit');
    form.set('token', token);
    Object.entries(fields).forEach(([key, value]) => form.set(key, value));
    form.append('rg_document', documents.rg);
    if (documents.cpf) form.append('cpf_document', documents.cpf);
    form.append('residence_document', documents.residence);
    form.set('cpf_in_identity', String(documents.cpfInIdentity));
    form.append('profile_photo', profilePhoto);
    return request(form);
  },

  async review(clientId: string, status: 'APPROVED' | 'REJECTED') {
    const { data, error } = await supabase.rpc('review_client_registration', {
      p_client_id: clientId,
      p_status: status,
    });
    if (error) throw new Error(error.message || 'Não foi possível concluir a análise.');
    return data;
  },

  async getDocumentUrls(clientId: string) {
    const { data, error } = await supabase
      .from('client_registration_documents')
      .select('id,document_type,storage_path,original_name,mime_type,created_at')
      .eq('client_id', clientId)
      .order('created_at');
    if (error) throw error;

    return Promise.all((data || []).map(async (document: any) => {
      const signed = await supabase.storage.from('client-registrations').createSignedUrl(document.storage_path, 300);
      if (signed.error) throw signed.error;
      return {
        id: document.id,
        type: document.document_type,
        name: document.original_name,
        mimeType: document.mime_type,
        createdAt: document.created_at,
        url: signed.data.signedUrl,
      };
    }));
  },

  async createClientAccessLink(clientId: string, lookup?: { profileId?: string; document?: string; phone?: string }) {
    const data = await request({
      action: 'create_client_link',
      client_id: clientId,
      profile_id: lookup?.profileId,
      document: lookup?.document,
      phone: lookup?.phone,
      reuse_registration_link: true,
    }, true) as any;

    if (!data?.clientId || !data?.linkId) {
      throw new Error('Este cliente ainda nao possui o link unico de cadastro vinculado.');
    }

    const rawUrl = data.url ? String(data.url) : '';
    const normalizedUrl = rawUrl ? (normalizeOriginUrl(rawUrl) || rawUrl) : '';
    return {
      token: String(data.token || ''),
      code: data.code ? String(data.code) : undefined,
      url: normalizedUrl,
      linkId: data.linkId ? String(data.linkId) : '',
      clientId: String(data.clientId),
      state: data.state || 'REGISTRATION',
    };
  },
};

export type ClientRegistrationLinkState = {
  valid: true;
  state: 'REGISTRATION' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'DOCUMENTS' | 'PORTAL';
  portalToken?: string;
  portalCode?: string;
  portalUrl?: string;
  client?: {
    id?: string;
    name?: string;
    document?: string;
    phone?: string;
    email?: string;
    city?: string;
    state?: string;
    profile_id?: string;
  };
  documents?: Array<{
    id: string;
    tipo: string;
    status_assinatura: string;
    created_at: string;
    sign_url: string;
    view_url: string;
  }>;
};
