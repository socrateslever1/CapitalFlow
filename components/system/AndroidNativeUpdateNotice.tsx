import React, { useEffect, useState } from 'react';
import { App } from '@capacitor/app';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Download, RefreshCw, X } from 'lucide-react';

const RELEASE_API = 'https://api.github.com/repos/socrateslever1/CapitalFlow/releases/tags/android-signed-beta';
const RELEASE_ASSET_PATH = '/socrateslever1/CapitalFlow/releases/download/android-signed-beta/CapitalFlow-Android.apk';

type Update = { versionCode: number; downloadUrl: string };
type NativeInstallStatus = { stage: string; message?: string };
type InAppInstaller = {
  downloadAndInstall: () => Promise<{ stage: string }>;
  consumeInstallStatus: () => Promise<NativeInstallStatus>;
};
const apkInstaller = registerPlugin<InAppInstaller>('CapitalFlowApkInstaller');
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
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string|null>(null);
  const [installNotice, setInstallNotice] = useState<string|null>(null);
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
    let active = true;
    let listener: { remove: () => Promise<void> } | null = null;
    let inFlight = false;
    let lastCheck = 0;

    const readInstallStatus = async () => {
      try {
        const status = await apkInstaller.consumeInstallStatus();
        if (!active) return;
        if (status.stage === 'ERROR') {
          setInstallError(status.message || 'A atualização foi recusada pelo Android.');
          setInstallNotice(null);
        } else if (status.stage === 'AWAITING_CONFIRMATION') {
          setInstallNotice('Confirme a instalação na tela do Android.');
        } else if (status.stage === 'SUCCESS') {
          setInstallError(null);
          setInstallNotice('Atualização instalada. Abra novamente o CapitalFlow.');
          void check();
        }
      } catch {
        // Old builds lack the status method. They still receive the normal update notice.
      }
    };

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
    void readInstallStatus();
    void App.addListener('resume', () => {
      void check();
      void readInstallStatus();
      // Installer results can be delivered after the activity resumes.
      window.setTimeout(() => { if (active) void readInstallStatus(); }, 1500);
    }).then(handle => {
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

  const install = async () => {
    if (installing || !update) return;
    setInstalling(true);
    setInstallError(null);
    setInstallNotice(null);
    try {
      // Native Plugin verifies SHA, cert, version, then stages via PackageInstaller.Session.
      // Starting a system session is not proof that Android installed anything.
      await apkInstaller.downloadAndInstall();
      setInstallNotice('O APK foi enviado ao Android. Confirme a instalação solicitada.');
    } catch (error) {
      setInstallError(error instanceof Error ? error.message : 'Não foi possível instalar a atualização.');
    } finally {
      setInstalling(false);
    }
  };

  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android' ||
      !update || update.versionCode === dismissedCode) return null;
  return <aside role="status" aria-live="polite" aria-label="Atualização do aplicativo Android"
    className="fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom))] left-3 right-3 z-[1750] mx-auto max-w-sm rounded-xl border border-cyan-500/40 bg-slate-900 p-3 text-white shadow-2xl shadow-black/60 md:bottom-5 md:left-auto md:right-5">
    <button type="button" onClick={() => setDismissedCode(update.versionCode)}
      aria-label="Dispensar atualização do APK" className="absolute right-2 top-2 rounded-lg p-1.5 text-slate-400"><X size={16}/></button>
    <div className="flex items-center gap-2 pr-7 text-sm font-semibold"><RefreshCw size={16} className="text-cyan-300"/> Nova versão do aplicativo</div>
    <p className="mt-1 text-xs text-slate-300">Existe um APK mais recente e assinado disponível para atualizar o CapitalFlow.</p>
    {installError && <p role="alert" className="mt-2 rounded-lg bg-rose-950/40 px-3 py-2 text-xs text-rose-200">{installError}</p>}
    {installNotice && !installError && <p role="status" className="mt-2 rounded-lg bg-cyan-950/40 px-3 py-2 text-xs text-cyan-100">{installNotice}</p>}
    <button type="button" disabled={installing} onClick={() => { void install(); }}
      className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50">
      {installing ? <RefreshCw size={15} className="animate-spin"/> : <Download size={15}/>}
      {installing ? 'Baixando e verificando APK…' : 'Atualizar pelo aplicativo'}
    </button>
  </aside>;
};
