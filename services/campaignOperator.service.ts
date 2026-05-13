import { supabase } from '../lib/supabase';
import { safeUUID } from '../utils/uuid';

const sanitizeExt = (name: string) => {
  const ext = (name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
  return ext || 'bin';
};

function isNetworkFetchError(err: any) {
  const msg = String(err?.message || '');
  const name = String(err?.name || '');
  return (
    name === 'TypeError' &&
    (msg === 'Failed to fetch' || msg?.includes('Failed to fetch') || msg?.includes('Load failed'))
  );
}

async function getSessionTokenOrThrow(sessionToken: string) {
  const t = String(sessionToken || '').trim();
  if (!t) throw new Error('SESSION_TOKEN_VAZIO');
  
  // Garantir que seja um UUID válido para evitar erro "uuid = text" no Postgres
  const safe = safeUUID(t);
  if (!safe) throw new Error('SESSION_TOKEN_INVALIDO');
  
  return safe;
}

export const campaignOperatorService = {
  async getLeads() {
    const { data, error } = await supabase
      .from('campaign_leads')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw new Error(`GET_LEADS_ERROR: ${error.message}`);
    return data || [];
  },

  async getMessages(sessionToken: string) {
    const token = await getSessionTokenOrThrow(sessionToken);

    try {
      const { data, error } = await supabase
        .from('campaign_messages')
        .select('*')
        .eq('session_token', token)
        .order('created_at', { ascending: true });

      if (error) {
        throw new Error(`GET_MESSAGES_DB_ERROR: ${error.message}`);
      }

      return data || [];
    } catch (err: any) {
      if (isNetworkFetchError(err)) {
        throw new Error('GET_MESSAGES_NETWORK_ERROR: Failed to fetch');
      }
      throw err;
    }
  },

  async sendMessage(sessionToken: string, message: string) {
    const token = await getSessionTokenOrThrow(sessionToken);
    const msg = String(message || '').trim();
    if (!msg) throw new Error('MENSAGEM_VAZIA');

    const { data, error } = await supabase.rpc('campaign_add_message', {
      p_session_token: token,
      p_sender: 'OPERATOR',
      p_message: msg,
    });

    if (error) throw new Error(`SEND_MESSAGE_ERROR: ${error.message}`);
    return data;
  },

  async uploadAttachment(file: File, sessionToken?: string) {
    if (!file) throw new Error('ARQUIVO_INVALIDO');

    const fileExt = sanitizeExt(file.name);
    const uid = crypto.randomUUID();
    
    // Se sessionToken for passado, validamos. Se não, folder raiz.
    let folder = 'campaign_attachments';
    if (sessionToken) {
      const token = await getSessionTokenOrThrow(sessionToken);
      folder = `campaign_attachments/${token}`;
    }
    
    const filePath = `${folder}/${uid}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('public_assets')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || 'application/octet-stream',
      });

    if (uploadError) throw new Error(`UPLOAD_ERROR: ${uploadError.message}`);

    const { data } = supabase.storage.from('public_assets').getPublicUrl(filePath);
    return data.publicUrl;
  },
};
