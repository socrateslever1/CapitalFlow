import { useState, useEffect, useCallback } from 'react';
import { campaignOperatorService } from '../services/campaignOperator.service';
import { supabase } from '../lib/supabase';

export const useCampaignChat = () => {
  const [leads, setLeads] = useState<any[]>([]);
  const [selectedSession, setSelectedSession] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);

  const loadLeads = useCallback(async () => {
    setLoadingLeads(true);
    try {
      const data = await campaignOperatorService.getLeads();
      setLeads(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingLeads(false);
    }
  }, []);

  const loadMessages = useCallback(async (sessionToken: string) => {
    setLoadingMessages(true);
    try {
      const data = await campaignOperatorService.getMessages(sessionToken);
      setMessages(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  const sendMessage = async (text: string) => {
    if (!text.trim() || !selectedSession || sending) return;
    setSending(true);
    try {
      await campaignOperatorService.sendMessage(selectedSession.session_token, text);
    } finally {
      setSending(false);
    }
  };

  const sendAttachment = async (file: File) => {
    if (!selectedSession || uploading) return;
    setUploading(true);
    try {
      const url = await campaignOperatorService.uploadAttachment(file, selectedSession.session_token);
      await campaignOperatorService.sendMessage(selectedSession.session_token, `[ANEXO] ${url}`);
    } finally {
      setUploading(false);
    }
  };

  const selectLead = (lead: any) => {
    setSelectedSession(lead);
    loadMessages(lead.session_token);
  };

  useEffect(() => {
    const channel = supabase
      .channel('operator-leads-global')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'campaign_leads' }, (payload) => {
        setLeads(prev => {
          const exists = prev.some(l => l.id === (payload.new as any).id);
          if (exists) return prev;
          return [payload.new, ...prev];
        });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'campaign_leads' }, (payload) => {
        setLeads(prev => prev.map(l => (l.id === (payload.new as any).id ? payload.new : l)));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    if (!selectedSession) return;

    const token = selectedSession.session_token;
    const channel = supabase
      .channel(`session-chat-${token}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'campaign_messages',
          filter: `session_token=eq.${token}`
        },
        (payload) => {
          setMessages(prev => {
            if (prev.find(m => m.id === (payload.new as any).id)) return prev;
            return [...prev, payload.new];
          });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedSession]);

  return {
    leads,
    selectedSession,
    messages,
    loadingLeads,
    loadingMessages,
    sending,
    uploading,
    loadLeads,
    selectLead,
    sendMessage,
    sendAttachment
  };
};
