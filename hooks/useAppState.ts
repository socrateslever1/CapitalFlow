import { useState, useEffect, useCallback } from 'react';
import { supabase, getSynchronizedSession } from '../lib/supabase';
import { Loan, Client, CapitalSource, UserProfile, SortOption, AppTab, LoanStatusFilter } from '../types';
import { maskPhone, maskDocument } from '../utils/formatters';
import { mapLoanFromDB } from '../services/adapters/dbAdapters';
import { asString, asNumber } from '../utils/safe';
import { filterDeletedLoans } from '../services/deletedContracts.service';

const DEFAULT_NAV: AppTab[] = ['DASHBOARD', 'CLIENTS'] as AppTab[];
const DEFAULT_HUB: AppTab[] = ['DOSSIER', 'SOURCES', 'LEGAL', 'PROFILE'] as AppTab[];

const CACHE_KEY = (profileId: string) => `cm_cache_${profileId}`;
const CACHE_MAX_AGE = 12 * 60 * 60 * 1000; // 12 horas

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

const filterDeletedForProfile = (
  profileId: string,
  loans: Loan[] | undefined,
  activeUser?: UserProfile | null
) => {
  const ownerId = activeUser?.supervisor_id || (activeUser as any)?.owner_profile_id || activeUser?.id;
  let filtered = filterDeletedLoans(profileId, loans || []);
  if (ownerId && ownerId !== profileId) {
    filtered = filterDeletedLoans(ownerId, filtered);
  }
  return filtered;
};

const readCache = (profileId: string): AppCacheSnapshot | null => {
  try {
    const raw = localStorage.getItem(CACHE_KEY(profileId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.ts) return null;
    if (Date.now() - parsed.ts > CACHE_MAX_AGE) return null;
    return parsed as AppCacheSnapshot;
  } catch {
    return null;
  }
};

const writeCache = (profileId: string, snap: Omit<AppCacheSnapshot, 'ts'>) => {
  try {
    const payload: AppCacheSnapshot = {
      ...snap,
      loans: filterDeletedForProfile(profileId, snap.loans, snap.activeUser),
      ts: Date.now()
    };
    localStorage.setItem(CACHE_KEY(profileId), JSON.stringify(payload));
  } catch (e) {
    console.warn('Falha ao salvar cache local', e);
  }
};

const REMOVED_TABS = new Set(['PERSONAL_FINANCE', 'AGENDA', 'TEAM', 'MASTER', 'ACQUISITION', 'LEADS']);

const sanitizeTabs = (tabs: any[] | undefined, fallback: AppTab[]) => {
  const source = Array.isArray(tabs) && tabs.length > 0 ? tabs : fallback;
  const clean = source.filter((t) => t && !REMOVED_TABS.has(String(t))) as AppTab[];
  return Array.from(new Set(clean));
};

const isRecoverableSyncError = (err: any) => {
  const text = String(err?.message || err?.error_description || err || '').toLowerCase();
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
  ].some((p) => text.includes(p));
};

const markSyncPaused = (reason: string) => {
  try {
    const detail = { status: 'PAUSED', reason, ts: Date.now() };
    localStorage.setItem('cm_sync_state', JSON.stringify(detail));
    window.dispatchEvent(new CustomEvent('cm_sync_state', { detail }));
  } catch {}
};

const hasLocalPayload = (local: { loans: Loan[]; clients: Client[]; sources: CapitalSource[] }) =>
  local.loans.length > 0 || local.clients.length > 0 || local.sources.length > 0;

