import { supabase } from '../lib/supabase';
import { supabasePortal } from '../lib/supabasePortal';

async function request(body: FormData | Record<string, unknown>, authenticated = false) {
  if (authenticated) {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw new Error('Nao foi possivel validar sua sessao. Entre novamente.');
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
      throw new Error(payload?.error || error.message || 'Nao foi possivel concluir o cadastro.');
    }

    return data;
  } catch (error) {
    if (error instanceof Error && /Failed to send a request to the Edge Function/i.test(error.message)) {
      throw new Error('Nao foi possivel acessar o cadastro. Verifique sua conexao e tente novamente.');
    }
    if (error instanceof Error && error.message) throw error;
    throw new Error('Sem conexao com o cadastro. Verifique a internet e tente novamente.');
  }
}

export const clientRegistrationService = {
  createLink: (profileId: string) => request({ action: 'create_link', profile_id: profileId }, true),
  getLink: (token: string) => request({ action: 'get_link', token }),
  submit: (token: string, fields: Record<string, string>, files: File[]) => {
    const form = new FormData();
    form.set('action', 'submit');
    form.set('token', token);
    Object.entries(fields).forEach(([key, value]) => form.set(key, value));
    files.forEach((file) => form.append('documents', file));
    return request(form);
  },
  async getDocumentUrls(clientId: string) {
    const { data, error } = await supabase
      .from('client_registration_documents')
      .select('storage_path,original_name')
      .eq('client_id', clientId)
      .order('created_at');
    if (error) throw error;
    const urls = await Promise.all((data || []).map(async (document: any) => {
      const signed = await supabase.storage.from('client-registrations').createSignedUrl(document.storage_path, 300);
      if (signed.error) throw signed.error;
      return { name: document.original_name, url: signed.data.signedUrl };
    }));
    return urls;
  },
};

export type ClientRegistrationLinkState = {
  valid: true;
  state: 'REGISTRATION' | 'SUBMITTED' | 'PORTAL';
  portalUrl?: string;
};
