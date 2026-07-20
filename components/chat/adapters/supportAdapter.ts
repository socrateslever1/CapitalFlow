import { SupabaseClient } from '@supabase/supabase-js';
import {
  ChatAdapter,
  ChatMessage,
  ChatRole,
  ChatHeaderInfo,
  ChatFeatures
} from '../chatAdapter';
import { supabase as defaultSupabase } from '../../../lib/supabase';
import { supportChatService } from '../../../services/supportChat.service';
import { formatFirstAndSecondName } from '../../../utils/formatters';

export interface SupportContext {
  loanId: string;
  profileId: string; // Tenant (Professional) ID
  myId: string;      // Current User (Author) ID
  clientName: string;
  operatorId?: string;
  portalToken?: string;
  portalCode?: string;
}

const isUuid = (v?: string | null) =>
  !!v &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(v).trim()
  );

export const createSupportAdapter = (
  role: ChatRole,
  supabaseClient: SupabaseClient = defaultSupabase
): ChatAdapter<SupportContext> => ({

  getFeatures(): ChatFeatures {
    return {
      hasTicket: true,
      hasPresence: true,
      canClose: role === 'OPERATOR',
      canDelete: role === 'OPERATOR',
      canUpload: role === 'OPERATOR'
    };
  },

  async getHeader(context: SupportContext): Promise<ChatHeaderInfo> {
    const { loanId, clientName } = context;
    const displayTitle = formatFirstAndSecondName(clientName);

    if (!isUuid(loanId))
      return { title: displayTitle, subtitle: 'Atendimento Direto', status: 'OPEN' };

    try {
      if (role === 'CLIENT' && context.portalToken && context.portalCode) {
        const { data, error } = await supabaseClient.rpc('portal_support_header', {
          p_token: context.portalToken,
          p_shortcode: context.portalCode,
          p_loan_id: loanId,
        });
        if (error) throw error;
        return {
          title: displayTitle,
          subtitle: `Contrato: ${loanId.slice(0, 8)}`,
          status: (data?.status as any) || 'OPEN',
          isOnline: data?.is_online === true,
        };
      }

      const { data: ticket } = await supabaseClient
        .from('support_tickets')
        .select('status')
        .eq('loan_id', loanId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const { data: presence } = await supabaseClient
        .from('support_presence')
        .select('last_seen_at')
        .eq('loan_id', loanId)
        .neq('role', role)
        .order('last_seen_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const isOnline = presence?.last_seen_at
        ? Date.now() - new Date(presence.last_seen_at).getTime() < 60000
        : false;

      return {
        title: displayTitle,
        subtitle: `Contrato: ${loanId.slice(0, 8)}`,
        status: (ticket?.status as any) || 'OPEN',
        isOnline
      };

    } catch (err: any) {
      console.warn('[supportAdapter] header error:', err?.message);
      return {
        title: displayTitle,
        subtitle: `Contrato: ${loanId.slice(0, 8)}`,
        status: 'OPEN',
        isOnline: false
      };
    }
  },

  async listMessages(context: SupportContext): Promise<ChatMessage[]> {
    const { loanId, profileId } = context;
    if (!isUuid(profileId)) return [];
    
    // Suporte para chat sem loanId (ex: suporte geral)
    const targetId = isUuid(loanId) ? loanId : profileId;
    const msgs = role === 'CLIENT'
      ? await (async () => {
          if (!context.portalToken || !context.portalCode || !isUuid(loanId)) return [];
          const { data, error } = await supabaseClient.rpc('portal_support_list_messages', {
            p_token: context.portalToken,
            p_shortcode: context.portalCode,
            p_loan_id: loanId,
          });
          if (error) throw error;
          return data || [];
        })()
      : await supportChatService.getMessages(targetId, supabaseClient);

    return msgs.map((m: any) => ({
      ...m,
      content: m.content || m.text
    })) as any;
  },

  subscribeMessages(context: SupportContext, handlers) {
    const { loanId, profileId, myId } = context;
    if (!isUuid(profileId)) return () => {};
    
    const targetId = isUuid(loanId) ? loanId : profileId;

    if (role === 'CLIENT') {
      if (!context.portalToken || !context.portalCode || !isUuid(loanId)) return () => {};

      let initialized = false;
      let disposed = false;
      const knownIds = new Set<string>();
      const poll = async () => {
        try {
          const { data, error } = await supabaseClient.rpc('portal_support_list_messages', {
            p_token: context.portalToken,
            p_shortcode: context.portalCode,
            p_loan_id: loanId,
          });
          if (error || disposed) return;
          for (const message of data || []) {
            const id = String(message.id || '');
            if (!id || knownIds.has(id)) continue;
            knownIds.add(id);
            if (initialized) {
              handlers.onNewMessage?.({
                ...message,
                content: message.content || message.text,
              } as any);
            }
          }
          initialized = true;
        } catch (error) {
          console.warn('[supportAdapter] portal polling error:', error);
        }
      };

      void poll();
      const interval = window.setInterval(poll, 5000);
      return () => {
        disposed = true;
        clearInterval(interval);
      };
    }

    const channel = supabaseClient
      .channel(`support-${targetId}`)

      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'mensagens_suporte',
          filter: `loan_id=eq.${targetId}`
        },
        (payload) => {
          const newMsg = payload.new as any;
          
          const processAndEmit = async () => {
            // ✅ Se tem anexo e não é URL, gera assinatura realtime
            if (newMsg.file_url && !/^https?:\/\//i.test(newMsg.file_url)) {
              try {
                const { data } = await supabaseClient.storage
                  .from('support_chat')
                  .createSignedUrl(newMsg.file_url, 3600);
                if (data?.signedUrl) {
                  newMsg.file_url = data.signedUrl;
                }
              } catch (e) {
                console.warn('[supportAdapter] realtime sign error:', e);
              }
            }

            handlers.onNewMessage?.({
              ...newMsg,
              content: newMsg.content || newMsg.text
            } as any);
          };

          processAndEmit();
        }
      )

      .subscribe();

    // 🔵 heartbeat presença
    const interval = window.setInterval(async () => {
      try {
        if (!isUuid(profileId) || !isUuid(loanId)) return;

        // Tenta pegar o ID do operador se estiver no modo OPERATOR
        const currentPresenceId = role === 'OPERATOR' 
            ? (context.operatorId || profileId) 
            : profileId;

        if (!isUuid(currentPresenceId)) return;

        const { error } = await supabaseClient
          .from('support_presence')
          .upsert({
            profile_id: currentPresenceId,
            loan_id: loanId,
            role,
            last_seen_at: new Date().toISOString(),
          });

        if (error) {
          console.warn('[presence] upsert error:', error.message);
        }

      } catch (e: any) {
        console.warn('[presence] heartbeat crash:', e?.message);
      }
    }, 20000);

    return () => {
      supabaseClient.removeChannel(channel);
      clearInterval(interval);
    };
  },

  async sendMessage(context: SupportContext, payload): Promise<void> {
    const { loanId, profileId, myId } = context;

    if (!isUuid(profileId))
      throw new Error(`ID Profissional Inválido (${profileId || 'Nulo'})`);

    if (!isUuid(myId))
      throw new Error(`Seu ID de Autor não foi reconhecido (${myId || 'Nulo'})`);
      
    const effectiveLoanId = isUuid(loanId) ? loanId : profileId;

    const operatorId =
      role === 'OPERATOR'
        ? (context.operatorId && isUuid(context.operatorId)
            ? context.operatorId
            : myId)
        : undefined;

    const text = String(payload?.content || '').trim();
    if (!text && !payload?.file)
      throw new Error('Mensagem vazia');

    if (role === 'CLIENT') {
      if (!context.portalToken || !context.portalCode || !isUuid(loanId)) {
        throw new Error('Sessao do portal invalida. Atualize a pagina.');
      }
      if (payload?.file) {
        throw new Error('Envio de anexos pelo portal esta temporariamente indisponivel.');
      }
      const { error } = await supabaseClient.rpc('portal_support_send_message', {
        p_token: context.portalToken,
        p_shortcode: context.portalCode,
        p_loan_id: loanId,
        p_content: text,
        p_type: payload.type === 'location' ? 'text' : payload.type,
        p_file_path: null,
        p_metadata: payload.metadata || {},
      });
      if (error) throw new Error(error.message);
      return;
    }

    await supportChatService.sendMessage({
      profileId,
      loanId: effectiveLoanId,
      sender: role as any,
      clientId: myId, // Usa o ID pessoal do autor (seja operador ou cliente)
      operatorId,
      text,
      type: payload.type as any,
      file: payload.file,
      metadata: payload.metadata,
      supabaseClient
    });
  },

  async deleteMessage(_context, messageId): Promise<void> {
    await supportChatService.deleteMessage(messageId, supabaseClient);
  },

  async markAsRead(context: SupportContext): Promise<void> {
    if (role === 'CLIENT') {
      if (!context.portalToken || !context.portalCode || !isUuid(context.loanId)) return;
      const { error } = await supabaseClient.rpc('portal_support_mark_read', {
        p_token: context.portalToken,
        p_shortcode: context.portalCode,
        p_loan_id: context.loanId,
      });
      if (error) throw new Error(error.message);
      return;
    }
    await supportChatService.markAsRead(context.loanId, role as any, supabaseClient);
  },

  async closeTicket(context): Promise<void> {
    const { loanId, profileId } = context;

    await supabaseClient
      .from('support_tickets')
      .update({
        status: 'CLOSED',
        closed_at: new Date().toISOString(),
        closed_by: profileId,
        updated_at: new Date().toISOString(),
      })
      .eq('loan_id', loanId)
      .eq('status', 'OPEN');
  },

  async reopenTicket(context): Promise<void> {
    const { loanId, profileId } = context;

    await supabaseClient
      .from('support_tickets')
      .insert({
        loan_id: loanId,
        status: 'OPEN',
        profile_id: profileId,
      });
  }

});
