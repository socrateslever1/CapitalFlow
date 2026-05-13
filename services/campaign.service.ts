import { Campaign, CampaignLead } from '../types';
import { supabasePortal } from '../lib/supabasePortal';

const CAMPAIGNS_KEY = 'cf_campaigns';
const LEADS_KEY = 'cf_campaign_leads';

export const campaignService = {
  getCampaigns: (): Campaign[] => {
    try {
      const saved = localStorage.getItem(CAMPAIGNS_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error('Failed to load campaigns', e);
      return [];
    }
  },

  getCampaign: (id: string): Campaign | undefined => {
    const campaigns = campaignService.getCampaigns();
    return campaigns.find(c => c.id === id);
  },

  saveCampaign: (campaign: Campaign) => {
    try {
      // Reload campaigns to avoid overwriting updates from other tabs/processes (like lead capture)
      const campaigns = campaignService.getCampaigns();
      const index = campaigns.findIndex(c => c.id === campaign.id);
      
      if (index >= 0) {
        // Preserve counters if not explicitly updated in the incoming object
        // This is a basic merge strategy. For robust sync, we'd need timestamps or a real backend.
        const existing = campaigns[index];
        campaigns[index] = {
          ...campaign,
          clicks: Math.max(campaign.clicks || 0, existing.clicks || 0),
          leads: Math.max(campaign.leads || 0, existing.leads || 0)
        };
      } else {
        campaigns.unshift(campaign);
      }
      
      localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify(campaigns));
    } catch (e: any) {
      if (e.name === 'QuotaExceededError' || e.code === 22) {
        console.error('LocalStorage quota exceeded. Cannot save campaign.');
        throw new Error('Limite de armazenamento local atingido. Tente remover imagens ou campanhas antigas.');
      }
      console.error('Failed to save campaign', e);
    }
  },

  deleteCampaign: (id: string) => {
    const campaigns = campaignService.getCampaigns();
    const filtered = campaigns.filter(c => c.id !== id);
    localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify(filtered));
  },

  trackClick: (id: string) => {
    const campaigns = campaignService.getCampaigns();
    const campaign = campaigns.find(c => c.id === id);
    if (campaign) {
      campaign.clicks = (campaign.clicks || 0) + 1;
      campaignService.saveCampaign(campaign);
    }
  },

  trackLead: (id: string) => {
    const campaigns = campaignService.getCampaigns();
    const campaign = campaigns.find(c => c.id === id);
    if (campaign) {
      campaign.leads = (campaign.leads || 0) + 1;
      campaignService.saveCampaign(campaign);
    }
  },

  saveLead: (lead: CampaignLead) => {
    try {
      const saved = localStorage.getItem(LEADS_KEY);
      const leads: CampaignLead[] = saved ? JSON.parse(saved) : [];
      leads.unshift(lead);
      localStorage.setItem(LEADS_KEY, JSON.stringify(leads));

      // Update campaign lead count
      const campaigns = campaignService.getCampaigns();
      const campaign = campaigns.find(c => c.id === lead.campaignId);
      if (campaign) {
        campaign.leads = (campaign.leads || 0) + 1;
        localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify(campaigns));
      }
    } catch (e) {
      console.error('Failed to save lead', e);
    }
  },

  getLeads: (campaignId?: string): CampaignLead[] => {
    try {
      const saved = localStorage.getItem(LEADS_KEY);
      const leads: CampaignLead[] = saved ? JSON.parse(saved) : [];
      if (campaignId) {
        return leads.filter(l => l.campaignId === campaignId);
      }
      return leads;
    } catch (e) {
      console.error('Failed to load leads', e);
      return [];
    }
  },

  /**
   * Cria uma sessão de lead no backend (RPC)
   * Retorna o session_token
   */
  createLeadSession: async (
    campaignId: string,
    nome: string,
    whatsapp: string,
    cpf: string,
    valor: number
  ): Promise<string> => {
    const { data, error } = await supabasePortal.rpc('campaign_create_lead_session', {
      p_campaign_id: campaignId,
      p_nome: nome,
      p_whatsapp: whatsapp,
      p_cpf: cpf.replace(/\D/g, ''), // Normaliza CPF
      p_valor: valor,
      p_ip: 'placeholder', // IP será capturado pelo backend se possível, ou placeholder
      p_user_agent: navigator.userAgent
    });

    if (error) throw new Error(error.message || 'Falha ao criar sessão de lead.');
    
    // RPC retorna json { ok: true, session_token: uuid }
    // Supabase RPC pode retornar array ou objeto dependendo da versão/config
    const payload = Array.isArray(data) ? data[0] : data;
    
    if (!payload?.session_token) {
      throw new Error('Token de sessão não retornado.');
    }

    return payload.session_token;
  }
};

export type CampaignChatMessage = {
  id: string;
  session_token: string;
  sender: 'LEAD' | 'BOT' | 'OPERATOR';
  message: string;
  created_at: string;
};

export const campaignChatService = {
  async listMessages(sessionToken: string): Promise<CampaignChatMessage[]> {
    const { data, error } = await supabasePortal.rpc('campaign_list_messages', {
      p_session_token: sessionToken,
    });

    if (error) throw new Error(error.message || 'Falha ao listar mensagens.');
    return (data ?? []) as CampaignChatMessage[];
  },

  async sendLeadMessage(sessionToken: string, message: string) {
    const { data, error } = await supabasePortal.rpc('campaign_add_message', {
      p_session_token: sessionToken,
      p_sender: 'LEAD', // IMPORTANTE: seu CHECK bloqueia CLIENT
      p_message: message,
    });

    if (error) throw new Error(error.message || 'Falha ao enviar mensagem.');
    const out = Array.isArray(data) ? data[0] : data;
    return out ?? { ok: true };
  },
};
