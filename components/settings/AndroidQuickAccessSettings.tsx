import React, { useEffect, useState } from 'react';
import { quickAccessSupported, walletQuickAccess, type QuickAccessStatus } from '../../services/walletQuickAccess';

export function AndroidQuickAccessSettings() {
  const [status, setStatus] = useState<QuickAccessStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!quickAccessSupported()) return;
    let active = true;
    const refresh = () => {
      void walletQuickAccess.getStatus()
        .then(value => { if (active) setStatus(value); })
        .catch(() => {});
    };
    refresh();
    window.addEventListener('capitalflow:quick-access-ready', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      active = false;
      window.removeEventListener('capitalflow:quick-access-ready', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  if (!status?.active) return null;

  const togglePriority = async () => {
    if (!status?.enabled || busy) return;
    setBusy(true);
    setError('');
    try {
      setStatus(await walletQuickAccess.setProminent({ prominent: !status.prominent }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível alterar o destaque.');
    } finally {
      setBusy(false);
    }
  };

  const toggle = async () => {
    setBusy(true);
    setError('');
    try {
      setStatus(await walletQuickAccess.setEnabled({ enabled: !status.enabled }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível alterar a notificação.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="quick-access-heading" className="rounded-lg border border-slate-700/70 bg-slate-950/30 p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 id="quick-access-heading" className="text-sm font-semibold text-slate-100">Lançamento rápido</h3>
          <p className="mt-1 text-xs text-slate-400">
            Notificação Android · {status.enabled ? 'Ativada' : 'Desativada'}
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          aria-label={status.enabled ? 'Desativar notificação de lançamento rápido' : 'Ativar notificação de lançamento rápido'}
          aria-pressed={status.enabled}
          onClick={toggle}
          className="min-h-11 shrink-0 rounded-lg border border-slate-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 disabled:cursor-wait disabled:opacity-50"
        >
          {busy ? 'Atualizando...' : status.enabled ? 'Desativar' : 'Ativar'}
        </button>
      </div>
      {status.enabled && status.priorityAvailable && (
        <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 border-t border-slate-800 pt-3">
          <span className="min-w-0">
            <span className="block text-xs font-semibold text-slate-200">Destacar notificação</span>
            <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-400">
              Tenta deixá-la mais acima, sem som ou vibração. O Android decide a posição.
            </span>
          </span>
          <input type="checkbox" checked={Boolean(status.prominent)} disabled={busy}
            aria-label="Destacar a notificação de lançamento rápido"
            onChange={() => { void togglePriority(); }}
            className="h-5 w-5 shrink-0 accent-blue-500 disabled:opacity-50" />
        </label>
      )}
      {!status.permissionGranted && (
        <p className="mt-3 text-xs text-amber-200">Permita notificações nas configurações do Android.</p>
      )}
      {error && <p role="alert" className="mt-3 text-xs text-rose-200">{error}</p>}
    </section>
  );
}
