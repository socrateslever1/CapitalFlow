import { createClient } from '@supabase/supabase-js';
import { fetchWithRetry } from '../utils/fetchWithRetry';

/**
 * Cliente Supabase “portal/público”.
 *
 * Mantém o MESMO projeto do Supabase principal.
 * Se você quiser separar projetos no futuro, crie variáveis próprias.
 */

type EnvLike = Record<string, any>;

function readEnv(): EnvLike {
  try {
    const meta = import.meta as any;
    if (meta?.env) return meta.env as EnvLike;
  } catch {
    // ignore
  }
  try {
    // @ts-ignore
    if (typeof process !== 'undefined' && (process as any)?.env) return (process as any).env as EnvLike;
  } catch {
    // ignore
  }
  return {};
}

function requireEnv(key: string): string {
  const env = readEnv();
  const val = String(env?.[key] ?? '').trim();
  if (!val || val === 'undefined' || val === 'null') {
    if (key === 'VITE_SUPABASE_URL') return 'https://hzchchbxkhryextaymkn.supabase.co';
    if (key === 'VITE_SUPABASE_ANON_KEY') return 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6Y2hjaGJ4a2hyeWV4dGF5bWtuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3NTk2ODcsImV4cCI6MjA4MzMzNTY4N30.kX6FlTuPkl7XfycwVuZN2mI6e3ed8NaDUoyAHy9L3nc';

    console.warn(`[ENV] Variável obrigatória ausente: ${key}. Usando valor de fallback.`);
    return 'placeholder-key';
  }
  return val;
}

const SUPABASE_URL = requireEnv('VITE_SUPABASE_URL');
const SUPABASE_ANON_KEY = requireEnv('VITE_SUPABASE_ANON_KEY');

// @ts-ignore
if (typeof window !== 'undefined' && (window as any).localStorage?.getItem('debug_supabase')) {
  console.log('[SUPABASE_PORTAL] URL:', SUPABASE_URL);
}

export const supabasePortal = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  global: {
    fetch: fetchWithRetry as any
  }
});
