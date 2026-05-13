import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

export const useExitGuard = (
  activeUser: any,
  activeTab: string,
  setActiveTab: (tab: any) => void,
  isPublicView: boolean,
  showToast: (msg: string, type?: any) => void,
  ui?: any 
) => {
  const lastBackPress = useRef<number>(0);

  // 1. Proteção Web (Confirmação ao fechar aba/recarregar)
  useEffect(() => {
    if (!activeUser || isPublicView) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!activeUser) return;
      e.preventDefault();
      e.returnValue = 'As alterações não salvas serão perdidas. Deseja realmente sair?';
      return e.returnValue;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [activeUser, isPublicView]);

  // 3. Interceptação de Teclas de Atualização (F5, Ctrl+R, Cmd+R)
  useEffect(() => {
    if (!activeUser || isPublicView) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // F5 ou Ctrl+R ou Cmd+R
      if (
        e.key === 'F5' ||
        ((e.ctrlKey || e.metaKey) && e.key === 'r')
      ) {
        e.preventDefault();
        showToast('Atualização bloqueada para manter o sistema online. Use o menu para sair.', 'warning');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeUser, isPublicView, showToast]);

  // 2. Proteção de Botão Voltar (Android PWA / Mobile Browser)
  useEffect(() => {
    if (!activeUser || isPublicView) return;

    const isAndroid = /Android/i.test(navigator.userAgent);
    
    // Mantém um estado à frente para interceptar o popstate
    if (window.history.state?.anchor !== true) {
      window.history.pushState({ anchor: true }, '', window.location.href);
    }

    const handlePopState = (e: PopStateEvent) => {
      // 1. Prioridade: Fechar Modais Abertos
      if (ui?.activeModal) {
        ui.closeModal();
        window.history.pushState({ anchor: true }, '', window.location.href);
        return;
      }

      // 2. Se não estiver no Dashboard, volta para ele primeiro
      if (activeTab !== 'DASHBOARD') {
        setActiveTab('DASHBOARD');
        window.history.pushState({ anchor: true }, '', window.location.href);
        return;
      }

      // 3. Lógica de Saída (Duplo Toque)
      const now = Date.now();
      const diff = now - lastBackPress.current;

      if (diff < 2000 && lastBackPress.current !== 0) {
        // Segundo toque em menos de 2s: permite a ação padrão do histórico
        // Em PWA instalado, tentamos fechar
        if (isAndroid && window.matchMedia('(display-mode: standalone)').matches) {
          window.close();
        }
      } else {
        // Primeiro toque: Avisa e empurra o histórico de volta para segurar
        lastBackPress.current = now;
        showToast('Pressione novamente para sair do CapitalFlow', 'warning');
        window.history.pushState({ anchor: true }, '', window.location.href);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [activeUser, activeTab, isPublicView, showToast, setActiveTab, ui?.activeModal]);
};