// feature/support/hooks/useSupportRealtime.ts
import { useEffect, useRef, useState } from 'react';
import { supabase as defaultSupabase } from '../../../lib/supabase';
import { isDev } from '../../../utils/isDev';
import { playNotificationSound } from '../../../utils/notificationSound';
import { supportChatService } from '../../../services/supportChat.service';

type Role = 'CLIENT' | 'OPERATOR';
type TicketStatus = 'OPEN' | 'CLOSED';

const ONLINE_TTL_MS = 60_000; // 60s
const HEARTBEAT_MS = 20_000; // 20s
const ONLINE_POLL_MS = 10_000;

function isOtherOnline(lastSeenAt?: string | null) {
  if (!lastSeenAt) return false;
  const last = new Date(lastSeenAt).getTime();
  return Number.isFinite(last) && Date.now() - last < ONLINE_TTL_MS;
}

/**
 * UUID v1-v5
 * Evita uuid:"" / null chegando no Postgres.
 */
const isUuid = (v?: string | null) =>
  !!v &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(v).trim()
  );

/**
 * Dedupe simples por id
 */
const pushUniqueById = (prev: any[], item: any) => {
  const id = item?.id;
  if (!id) return [...prev, item];
  if (prev.some((m) => m?.id === id)) return prev;
  return [...prev, item];
};

