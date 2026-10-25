import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { walletRepository } from '../services/walletRepository';

export type WalletAccessState =
  | { status: 'loading'; settings: Record<string, unknown> }
  | { status: 'active'; settings: Record<string, unknown>; userId: string }
  | { status: 'inactive'; settings: Record<string, unknown>; userId?: string }
  | { status: 'error'; settings: Record<string, unknown>; message: string };

export const useWalletAccess = (): WalletAccessState => {
  const [state, setState] = useState<WalletAccessState>({ status: 'loading', settings: {} });

  useEffect(() => {
    let mounted = true;
    setState({ status: 'loading', settings: {} });
    supabase.auth.getUser()
      .then(({ data, error }) => {
        if (error || !data.user?.id) throw new Error('Sessão autenticada não encontrada.');
        return Promise.all([data.user.id, walletRepository.getAccess(data.user.id)] as const);
      })
      .then(([userId, result]) => {
        if (mounted) setState(result.active ? { status: 'active', settings: result.settings, userId } : { status: 'inactive', settings: result.settings, userId });
      })
      .catch(reason => {
        if (mounted) setState({ status: 'error', settings: {}, message: reason instanceof Error ? reason.message : 'Falha ao verificar o módulo.' });
      });
    return () => { mounted = false; };
  }, []);

  return state;
};
