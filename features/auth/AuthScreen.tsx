import React, { useState, useEffect, useCallback } from 'react';
import {
  HelpCircle,
  TrendingUp,
  User,
  KeyRound,
  Loader2,
  X,
  ChevronRight,
  Beaker,
  Eye,
  EyeOff,
  UserPlus,
  AlertCircle,
  AlertTriangle,
  CheckCircle2
} from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { supabase } from '../../lib/supabase';
import { maskDocument, onlyDigits } from '../../utils/formatters';

const isDev = window.location.hostname === 'localhost' || window.location.hostname.includes('run.app');

/**
 * 1. CAMADA DE DADOS (QUERIES)
 */
const fetchInviteByToken = async (token: string) => {
  return await supabase
    .from('team_members')
    .select(
      'id, team_id, invite_status, invite_token, profile_id, linked_profile_id, full_name, username_or_email, expires_at, created_at, teams(owner_profile_id)'
    )
    .eq('invite_token', token)
    .maybeSingle();
};

const finalizeInvite = async (id: string, status: 'ACCEPTED' | 'EXPIRED') => {
  return await supabase.from('team_members').update({ invite_status: status }).eq('id', id);
};

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const normalizeEmailAddress = (value: string) =>
  String(value || '')
    .normalize('NFKC')
    .replace(/^mailto:/i, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, '')
    .replace(/^[<>"'`]+|[<>"'`]+$/g, '')
    .trim()
    .toLowerCase();

const isEmailAddressValid = (value: string) =>
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(
    value
  );

const ensureProfileWriteSession = async (
  email: string,
  password: string,
  attempts = 6,
  delayMs = 500
) => {
  const normalizedEmail = normalizeEmailAddress(email);
  let signInTried = false;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;

    const sessionEmail = data.session?.user?.email?.toLowerCase();
    if (data.session?.user?.id && sessionEmail === normalizedEmail) {
      return true;
    }

    if (!signInTried && attempt >= 1) {
      signInTried = true;
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      const message = signInError?.message?.toLowerCase?.() || '';
      const canIgnore =
        !signInError ||
        message.includes('email not confirmed') ||
        message.includes('invalid login credentials');

      if (!canIgnore) {
        throw signInError;
      }
    }

    await wait(delayMs);
  }

  return false;
};

const waitForProfileRow = async (profileId: string, attempts = 8, delayMs = 700) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const { data, error } = await supabase
      .from('perfis')
      .select('id')
      .eq('id', profileId)
      .maybeSingle();

    if (error) throw error;
    if (data?.id) return true;

    await wait(delayMs);
  }

  return false;
};

const updateExistingProfileRow = async (profileId: string, payload: Record<string, any>) => {
  const profileExists = await waitForProfileRow(profileId);
  if (!profileExists) {
    return false;
  }

  const { data, error } = await supabase
    .from('perfis')
    .update(payload)
    .eq('id', profileId)
    .select('id')
    .maybeSingle();

  if (error) throw error;
  return !!data?.id;
};

/**
 * 2. CAMADA DE LÃ“GICA (HOOKS)
 */
const useInviteFlow = (showToast: any) => {
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [inviteData, setInviteData] = useState<any | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const checkInviteToken = useCallback(
    async (token: string) => {
      setIsProcessing(true);
      try {
        const { data, error } = await fetchInviteByToken(token);
        if (error || !data) {
          showToast('Convite invÃ¡lido ou expirado.', 'error');
          localStorage.removeItem('cm_invite_token');
          setInviteToken(null);
          return;
        }
        localStorage.setItem('cm_invite_token', token);
        setInviteData(data);
      } catch (e) {
        setInviteToken(null);
      } finally {
        setIsProcessing(false);
      }
    },
    [showToast]
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('invite_token') || localStorage.getItem('cm_invite_token');
    if (token) {
      setInviteToken(token);
      checkInviteToken(token);
    }
  }, [checkInviteToken]);

  const cancelInvite = () => {
    localStorage.removeItem('cm_invite_token');
    setInviteToken(null);
    setInviteData(null);
  };

  return { inviteToken, setInviteToken, inviteData, isProcessing, cancelInvite };
};

