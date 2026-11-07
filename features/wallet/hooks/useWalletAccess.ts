import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { walletRepository } from '../services/walletRepository';

export type WalletAccessState =
  | { status: 'loading'; settings: Record<string, unknown> }
  | { status: 'active'; settings: Record<string, unknown>; userId: string }
  | { status: 'inactive'; settings: Record<string, unknown>; userId?: string }
  | { status: 'error'; settings: Record<string, unknown>; message: string; retry: () => void };

export const useWalletAccess = (): WalletAccessState => {
  const [state, setState] = useState<WalletAccessState>({ status: 'loading', settings: {} });
  const checkRef = useRef<() => Promise<void>>(async () => {});
  const retry = useCallback(() => { void checkRef.current(); }, []);
  useEffect(() => {
    let mounted = true;
    let pending: Promise<void> | null = null;
    let authTimer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      if (!mounted) return Promise.resolve();
      if (pending) return pending;
      pending = (async () => {
        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user?.id) throw error || new Error('Sessão não encontrada. Entre novamente.');
        const access = await walletRepository.getAccess(data.user.id);
        if (mounted) {
          setState(access.active
            ? { status: 'active', settings: access.settings, userId: data.user.id }
            : { status: 'inactive', settings: access.settings, userId: data.user.id });
        }
      })().catch(reason => {
        if (!mounted) return;
        const network = reason instanceof TypeError || /failed to fetch|network|networkerror|load failed|fetch failed|connection/i.test(String(reason?.message || reason));
        setState(previous => {
          // Never erase an already authorized wallet on a transient refresh failure.
          if (previous.status === 'active' && network) return previous;
          return {
            status: 'error', settings: {},
            message: network
              ? 'Não foi possível conectar ao servidor. Verifique sua internet e tente novamente.'
              : reason instanceof Error ? reason.message : 'Falha ao verificar o acesso à Carteira.',
            retry,
          };
        });
      }).finally(() => { pending = null; });
      return pending;
    };
    checkRef.current = check;
    void check();
    const onFocus = () => { void check(); };
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onFocus);
    // Auth callbacks must not re-enter the Supabase authentication lock.
    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      if (authTimer) clearTimeout(authTimer);
      authTimer = setTimeout(() => { void check(); }, 0);
    });
    return () => {
      mounted = false;
      if (authTimer) clearTimeout(authTimer);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onFocus);
      authListener.subscription.unsubscribe();
    };
  }, [retry]);
  return state;
};
