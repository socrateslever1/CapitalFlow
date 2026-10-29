import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as NativeApp } from '@capacitor/app';
import type { NavigateFunction } from 'react-router-dom';
import { requestDialogBack } from '../utils/dialogNavigation';
import { getRouteBackFallback, resolveBackTarget } from '../utils/nativeBackNavigation';

interface BackNavigationOptions {
  pathname: string;
  navigate: NavigateFunction;
  goBackTab: () => void;
}

export const useExitGuard = (
  activeUser: any,
  activeTab: string,
  setActiveTab: (tab: any) => void,
  isPublicView: boolean,
  showToast: (msg: string, type?: any) => void,
  ui: any,
  options: BackNavigationOptions,
) => {
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const exitOpenRef = useRef(false);
  const isNativeAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

  const cancelExit = useCallback(() => {
    exitOpenRef.current = false;
    setShowExitConfirm(false);
  }, []);

  const confirmExit = useCallback(() => {
    exitOpenRef.current = false;
    setShowExitConfirm(false);
    if (isNativeAndroid) {
      void NativeApp.exitApp();
    } else {
      // Browser/PWA windows cannot always be closed by JavaScript.
      window.close();
    }
  }, [isNativeAndroid]);

  const backRef = useRef<() => void>(() => {});
  backRef.current = () => {
    // Second back press while the confirmation is displayed dismisses it.
    if (exitOpenRef.current) {
      cancelExit();
      return;
    }

    // Registered dialogs and local pages have first priority.
    if (requestDialogBack()) return;

    const backRequest = new Event('capitalflow:back', { cancelable: true });
    if (!window.dispatchEvent(backRequest)) return;

    const target = resolveBackTarget({
      hasModal: !!ui?.activeModal,
      hubOpen: !!ui?.showNavHub,
      pathname: options.pathname,
      activeTab,
    });

    if (target === 'modal') {
      ui?.closeModal?.();
      return;
    }
    if (target === 'hub') {
      ui?.setShowNavHub?.(false);
      return;
    }
    if (target === 'route') {
      const index = Number(window.history.state?.idx ?? 0);
      // The wallet is a real set of React Router routes, not one fake tab.
      // A direct link has no previous in-app route and uses a safe fallback.
      if (index > 0) {
        options.navigate(-1);
      } else {
        const fallback = getRouteBackFallback(options.pathname);
        options.navigate(fallback, { replace: true });
        if (fallback === '/') setActiveTab('DASHBOARD');
      }
      return;
    }
    if (target === 'tab') {
      // Uses the existing local navigation stack, not an unconditional
      // return to the dashboard that would lose intermediate pages.
      options.goBackTab();
      return;
    }

    // Only the genuine home screen can offer to exit the native process.
    exitOpenRef.current = true;
    setShowExitConfirm(true);
  };

  // Native Capacitor back button/Android gesture is not a browser popstate.
  // Keep ONE listener and dispatch to the latest React navigation state.
  useEffect(() => {
    if (!isNativeAndroid) return;
    let disposed = false;
    let listener: { remove: () => Promise<void> } | null = null;
    void NativeApp.addListener('backButton', () => backRef.current())
      .then(handle => {
        if (disposed) void handle.remove();
        else listener = handle;
      })
      .catch(error => console.error('[ANDROID_BACK] Nao foi possivel registrar o retorno nativo', error));

    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      // Android desktop / physical keyboard; Android gesture uses the plugin.
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      event.preventDefault();
      backRef.current();
    };
    window.addEventListener('keydown', onEscape);
    return () => {
      disposed = true;
      window.removeEventListener('keydown', onEscape);
      if (listener) void listener.remove();
    };
  }, [isNativeAndroid]);

  // Standalone web PWA supports the same back stack. Ordinary browsers retain
  // their native history semantics so routes, external pages and navigation work.
  useEffect(() => {
    if (isNativeAndroid || isPublicView || !activeUser) return;
    if (!window.matchMedia('(display-mode: standalone)').matches) return;

    const anchor = { ...(window.history.state || {}), cfBackAnchor: true };
    if (!window.history.state?.cfBackAnchor) {
      window.history.pushState(anchor, '', window.location.href);
    }
    const onPopState = () => {
      backRef.current();
      if (!window.history.state?.cfBackAnchor) {
        window.history.pushState({ ...(window.history.state || {}), cfBackAnchor: true }, '', window.location.href);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [isNativeAndroid, isPublicView, !!activeUser]);

  // Keep the SaaS browser confirmation on actual tab closure/reload. Android
  // exit is handled by our explicit dialog and must not trigger beforeunload.
  useEffect(() => {
    if (isNativeAndroid || !activeUser || isPublicView) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [activeUser, isNativeAndroid, isPublicView]);

  // Preserve the existing protection against accidental browser refreshes.
  useEffect(() => {
    if (isNativeAndroid || !activeUser || isPublicView) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'F5' || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'r')) {
        event.preventDefault();
        showToast('Atualização bloqueada para manter o sistema online. Use o menu para sair.', 'warning');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeUser, isNativeAndroid, isPublicView, showToast]);

  return { showExitConfirm, cancelExit, confirmExit };
};