const useMemberActivation = (
  inviteData: any,
  submitTeamLogin: any,
  showToast: any
) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [form, setForm] = useState({ name: '', document: '', phone: '', email: '', accessCode: '' });
  const [errorText, setErrorText] = useState('');

  const handleActivate = async () => {
    if (!inviteData) return;
    setErrorText('');

    if (!form.name.trim() || !form.email.trim() || !form.document || !form.accessCode) {
      setErrorText('Preencha todos os campos.');
      return;
    }

    setIsProcessing(true);

    try {
      const cleanDoc = onlyDigits(form.document);
      const cleanPhone = onlyDigits(form.phone);
      const email = normalizeEmailAddress(form.email);

      if (!isEmailAddressValid(email)) {
        throw new Error('Digite um e-mail vÃ¡lido para ativar o convidado, sem aspas ou espaÃ§os ocultos.');
      }

      // âœ… PIN real do app (4 dÃ­gitos)
      const pin = onlyDigits(form.accessCode.trim());

      // âœ… Senha do Supabase Auth (mÃ­nimo 6 caracteres) - Regra Unificada
      const pinToAuthPassword = (p: string) => p.length < 6 ? p.padEnd(6, '0') : p;
      const authPass = pinToAuthPassword(pin);

      let authUid = '';

      // OtimizaÃ§Ã£o: Tentar SignUp primeiro (esperado para novos membros)
      // Se jÃ¡ registrado, tentamos o login para capturar o UID
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password: authPass,
        options: { 
          data: { 
            full_name: form.name,
            owner_id: inviteData.teams?.owner_profile_id,
            supervisor_id: inviteData.teams?.owner_profile_id,
            origin: 'TEAM_INVITE'
          } 
        }
      });

      if (signUpError) {
        if (signUpError.message?.toLowerCase().includes('already registered') || signUpError.status === 422) {
          const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
            email,
            password: authPass
          });

          if (signInError) {
            if (signInError.message?.toLowerCase().includes('rate limit')) {
              throw new Error('Muitas tentativas. Por favor, aguarde alguns minutos antes de tentar novamente.');
            }
            throw new Error('Este e-mail jÃ¡ estÃ¡ em uso com outra senha ou o limite de seguranÃ§a foi atingido.');
          }
          authUid = signInData.user?.id || '';
        } else {
          if (signUpError.message?.toLowerCase().includes('rate limit')) {
            throw new Error('Muitas tentativas. Por favor, aguarde alguns minutos.');
          }
          throw signUpError;
        }
      } else {
        authUid = signUpData.user?.id || '';
      }

      if (!authUid) throw new Error('Falha crÃ­tica ao obter identificador de seguranÃ§a.');

      // 3) Aguarda a sessao autenticar e atualiza o perfil criado pelo trigger do banco
      const hasSessionForProfileWrite = await ensureProfileWriteSession(email, authPass);
      if (!hasSessionForProfileWrite) {
        throw new Error('A conta foi criada, mas a sessao segura ainda nao foi liberada. Confirme o e-mail ou faca login novamente para concluir a ativacao.');
      }

      const profileUpdated = await updateExistingProfileRow(authUid, {
        supervisor_id: inviteData.teams?.owner_profile_id,
        owner_profile_id: inviteData.teams?.owner_profile_id,
        nome_operador: form.name.trim().split(' ')[0],
        nome_completo: form.name.trim(),
        email,
        usuario_email: email,

        // âœ… mantÃ©m PIN 4 no app
        senha_acesso: pin,
        access_code: pin,

        document: cleanDoc,
        phone: cleanPhone,
        access_level: 1
      });

      if (!profileUpdated) {
        throw new Error('O perfil ainda esta sendo preparado pelo sistema. Aguarde alguns segundos e tente novamente.');
      }

      await finalizeInvite(inviteData.id, 'ACCEPTED');
      localStorage.removeItem('cm_invite_token');
      showToast('Conta ativada!', 'success');

      // âœ… login do fluxo de equipe continua com PIN 4
      await submitTeamLogin({ document: cleanDoc, phone: cleanPhone, code: pin }, showToast);

      const cleanUrl = window.location.origin + window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
      window.location.reload();
    } catch (e: any) {
      setErrorText(e.message);
      setIsProcessing(false);
    }
  };

  return { form, setForm, handleActivate, errorText, isProcessing };
};

