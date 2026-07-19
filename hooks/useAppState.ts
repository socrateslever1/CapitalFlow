import { useState, useEffect, useCallback } from 'react';
import { supabase, getSynchronizedSession } from '../lib/supabase';
import { Loan, Client, CapitalSource, UserProfile, SortOption, AppTab, LoanStatusFilter } from '../types';
import { asString, asNumber } from '../utils/safe';
import { filterDeletedLoans } from '../services/deletedContracts.service';

const DEFAULT_NAV: AppTab[] = ['DASHBOARD', 'CLIENTS'] as AppTab[];
const DEFAULT_HUB: AppTab[] = ['DOSSIER', 'SOURCES', 'LEGAL', 'PROFILE'] as AppTab[];
const CACHE_KEY = (profileId: string) => `cm_cache_${profileId}`;
const CACHE_MAX_AGE = 12 * 60 * 60 * 1000;

const REMOVED_TABS = new Set(['PERSONAL_FINANCE', 'AGENDA', 'TEAM', 'MASTER', 'ACQUISITION', 'LEADS']);

type AppCacheSnapshot = {
  ts: number;
  activeUser: UserProfile;
  loans: Loan[];
  clients: Client[];
  sources: CapitalSource[];
  staffMembers: UserProfile[];
  navOrder: AppTab[];
  hubOrder: AppTab[];
};

const sanitizeTabs = (tabs: any[] | undefined, fallback: AppTab[]) => {
  const source = Array.isArray(tabs) && tabs.length > 0 ? tabs : fallback;
  return Array.from(new Set(source.filter((tab) => tab && !REMOVED_TABS.has(String(tab))))) as AppTab[];
};

const normalizeClients = (clients: any[] | undefined): Client[] =>
  (clients || []).map((client: any) => ({
    ...client,
    fotoUrl: client.foto_url || client.fotoUrl || null,
  })) as Client[];

const filterDeletedForProfile = (
  profileId: string,
  loans: Loan[] | undefined,
  activeUser?: UserProfile | null,
) => {
  const ownerId = activeUser?.supervisor_id || (activeUser as any)?.owner_profile_id || activeUser?.id;
  let filtered = filterDeletedLoans(profileId, loans || []);
  if (ownerId && ownerId !== profileId) filtered = filterDeletedLoans(ownerId, filtered);
  return filtered;
};

