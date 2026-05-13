// feature/auth/useAuth.ts
import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase, getSynchronizedSession } from '../../lib/supabase';
import { requestBrowserNotificationPermission } from '../../utils/notifications';
import { asString } from '../../utils/safe';
import { playNotificationSound } from '../../utils/notificationSound';
import { onlyDigits } from '../../utils/formatters';
import { isDev } from '../../utils/isDev';
import { isUUID, safeUUID } from '../../utils/uuid';

type SavedProfile = {
  id: string;
  name: string;
  email: string;
  contato_whatsapp?: string;
};

const resolveSmartName = (p: any): string => {
  if (!p) return 'Gestor';

  const isGeneric = (s: string) => {
    if (!s) return true;
    const clean = s.toLowerCase().trim();
    return ['usuário','usuario','user','operador','admin','gestor','undefined','null','']
      .includes(clean);
  };

  const display = asString(p.nome_exibicao || p.display_name);
  if (display && !isGeneric(display)) return display;

  const operator = asString(p.nome_operador || p.name || p.nome);
  if (operator && !isGeneric(operator)) return operator;

  const business = asString(p.nome_empresa || p.business_name);
  if (business && !isGeneric(business)) return business;

  const full = asString(p.nome_completo || p.full_name);
  if (full && !isGeneric(full)) return full.split(' ')[0];

  const email = asString(p.usuario_email || p.email || p.auth_email);
  if (email && email.includes('@')) {
    const prefix = email.split('@')[0];
    return prefix.charAt(0).toUpperCase() + prefix.slice(1);
  }

  return 'Gestor';
};

const mapLoginError = (err: any) => {
  let raw = String(err?.message || err || '');
  const l = raw.toLowerCase();

  // Tratamento específico para falhas críticas de serviço (Supabase)
  if (raw.includes('/auth/v1/token')) {
    return 'Falha ao validar acesso com o servidor de autenticação (Supabase). Tente novamente em instantes.';
  }
  
  if (raw.includes('/rest/v1/perfis') || raw.includes('/rest/v1/rpc/check_')) {
    return 'O servidor de dados está demorando para responder. Verifique sua conexão ou tente recarregar a página.';
  }

  if (
    l.includes('network') ||
    l.includes('failed to fetch') ||
    l.includes('load failed') ||
    l.includes('connection error')
  ) {
    return 'Falha de conexão com os servidores. Verifique sua internet ou VPN.';
  }

  if (raw.startsWith('AUTH_SIGNIN_FAILED:')) {
    try {
      const jsonPart = raw.replace('AUTH_SIGNIN_FAILED: ', '');
      const details = JSON.parse(jsonPart);
      if (details.message) raw = details.message;
    } catch {}
  }

  const l2 = raw.toLowerCase();

  if (l2.includes('invalid login')) return 'Usuário ou senha inválidos.';
  if (l2.includes('invalid_credentials')) return 'Usuário ou senha inválidos.';
  if (l2.includes('email not confirmed')) return 'E-mail não confirmado.';
  if (l2.includes('refresh token not found') || l2.includes('invalid refresh token')) {
    return 'Sessão expirada. Faça login novamente.';
  }

  if (l2.includes('lock') && l2.includes('stole')) {
    return 'Conflito de sessão detectado. O sistema está se recuperando automaticamente...';
  }

  return raw || 'Erro desconhecido no login.';
};

const readLocalProfileId = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem('cm_session') || 'null');
    const profileId = parsed?.profileId;
    return profileId && profileId !== 'undefined' && profileId !== 'null' ? profileId : null;
  } catch {
    return null;
  }
};

