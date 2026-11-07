import { useEffect, useMemo, useState } from 'react';
import type { UserProfile } from '../../../types';
import { supabase } from '../../../lib/supabase';

export type WalletOwnerDefaults = Readonly<{ name: string; document: string }>;

export function resolveWalletOwnerDefaults(
  activeUser?: UserProfile | null,
  fallbackName = '',
): WalletOwnerDefaults {
  const name = (activeUser?.fullName || activeUser?.name || fallbackName).trim();
  const document = String(activeUser?.document || '').trim();
  const digits = document.replace(/\D/g, '');
  return { name, document: digits.length === 11 || digits.length === 14 ? document : '' };
}

/**
 * Reuse the authenticated CapitalFlow owner's identity in wallet forms.
 * The profiles table is only queried if the app hasn't already provided a
 * name. Do not use client profile metadata as an authorization mechanism.
 */
export function useWalletOwnerDefaults(activeUser?: UserProfile | null, enabled = true): WalletOwnerDefaults {
  const [fallbackName, setFallbackName] = useState('');
  const appName = (activeUser?.fullName || activeUser?.name || '').trim();
  const document = String(activeUser?.document || '').trim();
  useEffect(() => {
    if (!enabled || appName) return;
    let live = true;
    void (async () => {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user?.id || !live) return;
      const { data, error } = await supabase.from('profiles').select('full_name')
        .eq('id', auth.user.id).maybeSingle();
      if (!error && live) setFallbackName(String(data?.full_name || '').trim());
    })().catch(() => { /* Profile hint is optional; forms remain usable. */ });
    return () => { live = false; };
  }, [enabled, appName]);
  return useMemo(
    () => resolveWalletOwnerDefaults(activeUser, fallbackName),
    [activeUser?.fullName, activeUser?.name, activeUser?.document, fallbackName],
  );
}
