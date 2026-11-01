import React, { useEffect, useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { claimReleaseNotice } from '../../utils/releaseNotice';

declare const __CAPITALFLOW_BUILD_ID__: string;

// Download on the CapitalFlow origin. Cloudflare Pages streams the official signed APK.
export const ANDROID_APK_DOWNLOAD_URL = '/api/android/apk';

export function isAndroidSaaSBrowser(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const native = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  if (native?.isNativePlatform?.()) return false;
  if (['localhost', '127.0.0.1'].includes(window.location.hostname)) return false;
  return /Android/i.test(navigator.userAgent);
}

/**
 * Browser install offer: show automatically once for each published web build.
 * Independently provide a permanent entry in the notification bell.
 */
export const AndroidApkNotice: React.FC<{ placement: 'banner' | 'notifications' }> = ({ placement }) => {
  const [eligible, setEligible] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [declinedInBell, setDeclinedInBell] = useState(false);

  useEffect(() => {
    const allowed = isAndroidSaaSBrowser();
    setEligible(allowed);
    // React StrictMode may run this effect twice: never reset a successfully
    // claimed popup on the second pass of the same mount.
    if (allowed && placement === 'banner' &&
        claimReleaseNotice('android-install', __CAPITALFLOW_BUILD_ID__)) {
      setShowBanner(true);
    }
  }, [placement]);

  if (!eligible) return null;

  if (placement === 'notifications') {
    return <section aria-label="Instalação do CapitalFlow para Android"
      className="mx-2 mb-2 rounded-xl border border-cyan-500/25 bg-cyan-950/20 p-3">
      <div className="flex items-center gap-2 text-xs font-bold text-cyan-200">
        <Smartphone size={16}/> CapitalFlow para Android
      </div>
      <p className="mt-1 text-xs leading-relaxed text-slate-300">
        {declinedInBell ? 'Instalação adiada. O aplicativo continua disponível por aqui.' :
          'Instale o CapitalFlow no seu celular.'}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <a href={ANDROID_APK_DOWNLOAD_URL} download="CapitalFlow-Android.apk"
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white">
          <Download size={15}/> Baixar aplicativo
        </a>
        <button type="button" onClick={() => setDeclinedInBell(true)}
          className="min-h-10 text-xs font-semibold text-slate-300">
          Agora não
        </button>
      </div>
    </section>;
  }

  if (!showBanner) return null;
  const dismiss = () => setShowBanner(false);
  return <aside role="status" aria-label="Aplicativo CapitalFlow para Android"
    className="fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom))] left-3 right-3 z-[1700] mx-auto max-w-sm rounded-xl border border-blue-500/40 bg-slate-900 p-3 text-white shadow-2xl shadow-black/60 md:bottom-5 md:left-auto md:right-5">
    <button type="button" onClick={dismiss} aria-label="Dispensar aviso de APK"
      className="absolute right-2 top-2 rounded-lg p-1.5 text-slate-400 hover:text-white"><X size={17}/></button>
    <div className="flex items-center gap-2 pr-7 text-sm font-semibold">
      <Smartphone size={17} className="text-cyan-300"/> Aplicativo para Android
    </div>
    <p className="mt-1 text-xs text-slate-300">
      Instale o CapitalFlow no seu celular e acesse o sistema pelo aplicativo.
    </p>
    <div className="mt-3 flex items-center gap-3">
      <a href={ANDROID_APK_DOWNLOAD_URL} download="CapitalFlow-Android.apk"
        onClick={dismiss}
        className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white">
        <Download size={15}/> Baixar aplicativo
      </a>
      <button type="button" onClick={dismiss} className="text-xs text-slate-300">Depois</button>
    </div>
  </aside>;
};