export const useAuth = () => {
  if (isDev) console.log('[useAuth] Hook execution started');
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [loginUser, setLoginUser] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [savedProfiles, setSavedProfiles] = useState<SavedProfile[]>([]);
  const [bootFinished, setBootFinished] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const bootInProgress = useRef(false);

  const trackAccess = async (profileId: string) => {
    const safeId = safeUUID(profileId);
    if (!safeId || safeId === 'DEMO') return;
    try {
      await supabase.rpc('increment_profile_access', { p_profile_id: safeId });
    } catch (e) {
      if (isDev) console.warn('[AUTH] Falha ao registrar acesso', e);
    }
  };

  const ensureAuthSession = async (email: string, pass: string) => {
    const cleanEmail = String(email || '').toLowerCase().trim();
    const cleanPass = String(pass || '');

    const { data: s, error: sessionError } = await getSynchronizedSession();

    if (sessionError) {
      if (isDev) console.warn('[AUTH_SYNC] erro sessão:', sessionError.message);
      await supabase.auth.signOut().catch(() => {});
    }

    if (s?.session?.user?.email?.toLowerCase() === cleanEmail) {
      return;
    }

    if (s?.session) {
      await supabase.auth.signOut();
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password: cleanPass,
    });

    if (error) {
      throw new Error(
        `AUTH_SIGNIN_FAILED: ${JSON.stringify({
          message: error.message,
          status: (error as any).status,
          code: (error as any).code,
        })}`
      );
    }

    if (isDev) console.log('[AUTH_SYNC] sessão criada:', !!data?.session);
  };

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const resolveAndSetProfile = useCallback(async (user: any) => {
    if (!mountedRef.current) return;
    if (isDev) console.log('[AUTH_BOOT] Resolvendo perfil para:', user.id);
    
    let profile = null;
    let attempts = 0;
    
    // Tenta buscar perfil vinculado ao user_id (Polling para aguardar Trigger)
    while (attempts < 5 && !profile && mountedRef.current) {
      const { data, error } = await supabase.from('perfis').select('*').eq('user_id', user.id).maybeSingle();
      profile = data;
      if (!profile) {
        if (isDev) console.log(`[AUTH_BOOT] Perfil não encontrado por user_id (tentativa ${attempts + 1}/5)...`);
        await new Promise(r => setTimeout(r, 2000));
        attempts++;
      }
    }

    if (profile && profile.id && mountedRef.current) {
      if (isDev) console.log('[AUTH_BOOT] Sucesso ao definir activeProfileId:', profile.id);
      setActiveProfileId(profile.id);
      trackAccess(profile.id);
      localStorage.setItem('cm_session', JSON.stringify({ profileId: profile.id, ts: Date.now() }));
      
      const profileName = resolveSmartName(profile);
      const profileEmail = asString(profile.usuario_email || profile.email || profile.auth_email) || user.email || '';
      const contato_whatsapp = asString(profile.contato_whatsapp || profile.support_phone || profile.supportPhone);
      
      const savedList = JSON.parse(localStorage.getItem('cm_saved_profiles') || '[]');
      const updated = [
        { id: profile.id, name: profileName, email: profileEmail, contato_whatsapp },
        ...savedList.filter((p: any) => p.id !== profile.id),
      ].slice(0, 5);
      setSavedProfiles(updated);
      localStorage.setItem('cm_saved_profiles', JSON.stringify(updated));
    } else if (mountedRef.current) {
      // 🚨 AUTO-CRIAÇÃO DE EMERGÊNCIA: Se autenticou mas não tem perfil, cria um agora.
      if (isDev) console.warn('[AUTH_BOOT] Perfil não encontrado. Iniciando criação de emergência...');
      
      try {
        const { data: newProfile, error: createError } = await supabase.from('perfis').insert({
          id: user.id, // ✅ ID do perfil = ID do Auth (Garante consistência total)
          user_id: user.id,
          email: user.email,
          usuario_email: user.email || '',
          nome_operador: user.email?.split('@')[0] || 'Gestor',
          nome_exibicao: user.email?.split('@')[0] || 'Gestor',
          access_level: 1, // Admin
          perfil: 'MASTER',
          created_at: new Date().toISOString()
        }).select().single();

        if (createError) throw createError;

        if (newProfile && mountedRef.current) {
          if (isDev) console.log('[AUTH_BOOT] Perfil de emergência criado com sucesso:', newProfile.id);
          setActiveProfileId(newProfile.id);
          localStorage.setItem('cm_session', JSON.stringify({ profileId: newProfile.id, ts: Date.now() }));
          return;
        }
      } catch (err) {
        if (isDev) console.error('[AUTH_BOOT] Falha na auto-criação de perfil:', err);
      }

      if (isDev) console.error('[AUTH_BOOT] Falha na resolução do perfil: Identidade não encontrada ou aguardando Trigger.');
      setActiveProfileId(null);
    }
  }, [isDev]);

  const boot = useCallback(async (force = false) => {
    if (!mountedRef.current) return;
    if (bootInProgress.current && !force) {
      if (isDev) console.log('[AUTH_BOOT] Boot já em progresso, ignorando...');
      return;
    }
    
    bootInProgress.current = true;
    
    try {
      if (isDev) console.log(`[AUTH_BOOT] Iniciando boot (force=${force})...`);

      const params = new URLSearchParams(window.location.search);
      const isPortalAccess = params.has('portal');
      const hasOAuthCode = params.has('code') && !isPortalAccess;
      
      if (window.location.hash.includes('access_token=') || hasOAuthCode) {
        if (isDev) console.log('[AUTH_BOOT] Detectado token/code na URL, aguardando processamento do Supabase...');
        await new Promise(r => setTimeout(r, 1200));
      }

      if (isDev) console.log('[AUTH_BOOT] Verificando perfis salvos...');
      const saved = localStorage.getItem('cm_saved_profiles');
      if (saved && mountedRef.current) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            const valid = parsed.filter((p: any) => p.email?.includes('@'));
            setSavedProfiles(valid);
            if (valid.length > 0 && !localStorage.getItem('cm_session')) {
              setLoginUser(valid[0].email);
            }
          }
        } catch (e) {
          if (isDev) console.warn('[AUTH_BOOT] Erro ao carregar perfis salvos:', e);
        }
      }

      if (isDev) console.log('[AUTH_BOOT] Obtendo sessão sincronizada...');
      const { data: { session }, error: sessionError } = await getSynchronizedSession();

      if (sessionError) {
        if (isDev) console.warn('[AUTH_BOOT] Erro ao obter sessão:', sessionError.message);
        const localProfileId = readLocalProfileId();
        if (localProfileId) {
          setActiveProfileId(localProfileId);
          window.dispatchEvent(new Event('cm_auth_paused'));
        } else if (sessionError.message.includes('Refresh Token Not Found')) {
          await handleLogout();
        }
      }

      const localSession = localStorage.getItem('cm_session');
      const hasSupabaseUser = !!session?.user;

      if (isDev) console.log('[AUTH_BOOT] Status Atual:', { 
        hasSupabaseUser, 
        localSession: !!localSession, 
        userId: session?.user?.id,
        email: session?.user?.email
      });

      if (localSession && hasSupabaseUser && mountedRef.current) {
        try {
          const parsed = JSON.parse(localSession);
          if (parsed?.profileId && parsed.profileId !== 'undefined' && parsed.profileId !== 'null') {
            if (isDev) console.log('[AUTH_BOOT] Restaurando sessão local:', parsed.profileId);
            setActiveProfileId(parsed.profileId);
            trackAccess(parsed.profileId);
          } else {
            if (isDev) console.log('[AUTH_BOOT] Sessão local inválida, removendo');
            localStorage.removeItem('cm_session');
            await resolveAndSetProfile(session!.user);
          }
        } catch {
          localStorage.removeItem('cm_session');
        }
      } else if (hasSupabaseUser && mountedRef.current) {
        if (isDev) console.log('[AUTH_BOOT] Usuário autenticado sem sessão local, resolvendo perfil...');
        await resolveAndSetProfile(session!.user);
      } else if (!hasSupabaseUser && mountedRef.current) {
        if (isDev) console.log('[AUTH_BOOT] Nenhum usuário logado no Supabase');
        const localProfileId = readLocalProfileId();
        if (localProfileId) {
          if (isDev) console.log('[AUTH_BOOT] Mantendo sessao local em modo offline/auth pausada:', localProfileId);
          setActiveProfileId(localProfileId);
          window.dispatchEvent(new Event('cm_auth_paused'));
        } else if (localSession) {
          if (isDev) console.log('[AUTH_BOOT] Removendo cm_session órfã');
          localStorage.removeItem('cm_session');
          setActiveProfileId(null);
        } else {
          setActiveProfileId(null);
        }
      }
    } catch (e: any) {
      const errorMsg = String(e?.message || e || '').toLowerCase();
      const isLockError = errorMsg.includes('lock') && errorMsg.includes('stole');
      
      if (isLockError && !force && mountedRef.current) {
        if (isDev) console.warn('[AUTH_BOOT] Conflito de lock detectado. Tentando recuperar em 1.5s...');
        bootInProgress.current = false;
        setTimeout(() => boot(true), 1500);
        return;
      }

      console.error('[AUTH_BOOT] Erro crítico no boot:', e);
      if (mountedRef.current) setLoadError(mapLoginError(e));
    } finally {
      if (mountedRef.current) {
        if (isDev) console.log('[AUTH_BOOT] Finalizando estado de boot');
        setBootFinished(true);
      }
      bootInProgress.current = false;
    }
  }, [isDev, resolveAndSetProfile]);

  // Safety Timeout for Boot
  useEffect(() => {
    if (!bootFinished) {
      const timer = setTimeout(() => {
        if (!bootFinished && mountedRef.current) {
          if (isDev) console.warn('[AUTH_BOOT] Timeout de segurança atingido. Forçando bootFinished=true');
          setBootFinished(true);
        }
      }, 15000); // 15 segundos para dar tempo ao boot real
      return () => clearTimeout(timer);
    }
  }, [bootFinished]);

  useEffect(() => {
    if (isDev) console.log('[AUTH] Boot effect running');
    boot();

    const { data: { subscription } } =
      supabase.auth.onAuthStateChange(async (event, session) => {
        if (!mountedRef.current) return;

        const ev = String(event);

        if (isDev) console.log('[AUTH EVENT]', ev, 'session?', !!session);

        if (ev === 'TOKEN_REFRESH_FAILED') {
          const localProfileId = readLocalProfileId();
          if (localProfileId) {
            setActiveProfileId(localProfileId);
            window.dispatchEvent(new Event('cm_auth_paused'));
            return;
          }
          setActiveProfileId(null);
          window.dispatchEvent(new Event('cm_auth_lost'));
          return;
        }

        if (ev === 'SIGNED_OUT') {
          const localProfileId = readLocalProfileId();
          if (localProfileId) {
            setActiveProfileId(localProfileId);
            window.dispatchEvent(new Event('cm_auth_paused'));
            return;
          }
          setActiveProfileId(null);
          window.dispatchEvent(new Event('cm_auth_lost'));
          return;
        }

        if (ev === 'SIGNED_IN' || ev === 'TOKEN_REFRESHED') {
          if (session?.user) {
            if (isDev) console.log('[AUTH] Sessão ativa, garantindo perfil...');
            boot();
          }
          window.dispatchEvent(new Event('cm_auth_restored'));
        }
      });

    return () => {
      subscription.unsubscribe();
    };
  }, [boot, isDev]);

  const handleLoginSuccess = (profile: any, showToast: any) => {
    const profileId = profile.id;
    const profileName = resolveSmartName(profile);
    const profileEmail =
      asString(profile.usuario_email || profile.email || profile.auth_email);
    const contato_whatsapp = asString(profile.contato_whatsapp || profile.support_phone || profile.supportPhone);

    if (!profileEmail || !profileEmail.includes('@')) {
      if (isDev) console.warn('[AUTH] Perfil sem e-mail válido para persistência', profile.id);
      setActiveProfileId(profileId);
      trackAccess(profileId);
      localStorage.setItem('cm_session', JSON.stringify({ profileId, ts: Date.now() }));
      showToast(`Bem-vindo, ${profileName}!`, 'success');
      playNotificationSound();
      window.dispatchEvent(new Event('cm_auth_restored'));
      return;
    }

    setActiveProfileId(profileId);
    trackAccess(profileId);
    
    const updated = [
      { id: profileId, name: profileName, email: profileEmail, contato_whatsapp },
      ...savedProfiles.filter((p) => p.id !== profileId && p.email?.includes('@')),
    ].slice(0, 5);

    setSavedProfiles(updated);

    localStorage.setItem('cm_saved_profiles', JSON.stringify(updated));
    localStorage.setItem('cm_session', JSON.stringify({ profileId, ts: Date.now() }));

    showToast(`Bem-vindo, ${profileName}!`, 'success');
    playNotificationSound();

    window.dispatchEvent(new Event('cm_auth_restored'));
  };

  const submitLogin = async (
    showToast: (msg: string, type?: 'error' | 'success' | 'warning') => void
  ) => {
    setIsLoading(true);
    try {
      const userInput = loginUser.trim();
      const pass = loginPassword.trim();
      
      if (!userInput || !pass) throw new Error('Preencha e-mail e senha.');

      requestBrowserNotificationPermission();

      let emailToLogin = userInput;
      let authPass = pass.length < 6 ? pass.padEnd(6, '0') : pass;

      if (!userInput.includes('@')) {
        throw new Error('O login deve ser realizado com seu e-mail cadastrado.');
      }

      try {
        await ensureAuthSession(emailToLogin, authPass);
      } catch (err: any) {
        if (pass !== authPass) {
          try {
            await ensureAuthSession(emailToLogin, pass);
            authPass = pass;
          } catch {
            throw err;
          }
        } else {
          throw err;
        }
      }

      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) throw new Error('Sessão inválida.');

      const { data: profile } = await supabase
        .from('perfis')
        .select('*')
        .eq('user_id', uid)
        .maybeSingle();

      if (!profile) {
        if (isDev) console.log('[AUTH] Perfil não encontrado no login direto, forçando boot para resolução...');
        // Em vez de erro fatal, forçamos o boot que agora tem auto-criação
        await boot(true);
        return;
      }

      handleLoginSuccess(profile, showToast);
    } catch (err: any) {
      showToast(mapLoginError(err), 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const submitTeamLogin = async (
    params: { document: string; phone: string; code: string },
    showToast: (msg: string, type?: 'error' | 'success' | 'warning') => void
  ) => {
    setIsLoading(true);
    try {
      const cleanDoc = onlyDigits(params.document);
      const cleanCode = params.code.trim();
      if (!cleanDoc || !cleanCode) throw new Error('Preencha todos os campos.');

      const { data: loginData, error: loginError } = await supabase.rpc('resolve_team_login', {
        p_document: cleanDoc,
        p_pin: cleanCode,
      });

      if (loginError) throw loginError;
      if (!loginData) throw new Error('Dados de acesso à equipe incorretos.');

      const profile = loginData as any;
      const authEmail = (loginData as any).auth_email;
      if (!authEmail) throw new Error('Este perfil não possui e-mail vinculado para autenticação segura.');

      const authPass = cleanCode.length < 6 ? cleanCode.padEnd(6, '0') : cleanCode;

      const { data: fnData, error: fnError } = await supabase.functions.invoke('ensure_auth_user', {
        body: { profile_id: profile.id, email: authEmail, password: authPass },
      });

      if (fnError) throw new Error('Serviço de autenticação indisponível no momento.');
      if (!fnData?.ok) throw new Error(fnData?.error || 'Falha ao sincronizar credenciais de acesso.');

      await ensureAuthSession(authEmail, authPass);
      handleLoginSuccess(profile, showToast);
    } catch (err: any) {
      showToast(mapLoginError(err), 'error');
      window.dispatchEvent(new Event('cm_auth_lost'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectSavedProfile = async (p: SavedProfile, showToast: any) => {
    const { data: s } = await getSynchronizedSession();
    if (s.session && s.session.user.email?.toLowerCase() === p.email.toLowerCase()) {
      setActiveProfileId(p.id);
      trackAccess(p.id);
      localStorage.setItem('cm_session', JSON.stringify({ profileId: p.id, ts: Date.now() }));
      showToast(`Bem-vindo de volta, ${p.name}!`, 'success');
      playNotificationSound();
      window.dispatchEvent(new Event('cm_auth_restored'));
    } else {
      showToast('Sessão de segurança expirada. Digite sua senha.', 'warning');
      setLoginUser(p.email);
      window.dispatchEvent(new Event('cm_auth_lost'));
    }
  };

  const handleRemoveSavedProfile = (id: string) => {
    const updated = savedProfiles.filter((p) => p.id !== id);
    setSavedProfiles(updated);
    localStorage.setItem('cm_saved_profiles', JSON.stringify(updated));
  };

  const handleGoogleLogin = async () => {
    if (isDev) console.log('[AUTH] Iniciando login Google...');
    localStorage.removeItem('cm_session');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });
    if (error) throw error;
  };

  const handlePasswordRecovery = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw error;
  };

  const handlePasswordReset = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  };

  const handleLogout = async () => {
    if (isDev) console.log('[AUTH] Executando logout...');
    setActiveProfileId(null);
    setBootFinished(true);

    localStorage.removeItem('cm_session');
    localStorage.removeItem('cm_supabase_auth');

    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
        localStorage.removeItem(key);
      }
    });

    await supabase.auth.signOut().catch(() => {});
    window.dispatchEvent(new Event('cm_auth_lost'));
    if (isDev) console.log('[AUTH] Logout concluído');
  };

  const reauthenticate = async (password: string) => {
    if (!activeProfileId) throw new Error('Nenhum perfil ativo.');

    const profile = savedProfiles.find((p) => p.id === activeProfileId);
    if (!profile?.email) throw new Error('E-mail do perfil não encontrado. Faça login novamente.');

    await supabase.auth.signOut().catch(() => {});
    await ensureAuthSession(profile.email, password);
    window.dispatchEvent(new Event('cm_auth_restored'));
  };

  return {
    activeProfileId,
    setActiveProfileId,
    loginUser,
    setLoginUser,
    loginPassword,
    setLoginPassword,
    savedProfiles,
    submitLogin,
    submitTeamLogin,
    handleLogout,
    handleGoogleLogin,
    handlePasswordRecovery,
    handlePasswordReset,
    reauthenticate,
    handleSelectSavedProfile,
    handleRemoveSavedProfile,
    bootFinished,
    isLoading,
    loadError,
    boot
  };
};
