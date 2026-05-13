// services/supportChat.service.ts
import { supabase } from '../lib/supabase';
import { isDev } from '../utils/isDev';
import { isUUID, safeUUID } from '../utils/uuid';

export type SupportMessageType = 'text' | 'image' | 'audio' | 'file' | 'location';

export interface SupportMessage {
  id: string;
  profile_id: string;
  loan_id: string;
  sender: 'CLIENT' | 'OPERATOR'; // legado
  sender_type: 'CLIENT' | 'OPERATOR';
  sender_user_id: string | null;
  text: string | null;     // legado
  content: string | null;  // novo
  type: SupportMessageType;
  file_url: string | null; // path do storage (ex: loans/<loanId>/...)
  metadata: any;
  read: boolean;
  created_at: string;
  operator_id?: string | null;
  read_at?: string | null;
  read_by?: string | null;
}

type SendMessageParams = {
  profileId: string;
  loanId: string;
  sender: 'CLIENT' | 'OPERATOR';
  clientId?: string; // ID real do autor (se for cliente)
  operatorId?: string;
  text?: string;
  type?: SupportMessageType;
  file?: File;
  metadata?: any;
  supabaseClient?: any;
};

const BUCKET = 'support_chat';
const SIGNED_URL_TTL = 60 * 60; // 1h

function extFromMime(mime: string | null | undefined) {
  if (!mime) return 'bin';
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
  if (mime.includes('mp4')) return 'mp4';
  if (mime.includes('png')) return 'png';
  if (mime.includes('jpeg')) return 'jpg';
  if (mime.includes('pdf')) return 'pdf';
  return 'bin';
}

function isHttpUrl(v?: string | null) {
  if (!v) return false;
  return /^https?:\/\//i.test(v);
}

async function getAuthUid(supabaseClient: any = supabase): Promise<string | null> {
  const { data, error } = await supabaseClient.auth.getUser();
  if (error) return null;
  return data?.user?.id || null;
}

// (mantido) helpers caso você use depois
async function uploadToStorage(params: { loanId: string; file: File }) {
  const { loanId, file } = params;
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const safeName = (file.name || 'upload').replace(/[^\w.\-]+/g, '_');
  const ext = safeName.includes('.') ? safeName.split('.').pop() : extFromMime(file.type);
  const fileName = `${crypto.randomUUID()}.${ext}`;
  const path = `loans/${loanId}/${yyyy}-${mm}-${dd}/${fileName}`;
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || 'application/octet-stream',
  });
  if (upErr) {
    console.error('[Storage Error]', upErr);
    if (upErr.message.includes('row-level security policy')) {
      throw new Error(`Este canal não permite envio de arquivos no momento. Utilize o suporte via WhatsApp.`);
    }
    throw new Error(`Storage upload falhou: ${upErr.message}`);
  }
  return { path };
}

async function signPath(path: string) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL);
  if (error) throw new Error(`SignedUrl falhou: ${error.message}`);
  return data.signedUrl;
}