const useCreateProfile = (setLoginUser: any, setIsCreatingProfile: any, showToast: any, setIsProcessing: any) => {
  const [form, setForm] = useState({ name: '', email: '', businessName: '', password: '', recoveryPhrase: '' });

  const handleCreate = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.password) {
      showToast('Preencha os campos obrigatÃ³rios.', 'error');
      return;
    }

    setIsProcessing(true);

    try {
      const email = normalizeEmailAddress(form.email);

      if (!isEmailAddressValid(email)) {
        throw new Error('Digite um e-mail vÃ¡lido para criar a conta.');
      }

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password: form.password.trim(),
        options: { data: { full_name: form.name } }
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('Erro ao gerar credenciais.');

      const hasSessionForProfileWrite = await ensureProfileWriteSession(email, form.password.trim());

      if (hasSessionForProfileWrite) {
        const profileUpdated = await updateExistingProfileRow(authData.user.id, {
          owner_profile_id: authData.user.id,
          nome_operador: form.name.trim(),
          usuario_email: email,
          email,
          nome_empresa: form.businessName.trim(),
          senha_acesso: form.password.trim(),
          recovery_phrase: form.recoveryPhrase.trim(),
          access_level: 1
        });

        if (!profileUpdated) {
          throw new Error('Conta criada no Auth, mas o perfil ainda nao foi provisionado. Tente novamente em instantes.');
        }
      }

      showToast('Conta criada! Verifique seu e-mail.', 'success');
      setIsCreatingProfile(false);
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  return { form, setForm, handleCreate };
};