const readCache = (profileId: string): AppCacheSnapshot | null => {
  try {
    const raw = localStorage.getItem(CACHE_KEY(profileId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.ts || Date.now() - parsed.ts > CACHE_MAX_AGE) return null;
    return parsed as AppCacheSnapshot;
  } catch {
    return null;
  }
};

const writeCache = (profileId: string, snapshot: Omit<AppCacheSnapshot, 'ts'>) => {
  try {
    const payload: AppCacheSnapshot = {
      ...snapshot,
      loans: filterDeletedForProfile(profileId, snapshot.loans, snapshot.activeUser),
      ts: Date.now(),
    };
    localStorage.setItem(CACHE_KEY(profileId), JSON.stringify(payload));
  } catch (error) {
    console.warn('Falha ao salvar cache local', error);
  }
};

const isRecoverableSyncError = (error: any) => {
  const text = String(error?.message || error?.error_description || error || '').toLowerCase();
  return [
    'jwt expired',
    'invalid jwt',
    'token is expired',
    'auth session missing',
    'refresh token',
    'session not found',
    'failed to fetch',
    'network',
    'load failed',
    'offline',
    'failed verification',
  ].some((part) => text.includes(part));
};

const markSyncPaused = (reason: string) => {
  try {
    const detail = { status: 'PAUSED', reason, ts: Date.now() };
    localStorage.setItem('cm_sync_state', JSON.stringify(detail));
    window.dispatchEvent(new CustomEvent('cm_sync_state', { detail }));
  } catch {}
};

const mapProfileFromDB = (data: any): UserProfile => {
  const navOrder = sanitizeTabs(data.ui_nav_order, DEFAULT_NAV);
  const hubOrder = sanitizeTabs(data.ui_hub_order, DEFAULT_HUB);

  return {
    id: data.id,
    profile_id: data.id,
    name: asString(data.nome_operador),
    fullName: asString(data.nome_completo),
    email: asString(data.usuario_email || data.email),
    document: asString(data.document),
    phone: asString(data.phone),
    address: asString(data.address),
    addressNumber: asString(data.address_number),
    neighborhood: asString(data.neighborhood),
    city: asString(data.city),
    state: asString(data.state),
    zipCode: asString(data.zip_code),
    businessName: asString(data.nome_empresa),
    accessLevel: (() => {
      const level = String(data.access_level);
      if (level === '1' || level === 'ADMIN') return 'ADMIN';
      if (level === '3' || level === 'VIEWER') return 'VIEWER';
      return 'OPERATOR';
    })() as 'ADMIN' | 'OPERATOR' | 'VIEWER',
    interestBalance: asNumber(data.interest_balance),
    totalAvailableCapital: asNumber(data.total_available_capital),
    supervisor_id: data.supervisor_id,
    pixKey: asString(data.pix_key),
    photo: data.avatar_url,
    brandColor: '#2563eb',
    logoUrl: data.logo_url,
    contato_whatsapp: data.contato_whatsapp,
    defaultInterestRate: asNumber(data.default_interest_rate),
    defaultFinePercent: asNumber(data.default_fine_percent),
    defaultDailyInterestPercent: asNumber(data.default_daily_interest_percent),
    targetCapital: asNumber(data.target_capital),
    targetProfit: asNumber(data.target_profit),
    ui_nav_order: navOrder,
    ui_hub_order: hubOrder,
    createdAt: data.created_at,
  };
};

const DEMO_USER: UserProfile = {
  id: 'DEMO',
  profile_id: 'DEMO',
  name: 'Gestor Demo',
  fullName: 'Usuário de Demonstração',
  email: 'demo@capitalflow.app',
  businessName: 'Capital Demo',
  accessLevel: 'ADMIN',
  interestBalance: 1500,
  totalAvailableCapital: 50000,
  ui_nav_order: DEFAULT_NAV,
  ui_hub_order: DEFAULT_HUB,
  brandColor: '#2563eb',
  targetCapital: 100000,
};

export const useAppState = (activeProfileId: string | null, onProfileNotFound?: () => void) => {
  const [activeUser, setActiveUser] = useState<UserProfile | null>(null);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [sources, setSources] = useState<CapitalSource[]>([]);
  const [staffMembers, setStaffMembers] = useState<UserProfile[]>([]);
  const [navOrder, setNavOrder] = useState<AppTab[]>(DEFAULT_NAV);
  const [hubOrder, setHubOrder] = useState<AppTab[]>(DEFAULT_HUB);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isDataReady, setIsDataReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState<string>('ALL');
  const [activeTab, setActiveTab] = useState<AppTab>('DASHBOARD');
  const [statusFilter, setStatusFilter] = useState<LoanStatusFilter>('TODOS');
  const [sortOption, setSortOption] = useState<SortOption>('DUE_DATE_ASC');
  const [searchTerm, setSearchTerm] = useState('');
  const [clientSearchTerm, setClientSearchTerm] = useState('');
  const [profileEditForm, setProfileEditForm] = useState<UserProfile | null>(null);

  const hydrateCache = useCallback((profileId: string, cached?: AppCacheSnapshot | null) => {
    const snapshot = cached || readCache(profileId);
    if (!snapshot?.activeUser) return false;

    setActiveUser(snapshot.activeUser);
    setProfileEditForm(snapshot.activeUser);
    setNavOrder(sanitizeTabs(snapshot.navOrder, DEFAULT_NAV));
    setHubOrder(sanitizeTabs(snapshot.hubOrder, DEFAULT_HUB));
    setClients(normalizeClients(snapshot.clients));
    setSources(snapshot.sources || []);
    setLoans(filterDeletedForProfile(profileId, snapshot.loans, snapshot.activeUser));
    setStaffMembers(snapshot.staffMembers || []);
    setLoadError(null);
    setIsDataReady(true);
    return true;
  }, []);

  const fetchFullData = useCallback(async (profileId: string) => {
    if (!profileId || profileId === 'null' || profileId === 'undefined') return;

    const searchId = profileId === 'DEMO' ? 'DEMO' : profileId;
    if (searchId === 'DEMO') {
      setActiveUser(DEMO_USER);
      setProfileEditForm(DEMO_USER);
      setIsDataReady(true);
      return;
    }

    const cached = readCache(searchId);
    const hasCachedBootstrap = !!cached?.activeUser;
    if (!hasCachedBootstrap) setIsLoadingData(true);
    setLoadError(null);

    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        if (hydrateCache(searchId, cached)) {
          markSyncPaused('OFFLINE_CACHE');
          return;
        }

        const { db } = await import('../services/offline/adminOfflineStore');
        const profileData = await db.perfis.get(searchId);
        if (!profileData) throw new Error('Sem internet e sem cache local para este perfil.');

        const user = mapProfileFromDB(profileData);
        const ownerId = (profileData as any).owner_profile_id || profileData.supervisor_id || profileData.id;
        const { syncService } = await import('../services/sync.service');
        const local = await syncService.getLocalData(ownerId);

        setActiveUser(user);
        setProfileEditForm(user);
        setNavOrder(sanitizeTabs(user.ui_nav_order, DEFAULT_NAV));
        setHubOrder(sanitizeTabs(user.ui_hub_order, DEFAULT_HUB));
        setLoans(local.loans);
        setClients(local.clients);
        setSources(local.sources);
        markSyncPaused('OFFLINE_DEXIE');
        return;
      }

      const sessionResult = await getSynchronizedSession({ minValidityMs: 2 * 60 * 1000 });
      if (sessionResult.error) throw sessionResult.error;
      const session = sessionResult.data.session;

      const { data: dbProfiles, error: profileError } = await supabase
        .from('perfis')
        .select('*')
        .or(`id.eq.${searchId},user_id.eq.${session?.user?.id || ''}`)
        .order('created_at', { ascending: false })
        .limit(1);

      if (profileError && !isRecoverableSyncError(profileError)) throw profileError;
      let profileData = dbProfiles?.[0];

      if (!profileData) {
        const { db } = await import('../services/offline/adminOfflineStore');
        profileData = await db.perfis.get(searchId);
      }

      if (!profileData) {
        if (hydrateCache(searchId, cached)) return;
        onProfileNotFound?.();
        throw new Error('Perfil não encontrado.');
      }

      const user = mapProfileFromDB(profileData);
      const ownerId = profileData.owner_profile_id || profileData.supervisor_id || profileData.id;
      const cleanNav = sanitizeTabs(user.ui_nav_order, DEFAULT_NAV);
      const cleanHub = sanitizeTabs(user.ui_hub_order, DEFAULT_HUB);

      setActiveUser(user);
      setProfileEditForm(user);
      setNavOrder(cleanNav);
      setHubOrder(cleanHub);

      const { syncService } = await import('../services/sync.service');
      await syncService.syncFullData(searchId, ownerId);
      const updated = await syncService.getLocalData(ownerId);

      setLoans(updated.loans);
      setClients(updated.clients);
      setSources(updated.sources);
      if ((updated as any).staffMembers) setStaffMembers((updated as any).staffMembers);

      writeCache(searchId, {
        activeUser: { ...user, ui_nav_order: cleanNav, ui_hub_order: cleanHub },
        loans: updated.loans,
        clients: updated.clients,
        sources: updated.sources,
        staffMembers: (updated as any).staffMembers || [],
        navOrder: cleanNav,
        hubOrder: cleanHub,
      });
    } catch (error: any) {
      console.warn('[useAppState] Sincronização remota falhou:', error);
      if (isRecoverableSyncError(error) && hydrateCache(searchId, cached)) {
        markSyncPaused('CACHE_RECOVERY');
      } else {
        setLoadError(error?.message || 'Erro de conexão.');
      }
    } finally {
      setIsLoadingData(false);
      setIsDataReady(true);
    }
  }, [hydrateCache, onProfileNotFound]);

  useEffect(() => {
    if (!activeProfileId || activeProfileId === 'undefined' || activeProfileId === 'null') {
      setActiveUser(null);
      setLoadError(null);
      setIsDataReady(false);
      return;
    }

    const cached = readCache(activeProfileId);
    hydrateCache(activeProfileId, cached);
    void fetchFullData(activeProfileId);
  }, [activeProfileId, fetchFullData, hydrateCache]);

  useEffect(() => {
    if (!activeUser || !activeProfileId || activeUser.id === 'DEMO') return;

    const ownerId = activeUser.supervisor_id || activeUser.id;
    let syncTimeout: ReturnType<typeof setTimeout> | null = null;

    const triggerRealtimeSync = () => {
      if (syncTimeout) clearTimeout(syncTimeout);
      syncTimeout = setTimeout(async () => {
        try {
          const { syncService } = await import('../services/sync.service');
          await syncService.syncFullData(activeProfileId, ownerId);
          const updated = await syncService.getLocalData(ownerId);
          setLoans(updated.loans);
          setClients(updated.clients);
          setSources(updated.sources);
          if ((updated as any).staffMembers) setStaffMembers((updated as any).staffMembers);

          writeCache(activeProfileId, {
            activeUser,
            loans: updated.loans,
            clients: updated.clients,
            sources: updated.sources,
            staffMembers: (updated as any).staffMembers || staffMembers,
            navOrder,
            hubOrder,
          });
        } catch (error) {
          console.warn('[REALTIME] Falha ao sincronizar em segundo plano:', error);
        }
      }, 500);
    };

    const channel = supabase
      .channel(`realtime-sync-${ownerId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contratos' }, triggerRealtimeSync)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clientes' }, triggerRealtimeSync)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fontes' }, triggerRealtimeSync)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'parcelas' }, triggerRealtimeSync)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transacoes' }, triggerRealtimeSync)
      .subscribe();

    return () => {
      if (syncTimeout) clearTimeout(syncTimeout);
      supabase.removeChannel(channel);
    };
  }, [activeUser, activeProfileId, hubOrder, navOrder, staffMembers]);

  const saveNavConfig = async (newNav: AppTab[], newHub: AppTab[]) => {
    if (!activeUser) return;

    const cleanNav = sanitizeTabs(newNav, DEFAULT_NAV);
    const cleanHub = sanitizeTabs(newHub, DEFAULT_HUB);
    const updatedUser = { ...activeUser, ui_nav_order: cleanNav, ui_hub_order: cleanHub };

    setNavOrder(cleanNav);
    setHubOrder(cleanHub);
    setActiveUser(updatedUser);
    if (profileEditForm?.id === activeUser.id) setProfileEditForm(updatedUser);

    if (activeUser.id !== 'DEMO') {
      const { error } = await supabase
        .from('perfis')
        .update({ ui_nav_order: cleanNav, ui_hub_order: cleanHub })
        .eq('id', activeUser.id);
      if (error) console.error(error);
    }

    writeCache(activeUser.id, {
      activeUser: updatedUser,
      loans,
      clients,
      sources,
      staffMembers,
      navOrder: cleanNav,
      hubOrder: cleanHub,
    });
  };

  return {
    loans, setLoans,
    clients, setClients,
    sources, setSources,
    activeUser, setActiveUser,
    staffMembers, systemUsers: staffMembers,
    navOrder,
    hubOrder,
    isLoadingData, setIsLoadingData,
    isDataReady,
    loadError, setLoadError,
    fetchFullData,
    selectedStaffId, setSelectedStaffId,
    activeTab, setActiveTab,
    statusFilter, setStatusFilter,
    sortOption, setSortOption,
    searchTerm, setSearchTerm,
    clientSearchTerm, setClientSearchTerm,
    profileEditForm, setProfileEditForm,
    saveNavConfig,
  };
};
