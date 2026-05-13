import { supabase } from '../lib/supabase';
import { Lead } from '../types';
import { safeUUID } from '../utils/uuid';

export const leadsService = {
  async insertLead(lead: Partial<Lead>) {
    const { data, error } = await supabase
      .from('campaign_leads')
      .insert([lead])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async listLeads(ownerId?: string) {
    const safeOwnerId = ownerId ? safeUUID(ownerId) : null;

    let query = supabase
      .from('campaign_leads')
      .select('*')
      .order('created_at', { ascending: false });

    if (safeOwnerId) {
      // Se tiver owner_id, filtra. Se não, traz tudo (ou depende da RLS)
      query = query.eq('owner_id', safeOwnerId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data as Lead[];
  },

  async updateLeadStatus(id: string, status: Lead['status']) {
    const safeId = safeUUID(id);
    if (!safeId) throw new Error('ID do lead inválido');

    const { data, error } = await supabase
      .from('campaign_leads')
      .update({ status })
      .eq('id', safeId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }
};
