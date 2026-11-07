import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { isNewPublishedVersion, parsePublishedVersion } from '../../utils/appVersion';
import { dismissReleaseNotice, isReleaseNoticeDismissed } from '../../utils/releaseNotice';

declare const __CAPITALFLOW_BUILD_ID__: string;

const CHECK_INTERVAL_MS = 60_000;

/** Notices are offered only after the NEW deployment is actually served. */
export const AppUpdateBanner: React.FC<{ placement: 'notifications' }> = () => {
  const [availableBuild, setAvailableBuild] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    // Never poll a Cloudflare deployment from development or native-app localhost.
    if (Capacitor.isNativePlatform() || !import.meta.env.PROD ||
      !['http:', 'https:'].includes(window.location.protocol) ||
      ['localhost', '127.0.0.1'].includes(window.location.hostname)) return;

    let mounted = true;
    const abort = new AbortController();
    let inFlight = false;

    const checkVersion = async () => {
      if (inFlight || !navigator.onLine || document.visibilityState === 'hidden') return;
      inFlight = true;
      try {
        const result = await fetch(`/version.json?verificacao=${Date.now()}`, {
          cache: 'no-store',
          headers: { Accept: 'application/json' },
          signal: abort.signal,
        });
        // A missing file might be rewritten to index.html by SPA routing.
        if (!result.ok || !(result.headers.get('content-type') || '').includes('application/json')) {
          return;
        }
        const remote = parsePublishedVersion(await result.json());
        if (mounted && isNewPublishedVersion(__CAPITALFLOW_BUILD_ID__, remote)) {
          setAvailableBuild(remote!.buildId);
          setHidden(isReleaseNoticeDismissed('web-update', remote!.buildId));
        }
      } catch {
        // Offline, missing manifest or interrupted requests do not force a reload.
      } finally {
        inFlight = false;
      }
    };

    const onReturn = () => { void checkVersion(); };
    const starting = window.setTimeout(onReturn, 0);
    const periodic = window.setInterval(onReturn, CHECK_INTERVAL_MS);
    window.addEventListener('focus', onReturn);
    window.addEventListener('online', onReturn);
    document.addEventListener('visibilitychange', onReturn);
    return () => {
      mounted = false;
      abort.abort();
      window.clearTimeout(starting);
      window.clearInterval(periodic);
      window.removeEventListener('focus', onReturn);
      window.removeEventListener('online', onReturn);
      document.removeEventListener('visibilitychange', onReturn);
    };
  }, []);

  const applyUpdate = useCallback(async () => {
    if (applying) return;
    setApplying(true);
    try {
      const registration = 'serviceWorker' in navigator
        ? await navigator.serviceWorker.getRegistration()
        : null;
      if (registration?.waiting) {
        // Only the explicit user click authorizes replacing the active worker.
        let navigated = false;
        const reload = () => {
          if (navigated) return;
          navigated = true;
          window.location.reload();
        };
        navigator.serviceWorker.addEventListener('controllerchange', reload, { once: true });
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        window.setTimeout(reload, 4_000);
      } else {
        window.location.reload();
      }
    } catch {
      window.location.reload();
    } finally {
      // A beforeunload guard may keep the user on this page.
      window.setTimeout(() => setApplying(false), 5_000);
    }
  }, [applying]);

  const dismiss = () => {
    if (!availableBuild) return;
    dismissReleaseNotice('web-update', availableBuild);
    setHidden(true);
  };

  if (Capacitor.isNativePlatform() || !import.meta.env.PROD || !availableBuild || hidden) return null;

  return <section aria-label="Atualização web disponível"
    className="mx-2 mb-2 rounded-xl border border-blue-500/25 bg-blue-950/20 p-3">
    <div className="flex items-center gap-2 text-xs font-bold text-blue-200">
      <RefreshCw size={16}/> Atualização disponível
    </div>
    <p className="mt-1 text-xs text-slate-300">
      Há melhorias disponíveis. Salve suas alterações antes de atualizar.
    </p>
    <div className="mt-2 flex flex-wrap items-center gap-3">
      <button type="button" disabled={applying} onClick={() => { void applyUpdate(); }}
        className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60">
        <RefreshCw size={15} className={applying ? 'animate-spin' : ''}/>
        {applying ? 'Atualizando...' : 'Atualizar agora'}
      </button>
      <button type="button" onClick={dismiss}
        className="min-h-10 text-xs font-semibold text-slate-300">Agora não</button>
    </div>
  </section>;
};
