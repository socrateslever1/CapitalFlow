import React, { useEffect, useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';

// O alias da release sempre contém o último APK assinado (não o debug).
export const ANDROID_APK_DOWNLOAD_URL =
  'https://github.com/socrateslever1/CapitalFlow/releases/download/android-signed-beta/CapitalFlow-Android.apk';

export function isAndroidSaaSBrowser(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const native = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  if (native?.isNativePlatform?.()) return false;
  if (['localhost', '127.0.0.1'].includes(window.location.hostname)) return false;
  return /Android/i.test(navigator.userAgent);
}

/** An Android SaaS browser sees the APK once, plus a permanent shortcut in alerts. */
export const AndroidApkNotice: React.FC<{ placement: 'banner' | 'notifications' }> = ({ placement }) => {
  const [eligible, setEligible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    setEligible(isAndroidSaaSBrowser());
    try { setDismissed(sessionStorage.getItem('capitalflow:apk-install-offer-hidden') === '1'); } catch { /* privacy mode */ }
  }, []);
  if (!eligible || (placement === 'banner' && dismissed)) return null;

  if (placement === 'notifications') {
    return <div className="mx-2 mb-2 rounded-xl border border-cyan-500/25 bg-cyan-950/20 p-3">
      <div className="flex items-center gap-2 text-xs font-bold text-cyan-200"><Smartphone size={16}/> CapitalFlow para Android</div>
      <p className="mt-1 text-xs leading-relaxed text-slate-300">Existe um aplicativo oficial para instalar no celular.</p>
      <a href={ANDROID_APK_DOWNLOAD_URL} target="_blank" rel="noopener noreferrer"
        className="mt-2 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white">
        <Download size={15}/> Baixar APK diretamente
      </a>
    </div>;
  }

  const dismiss = () => {
    setDismissed(true);
    try { sessionStorage.setItem('capitalflow:apk-install-offer-hidden', '1'); } catch { /* privacy mode */ }
  };
  return <aside role="status" aria-label="Aplicativo CapitalFlow para Android"
    className="fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom))] left-3 right-3 z-[1700] mx-auto max-w-sm rounded-xl border border-blue-500/40 bg-slate-900 p-3 text-white shadow-2xl shadow-black/60 md:bottom-5 md:left-auto md:right-5">
    <button type="button" onClick={dismiss} aria-label="Dispensar aviso de APK"
      className="absolute right-2 top-2 rounded-lg p-1.5 text-slate-400 hover:text-white"><X size={17}/></button>
    <div className="flex items-center gap-2 pr-7 text-sm font-semibold"><Smartphone size={17} className="text-cyan-300"/> Aplicativo para Android</div>
    <p className="mt-1 text-xs text-slate-300">Baixe e instale o CapitalFlow no dispositivo. O link também ficará na Central de Alertas.</p>
    <div className="mt-3 flex items-center gap-3">
      <a href={ANDROID_APK_DOWNLOAD_URL} target="_blank" rel="noopener noreferrer"
        className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white">
        <Download size={15}/> Baixar APK
      </a>
      <button type="button" onClick={dismiss} className="text-xs text-slate-300">Depois</button>
    </div>
  </aside>;
};
