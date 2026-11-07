import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, getSynchronizedSession } from '../lib/supabase';
import { Loan, Client, CapitalSource, UserProfile, SortOption, AppTab, LoanStatusFilter } from '../types';
import { asString, asNumber } from '../utils/safe';
import { filterDeletedLoans } from '../services/deletedContracts.service';
import { DEFAULT_MOBILE_NAV, normalizeMenuOrder, normalizeMobileNavOrder,
  readStoredNavigation, resolveNavigationPreferences, writeStoredNavigation } from '../layout/navigationPreferences';

const DEFAULT_NAV: AppTab[] = ['DASHBOARD', 'CLIENTS'] as AppTab[];
const DEFAULT_HUB: AppTab[] = ['DOSSIER', 'SOURCES', 'LEGAL', 'PROFILE'] as AppTab[];
const CACHE_KEY = (profileId: string) => `cm_cache_${profileId}`;
const CACHE_MAX_AGE = 12 * 60 * 60 * 1000;

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

const sanitizeTabs = (tabs: unknown, fallback: AppTab[]) => normalizeMenuOrder(tabs, fallback);

const persistNavigation = async (
  profileId: string,
  data: {ui_nav_order?: AppTab[];ui_hub_order?: AppTab[];ui_mobile_nav_order?: AppTab[]},
): Promise<void> => {
  const response = await supabase.from('perfis').update(data)
    .eq('id', profileId).select('id').maybeSingle();
  if (response.error) throw new Error('Falha ao salvar menus: ' + response.error.message);
  if (!response.data) throw new Error('O perfil não autorizou salvar a ordem dos menus.');
};

const retryPendingNavigation = async (profileId: string): Promise<void> => {
  const current = readStoredNavigation(profileId);
  if (current?.pendingDesktop && current.nav && current.hub) {
    await persistNavigation(profileId, {
      ui_nav_order: current.nav, ui_hub_order: current.hub,
    });
    const latest = readStoredNavigation(profileId);
    if (latest?.pendingDesktop &&
      JSON.stringify(latest.nav) === JSON.stringify(current.nav) &&
      JSON.stringify(latest.hub) === JSON.stringify(current.hub))
      writeStoredNavigation(profileId,{...latest,pendingDesktop:false});
  }
  const last = readStoredNavigation(profileId);
  if (last?.pendingMobile && last.mobile) {
    await persistNavigation(profileId,{ui_mobile_nav_order:last.mobile});
    const latest = readStoredNavigation(profileId);
    if (latest?.pendingMobile && JSON.stringify(latest.mobile) === JSON.stringify(last.mobile))
      writeStoredNavigation(profileId,{...latest,pendingMobile:false});
  }
};

