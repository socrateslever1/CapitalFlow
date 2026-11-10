import { supabase } from '../../../lib/supabase';
import { personalWalletService, type WalletCardInvoiceFacts } from '../../../services/personalWallet.service';

import {
  deriveOverviewFromSnapshot,
  loadWalletOfflineAccess,
  loadWalletOfflineFull,
  loadWalletOfflineOverview,
  saveWalletOfflineAccess,
  saveWalletOfflineFull,
  saveWalletOfflineOverview,
} from './walletOfflineStore';
import { WalletSnapshotCache } from './walletSnapshotCache';

export type WalletSnapshot = Awaited<ReturnType<typeof personalWalletService.load>>;
export type WalletOverviewSnapshot = Awaited<ReturnType<typeof personalWalletService.loadOverview>>;

const snapshotCache = new WalletSnapshotCache<WalletSnapshot>(25_000);
const overviewCache = new WalletSnapshotCache<WalletOverviewSnapshot>(25_000);
const accessCache = new Map<string, { active: boolean; settings: Record<string, unknown>; expiresAt: number }>();
let initializedUser: string | null = null;
let initialization: Promise<void> | null = null;
let prefetchedUser: string | null = null;
let prefetchInFlight: Promise<void> | null = null;

function isBrowserOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function isNetworkFailure(error: unknown): boolean {
  if (isBrowserOffline()) return true;
  if (error instanceof TypeError) return true;
  const text = String((error as { message?: unknown } | null)?.message || error || '');
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|internet|offline|connection/i.test(text);
}

function scheduleFullPrefetch(userId: string) {
  if (typeof window === 'undefined' || isBrowserOffline()) return;
  if (prefetchedUser === userId && snapshotCache.peek(userId)) return;
  if (prefetchInFlight) return;
  window.setTimeout(() => {
    void walletRepository.prefetchFull().catch(() => undefined);
  }, 150);
}

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
  window.addEventListener('capitalflow:wallet-updated', () => {
    snapshotCache.invalidate();
    overviewCache.invalidate();
    prefetchedUser = null;
  });
}

async function resolveSessionUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  const userId = data.session?.user?.id;
  if (error || !userId) {
    snapshotCache.invalidate();
    overviewCache.invalidate();
    accessCache.clear();
    initializedUser = null;
    initialization = null;
    prefetchedUser = null;
    throw new Error('Sessão não encontrada. Entre novamente para abrir a Carteira.');
  }
  return userId;
}

