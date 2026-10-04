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

export type PlatformFeatureConfiguration = {
  defaults: Record<string, boolean>;
  overrides: Array<{ profile_id: string; feature_key: string; enabled: boolean }>;
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

  async listFeatureConfiguration(): Promise<PlatformFeatureConfiguration> {
    const [registry, access] = await Promise.all([
      supabase.from('feature_registry').select('key, default_enabled'),
      supabase.from('profile_feature_access').select('profile_id, feature_key, enabled'),
    ]);
    const error = registry.error || access.error;
    if (error) throw new Error(error.message);
    return {
      defaults: Object.fromEntries((registry.data || []).map((feature: any) => [feature.key, feature.default_enabled === true])),
      overrides: (access.data || []) as PlatformFeatureConfiguration['overrides'],
    };
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