const normalizeClients = (clients: any[] | undefined): Client[] =>
  (clients || []).filter((client: any) => client.registration_status !== 'REJECTED').map((client: any) => ({
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
    if (!Array.isArray(parsed?.loans) || !Array.isArray(parsed?.clients) || !Array.isArray(parsed?.sources)) return null;
    return parsed as AppCacheSnapshot;
  } catch {
    return null;
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
    ui_mobile_nav_order: normalizeMobileNavOrder(data.ui_mobile_nav_order),
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
  ui_mobile_nav_order: [...DEFAULT_MOBILE_NAV],
  brandColor: '#2563eb',
  targetCapital: 100000,
};

export const useAppState = (activeProfileId: string | null, onProfileNotFound?: () => void) => {
  const fetchInFlightRef = useRef<Map<string, Promise<void>>>(new Map());
  const [activeUser, setActiveUser] = useState<UserProfile | null>(null);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [sources, setSources] = useState<CapitalSource[]>([]);
  const [staffMembers, setStaffMembers] = useState<UserProfile[]>([]);
  const [navOrder, setNavOrder] = useState<AppTab[]>(DEFAULT_NAV);
  const [hubOrder, setHubOrder] = useState<AppTab[]>(DEFAULT_HUB);
  const [mobileNavOrder, setMobileNavOrder] = useState<AppTab[]>([...DEFAULT_MOBILE_NAV]);
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

    const stored = readStoredNavigation(profileId);
    const nav = sanitizeTabs(stored?.nav ?? snapshot.navOrder, DEFAULT_NAV);
    const hub = sanitizeTabs(stored?.hub ?? snapshot.hubOrder, DEFAULT_HUB);
    const mobile = normalizeMobileNavOrder(stored?.mobile ?? snapshot.activeUser.ui_mobile_nav_order);
    const user = {...snapshot.activeUser, ui_nav_order:nav, ui_hub_order:hub, ui_mobile_nav_order:mobile};
    setActiveUser(user);
    setProfileEditForm(user);
    setNavOrder(nav);
    setHubOrder(hub);
    setMobileNavOrder(mobile);
    setClients(normalizeClients(snapshot.clients));
    setSources(snapshot.sources || []);
    setLoans(filterDeletedForProfile(profileId, snapshot.loans, snapshot.activeUser));
    setStaffMembers(snapshot.staffMembers || []);
    setLoadError(null);
    setIsDataReady(true);
    return true;
  }, []);

  const fetchFullDataInternal = useCallback(async (profileId: string) => {
    if (!profileId || profileId === 'null' || profileId === 'undefined') return;

    const searchId = profileId === 'DEMO' ? 'DEMO' : profileId;
    if (searchId === 'DEMO') {
      setActiveUser(DEMO_USER);
      setProfileEditForm(DEMO_USER);
      const stored = readStoredNavigation('DEMO');
      setNavOrder(sanitizeTabs(stored?.nav, DEFAULT_NAV));
      setHubOrder(sanitizeTabs(stored?.hub, DEFAULT_HUB));
      setMobileNavOrder(normalizeMobileNavOrder(stored?.mobile));
      setIsDataReady(true);
      return;
    }

    const cached = readCache(searchId);
    const hasCachedBootstrap = !!cached?.activeUser;
    if (!hasCachedBootstrap) setIsLoadingData(true);
    setLoadError(null);

    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        const { db } = await import('../services/offline/adminOfflineStore');
        const profileData = await db.perfis.get(searchId);
        if (!profileData) {
          if (hydrateCache(searchId, cached)) {
            markSyncPaused('OFFLINE_LEGACY_CACHE');
            return;
          }
          throw new Error('Sem internet e sem dados offline para este perfil.');
        }

        const user = mapProfileFromDB(profileData);
        const ownerId = (profileData as any).owner_profile_id || profileData.supervisor_id || profileData.id;
        const { syncService } = await import('../services/sync.service');
        const local = await syncService.getLocalData(ownerId);

        const stored = readStoredNavigation(searchId);
        const nav = sanitizeTabs(stored?.nav ?? user.ui_nav_order, DEFAULT_NAV);
        const hub = sanitizeTabs(stored?.hub ?? user.ui_hub_order, DEFAULT_HUB);
        const mobile = normalizeMobileNavOrder(stored?.mobile ?? user.ui_mobile_nav_order);
        const updatedUser={...user,ui_nav_order:nav,ui_hub_order:hub,ui_mobile_nav_order:mobile};
        setActiveUser(updatedUser);
        setProfileEditForm(updatedUser);
        setNavOrder(nav);
        setHubOrder(hub);
        setMobileNavOrder(mobile);
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
        .or(session?.user?.id ? `id.eq.${searchId},user_id.eq.${session.user.id}` : `id.eq.${searchId}`)
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
      const prefs=resolveNavigationPreferences(searchId,user,DEFAULT_NAV,DEFAULT_HUB);
      const prepared={...user,ui_nav_order:prefs.nav,ui_hub_order:prefs.hub,ui_mobile_nav_order:prefs.mobile};
      setActiveUser(prepared);
      setProfileEditForm(prepared);
      setNavOrder(prefs.nav);
      setHubOrder(prefs.hub);
      setMobileNavOrder(prefs.mobile);
      if(prefs.pending?.pendingDesktop||prefs.pending?.pendingMobile)
        void retryPendingNavigation(searchId).catch(()=>{ /* persist offline until next refresh */ });

      const { syncService } = await import('../services/sync.service');
      const { db } = await import('../services/offline/adminOfflineStore');
      await db.perfis.put(profileData as any);
      await syncService.syncFullData(searchId, ownerId);
      const updated = await syncService.getLocalData(ownerId);

      setLoans(updated.loans);
      setClients(updated.clients);
      setSources(updated.sources);
      if ((updated as any).staffMembers) setStaffMembers((updated as any).staffMembers);

      localStorage.removeItem(CACHE_KEY(searchId));
    } catch (error: any) {
      console.warn('[useAppState] Sincronização remota falhou:', error);
      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
      if (isRecoverableSyncError(error) && hydrateCache(searchId, cached)) {
        markSyncPaused('OFFLINE_CACHE_RECOVERY');
        return;
      }

      setLoadError(
        isRecoverableSyncError(error)
          ? 'Não foi possível conectar ao servidor. Verifique sua internet e tente novamente.'
          : (error?.message || 'Erro de conexão.')
      );
    } finally {
      setIsLoadingData(false);
      setIsDataReady(true);
    }
  }, [hydrateCache, onProfileNotFound]);

  const fetchFullData = useCallback((profileId: string) => {
    const existing = fetchInFlightRef.current.get(profileId);
    if (existing) return existing;

    const request = fetchFullDataInternal(profileId).finally(() => {
      if (fetchInFlightRef.current.get(profileId) === request) {
        fetchInFlightRef.current.delete(profileId);
      }
    });
    fetchInFlightRef.current.set(profileId, request);
    return request;
  }, [fetchFullDataInternal]);

  useEffect(() => {
    if (!activeProfileId || activeProfileId === 'undefined' || activeProfileId === 'null') {
      setActiveUser(null);
      setNavOrder(DEFAULT_NAV);
      setHubOrder(DEFAULT_HUB);
      setMobileNavOrder([...DEFAULT_MOBILE_NAV]);
      setLoadError(null);
      setIsDataReady(false);
      return;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      hydrateCache(activeProfileId, readCache(activeProfileId));
    }
    void fetchFullData(activeProfileId);
  }, [activeProfileId, fetchFullData, hydrateCache]);

  useEffect(() => {
    if (!activeProfileId) return;
    const refreshFromNetwork = () => {
      if (navigator.onLine) void fetchFullData(activeProfileId);
    };
    window.addEventListener('online', refreshFromNetwork);
    return () => {
      window.removeEventListener('online', refreshFromNetwork);
    };
  }, [activeProfileId, fetchFullData]);

  const saveNavConfig = async (newNav: AppTab[], newHub: AppTab[]): Promise<void> => {
    if(!activeUser)throw new Error('Entre na conta para editar os menus.');
    const nav=sanitizeTabs(newNav,DEFAULT_NAV),hub=sanitizeTabs(newHub,DEFAULT_HUB);
    const profileId=activeUser.id, stored=readStoredNavigation(profileId);
    writeStoredNavigation(profileId,{...stored,nav,hub,pendingDesktop:profileId!=='DEMO'});
    setNavOrder(nav);setHubOrder(hub);
    setActiveUser(current=>current?.id===profileId?{...current,ui_nav_order:nav,ui_hub_order:hub}:current);
    setProfileEditForm(current=>current?.id===profileId?{...current,ui_nav_order:nav,ui_hub_order:hub}:current);
    if(profileId==='DEMO')return;
    await persistNavigation(profileId,{ui_nav_order:nav,ui_hub_order:hub});
    const latest=readStoredNavigation(profileId);
    if(latest?.pendingDesktop&&JSON.stringify(latest.nav)===JSON.stringify(nav)&&
      JSON.stringify(latest.hub)===JSON.stringify(hub))
      writeStoredNavigation(profileId,{...latest,pendingDesktop:false});
  };

  const saveMobileNavOrder = async (value: AppTab[]): Promise<void> => {
    if(!activeUser)throw new Error('Entre na conta para personalizar a barra.');
    const profileId=activeUser.id, mobile=normalizeMobileNavOrder(value);
    const stored=readStoredNavigation(profileId);
    writeStoredNavigation(profileId,{...stored,mobile,pendingMobile:profileId!=='DEMO'});
    setMobileNavOrder(mobile);
    setActiveUser(current=>current?.id===profileId?{...current,ui_mobile_nav_order:mobile}:current);
    if(profileId==='DEMO')return;
    await persistNavigation(profileId,{ui_mobile_nav_order:mobile});
    const latest=readStoredNavigation(profileId);
    if(latest?.pendingMobile&&JSON.stringify(latest.mobile)===JSON.stringify(mobile))
      writeStoredNavigation(profileId,{...latest,pendingMobile:false});
  };

  return {
    loans, setLoans,
    clients, setClients,
    sources, setSources,
    activeUser, setActiveUser,
    staffMembers, systemUsers: staffMembers,
    navOrder,
    hubOrder,
    mobileNavOrder,
    saveMobileNavOrder,
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
