import { supabase } from '../../../lib/supabase';
import { personalWalletService } from '../../../services/personalWallet.service';

import { WalletSnapshotCache } from './walletSnapshotCache';

export type WalletSnapshot = Awaited<ReturnType<typeof personalWalletService.load>>;

const snapshotCache = new WalletSnapshotCache<WalletSnapshot>(25_000);
let initializedUser: string | null = null;
let initialization: Promise<void> | null = null;

function ensureWalletInitialized(userId: string): Promise<void> {
  if (initializedUser !== userId) {
    initializedUser = userId;
    initialization = null;
  }
  if (!initialization) {
    initialization = personalWalletService.ensureDefaultCashAccount().catch(error => {
      initialization = null; // Retry if the RPC fails.
      throw error;
    });
  }
  return initialization;
}

// Every write/realtime event invalidates the cache before mounted pages refresh.
if (typeof window !== 'undefined') {
  window.addEventListener('capitalflow:wallet-updated', () => snapshotCache.invalidate());
}

export const walletRepository = {
  async load(options: { force?: boolean } = {}): Promise<WalletSnapshot> {
    // Session identity is read before handing out cached financial data.
    const { data, error } = await supabase.auth.getSession();
    const userId = data.session?.user?.id;
    if (error || !userId) {
      snapshotCache.invalidate();
      initializedUser = null;
      initialization = null;
      throw new Error('Sessão não encontrada. Entre novamente para abrir a Carteira.');
    }
    return snapshotCache.load(userId, async () => {
      await ensureWalletInitialized(userId);
      return personalWalletService.load();
    }, options.force === true);
  },
  async getAccess(userId: string) {
    const { data, error } = await supabase
      .from('user_modulos')
      .select('ativo,configuracoes')
      .eq('user_id', userId)
      .eq('modulo_chave', 'carteira')
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? { active: Boolean(data.ativo), settings: data.configuracoes ?? {} } : { active: false, settings: {} };
  },
};
