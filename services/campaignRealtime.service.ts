import { supabase } from '../lib/supabase';

type CampaignNotificationCallback = (payload: any) => void;

export const campaignRealtimeService = {
  startCampaignNotifications({
    ownerId,
    onNewLead,
    onNewMessage
  }: {
    ownerId?: string;
    onNewLead?: CampaignNotificationCallback;
    onNewMessage?: CampaignNotificationCallback;
  }) {
    const seenLeadIds = new Set<string>();
    const seenMessageIds = new Set<string>();

    const emitLead = (lead: any) => {
      if (!lead?.id) return;
      if (ownerId && String(lead.owner_id || '') !== String(ownerId)) return;
      if (seenLeadIds.has(lead.id)) return;
      seenLeadIds.add(lead.id);
      onNewLead?.(lead);
    };

    const emitMessage = async (msg: any) => {
      if (!msg?.id) return;
      if (seenMessageIds.has(msg.id)) return;
      if (ownerId) {
        const { data: lead } = await supabase
          .from('campaign_leads')
          .select('owner_id')
          .eq('session_token', msg.session_token)
          .maybeSingle();
        if (String((lead as any)?.owner_id || '') !== String(ownerId)) return;
      }
      seenMessageIds.add(msg.id);
      onNewMessage?.(msg);
    };

    const channel = supabase
      .channel('campaign-global-notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'campaign_leads' }, (payload) => {
        emitLead(payload.new);
      })
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'campaign_messages', filter: 'sender=eq.LEAD' },
        (payload) => {
          void emitMessage(payload.new);
        }
      )
      .subscribe();

    // watermark baseada em último created_at processado
    let lastCheck = new Date(Date.now() - 10_000).toISOString();

    const interval = setInterval(async () => {
      if (document.hidden) return;

      let maxCreatedAt = lastCheck;

      const { data: msgs } = await supabase
        .from('campaign_messages')
        .select('id, session_token, message, created_at, sender')
        .eq('sender', 'LEAD')
        .gt('created_at', lastCheck)
        .order('created_at', { ascending: true });

      if (msgs?.length) {
        for (const msg of msgs) {
          await emitMessage(msg);
          if (msg.created_at > maxCreatedAt) maxCreatedAt = msg.created_at;
        }
      }

      let leadsQuery = supabase
        .from('campaign_leads')
        .select('id, nome, owner_id, created_at')
        .gt('created_at', lastCheck)
        .order('created_at', { ascending: true });
      if (ownerId) {
        leadsQuery = leadsQuery.eq('owner_id', ownerId);
      }
      const { data: leads } = await leadsQuery;

      if (leads?.length) {
        for (const lead of leads) {
          emitLead(lead);
          if (lead.created_at > maxCreatedAt) maxCreatedAt = lead.created_at;
        }
      }

      // avança somente até o maior timestamp realmente processado
      lastCheck = maxCreatedAt;
    }, 5000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }
};