export const walletRepository = {
  async peekCachedFull(): Promise<WalletSnapshot | null> {
    try {
      const userId = await resolveSessionUserId();
      return snapshotCache.peek(userId) || await loadWalletOfflineFull(userId);
    } catch {
      return null;
    }
  },
  async peekCachedOverview(): Promise<WalletOverviewSnapshot | null> {
    try {
      const userId = await resolveSessionUserId();
      const inMemory = overviewCache.peek(userId);
      if (inMemory) return inMemory;
      const fullInMemory = snapshotCache.peek(userId);
      if (fullInMemory) return deriveOverviewFromSnapshot(fullInMemory);
      return await loadWalletOfflineOverview(userId);
    } catch {
      return null;
    }
  },
  async prefetchFull(): Promise<void> {
    if (isBrowserOffline()) return;
    if (prefetchInFlight) return prefetchInFlight;
    prefetchInFlight = this.load()
      .then(() => undefined)
      .catch(() => undefined)
      .finally(() => { prefetchInFlight = null; });
    return prefetchInFlight;
  },
  async load(options: { force?: boolean } = {}): Promise<WalletSnapshot> {
    // Session identity is read before handing out cached financial data.
    const userId = await resolveSessionUserId();
    if (isBrowserOffline()) {
      const offlineSnapshot = snapshotCache.peek(userId) || await loadWalletOfflineFull(userId);
      if (offlineSnapshot) {
        snapshotCache.prime(userId, offlineSnapshot);
        return offlineSnapshot;
      }
      throw new Error('Sem internet e sem dados da Carteira salvos neste aparelho.');
    }
    return snapshotCache.load(userId, async () => {
      try {
        await ensureWalletInitialized(userId);
        const fullSnapshot = await personalWalletService.load();
        prefetchedUser = userId;
        const derivedOverview = await saveWalletOfflineFull(userId, fullSnapshot);
        overviewCache.prime(userId, derivedOverview);
        return fullSnapshot;
      } catch (error) {
        if (isNetworkFailure(error)) {
          const offlineSnapshot = await loadWalletOfflineFull(userId);
          if (offlineSnapshot) return offlineSnapshot;
        }
        throw error;
      }
    }, options.force === true);
  },
  async loadOverview(options: { force?: boolean } = {}): Promise<WalletOverviewSnapshot> {
    const userId = await resolveSessionUserId();
    if (isBrowserOffline()) {
      const offlineOverview = overviewCache.peek(userId) || await loadWalletOfflineOverview(userId);
      if (offlineOverview) {
        overviewCache.prime(userId, offlineOverview);
        return offlineOverview;
      }
      throw new Error('Sem internet e sem dados da Carteira salvos neste aparelho.');
    }
    if (!options.force) {
      const cachedOverview = overviewCache.peek(userId);
      if (cachedOverview) {
        scheduleFullPrefetch(userId);
        return cachedOverview;
      }
      const fullInMemory = snapshotCache.peek(userId);
      if (fullInMemory) {
        const storedOverview = await loadWalletOfflineOverview(userId);
        const derived = deriveOverviewFromSnapshot(fullInMemory, storedOverview?.cardInvoiceDates || []);
        overviewCache.prime(userId, derived);
        return derived;
      }
    }
    return overviewCache.load(userId, async () => {
      try {
        await ensureWalletInitialized(userId);
        const overview = await personalWalletService.loadOverview();
        await saveWalletOfflineOverview(userId, overview);
        scheduleFullPrefetch(userId);
        return overview;
      } catch (error) {
        if (isNetworkFailure(error)) {
          const offlineOverview = await loadWalletOfflineOverview(userId);
          if (offlineOverview) return offlineOverview;
        }
        throw error;
      }
    }, options.force === true);
  },
  async loadCardInvoiceFacts(cardId: string): Promise<WalletCardInvoiceFacts[]> {
    if (!cardId) return [];
    let userId: string | null = null;
    try {
      userId = await resolveSessionUserId();
    } catch {
      userId = null;
    }

    const readCachedCardFacts = async (): Promise<WalletCardInvoiceFacts[] | null> => {
      if (!userId) return null;
      const fullSnapshot = snapshotCache.peek(userId) || await loadWalletOfflineFull(userId);
      if (fullSnapshot?.cardInvoiceFacts) {
        return fullSnapshot.cardInvoiceFacts
          .filter(fact => fact.card_id === cardId)
          .sort((a, b) => String(b.due_month).localeCompare(String(a.due_month)))
          .slice(0, 24);
      }
      return null;
    };

    if (isBrowserOffline()) {
      return (await readCachedCardFacts()) || [];
    }

    try {
      const facts = await personalWalletService.loadCardInvoiceFacts(cardId);
      if (userId) {
        const cachedFull = snapshotCache.peek(userId) || await loadWalletOfflineFull(userId);
        if (cachedFull) {
          const otherCardFacts = (cachedFull.cardInvoiceFacts || []).filter(fact => fact.card_id !== cardId);
          const updatedSnapshot: WalletSnapshot = {
            ...cachedFull,
            cardInvoiceFacts: [...facts, ...otherCardFacts],
          };
          if (snapshotCache.peek(userId)) snapshotCache.prime(userId, updatedSnapshot);
          await saveWalletOfflineFull(userId, updatedSnapshot);
        }
      }
      return facts;
    } catch (error) {
      if (isNetworkFailure(error)) {
        const offlineFacts = await readCachedCardFacts();
        if (offlineFacts) return offlineFacts;
      }
      throw error;
    }
  },
  async prefetchAccess(): Promise<void> {
    try {
      const userId = await resolveSessionUserId();
      await this.getAccess(userId);
    } catch {
      /* Pré-aquecimento silencioso para habilitar abertura offline no primeiro acesso */
    }
  },
  async getAccess(userId: string) {
    const cachedMemory = accessCache.get(userId);
    if (cachedMemory && Date.now() < cachedMemory.expiresAt) {
      return { active: cachedMemory.active, settings: cachedMemory.settings };
    }
    if (isBrowserOffline()) {
      const offlineAccess = await loadWalletOfflineAccess(userId);
      if (offlineAccess) return offlineAccess;
    }
    try {
      const { data: isSuperAdmin, error: adminError } = await supabase.rpc('is_platform_super_admin');
      if (adminError) throw new Error(adminError.message);
      if (!isSuperAdmin) {
        const denied = { active: false, settings: {} };
        accessCache.set(userId, { ...denied, expiresAt: Date.now() + 60_000 });
        return denied;
      }
      const { data, error } = await supabase
        .from('user_modulos')
        .select('ativo,configuracoes')
        .eq('user_id', userId)
        .eq('modulo_chave', 'carteira')
        .maybeSingle();
      if (error) throw new Error(error.message);
      const result = data ? { active: Boolean(data.ativo), settings: data.configuracoes ?? {} } : { active: false, settings: {} };
      accessCache.set(userId, { ...result, expiresAt: Date.now() + 60_000 });
      if (result.active) await saveWalletOfflineAccess(userId, result);
      return result;
    } catch (error) {
      if (isNetworkFailure(error)) {
        const offlineAccess = await loadWalletOfflineAccess(userId);
        if (offlineAccess) return offlineAccess;
      }
      throw error;
    }
  },
};
