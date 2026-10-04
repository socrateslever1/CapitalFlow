import { supabase } from '../lib/supabase';

export type PlatformProfileSummary = {
  id: string;
  user_id: string | null;
  email: string | null;
  name: string | null;
  access_level: number | null;
  created_at: string | null;
  last_active_at: string | null;
};

export const platformAdminService = {
  async isSuperAdmin() {
    const { data, error } = await supabase.rpc('is_platform_super_admin');
    if (error) throw new Error(error.message);
    return data === true;
  },

  async listProfiles(): Promise<PlatformProfileSummary[]> {
    const { data, error } = await supabase.rpc('platform_admin_list_profiles');
    if (error) throw new Error(error.message);
    return (data || []) as PlatformProfileSummary[];
  },

  async setFeature(profileId: string, featureKey: string, enabled: boolean) {
    const { error } = await supabase.rpc('platform_admin_set_feature', {
      p_profile_id: profileId,
      p_feature_key: featureKey,
      p_enabled: enabled,
    });
    if (error) throw new Error(error.message);
  },

  async startReadOnlySupport(profileId: string) {
    const { data, error } = await supabase.rpc('platform_admin_start_support', { p_profile_id: profileId });
    if (error) throw new Error(error.message);
    return String(data || '');
  },

  async endReadOnlySupport(sessionId: string) {
    const { error } = await supabase.rpc('platform_admin_end_support', { p_session_id: sessionId });
    if (error) throw new Error(error.message);
  },
};
