import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { isNewPublishedVersion, parsePublishedVersion } from '../../utils/appVersion';
import { claimReleaseNotice } from '../../utils/releaseNotice';

declare const __CAPITALFLOW_BUILD_ID__: string;

const CHECK_INTERVAL_MS = 60_000;

/** Notices are offered only after the NEW deployment is actually served. */
export const AppUpdateBanner: React.FC<{ placement?: 'banner' | 'notifications' }> = ({ placement = 'banner' }) => {
  const [availableBuild, setAvailableBuild] = useState<string | null>(null);
  const [dismissedBuild, setDismissedBuild] = useState<string | null>(null);
  const [bannerBuild, setBannerBuild] = useState<string | null>(null);
  const [declinedInBell, setDeclinedInBell] = useState(false);
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
          if (placement === 'banner' && claimReleaseNotice('web-update', remote!.buildId)) {
            setBannerBuild(remote!.buildId);
          }
        }
      } catch {
        // Offline, missing manifest or interrupted requests do not force a reload.
      } finally {
        inFlight = false;
      }
    };

    const onReturn = () => { void checkVersion(); };
    const starting = window.setTimeout(onReturn, placement === 'notifications' ? 0 : 1_500);
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
  }, [placement]);

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

  if (Capacitor.isNativePlatform() || !import.meta.env.PROD || !availableBuild) return null;

  if (placement === 'notifications') {
    return <section aria-label="Atualização web disponível"
      className="mx-2 mb-2 rounded-xl border border-blue-500/25 bg-blue-950/20 p-3">
      <div className="flex items-center gap-2 text-xs font-bold text-blue-200">
        <RefreshCw size={16}/> Nova versão do CapitalFlow
      </div>
      <p className="mt-1 text-xs text-slate-300">
        {declinedInBell ? 'Atualização adiada. Você pode atualizar por aqui.' :
          'Salve suas alterações antes de atualizar.'}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button type="button" disabled={applying} onClick={() => { void applyUpdate(); }}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60">
          <RefreshCw size={15} className={applying ? 'animate-spin' : ''}/>
          {applying ? 'Atualizando...' : 'Atualizar página'}
        </button>
        <button type="button" onClick={() => setDeclinedInBell(true)}
          className="min-h-10 text-xs font-semibold text-slate-300">Agora não</button>
      </div>
    </section>;
  }

  if (availableBuild !== bannerBuild || availableBuild === dismissedBuild) return null;

  return <aside role="status" aria-live="polite" aria-label="Atualização do CapitalFlow"
    className="fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom))] left-3 right-3 z-[1800] mx-auto max-w-sm rounded-2xl border border-blue-400/40 bg-slate-900 p-4 text-white shadow-2xl shadow-black/60 sm:bottom-6 sm:left-auto sm:right-6">
    <button type="button" onClick={() => setDismissedBuild(availableBuild)}
      aria-label="Lembrar da atualização mais tarde"
      className="absolute right-3 top-3 rounded-lg p-1 text-slate-400 hover:text-white">
      <X size={17} />
    </button>
    <div className="pr-7 text-sm font-bold">Nova atualização disponível</div>
    <p className="mt-1 text-xs text-slate-300">
      Salve suas alterações antes de atualizar.
    </p>
    <div className="mt-3 flex items-center gap-3">
      <button type="button" disabled={applying} onClick={() => { void applyUpdate(); }}
        className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-500 disabled:opacity-60">
        <RefreshCw size={15} className={applying ? 'animate-spin' : ''}/>
        {applying ? 'Atualizando...' : 'Atualizar página'}
      </button>
      <button type="button" onClick={() => setDismissedBuild(availableBuild)}
        className="text-xs font-semibold text-slate-400 hover:text-white">
        Depois
      </button>
    </div>
  </aside>;
};
