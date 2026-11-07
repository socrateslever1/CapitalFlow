import React, { useEffect, useState } from 'react';
import { App } from '@capacitor/app';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Download, RefreshCw } from 'lucide-react';
import { dismissReleaseNotice, isReleaseNoticeDismissed } from '../../utils/releaseNotice';
import { friendlyAndroidUpdateError } from '../../utils/androidUpdateMessages';

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
export const AndroidNativeUpdateNotice: React.FC<{ placement: 'notifications' }> = () => {
  const [update, setUpdate] = useState<Update | null>(null);
  const [hidden, setHidden] = useState(false);
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
          setInstallError(friendlyAndroidUpdateError(status.message));
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
        if (active) {
          setUpdate(next);
          setHidden(next ? isReleaseNoticeDismissed('android-update', String(next.versionCode)) : false);
        }
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
      setInstallNotice('O Android vai concluir a atualização. Confirme se for solicitado.');
    } catch (error) {
      setInstallError(friendlyAndroidUpdateError(error));
    } finally {
      setInstalling(false);
    }
  };

  const dismiss = () => {
    if (!update) return;
    dismissReleaseNotice('android-update', String(update.versionCode));
    setHidden(true);
  };

  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android' || !update || hidden) return null;

  return <section aria-label="Atualização do aplicativo Android"
    className="mx-2 mb-2 min-w-0 max-w-full break-words rounded-xl border border-cyan-500/25 bg-cyan-950/20 p-3 [overflow-wrap:anywhere]">
    <div className="flex items-center gap-2 text-xs font-bold text-cyan-200">
      <RefreshCw size={16}/> Atualização disponível
    </div>
    <p className="mt-1 text-xs leading-relaxed text-slate-300">
      Uma nova versão do CapitalFlow está disponível para instalar.
    </p>
    {installError && <p role="alert" className="mt-2 break-words text-xs leading-relaxed text-rose-300 [overflow-wrap:anywhere]">{installError}</p>}
    {installNotice && !installError && <p role="status" aria-live="polite" className="mt-2 break-words text-xs leading-relaxed text-cyan-100">{installNotice}</p>}
    <div className="mt-2 flex flex-wrap items-center gap-3">
      <button type="button" disabled={installing} onClick={() => { void install(); }}
        className="inline-flex min-h-10 min-w-0 max-w-full flex-wrap items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-center text-xs font-semibold text-white disabled:opacity-50">
        {installing ? <RefreshCw size={15} className="animate-spin"/> : <Download size={15}/>}
        {installing ? 'Baixando atualização…' : installError ? 'Tentar novamente' : 'Atualizar aplicativo'}
      </button>
      <button type="button" onClick={dismiss}
        className="min-h-10 text-xs font-semibold text-slate-300">Agora não</button>
    </div>
  </section>;
};