const useRecoveryAndSupport = (setIsRecoveringPassword: any, showToast: any, supportNumber?: string) => {
  const [form, setForm] = useState({ email: '', phrase: '', newPassword: '' });

  const handleHelpSupport = (type: 'password' | 'access') => {
    const number = supportNumber || import.meta.env.VITE_SUPPORT_PHONE || '';
    if (!number) {
      showToast('Número de suporte não configurado. Por favor, tente novamente mais tarde.', 'error');
      return;
    }
    const msg = type === 'password' ? 'Olá, esqueci minha senha no CapitalFlow.' : 'Olá, não consigo acessar minha conta.';
    window.open(`https://wa.me/${number}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const handleRecovery = async () => {
    if (!form.email.trim()) return;
    const email = normalizeEmailAddress(form.email);
    if (!isEmailAddressValid(email)) {
      showToast('Digite um e-mail vÃ¡lido para recuperar a senha.', 'error');
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) showToast(error.message, 'error');
    else showToast('E-mail de recuperaÃ§Ã£o enviado!', 'success');
    setIsRecoveringPassword(false);
  };

  return { form, setForm, handleRecovery, handleHelpSupport };
};

/**
 * 3. COMPONENTES DE INTERFACE (MANTIDOS)
 */
const GoogleIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24">
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      fill="#4285F4"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      fill="#FBBC05"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      fill="#EA4335"
    />
  </svg>
);

const InviteActivationView = ({ form, setForm, onConfirm, isLoading, errorText, onCancel }: any) => (
  <div className="space-y-4 pb-24">
    <div className="relative z-10 text-center mb-6">
      <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl shadow-lg shadow-blue-600/20 mb-4">
        <UserPlus className="text-white w-8 h-8" />
      </div>
      <h1 className="text-xl font-black text-white uppercase tracking-tighter mb-1">Ativar Acesso</h1>
      <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">VocÃª estÃ¡ entrando em: Equipe</p>
    </div>

    {errorText && (
      <div className="bg-rose-900/20 border border-rose-500/30 p-4 rounded-xl flex items-start gap-3 animate-in fade-in zoom-in-95">
        <AlertCircle className="text-rose-500 shrink-0" size={18} />
        <p className="text-xs text-rose-200 font-bold leading-tight">{errorText}</p>
      </div>
    )}

    <div className="space-y-3">
      <input
        type="text"
        className="w-full bg-slate-800/50 p-4 rounded-xl text-white outline-none border border-slate-700 text-sm font-bold"
        placeholder="Nome Completo"
        value={form.name || ''}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
      />
      <input
        type="email"
        className="w-full bg-slate-800/50 p-4 rounded-xl text-white outline-none border border-slate-700 text-sm font-bold"
        placeholder="Seu E-mail"
        value={form.email || ''}
        onChange={(e) => setForm({ ...form, email: normalizeEmailAddress(e.target.value) })}
      />
      <input
        type="text"
        className="w-full bg-slate-800/50 p-4 rounded-xl text-white outline-none border border-slate-700 text-sm font-bold"
        placeholder="CPF"
        value={form.document || ''}
        onChange={(e) => setForm({ ...form, document: maskDocument(e.target.value) })}
      />
      <input
        type="text"
        maxLength={4}
        className="w-full bg-slate-800/50 p-4 rounded-xl text-white outline-none border border-slate-700 text-sm font-bold"
        placeholder="Crie um PIN de 4 dÃ­gitos"
        value={form.accessCode || ''}
        onChange={(e) => setForm({ ...form, accessCode: onlyDigits(e.target.value) })}
      />
    </div>

    <button
      onClick={onConfirm}
      disabled={isLoading}
      className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-xs font-black uppercase flex items-center justify-center gap-2"
    >
      {isLoading ? <Loader2 className="animate-spin" /> : 'Ativar e Entrar'}
    </button>

    <button onClick={onCancel} className="w-full py-2 text-slate-500 text-[10px] font-black uppercase">
      Cancelar
    </button>
  </div>
);

const LoginView = ({
  loginUser,
  setLoginUser,
  loginPassword,
  setLoginPassword,
  showPassword,
  setShowPassword,
  submitLogin,
  isLoading,
  savedProfiles,
  handleSelectSavedProfile,
  handleRemoveSavedProfile,
  setIsCreatingProfile,
  setIsRecoveringPassword,
  handleDemoMode,
  handleGoogleLogin
}: any) => (
  <div className="space-y-6">
    <div className="space-y-4 animate-in fade-in">
      <div className="bg-slate-800/50 p-2 rounded-2xl border border-slate-700 flex items-center gap-2 focus-within:border-blue-500 transition-colors">
        <div className="p-3 bg-slate-800 rounded-xl">
          <User className="text-slate-400 w-5 h-5" />
        </div>
        <input
          type="email"
          className="bg-transparent w-full text-white outline-none text-sm font-bold"
          placeholder="Seu E-mail"
          value={loginUser || ''}
          onChange={(e) => setLoginUser(e.target.value)}
        />
      </div>

      <div className="bg-slate-800/50 p-2 rounded-2xl border border-slate-700 flex items-center gap-2 relative focus-within:border-blue-500 transition-colors">
        <div className="p-3 bg-slate-800 rounded-xl">
          <KeyRound className="text-slate-400 w-5 h-5" />
        </div>
        <input
          type={showPassword ? 'text' : 'password'}
          className="bg-transparent w-full text-white outline-none text-sm font-bold pr-10"
          placeholder="Senha"
          value={loginPassword || ''}
          onChange={(e) => setLoginPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submitLogin()}
        />
        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 text-slate-500">
          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>

      <button
        onClick={submitLogin}
        disabled={isLoading}
        className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-xs font-black uppercase shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95"
      >
        {isLoading ? <Loader2 className="animate-spin" /> : 'Entrar'}
      </button>

      <button
        onClick={handleGoogleLogin}
        disabled={isLoading}
        className="w-full py-4 bg-white hover:bg-slate-100 text-slate-900 rounded-2xl text-xs font-black uppercase shadow-lg flex items-center justify-center gap-3 transition-all active:scale-95"
      >
        <GoogleIcon /> Entrar com Google
      </button>
    </div>

    <div className="flex gap-2 pt-2 border-t border-slate-800">
      <button onClick={() => setIsCreatingProfile(true)} className="flex-1 py-3 bg-slate-800 text-slate-400 rounded-2xl text-[10px] font-black uppercase">
        Criar Conta
      </button>
      <button
        onClick={() => setIsRecoveringPassword(true)}
        className="flex-1 py-3 bg-slate-800 text-slate-400 rounded-2xl text-[10px] font-black uppercase"
      >
        Esqueci Senha
      </button>
    </div>

    {savedProfiles.length > 0 && (
      <div className="pt-2">
        <p className="text-[10px] text-slate-500 font-bold uppercase mb-2 text-center">Salvos</p>
        <div className="flex flex-col gap-2">
          {savedProfiles.map((p: any) => (
            <div
              key={p.id}
              className="flex items-center gap-3 bg-slate-950 p-2 rounded-xl border border-slate-800 cursor-pointer hover:border-slate-600 transition-colors group"
              onClick={() => handleSelectSavedProfile(p)}
            >
              <div className="w-8 h-8 rounded-lg bg-blue-900/30 flex items-center justify-center text-blue-400 font-black text-xs">
                {p.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 overflow-hidden">
                <p className="text-xs font-bold text-white truncate">{p.name}</p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveSavedProfile(p.id);
                }}
                className="p-2 text-slate-600 hover:text-rose-500"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>
    )}

    <button
      onClick={handleDemoMode}
      className="w-full py-3 border border-dashed border-emerald-600/50 text-emerald-500 hover:bg-emerald-600/10 rounded-2xl text-[10px] font-black uppercase flex items-center justify-center gap-2 transition-all"
    >
      <Beaker size={14} /> Modo DemonstraÃ§Ã£o
    </button>
  </div>
);

/**
 * 4. COMPONENTE PRINCIPAL
 */
export const AuthScreen: React.FC<AuthScreenProps> = ({
  loginUser,
  setLoginUser,
  loginPassword,
  setLoginPassword,
  submitLogin,
  submitTeamLogin,
  isLoading,
  savedProfiles,
  handleSelectSavedProfile,
  handleRemoveSavedProfile,
  showToast,
  toast,
  supportNumber
}) => {
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);
  const [isRecoveringPassword, setIsRecoveringPassword] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { inviteToken, inviteData, isProcessing: isProcessingInvite, cancelInvite } = useInviteFlow(showToast);
  const { form: memberForm, setForm: setMemberForm, handleActivate: handleActivateMember, errorText, isProcessing: isActivatingMember } = useMemberActivation(
    inviteData,
    submitTeamLogin,
    showToast
  );
  const { form: createForm, setForm: setCreateForm, handleCreate: handleCreateProfile } = useCreateProfile(
    setLoginUser,
    setIsCreatingProfile,
    showToast,
    (_l: any) => {}
  );
  const { form: recoveryForm, setForm: setRecoveryForm, handleHelpSupport, handleRecovery } = useRecoveryAndSupport(
    setIsRecoveringPassword,
    showToast,
    supportNumber
  );

  const handleDemoMode = () => {
    localStorage.setItem('cm_session', JSON.stringify({ profileId: 'DEMO', ts: Date.now() }));
    window.location.reload();
  };

  const handleGoogleLogin = async () => {
    try {
      if (isDev) console.log('[AUTH_SCREEN] Iniciando login com Google...');
      // Limpa qualquer resquÃ­cio de sessÃ£o anterior antes de iniciar OAuth
      localStorage.removeItem('cm_session');
      
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + '/',
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          }
        }
      });

      if (error) {
        if (isDev) console.error('[AUTH_SCREEN] Erro no signInWithOAuth:', error.message);
        throw error;
      }
    } catch (e: any) {
      console.error('[AUTH_SCREEN] Erro ao iniciar login Google:', e);
      showToast(e.message, 'error');
    }
  };

  return (
    <div className="min-h-[100dvh] bg-slate-950 flex items-start sm:items-center justify-center p-4 md:p-6 relative overflow-y-auto py-8">
      {/* Toasts are now handled by sonner in App.tsx */}

      <div className="absolute top-6 right-6 z-50">
        <button onClick={() => setShowHelpModal(true)} className="p-3 bg-slate-800/50 rounded-full text-slate-400 hover:text-white transition-all">
          <HelpCircle size={24} />
        </button>
      </div>

      <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl relative flex flex-col justify-center animate-in zoom-in-95 duration-300">
        <div className="absolute inset-0 bg-blue-600/5 blur-3xl rounded-full pointer-events-none"></div>

        {inviteToken && inviteData ? (
          <InviteActivationView
            inviteData={inviteData}
            form={memberForm}
            setForm={setMemberForm}
            onConfirm={handleActivateMember}
            isLoading={isActivatingMember || isProcessingInvite}
            errorText={errorText}
            onCancel={cancelInvite}
          />
        ) : (
          <>
            <div className="relative z-10 text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl shadow-lg shadow-blue-600/20 mb-4">
                <TrendingUp className="text-white w-8 h-8" />
              </div>
              <h1 className="text-2xl font-black text-white uppercase tracking-tighter mb-1">
                Capital<span className="text-blue-500">Flow</span>
              </h1>
              <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Acesso Restrito</p>
            </div>

            {!isCreatingProfile && !isRecoveringPassword && (
              <LoginView
                loginUser={loginUser}
                setLoginUser={setLoginUser}
                loginPassword={loginPassword}
                setLoginPassword={setLoginPassword}
                showPassword={showPassword}
                setShowPassword={setShowPassword}
                submitLogin={submitLogin}
                isLoading={isLoading}
                savedProfiles={savedProfiles}
                handleSelectSavedProfile={handleSelectSavedProfile}
                handleRemoveSavedProfile={handleRemoveSavedProfile}
                setIsCreatingProfile={setIsCreatingProfile}
                setIsRecoveringPassword={setIsRecoveringPassword}
                handleDemoMode={handleDemoMode}
                handleGoogleLogin={handleGoogleLogin}
              />
            )}

            {isCreatingProfile && (
              <div className="animate-in slide-in-from-right duration-300 space-y-4">
                <h3 className="text-center text-white font-black uppercase text-sm">Nova Conta</h3>
                <input
                  type="text"
                  placeholder="Seu Nome"
                  className="w-full bg-slate-800 p-4 rounded-xl text-white outline-none"
                  value={createForm.name || ''}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                />
                <input
                  type="email"
                  placeholder="E-mail"
                  className="w-full bg-slate-800 p-4 rounded-xl text-white outline-none"
                  value={createForm.email || ''}
                  onChange={(e) => setCreateForm({ ...createForm, email: normalizeEmailAddress(e.target.value) })}
                />
                <input
                  type="password"
                  placeholder="Senha"
                  className="w-full bg-slate-800 p-4 rounded-xl text-white outline-none"
                  value={createForm.password || ''}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                />
                <button onClick={handleCreateProfile} className="w-full py-4 bg-blue-600 text-white rounded-xl font-black uppercase text-xs">
                  Criar Perfil
                </button>
                <button
                  onClick={handleGoogleLogin}
                  className="w-full py-4 bg-white hover:bg-slate-100 text-slate-900 rounded-xl font-black uppercase text-xs flex items-center justify-center gap-3 transition-all active:scale-95"
                >
                  <GoogleIcon /> Criar com Google
                </button>
                <button onClick={() => setIsCreatingProfile(false)} className="w-full text-slate-500 text-[10px] uppercase font-bold">
                  Voltar
                </button>
              </div>
            )}

            {isRecoveringPassword && (
              <div className="animate-in slide-in-from-left duration-300 space-y-4">
                <h3 className="text-center text-white font-black uppercase text-sm">Recuperar</h3>
                <input
                  type="email"
                  placeholder="Seu e-mail cadastrado"
                  className="w-full bg-slate-800 p-4 rounded-xl text-white outline-none"
                  value={recoveryForm.email || ''}
                  onChange={(e) => setRecoveryForm({ ...recoveryForm, email: normalizeEmailAddress(e.target.value) })}
                />
                <button onClick={handleRecovery} className="w-full py-4 bg-blue-600 text-white rounded-xl font-black uppercase text-xs">
                  Enviar E-mail
                </button>
                <button onClick={() => setIsRecoveringPassword(false)} className="w-full text-slate-500 text-[10px] uppercase font-bold">
                  Voltar
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {showHelpModal && (
        <Modal onClose={() => setShowHelpModal(false)} title="Suporte">
          <div className="space-y-4">
            <button
              onClick={() => handleHelpSupport('password')}
              className="w-full p-4 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-between hover:bg-slate-800 transition-all"
            >
              <span className="text-sm font-bold text-white">Esqueci a Senha</span>
              <ChevronRight size={16} className="text-slate-500" />
            </button>
            <button
              onClick={() => handleHelpSupport('access')}
              className="w-full p-4 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-between hover:bg-slate-800 transition-all"
            >
              <span className="text-sm font-bold text-white">NÃ£o consigo entrar</span>
              <ChevronRight size={16} className="text-slate-500" />
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};

interface AuthScreenProps {
  loginUser: string;
  setLoginUser: (v: string) => void;
  loginPassword: string;
  setLoginPassword: (v: string) => void;
  submitLogin: () => void;
  submitTeamLogin: (params: { document: string; phone: string; code: string }, showToast: (msg: string, type?: any) => void) => Promise<void>;
  isLoading: boolean;
  savedProfiles: any[];
  handleSelectSavedProfile: (p: any) => void;
  handleRemoveSavedProfile: (id: string) => void;
  showToast: (msg: string, type?: any) => void;
  toast?: any;
  supportNumber?: string;
}
