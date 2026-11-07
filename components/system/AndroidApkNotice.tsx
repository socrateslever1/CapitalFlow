import React, { useEffect, useState } from 'react';
import { Download, Smartphone } from 'lucide-react';
import { dismissReleaseNotice, isReleaseNoticeDismissed } from '../../utils/releaseNotice';

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

/** The installation option lives only in the bell and can be refused per version. */
export const AndroidApkNotice: React.FC<{ placement: 'notifications' }> = () => {
  const [eligible, setEligible] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setEligible(isAndroidSaaSBrowser());
    setHidden(isReleaseNoticeDismissed('android-install', __CAPITALFLOW_BUILD_ID__));
  }, []);

  const dismiss = () => {
    dismissReleaseNotice('android-install', __CAPITALFLOW_BUILD_ID__);
    setHidden(true);
  };

  if (!eligible || hidden) return null;

  return <section aria-label="CapitalFlow para Android"
    className="mx-2 mb-2 rounded-xl border border-cyan-500/25 bg-cyan-950/20 p-3">
    <div className="flex items-center gap-2 text-xs font-bold text-cyan-200">
      <Smartphone size={16}/> CapitalFlow para Android
    </div>
    <p className="mt-1 text-xs leading-relaxed text-slate-300">
      Instale o CapitalFlow no seu celular para acessar com mais facilidade.
    </p>
    <div className="mt-2 flex flex-wrap items-center gap-3">
      <a href={ANDROID_APK_DOWNLOAD_URL} download="CapitalFlow-Android.apk"
        onClick={dismiss}
        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white">
        <Download size={15}/> Instalar aplicativo
      </a>
      <button type="button" onClick={dismiss}
        className="min-h-10 text-xs font-semibold text-slate-300">
        Agora não
      </button>
    </div>
  </section>;
};