export const supportChatService = {
  async getMessages(loanId: string, supabaseClient: any = supabase) {
    try {
      const safeLoanId = safeUUID(loanId);
      if (!safeLoanId) return [];

      const { data, error } = await supabaseClient
        .from('mensagens_suporte')
        .select('*')
        .eq('loan_id', safeLoanId)
        .order('created_at', { ascending: true });

      if (error) throw new Error(error.message);

      const msgs = (data || []) as SupportMessage[];

      // Gera signed URLs para anexos (quando file_url é PATH e não http)
      const out: SupportMessage[] = [];
      for (const m of msgs) {
        // ✅ any message with file_url that is a path needs signing
        const hasFile = !!m.file_url;

        if (hasFile && m.file_url && !isHttpUrl(m.file_url)) {
          try {
            const { data: signedData, error: signedError } = await supabaseClient.storage
              .from(BUCKET)
              .createSignedUrl(m.file_url, SIGNED_URL_TTL);

            if (signedError) throw new Error(`SignedUrl falhou para ${m.file_url}: ${signedError.message}`);

            out.push({
              ...m,
              file_url: signedData.signedUrl, // troca por signed URL
              metadata: {
                ...(m.metadata || {}),
                storage_path: m.file_url,
                signed_expires_in: SIGNED_URL_TTL,
              },
            });
          } catch (e: any) {
            console.error('[supportChatService] Erro ao assinar URL:', e?.message || e);
            out.push(m);
          }
        } else {
          out.push(m);
        }
      }

      return out;
    } catch (err: any) {
      if (
        err.message === 'TypeError: Failed to fetch' ||
        err.name === 'TypeError' ||
        err.message?.includes('Failed to fetch')
      ) {
        console.warn('[supportChatService] Failed to fetch messages (Network Error):', err);
        return [];
      }
      throw err;
    }
  },

  async sendMessage(params: SendMessageParams) {
    const {
      profileId,
      loanId,
      sender,
      clientId,
      operatorId,
      text,
      type = 'text',
      file,
      metadata,
      supabaseClient = supabase,
    } = params;

    // ✅ Permite loanId nulo ou virtual para suporte direto
    if (!profileId) throw new Error('CLIENT sem profileId (client_id). Corrija o context do chat.');

    // ✅ Validação de Identidade: Garante que temos um autor para a mensagem
    // Se for OPERATOR, o clientId (passado pelo adapter como myId) deve ser o perfis.id
    // Se for CLIENT, o clientId deve ser o ID do cliente/devedor
    const uid = clientId || profileId; 

    let filePath: string | null = null;
    let finalMeta: any = metadata || {};

    if (file) {
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');

      const safeName = (file.name || 'upload').replace(/[^\w.\-]+/g, '_');
      const ext = safeName.includes('.') ? safeName.split('.').pop() : extFromMime(file.type);

      const fileName = `${crypto.randomUUID()}.${ext}`;
      const path = `loans/${loanId}/${yyyy}-${mm}-${dd}/${fileName}`;

      const { error: upErr } = await supabaseClient.storage.from(BUCKET).upload(path, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || 'application/octet-stream',
      });

      if (upErr) {
        console.error('[Storage Error]', upErr);
        if (upErr.message.includes('row-level security policy')) {
          throw new Error(`Este canal não permite envio de arquivos no momento. Utilize o suporte via WhatsApp.`);
        }
        throw new Error(`Storage upload falhou: ${upErr.message}`);
      }

      filePath = path;

      finalMeta = {
        ...(finalMeta || {}),
        storage_bucket: BUCKET,
        storage_path: path,
        mime: file.type || null,
        size: file.size || null,
        original_name: file.name || null,
      };
    }

    const payload: any = {
      profile_id: profileId, // ✅ nunca null
      loan_id: loanId,       // ✅ nunca null

      // legado + novo
      sender,
      sender_type: sender,
      sender_user_id: uid || null,

      text: text ?? (type === 'location' ? text : null),
      content: text ?? (type === 'location' ? text : null),

      // ✅ Mapeia 'location' para 'text' no banco se necessário para evitar type_check fail
      // Mantendo o tipo original no metadata para renderização se o banco aceitar
      type: type === 'location' ? 'text' : type,
      file_url: filePath, // salva PATH (privado)
      metadata: {
        ...(finalMeta || {}),
        original_type: type
      },

      operator_id: operatorId || null,
      read: false,
      created_at: new Date().toISOString(),
    };

    const { error } = await supabaseClient.from('mensagens_suporte').insert(payload);
    if (error) throw new Error(error.message);

    return true;
  },

  async markAsRead(
    loanId: string,
    viewer: 'CLIENT' | 'OPERATOR',
    supabaseClient: any = supabase
  ) {
    const safeLoanId = safeUUID(loanId);
    if (!safeLoanId) return true;

    let uid: string | null = null;
    if (viewer === 'OPERATOR') {
      uid = await getAuthUid(supabaseClient);
    }

    const { error } = await supabaseClient
      .from('mensagens_suporte')
      .update({
        read: true,
        read_at: new Date().toISOString(),
        read_by: uid,
      })
      .eq('loan_id', safeLoanId)
      .neq('sender_type', viewer)
      .eq('read', false);

    if (error) throw new Error(error.message);
    return true;
  },

  async deleteMessage(messageId: string, supabaseClient: any = supabase) {
    const safeMessageId = safeUUID(messageId);
    if (!safeMessageId) return;
    const { error } = await supabaseClient.from('mensagens_suporte').delete().eq('id', safeMessageId);
    if (error) throw error;
  },

  async deleteChatHistory(loanId: string, supabaseClient: any = supabase) {
    const safeLoanId = safeUUID(loanId);
    if (!safeLoanId) return;
    const { error } = await supabaseClient.from('mensagens_suporte').delete().eq('loan_id', safeLoanId);
    if (error) throw error;

    await supabaseClient.from('support_tickets').delete().eq('loan_id', safeLoanId);
  },

  async deleteCampaignChatHistory(sessionToken: string, supabaseClient: any = supabase) {
    const safeSessionToken = safeUUID(sessionToken);
    if (!safeSessionToken) return;
    const { error } = await supabaseClient.from('campaign_messages').delete().eq('session_token', safeSessionToken);
    if (error) throw error;
  },

  async deleteMultipleChats(loanIds: string[]) {
    if (loanIds.length === 0) return;
    const safeIds = loanIds.map(id => safeUUID(id)).filter(Boolean) as string[];
    if (safeIds.length === 0) return;

    const { error } = await supabase.from('mensagens_suporte').delete().in('loan_id', safeIds);
    if (error) throw error;

    await supabase.from('support_tickets').delete().in('loan_id', safeIds);
  },

  async getActiveChats(operatorId: string) {
    if (isDev) {
      console.log('[BUILD-MARK] supportChatService.getActiveChats v6 (Optimized)');
    }

    try {
      const { data: messages, error } = await supabase
        .from('mensagens_suporte')
        .select('id, loan_id, profile_id, content, text, created_at, read, sender_type')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      if (!messages || messages.length === 0) return [];

      const loanIds = Array.from(new Set(messages.map((m: any) => m.loan_id).filter(isUUID)));
      if (loanIds.length === 0) return [];

      const contractsMap = new Map<string, { name: string; clientId: string; profileId: string }>();

      const { data: loans, error: loansError } = await supabase
        .from('contratos')
        .select('id, debtor_name, client_id, profile_id')
        .in('id', loanIds);

      if (!loansError && loans) {
        loans.forEach((l: any) =>
          contractsMap.set(l.id, { 
            name: l.debtor_name || 'Cliente', 
            clientId: l.client_id,
            profileId: l.profile_id 
          })
        );
      }

      const chatsMap = new Map<string, any>();

      for (const m of messages) {
        const anyMsg = m as any;
        const loanId = anyMsg.loan_id;
        const msgProfileId = anyMsg.profile_id;

        let contractInfo = contractsMap.get(loanId);
        
        // Se não achou contrato, pode ser Suporte Direto (loanId == profileId do cliente ou algo do tipo)
        if (!contractInfo) {
          // Fallback seguro: usa o profile_id da própria mensagem, que sabemos ser válido (FK check passou no insert)
          contractInfo = { 
            name: 'Suporte Direto', 
            clientId: msgProfileId, 
            profileId: msgProfileId 
          };
        }

        if (!chatsMap.has(loanId)) {
          chatsMap.set(loanId, {
            loanId,
            clientId: contractInfo.clientId,
            profileId: contractInfo.profileId, // ID do profissional/tenant
            clientName: contractInfo.name,
            timestamp: anyMsg.created_at,
            lastMessage: anyMsg.content || anyMsg.text || 'Mídia enviada',
            unreadCount: 0,
            type: 'ACTIVE',
          });
        }

        if (anyMsg.sender_type === 'CLIENT' && !anyMsg.read) {
          chatsMap.get(loanId).unreadCount += 1;
        }
      }

      return Array.from(chatsMap.values());
    } catch (err: any) {
      console.warn('[supportChatService] getActiveChats error:', err);
      return [];
    }
  },

  async getAvailableContracts(ownerId: string) {
    const safeOwnerId = safeUUID(ownerId);
    if (!safeOwnerId) return [];

    const { data, error } = await supabase
      .from('contratos')
      .select('id, debtor_name, debtor_document, debtor_phone, client_id')
      .eq('owner_id', safeOwnerId)
      .neq('is_archived', true)
      .order('debtor_name', { ascending: true })
      .limit(300);

    if (error) return [];

    return (data || []).map((c: any) => ({
      loanId: c.id,
      clientId: c.client_id,
      profileId: c.profile_id,
      clientName: c.debtor_name || 'Sem Nome',
      debtorDocument: c.debtor_document,
      type: 'CLIENT',
      unreadCount: 0,
      lastMessage: 'Iniciar conversa',
    }));
  },

  async getTeamMembers(ownerId: string) {
    const safeOwnerId = safeUUID(ownerId);
    if (!safeOwnerId) return [];

    const { data, error } = await supabase
      .from('perfis')
      .select('id, nome_operador, nome_completo, email, access_level')
      .or(`id.eq.${safeOwnerId},supervisor_id.eq.${safeOwnerId}`)
      .order('nome_operador', { ascending: true });

    if (error) return [];

    return (data || []).map((u: any) => ({
      profileId: u.id,
      clientName: u.nome_operador || u.nome_completo || 'Membro',
      role: u.access_level === 1 ? 'Admin' : 'Operador',
      type: 'TEAM',
      unreadCount: 0,
      lastMessage: 'Chat de equipe',
    }));
  },
};