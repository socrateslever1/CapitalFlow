// components/AppGate.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { ClientPortalView } from '../containers/ClientPortal/ClientPortalView';
import { PublicSignaturePage } from '../pages/Public/PublicSignaturePage';
import { PublicLoanLeadPage } from '../pages/PublicLoanLeadPage';
import { CampanhaLanding } from '../pages/Campanha/CampanhaLanding';
import { CampanhaChat } from '../pages/Campanha/CampanhaChat';
import { AuthScreen } from '../features/auth/AuthScreen';
import { Lock, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { notificationService } from '../services/notification.service';
import { playNotificationSound } from '../utils/notificationSound';
import { AlertTriangle } from 'lucide-react';

interface AppGateProps {
  portalToken?: string | null;
  portalCode?: string | null;
  legalSignToken?: string | null;

  activeProfileId: string | null;
  activeUser: any | null;

  isLoadingData: boolean;
  loadError: string | null;

  loginUser: string;
  setLoginUser: (v: string) => void;
  loginPassword: string;
  setLoginPassword: (v: string) => void;

  submitLogin: (setLoading: any, setToast: any) => void;
  submitTeamLogin: (params: any, showToast: any) => Promise<void>;

  savedProfiles: any[];
  handleSelectSavedProfile: (p: any, toast: any) => void;
  handleRemoveSavedProfile: (id: string) => void;

  showToast: (msg: string, type?: any) => void;
  setIsLoadingData: (v: boolean) => void;
  toast: any;

  children: React.ReactNode;

  reauthenticate: (pass: string) => Promise<void>;
  onReauthSuccess: () => void;
  handleLogout: () => void;
}

export const AppGate: React.FC<AppGateProps> = ({
  portalToken,
  portalCode,
  legalSignToken,
  activeUser,
  activeProfileId,
  children,

  loginUser,
  setLoginUser,
  loginPassword,
  setLoginPassword,
  submitLogin,
  submitTeamLogin,
  savedProfiles,
  handleSelectSavedProfile,
  handleRemoveSavedProfile,

  isLoadingData,
  setIsLoadingData,
  showToast,
  toast,
  loadError,

  reauthenticate,
  onReauthSuccess,
  handleLogout,
}) => {
  // ✅ Hooks SEMPRE antes de qualquer return
  const [reauthPass, setReauthPass] = useState('');
  const [isReauthing, setIsReauthing] = useState(false);

  const { params, campaignId, path, isPublicLoanLead } = useMemo(() => {
    const p = new URLSearchParams(window.location.search);
    const cid = p.get('campaign_id');
    const pathname = window.location.pathname;
    return {
      params: p,
      campaignId: cid,
      path: pathname,
      isPublicLoanLead: p.get('public') === 'emprestimo',
    };
  }, []);

  useEffect(() => {
    if (loadError && loadError !== 'SESSAO_EXPIRADA') {
      showToast(loadError, 'error');
    }
  }, [loadError, showToast]);

  // 4. Usuário Autenticado: Renderiza o App Shell + Modal de Reauth se necessário
  useEffect(() => {
    // Só ativa se estiver logado e NÃO estiver em rotas públicas (portal/legal)
    if (activeUser && activeProfileId && !portalToken && !legalSignToken) {
        const channel = supabase.channel('rt_campaign_lead_messages')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'campaign_messages', filter: 'sender=eq.LEAD' },
                (payload) => {
                    const msg = payload.new as any;
                    notificationService.notify(
                        'Novo lead no chat',
                        msg?.message ?? 'Mensagem nova'
                    );
                    playNotificationSound();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }
  }, [activeUser, activeProfileId, portalToken, legalSignToken]);

  const handleReauthSubmit = async () => {
    if (!reauthPass) return;
    setIsReauthing(true);
    try {
      await reauthenticate(reauthPass);
      setReauthPass('');
      onReauthSuccess();
    } catch (e: any) {
      showToast(e?.message || 'Senha incorreta.', 'error');
    } finally {
      setIsReauthing(false);
    }
  };

  // =========================
  // Rotas públicas
  // =========================
  if (isPublicLoanLead) {
    return <PublicLoanLeadPage />;
  }

  if (path === '/campanha/chat') {
    return <CampanhaChat />;
  }

  if (path === '/campanha' || !!campaignId) {
    if (!campaignId) {
      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-500 text-sm font-bold uppercase">
          Campanha não especificada.
        </div>
      );
    }
    return <CampanhaLanding campaignId={campaignId} />;
  }

  if (portalToken) {
    return <ClientPortalView initialPortalToken={portalToken} initialPortalCode={portalCode || ''} />;
  }

  if (legalSignToken) {
    return <PublicSignaturePage />;
  }

  // 0. Erro crítico de carregamento
  if (loadError && loadError !== 'SESSAO_EXPIRADA') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-center">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-lg p-10 shadow-2xl relative overflow-hidden">
          <div className="absolute inset-0 bg-rose-600/5 blur-3xl rounded-full pointer-events-none" />

          <div className="w-20 h-20 bg-rose-950/30 rounded-full flex items-center justify-center mx-auto mb-8 border border-rose-500/20">
            <AlertTriangle className="text-rose-500" size={40} />
          </div>

          <h2 className="text-white font-black text-2xl uppercase tracking-tight mb-4 leading-tight">
            Ops! Algo deu errado na sincronização
          </h2>

          <p className="text-slate-400 text-sm font-medium mb-8 leading-relaxed">
            {loadError === 'Tempo limite de sincronização excedido. Verifique sua conexão ou tente reconectar.'
              ? 'Não conseguimos carregar seus dados a tempo. Isso pode ser instabilidade na rede ou um problema temporário no servidor.'
              : loadError}
          </p>

          <div className="space-y-3">
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-white hover:bg-slate-100 text-slate-950 font-black uppercase text-xs py-4 rounded-full shadow-lg transition-all flex items-center justify-center gap-2"
            >
              Tentar Novamente
            </button>
            <button
              onClick={handleLogout}
              className="w-full bg-slate-800 hover:bg-slate-700 text-slate-400 font-bold uppercase text-[10px] py-3 rounded-full transition-all"
            >
              Voltar ao Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  // =========================
  // Rota privada: login
  // =========================
  // 1. Sem usuário do Auth
  if (!activeUser) {
    return (
      <AuthScreen
        loginUser={loginUser}
        setLoginUser={setLoginUser}
        loginPassword={loginPassword}
        setLoginPassword={setLoginPassword}
        submitLogin={() => submitLogin(setIsLoadingData, showToast)}
        submitTeamLogin={submitTeamLogin}
        savedProfiles={savedProfiles}
        handleSelectSavedProfile={(p) => handleSelectSavedProfile(p, showToast)}
        handleRemoveSavedProfile={handleRemoveSavedProfile}
        isLoading={isLoadingData}
        showToast={showToast}
        toast={toast}
        supportNumber={savedProfiles[0]?.contato_whatsapp}
      />
    );
  }

  // 2. Com usuário mas sem Perfil (Aguardando sincronização ou falha na Trigger)
  // ✅ REMOVIDO BLOQUEIO: O AppGate agora permite carregar o app mesmo sem profileId,
  // deixando que o useAppState lide com a identidade temporária.

  // =========================
  // Usuário autenticado
  // =========================
  return (
    <>
      {children}

      {loadError === 'SESSAO_EXPIRADA' && (
        <div className="fixed top-4 right-4 z-[200] w-80 bg-slate-900 border border-amber-500/50 rounded-lg p-5 shadow-2xl shadow-black/50 animate-in slide-in-from-top-4 duration-300">
          <div className="flex items-start gap-3 mb-4">
            <div className="bg-amber-500/10 p-2 rounded-full">
              <Lock className="text-amber-500" size={18} />
            </div>
            <div>
              <h3 className="text-white font-bold text-sm">Sincronização Pausada</h3>
              <p className="text-slate-400 text-[10px] leading-tight mt-1">Sua sessão expirou. Você está operando offline. Digite a senha para reconectar.</p>
            </div>
          </div>

          <div className="space-y-2">
            <input
              type="password"
              value={reauthPass}
              onChange={(e) => setReauthPass(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleReauthSubmit()}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-xs font-bold outline-none focus:border-amber-500 transition-colors"
              placeholder="Senha"
            />
            <button
              onClick={handleReauthSubmit}
              disabled={isReauthing || !reauthPass}
              className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs py-2 rounded-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isReauthing ? <Loader2 className="animate-spin" size={14} /> : 'Reconectar Nuvem'}
            </button>
          </div>
        </div>
      )}
    </>
  );
};