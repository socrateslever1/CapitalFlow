import { supabase } from '../lib/supabase';

const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/client-registration`;

async function request(body: FormData | Record<string, unknown>, authenticated = false) {
  const headers: Record<string, string> = {};
  if (!(body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (authenticated) {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token) throw new Error('Sessão expirada. Entre novamente.');
    headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  const response = await fetch(functionUrl, { method: 'POST', headers, body: body instanceof FormData ? body : JSON.stringify(body) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Não foi possível concluir o cadastro.');
  return result;
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
