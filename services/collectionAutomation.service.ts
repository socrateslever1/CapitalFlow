import { supabase } from '../lib/supabase';

export type CollectionCadence = 'MANUAL' | 'DAILY' | 'WEEKLY';
export type CollectionTone = 'CORDIAL' | 'OBJECTIVE' | 'MEDIATOR' | 'FIRM_RESPECTFUL';

export interface CollectionPolicy {
  id?: string;
  profile_id: string;
  client_id?: string | null;
  loan_id?: string | null;
  enabled: boolean;
  overdue_cadence: CollectionCadence;
  tone: CollectionTone;
  remind_two_days_before: boolean;
  remind_due_today: boolean;
  remind_first_overdue_day: boolean;
  send_hour: number;
  max_consecutive_messages: number;
  paused: boolean;
  pause_reason?: string | null;
}

export const DEFAULT_COLLECTION_POLICY: Omit<CollectionPolicy, 'profile_id'> = {
  enabled: true,
  overdue_cadence: 'DAILY',
  tone: 'MEDIATOR',
  remind_two_days_before: true,
  remind_due_today: true,
  remind_first_overdue_day: true,
  send_hour: 9,
  max_consecutive_messages: 10,
  paused: false,
  pause_reason: null,
};

export const collectionAutomationService = {
  async isWhatsAppConfigured(profileId: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('rpc_has_whatsapp_automation', { p_profile_id: profileId });
    if (!error) return data === true;

    const { data: config, error: configError } = await supabase.from('whatsapp_configs')
      .select('token, instance_id').eq('profile_id', profileId).maybeSingle();
    if (configError) return false;
    return Boolean(config?.token?.trim() && config?.instance_id?.trim());
  },

  async getDefaultPolicy(profileId: string): Promise<CollectionPolicy> {
    const { data, error } = await supabase.from('n8n_collection_policies')
      .select('*').eq('profile_id', profileId).is('client_id', null).is('loan_id', null).maybeSingle();
    if (error) throw error;
    return { ...DEFAULT_COLLECTION_POLICY, ...(data || {}), profile_id: profileId } as CollectionPolicy;
  },

  async saveDefaultPolicy(policy: CollectionPolicy): Promise<CollectionPolicy> {
    return this.savePolicy({ ...policy, client_id: null, loan_id: null });
  },

  async getClientPolicy(profileId: string, clientId: string): Promise<CollectionPolicy | null> {
    const { data, error } = await supabase.from('n8n_collection_policies')
      .select('*').eq('profile_id', profileId).eq('client_id', clientId).is('loan_id', null).maybeSingle();
    if (error) throw error;
    return data as CollectionPolicy | null;
  },

  async getLoanPolicy(profileId: string, loanId: string): Promise<CollectionPolicy | null> {
    const { data, error } = await supabase.from('n8n_collection_policies')
      .select('*').eq('profile_id', profileId).eq('loan_id', loanId).maybeSingle();
    if (error) throw error;
    return data as CollectionPolicy | null;
  },

  async saveClientPolicy(policy: CollectionPolicy, clientId: string): Promise<CollectionPolicy> {
    return this.savePolicy({ ...policy, client_id: clientId, loan_id: null });
  },

  async saveLoanPolicy(policy: CollectionPolicy, loanId: string): Promise<CollectionPolicy> {
    return this.savePolicy({ ...policy, client_id: null, loan_id: loanId });
  },

  async deletePolicy(profileId: string, id: string): Promise<void> {
    const { error } = await supabase.from('n8n_collection_policies')
      .delete().eq('profile_id', profileId).eq('id', id);
    if (error) throw error;
  },

  async savePolicy(policy: CollectionPolicy): Promise<CollectionPolicy> {
    const payload = {
      enabled: policy.enabled,
      overdue_cadence: policy.overdue_cadence,
      tone: policy.tone,
      remind_two_days_before: policy.remind_two_days_before,
      remind_due_today: policy.remind_due_today,
      remind_first_overdue_day: policy.remind_first_overdue_day,
      send_hour: policy.send_hour,
      max_consecutive_messages: policy.max_consecutive_messages,
      paused: policy.paused,
      pause_reason: policy.pause_reason || null,
      updated_at: new Date().toISOString(),
    };
    if (policy.id) {
      const { data, error } = await supabase.from('n8n_collection_policies').update(payload)
        .eq('id', policy.id).eq('profile_id', policy.profile_id).select('*').single();
      if (error) throw error;
      return data as CollectionPolicy;
    }
    const { data, error } = await supabase.from('n8n_collection_policies')
      .insert({
        profile_id: policy.profile_id,
        client_id: policy.client_id || null,
        loan_id: policy.loan_id || null,
        ...payload,
      }).select('*').single();
    if (error) throw error;
    return data as CollectionPolicy;
  },

  async listRecentDispatches(profileId: string, limit = 20) {
    const { data, error } = await supabase.from('n8n_collection_dispatches')
      .select('id, stage, scheduled_date, amount, days_late, tone, message, status, sent_at, error_message')
      .eq('profile_id', profileId).order('created_at', { ascending: false }).limit(limit);
    if (error) throw error;
    return data || [];
  },
};