const normalizeClients = (clients: any[] | undefined): Client[] =>
  (clients || []).map((client: any) => ({
    ...client,
    fotoUrl: client.foto_url || client.fotoUrl || null,
  })) as Client[];

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
      if (level === '2' || level === 'OPERATOR') return 'OPERATOR';
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
    createdAt: data.created_at
  };
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
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedStaffId, setSelectedStaffId] = useState<string>('ALL');
  const [activeTab, setActiveTab] = useState<AppTab>('DASHBOARD');
  const [statusFilter, setStatusFilter] = useState<LoanStatusFilter>('TODOS');
  const [sortOption, setSortOption] = useState<SortOption>('DUE_DATE_ASC');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [clientSearchTerm, setClientSearchTerm] = useState<string>('');
  const [profileEditForm, setProfileEditForm] = useState<UserProfile | null>(null);

  const fetchFullData = useCallback(async (profileId: string) => {
    if (!profileId || profileId === 'null' || profileId === 'undefined') return;

    let session: any = null;
    try {
      const sessionResult = await getSynchronizedSession({ minValidityMs: 2 * 60 * 1000 });
      session = sessionResult.data.session;
      if (sessionResult.error) throw sessionResult.error;
    } catch (sessionErr) {
      if (isRecoverableSyncError(sessionErr)) {
        markSyncPaused('AUTH_OR_NETWORK');
      } else {
        throw sessionErr;
      }
    }
    const searchId = profileId === 'DEMO' ? 'DEMO' : profileId;

    if (searchId === 'DEMO') {
      setActiveUser(DEMO_USER);
      setProfileEditForm(DEMO_USER);
      return;
    }
    
    setIsLoadingData(true);
    setLoadError(null);

    try {
      const { data: dbProfiles, error: profileErr } = await supabase
        .from('perfis')
        .select('*')
        .or(`id.eq.${searchId},user_id.eq.${session?.user?.id || ''}`)
        .order('created_at', { ascending: false })
        .limit(1);

      if (profileErr && !isRecoverableSyncError(profileErr)) throw profileErr;
      if (profileErr) markSyncPaused('PROFILE_REMOTE_UNAVAILABLE');
      let profileData = dbProfiles?.[0];
      if (!profileData) {
        const { db } = await import('../services/offline/adminOfflineStore');
        profileData = await db.perfis.get(searchId);
      }
      if (!profileData) {
        const cached = readCache(searchId);
        if (cached?.activeUser) {
          setActiveUser(cached.activeUser);
          setProfileEditForm(cached.activeUser);
          setNavOrder(sanitizeTabs(cached.navOrder, DEFAULT_NAV));
          setHubOrder(sanitizeTabs(cached.hubOrder, DEFAULT_HUB));
          setClients(normalizeClients(cached.clients));
          setSources(cached.sources);
          setLoans(filterDeletedForProfile(searchId, cached.loans, cached.activeUser));
          setStaffMembers(cached.staffMembers);
          setLoadError(null);
          markSyncPaused('CACHE_RECOVERY');
          return;
        }
        throw new Error('Perfil não encontrado no cache local. Conecte-se uma vez para preparar o modo offline.');
      }

      const u = mapProfileFromDB(profileData);
      const ownerId = profileData.owner_profile_id || profileData.supervisor_id || profileData.id;
      
      setActiveUser(u);
      setProfileEditForm(u);
      const cleanNav = sanitizeTabs(u.ui_nav_order, DEFAULT_NAV);
      const cleanHub = sanitizeTabs(u.ui_hub_order, DEFAULT_HUB);
      setNavOrder(cleanNav);
      setHubOrder(cleanHub);

      const { syncService } = await import('../services/sync.service');
      const local = await syncService.getLocalData(ownerId);
      const localHasData = hasLocalPayload(local);
      
      if (localHasData) {
        setLoans(local.loans);
        setClients(local.clients);
        setSources(local.sources);
        setIsLoadingData(false);
      } else {
        const cached = readCache(searchId);
        if (cached) {
          setLoans(filterDeletedForProfile(searchId, cached.loans, cached.activeUser));
          setClients(normalizeClients(cached.clients));
          setSources(cached.sources);
          setStaffMembers(cached.staffMembers);
        }
      }

      try {
        await syncService.syncFullData(searchId, ownerId);
        const updated = await syncService.getLocalData(ownerId);
        setLoans(updated.loans);
        setClients(updated.clients);
        setSources(updated.sources);
        if ((updated as any).staffMembers) setStaffMembers((updated as any).staffMembers);

        writeCache(searchId, {
          activeUser: { ...u, ui_nav_order: cleanNav, ui_hub_order: cleanHub },
          loans: updated.loans,
          clients: updated.clients,
          sources: updated.sources,
          staffMembers: (updated as any).staffMembers || [],
          navOrder: cleanNav,
          hubOrder: cleanHub,
        });
      } catch (syncErr: any) {
        console.warn('[useAppState] Sync em background pausado:', syncErr);
        if (isRecoverableSyncError(syncErr)) {
          markSyncPaused('SYNC_BACKGROUND_UNAVAILABLE');
          setLoadError(null);
        } else if (!localHasData && !readCache(searchId)) {
          throw syncErr;
        }
      }

    } catch (err: any) {
      console.error('Erro ao carregar dados:', err);
      const { isAuthSyncError } = await import('../services/sync.service');
      const isAuth = isAuthSyncError(err);
      const cached = readCache(searchId);

      if (isAuth) {
        setLoadError('SESSAO_EXPIRADA');
        if (cached?.activeUser) {
          setActiveUser(cached.activeUser);
          setProfileEditForm(cached.activeUser);
          setLoans(filterDeletedForProfile(searchId, cached.loans || [], cached.activeUser));
        }
      } else if (isRecoverableSyncError(err) && cached?.activeUser) {
        setActiveUser(cached.activeUser);
        setProfileEditForm(cached.activeUser);
        setNavOrder(sanitizeTabs(cached.navOrder, DEFAULT_NAV));
        setHubOrder(sanitizeTabs(cached.hubOrder, DEFAULT_HUB));
        setClients(normalizeClients(cached.clients));
        setSources(cached.sources);
        setLoans(filterDeletedForProfile(searchId, cached.loans, cached.activeUser));
        setStaffMembers(cached.staffMembers);
        setLoadError(null);
        markSyncPaused('CACHE_RECOVERY');
      } else {
        setLoadError(err.message || 'Erro de conexão.');
      }
    } finally {
      setIsLoadingData(false);
    }
  }, []);

  useEffect(() => {
    if (!activeProfileId || activeProfileId === 'undefined' || activeProfileId === 'null') {
      setActiveUser(null);
      setLoadError(null);
      return;
    }

    const cached = readCache(activeProfileId);
    if (cached?.activeUser) {
      setActiveUser(cached.activeUser);
      setProfileEditForm(cached.activeUser);
      setNavOrder(sanitizeTabs(cached.navOrder, DEFAULT_NAV));
      setHubOrder(sanitizeTabs(cached.hubOrder, DEFAULT_HUB));
      setClients(normalizeClients(cached.clients));
      setSources(cached.sources);
      setLoans(filterDeletedForProfile(activeProfileId, cached.loans, cached.activeUser));
      setStaffMembers(cached.staffMembers);

      const cacheAge = Date.now() - cached.ts;
      if (cacheAge > 30 * 1000) {
        fetchFullData(activeProfileId);
      }
    } else {
      fetchFullData(activeProfileId);
    }
  }, [activeProfileId]);

  // Sincronização Automática em Tempo Real (Offline Prevention)
  useEffect(() => {
    if (!activeUser || !activeProfileId || activeUser.id === 'DEMO') return;

    const ownerId = activeUser.supervisor_id || activeUser.id;
    let syncTimeout: any = null;

    const triggerRealtimeSync = () => {
      if (syncTimeout) clearTimeout(syncTimeout);
      syncTimeout = setTimeout(async () => {
        try {
          console.log('[REALTIME] Alteração remota detectada. Sincronizando dados imediatamente...');
          const { syncService } = await import('../services/sync.service');
          await syncService.syncFullData(activeProfileId, ownerId);
          const updated = await syncService.getLocalData(ownerId);
          setLoans(updated.loans);
          setClients(updated.clients);
          setSources(updated.sources);
          if ((updated as any).staffMembers) setStaffMembers((updated as any).staffMembers);
        } catch (err) {
          console.warn('[REALTIME] Falha ao processar sincronização automática:', err);
        }
      }, 500); // 500ms debounce
    };

    console.log('[REALTIME] Registrando canais em tempo real para supervisor:', ownerId);
    const channel = supabase
      .channel(`realtime-sync-${ownerId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contratos' }, triggerRealtimeSync)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clientes' }, triggerRealtimeSync)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fontes' }, triggerRealtimeSync)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'parcelas' }, triggerRealtimeSync)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transacoes' }, triggerRealtimeSync)
      .subscribe((status) => {
        console.log(`[REALTIME] Canal de sincronização ativa: ${status}`);
      });

    return () => {
      if (syncTimeout) clearTimeout(syncTimeout);
      console.log('[REALTIME] Removendo escuta em tempo real do canal:', ownerId);
      supabase.removeChannel(channel);
    };
  }, [activeUser, activeProfileId]);

  const saveNavConfig = async (newNav: AppTab[], newHub: AppTab[]) => {
    if (!activeUser) return;
    const cleanNav = sanitizeTabs(newNav, DEFAULT_NAV);
    const cleanHub = sanitizeTabs(newHub, DEFAULT_HUB);
    setNavOrder(cleanNav);
    setHubOrder(cleanHub);
    const updatedUser = { ...activeUser, ui_nav_order: cleanNav, ui_hub_order: cleanHub };
    setActiveUser(updatedUser);

    if (profileEditForm?.id === activeUser.id) {
      setProfileEditForm(updatedUser);
    }

    if (activeUser.id !== 'DEMO') {
        try {
            const { error } = await supabase.from('perfis').update({ ui_nav_order: cleanNav, ui_hub_order: cleanHub }).eq('id', activeUser.id);
            if (error) throw error;
        } catch (e) { console.error(e); }
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
    loadError, setLoadError,
    fetchFullData,
    selectedStaffId, setSelectedStaffId,
    activeTab, setActiveTab,
    statusFilter, setStatusFilter,
    sortOption, setSortOption,
    searchTerm, setSearchTerm,
    clientSearchTerm, setClientSearchTerm,
    profileEditForm, setProfileEditForm,
    saveNavConfig
  };
};