export const useSupportRealtime = (
  loanId: string,
  profileId: string,
  role: Role,
  customSupabase?: any
) => {
  const supabase = customSupabase || defaultSupabase;

  const [messages, setMessages] = useState<any[]>([]);
  const [ticketStatus, setTicketStatus] = useState<TicketStatus>('OPEN');
  const [isOnline, setIsOnline] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const channelRef = useRef<any>(null);
  const heartbeatRef = useRef<number | null>(null);
  const onlinePollRef = useRef<number | null>(null);

  // ✅ ids válidos p/ queries/insert (evita uuid:"" e RLS confusa)
  const idsOk = isUuid(loanId) && isUuid(profileId);

  // 1) Carga inicial: mensagens + ticket + presença
  useEffect(() => {
    if (!idsOk) {
      setMessages([]);
      setTicketStatus('OPEN');
      setIsOnline(false);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const loadInitial = async () => {
      setIsLoading(true);

      // Mensagens
      {
        const { data: msgs, error } = await supabase
          .from('mensagens_suporte')
          .select('*')
          .eq('loan_id', loanId)
          .order('created_at', { ascending: true });

        if (!cancelled) {
          if (!error && msgs) setMessages(msgs);
          if (error && isDev) console.error('[SUPPORT] load mensagens error:', error);
        }
      }

      // Ticket (último)
      {
        const { data: ticket, error: tErr } = await supabase
          .from('support_tickets')
          .select('id,status,created_at')
          .eq('loan_id', loanId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!cancelled) {
          if (tErr && isDev) console.error('[SUPPORT] load ticket error:', tErr);

          if (ticket?.status) {
            setTicketStatus(ticket.status as TicketStatus);
          } else {
            // cria ticket inicial OPEN
            const { data: newTicket, error: insErr } = await supabase
              .from('support_tickets')
              .insert({
                loan_id: loanId,
                status: 'OPEN',
                profile_id: profileId,
              })
              .select('status')
              .single();

            if (!cancelled) {
              if (insErr && isDev) console.error('[SUPPORT] create ticket error:', insErr);
              if (!insErr && newTicket?.status) setTicketStatus(newTicket.status as TicketStatus);
            }
          }
        }
      }

      // Presença inicial: pega o último last_seen da role oposta
      {
        const { data: presence, error: pErr } = await supabase
          .from('support_presence')
          .select('last_seen_at,role')
          .eq('loan_id', loanId)
          .neq('role', role)
          .order('last_seen_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!cancelled) {
          if (pErr && isDev) console.error('[SUPPORT] load presence error:', pErr);
          setIsOnline(isOtherOnline((presence as any)?.last_seen_at));
        }
      }

      if (!cancelled) setIsLoading(false);
    };

    loadInitial();

    return () => {
      cancelled = true;
    };
  }, [idsOk, loanId, profileId, role, supabase]);

  // 2) Realtime + heartbeat + polling de online
  useEffect(() => {
    if (!idsOk) return;

    // sempre limpar canal anterior antes de criar outro
    if (channelRef.current) {
      try {
        supabase.removeChannel(channelRef.current);
      } catch {}
      channelRef.current = null;
    }

    const channel = supabase
      .channel(`support-${loanId}`)

      // Mensagens novas
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'mensagens_suporte',
          filter: `loan_id=eq.${loanId}`,
        },
        (payload) => {
          const n: any = payload.new;

          // adiciona sem duplicar
          setMessages((prev) => pushUniqueById(prev, n));

          /**
           * ✅ FIX DEFINITIVO: notifica somente se NÃO foi enviado por mim
           * IMPORTANTÍSSIMO:
           * - sender_user_id no seu banco pode ser auth.uid() (UUID diferente do profileId)
           * - então NÃO USAMOS sender_user_id aqui.
           */
          const senderProfileId = n?.operator_id ?? n?.profile_id ?? null;
          const isMine = senderProfileId && String(senderProfileId) === String(profileId);

          if (!isMine) {
            playNotificationSound();
          } else if (isDev) {
            console.log('[SUPPORT] mensagem minha, sem notificação', {
              senderProfileId,
              profileId,
              msgId: n?.id,
            });
          }
        }
      )

      // Mensagens deletadas
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'mensagens_suporte',
          filter: `loan_id=eq.${loanId}`,
        },
        (payload) => {
          const oldId = (payload.old as any)?.id;
          if (!oldId) return;
          setMessages((prev) => prev.filter((m) => m?.id !== oldId));
        }
      )

      // Tickets
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'support_tickets',
          filter: `loan_id=eq.${loanId}`,
        },
        (payload) => {
          const st = (payload.new as any)?.status;
          if (st) setTicketStatus(st as TicketStatus);
        }
      )

      // Presença
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'support_presence',
          filter: `loan_id=eq.${loanId}`,
        },
        (payload) => {
          const n: any = payload.new;
          if (!n) return;
          if (n.role !== role) {
            setIsOnline(isOtherOnline(n.last_seen_at));
          }
        }
      )
      .subscribe((status: any) => {
        if (isDev) console.log('[SUPPORT] realtime status:', status);
      });

    channelRef.current = channel;

    // Heartbeat
    const sendHeartbeat = async () => {
      if (!idsOk) return;
      const { error } = await supabase.from('support_presence').upsert({
        profile_id: profileId,
        loan_id: loanId,
        role,
        last_seen_at: new Date().toISOString(),
      });
      if (error && isDev) console.error('[SUPPORT] heartbeat upsert error:', error);
    };

    sendHeartbeat();
    heartbeatRef.current = window.setInterval(sendHeartbeat, HEARTBEAT_MS);

    // Poll online (fallback)
    const pollOnline = async () => {
      if (!idsOk) return;
      const { data, error } = await supabase
        .from('support_presence')
        .select('last_seen_at,role')
        .eq('loan_id', loanId)
        .neq('role', role)
        .order('last_seen_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error && isDev) console.error('[SUPPORT] poll presence error:', error);
      if (!error) setIsOnline(isOtherOnline((data as any)?.last_seen_at));
    };

    onlinePollRef.current = window.setInterval(pollOnline, ONLINE_POLL_MS);

    return () => {
      if (channelRef.current) {
        try {
          supabase.removeChannel(channelRef.current);
        } catch {}
      }
      channelRef.current = null;

      if (heartbeatRef.current) window.clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;

      if (onlinePollRef.current) window.clearInterval(onlinePollRef.current);
      onlinePollRef.current = null;
    };
  }, [idsOk, loanId, profileId, role, supabase]);

  // Envio simples (texto/link). Uploads: use supportChat.service.ts
  const sendMessage = async (
    content: string,
    type: string = 'text',
    fileUrl?: string,
    metadata?: any
  ) => {
    if (!idsOk) {
      throw new Error(
        'Não foi possível identificar o contrato para o atendimento. Volte e abra o chat pelo contrato.'
      );
    }

    if (ticketStatus === 'CLOSED' && role === 'CLIENT') {
      throw new Error(
        'Atendimento encerrado. Aguarde reabertura pelo operador ou abra um novo chamado.'
      );
    }

    const payload: any = {
      loan_id: loanId,
      profile_id: profileId,

      // dados de remetente
      sender: role,
      sender_type: role,

      /**
       * ✅ manter sender_user_id preenchido (útil pra auditoria)
       * MAS não use isso pra decidir notificação.
       */
      sender_user_id: profileId,

      // conteúdo
      content: content ?? '',
      text: content ?? '',
      type,
      file_url: fileUrl || null,
      metadata: metadata || null,

      // status inicial
      read: false,
    };

    if (role === 'OPERATOR') payload.operator_id = profileId;

    if (isDev) console.log('[SUPPORT_SEND_PAYLOAD]', payload);

    const { error } = await supabase.from('mensagens_suporte').insert(payload);
    if (error) {
      if (isDev) console.error('[SUPPORT_SEND_ERROR]', error, payload);
      throw new Error(error.message || 'Falha ao enviar mensagem.');
    }
  };

  const sendLocation = async (lat: number, lng: number) => {
    await sendMessage(`https://maps.google.com/?q=${lat},${lng}`, 'location', undefined, { lat, lng });
  };

  const updateTicketStatus = async (newStatus: TicketStatus) => {
    if (!idsOk) {
      throw new Error(
        'Não foi possível identificar o contrato para o atendimento. Volte e abra o chat pelo contrato.'
      );
    }

    if (newStatus === 'CLOSED') {
      const { error } = await supabase
        .from('support_tickets')
        .update({
          status: 'CLOSED',
          closed_at: new Date().toISOString(),
          closed_by: profileId,
          updated_at: new Date().toISOString(),
        })
        .eq('loan_id', loanId)
        .eq('status', 'OPEN');

      if (error) throw new Error(error.message || 'Falha ao encerrar ticket.');
      return;
    }

    // Reabrir: cria novo ticket OPEN (histórico preservado)
    const { error } = await supabase.from('support_tickets').insert({
      loan_id: loanId,
      status: 'OPEN',
      profile_id: profileId,
    });

    if (error) throw new Error(error.message || 'Falha ao reabrir ticket.');
  };

  const deleteMessage = async (msgId: string) => {
    await supportChatService.deleteMessage(msgId, supabase);
  };

  return {
    messages,
    ticketStatus,
    isOnline,
    isLoading,
    sendMessage,
    sendLocation,
    updateTicketStatus,
    deleteMessage,
  };
};