import { createClient } from '@supabase/supabase-js';
import { fetchWithRetry } from '../utils/fetchWithRetry';
import { isDev } from '../utils/isDev';

const isPortalAccessUrl = (() => {
  try {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return params.has('portal');
  } catch {
    return false;
  }
})();

const getSafeEnv = (key: string, fallback: string): string => {
  const env = (import.meta as any).env;
  const val = env?.[key] || '';
  if (!val && isDev) {
    console.warn(`[BOOT_WARNING] ${key} nao encontrada no ambiente. Usando fallback.`);
    return fallback;
  }
  return val || fallback;
};

const REAL_URL = 'https://hzchchbxkhryextaymkn.supabase.co';
const REAL_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6Y2hjaGJ4a2hyeWV4dGF5bWtuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3NTk2ODcsImV4cCI6MjA4MzMzNTY4N30.kX6FlTuPkl7XfycwVuZN2mI6e3ed8NaDUoyAHy9L3nc';

const SUPABASE_URL = getSafeEnv('VITE_SUPABASE_URL', REAL_URL).trim();
const SUPABASE_ANON_KEY = getSafeEnv('VITE_SUPABASE_ANON_KEY', REAL_KEY).trim();

if (isDev) {
  console.log('[BOOT] Supabase Initialized with:', {
    url: SUPABASE_URL.substring(0, 15) + '...',
    isFallback: SUPABASE_URL === REAL_URL && !(import.meta as any).env?.VITE_SUPABASE_URL
  });
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: !isPortalAccessUrl,
    storageKey: 'cm_supabase_auth',
  },
  global: {
    fetch: fetchWithRetry as any
  }
});

type SynchronizedSessionOptions = {
  forceRefresh?: boolean;
  minValidityMs?: number;
};

let sessionPromise: Promise<{ data: { session: any }, error: any }> | null = null;
let refreshPromise: Promise<{ data: { session: any }, error: any }> | null = null;

const isSessionExpiring = (session: any, minValidityMs: number) => {
  const expiresAt = Number(session?.expires_at || 0);
  if (!expiresAt) return false;
  return expiresAt * 1000 <= Date.now() + minValidityMs;
};

export async function getSynchronizedSession(options: SynchronizedSessionOptions = {}) {
  if (sessionPromise && !options.forceRefresh) return sessionPromise;

  sessionPromise = (async () => {
    try {
      const current = await supabase.auth.getSession();
      const session = current.data?.session;
      const minValidityMs = options.minValidityMs ?? 60_000;

      if (!session || current.error) return current;

      if (!options.forceRefresh && !isSessionExpiring(session, minValidityMs)) {
        return current;
      }

      if (!refreshPromise) {
        refreshPromise = supabase.auth.refreshSession()
          .finally(() => {
            setTimeout(() => { refreshPromise = null; }, 1000);
          });
      }

      const refreshed = await refreshPromise;
      if (refreshed.data?.session && !refreshed.error) {
        return refreshed;
      }

      return current;
    } finally {
      setTimeout(() => { sessionPromise = null; }, 1000);
    }
  })();

  return sessionPromise;
}
