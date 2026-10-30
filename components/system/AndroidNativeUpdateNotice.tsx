import React, { useEffect, useState } from 'react';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Download, RefreshCw, X } from 'lucide-react';

const RELEASE_API = 'https://api.github.com/repos/socrateslever1/CapitalFlow/releases/tags/android-signed-beta';
const RELEASE_ASSET_PATH = '/socrateslever1/CapitalFlow/releases/download/android-signed-beta/CapitalFlow-Android.apk';

type Update = { versionCode: number; downloadUrl: string };
export function parseSignedAndroidRelease(payload: unknown, installedCode: number): Update | null {
  if (!payload || typeof payload !== 'object') return null;
  const data = payload as { body?: unknown; assets?: Array<{ name?: unknown; browser_download_url?: unknown }> };
  const version = /versionCode:\s*(\d+)/.exec(typeof data.body === 'string' ? data.body : '');
  const versionCode = Number(version?.[1] || 0);
  if (!Number.isSafeInteger(versionCode) || versionCode <= installedCode) return null;
  const asset = data.assets?.find(item => item.name === 'CapitalFlow-Android.apk');
  if (typeof asset?.browser_download_url !== 'string') return null;
  try {
    const link = new URL(asset.browser_download_url);
    if (link.protocol !== 'https:' || link.hostname !== 'github.com' || link.pathname !== RELEASE_ASSET_PATH) return null;
    return { versionCode, downloadUrl: link.toString() };
  } catch {
    return null;
  }
}

/** Native APK update discovery: compare the signed release versionCode with App.getInfo().build. */
export const AndroidNativeUpdateNotice: React.FC = () => {
  const [update, setUpdate] = useState<Update | null>(null);
  const [dismissedCode, setDismissedCode] = useState(0);
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
    let active = true;
    let listener: { remove: () => Promise<void> } | null = null;
    let inFlight = false;
    let lastCheck = 0;

    const check = async () => {
      if (!navigator.onLine || inFlight || Date.now() - lastCheck < 60_000) return;
      inFlight = true;
      lastCheck = Date.now();
      try {
        const info = await App.getInfo();
        const installedCode = Number(info.build);
        if (!Number.isSafeInteger(installedCode) || installedCode < 1) return;
        const response = await fetch(RELEASE_API, {
          headers: { Accept: 'application/vnd.github+json' },
          cache: 'no-store',
        });
        if (!response.ok) return;
        const next = parseSignedAndroidRelease(await response.json(), installedCode);
        if (active) setUpdate(next);
      } catch {
        // Sem internet não se mostra uma versão não confirmada.
      } finally {
        inFlight = false;
      }
    };
    void check();
    void App.addListener('resume', () => { void check(); }).then(handle => {
      if (!active) { void handle.remove(); return; }
      listener = handle;
    }).catch(() => {});
    const onOnline = () => { void check(); };
    window.addEventListener('online', onOnline);
    return () => {
      active = false;
      window.removeEventListener('online', onOnline);
      if (listener) void listener.remove();
    };
  }, []);

  if (!update || update.versionCode === dismissedCode) return null;
  return <aside role="status" aria-live="polite" aria-label="Atualização do aplicativo Android"
    className="fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom))] left-3 right-3 z-[1750] mx-auto max-w-sm rounded-xl border border-cyan-500/40 bg-slate-900 p-3 text-white shadow-2xl shadow-black/60 md:bottom-5 md:left-auto md:right-5">
    <button type="button" onClick={() => setDismissedCode(update.versionCode)}
      aria-label="Dispensar atualização do APK" className="absolute right-2 top-2 rounded-lg p-1.5 text-slate-400"><X size={16}/></button>
    <div className="flex items-center gap-2 pr-7 text-sm font-semibold"><RefreshCw size={16} className="text-cyan-300"/> Nova versão do aplicativo</div>
    <p className="mt-1 text-xs text-slate-300">Existe um APK mais recente e assinado disponível para atualizar o CapitalFlow.</p>
    <a href={update.downloadUrl} target="_blank" rel="noopener noreferrer"
      className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white">
      <Download size={15}/> Abrir download da atualização
    </a>
  </aside>;
};
