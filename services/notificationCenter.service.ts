import { supabase } from '../lib/supabase';

export type NotificationTone = 'info' | 'warning' | 'error' | 'success';

export type PersistedNotificationInput = {
  profileId: string;
  title: string;
  message: string;
  actionUrl?: string | null;
  itemType?: string | null;
  itemId?: string | null;
  metadata?: any;
};

type NotificationRow = Record<string, any>;
type CacheEntry = { rows: NotificationRow[]; fetchedAt: number };

const NOTIFICATION_CACHE_TTL_MS = 1_500;
const unreadCache = new Map<string, CacheEntry>();
const recentReadCache = new Map<string, CacheEntry>();
const unreadRequests = new Map<string, Promise<NotificationRow[]>>();
const recentReadRequests = new Map<string, Promise<NotificationRow[]>>();

const isFresh = (entry?: CacheEntry) =>
  !!entry && Date.now() - entry.fetchedAt < NOTIFICATION_CACHE_TTL_MS;

const invalidateProfileCache = (profileId?: string | null) => {
  if (!profileId) return;
  unreadCache.delete(profileId);
  recentReadCache.delete(profileId);
};

export const notificationCenterService = {
  async listUnread(profileId: string) {
    if (!profileId || profileId === 'DEMO') return [];

    const cached = unreadCache.get(profileId);
    if (isFresh(cached)) return cached!.rows;

    const pending = unreadRequests.get(profileId);
    if (pending) return pending;

    const request = (async () => {
      const { data, error } = await supabase
        .from('notificacoes')
        .select('id,titulo,mensagem,action_url,item_type,item_id,metadata,created_at,read_at')
        .eq('profile_id', profileId)
        .is('read_at', null)
        .order('created_at', { ascending: false })
        .limit(40);

      if (error) {
        console.warn('[NotificationCenter] Falha ao listar notificacoes:', error.message);
        return cached?.rows || [];
      }

      const rows = (data || []) as NotificationRow[];
      unreadCache.set(profileId, { rows, fetchedAt: Date.now() });
      return rows;
    })().finally(() => {
      unreadRequests.delete(profileId);
    });

    unreadRequests.set(profileId, request);
    return request;
  },

  async listRecentlyRead(profileId: string, sinceIso: string) {
    if (!profileId || profileId === 'DEMO') return [];

    const cached = recentReadCache.get(profileId);
    if (isFresh(cached)) return cached!.rows;

    const pending = recentReadRequests.get(profileId);
    if (pending) return pending;

    const request = (async () => {
      const { data, error } = await supabase
        .from('notificacoes')
        .select('id,item_type,item_id,read_at')
        .eq('profile_id', profileId)
        .not('read_at', 'is', null)
        .gte('read_at', sinceIso)
        .order('read_at', { ascending: false })
        .limit(100);

      if (error) {
        console.warn('[NotificationCenter] Falha ao listar notificacoes lidas recentes:', error.message);
        return cached?.rows || [];
      }

      const rows = (data || []) as NotificationRow[];
      recentReadCache.set(profileId, { rows, fetchedAt: Date.now() });
      return rows;
    })().finally(() => {
      recentReadRequests.delete(profileId);
    });

    recentReadRequests.set(profileId, request);
    return request;
  },

  async create(input: PersistedNotificationInput) {
    if (!input.profileId || input.profileId === 'DEMO') return null;

    const { data, error } = await supabase
      .from('notificacoes')
      .insert({
        profile_id: input.profileId,
        titulo: input.title,
        mensagem: input.message,
        action_url: input.actionUrl || null,
        item_type: input.itemType || null,
        item_id: input.itemId || null,
        metadata: input.metadata || null,
      })
      .select('id')
      .maybeSingle();

    if (error) {
      console.warn('[NotificationCenter] Falha ao persistir notificacao:', error.message);
      return null;
    }

    invalidateProfileCache(input.profileId);
    return data?.id || null;
  },

  async markAsRead(notificationId: string) {
    if (!notificationId) return;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(notificationId)) {
      return;
    }

    const { data, error } = await supabase
      .from('notificacoes')
      .update({ read_at: new Date().toISOString() })
      .eq('id', notificationId)
      .select('profile_id')
      .maybeSingle();

    if (error) {
      console.warn('[NotificationCenter] Falha ao marcar notificacao como lida:', error.message);
      return;
    }

    invalidateProfileCache(data?.profile_id);
  },

  async markItemAsRead(profileId: string, itemType: string, itemId: string) {
    if (!profileId || !itemType || !itemId) return;
    const { error } = await supabase
      .from('notificacoes')
      .update({ read_at: new Date().toISOString() })
      .eq('profile_id', profileId)
      .eq('item_type', itemType)
      .eq('item_id', itemId)
      .is('read_at', null);

    if (error) {
      console.warn('[NotificationCenter] Falha ao marcar item como lido:', error.message);
      return;
    }

    invalidateProfileCache(profileId);
  },

  async markAllAsRead(profileId: string) {
    if (!profileId || profileId === 'DEMO') return;
    const { error } = await supabase
      .from('notificacoes')
      .update({ read_at: new Date().toISOString() })
      .eq('profile_id', profileId)
      .is('read_at', null);

    if (error) {
      console.warn('[NotificationCenter] Falha ao marcar todas as notificacoes como lidas:', error.message);
      return;
    }

    invalidateProfileCache(profileId);
  },
};
