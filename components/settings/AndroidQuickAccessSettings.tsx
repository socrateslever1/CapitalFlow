import React, { useEffect, useRef, useState } from 'react';
import { quickAccessSupported, walletQuickAccess, type QuickAccessStatus } from '../../services/walletQuickAccess';

export function AndroidQuickAccessSettings() {
  const [status, setStatus] = useState<QuickAccessStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lastStatusRequest = useRef(0);

  useEffect(() => {
    if (!quickAccessSupported()) return;
    let active = true;
    const refresh = () => {
      const request = ++lastStatusRequest.current;
      void walletQuickAccess.getStatus()
        .then(value => {
          if (active && request === lastStatusRequest.current) setStatus(value);
        })
        .catch(() => {});
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    refresh();
    window.addEventListener('capitalflow:quick-access-ready', refresh);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', refresh);
    return () => {
      active = false;
      lastStatusRequest.current += 1;
      window.removeEventListener('capitalflow:quick-access-ready', refresh);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', refresh);
    };
  }, []);

  if (!status?.active) return null;

  const openAndroidPrioritySettings = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await walletQuickAccess.openNotificationSettings();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível abrir as configurações do Android.');
    } finally {
      setBusy(false);
    }
  };
  const togglePriority = async () => {
    if (!status?.enabled || busy) return;
    setBusy(true);
    setError('');
    try {
      const next = await walletQuickAccess.setProminent({ prominent: !status.prominent });
      lastStatusRequest.current += 1;
      setStatus(next);
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
      const next = await walletQuickAccess.setEnabled({ enabled: !status.enabled });
      lastStatusRequest.current += 1;
      setStatus(next);
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
            Notificação Android · {status.enabled ? (status.permissionGranted ? 'Ativada' : 'Bloqueada no Android') : 'Desativada'}
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
              Solicita destaque sem som ou vibração. A posição é definida pelo Android.
            </span>
          </span>
          <input type="checkbox" checked={Boolean(status.prominent)} disabled={busy}
            aria-label="Destacar a notificação de lançamento rápido"
            onChange={() => { void togglePriority(); }}
            className="h-5 w-5 shrink-0 accent-blue-500 disabled:opacity-50" />
        </label>
      )}
      {status.enabled && status.priorityAvailable && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-3">
          <span className="text-[11px] text-slate-400">
            Importância do canal: {status.channelImportance === 0 ? 'Bloqueada'
              : status.channelImportance >= 4 ? 'Alta'
              : status.channelImportance === 3 ? 'Normal'
              : status.channelImportance >= 1 ? 'Baixa'
              : 'Não configurada'}
          </span>
          <button type="button" disabled={busy}
            onClick={() => { void openAndroidPrioritySettings(); }}
            className="min-h-11 rounded-lg border border-blue-500/40 px-3 text-xs font-semibold text-blue-200 hover:bg-blue-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 disabled:opacity-50">
            Ajustar prioridade no Android
          </button>
          <p className="w-full text-[11px] leading-relaxed text-slate-500">
            A ordenação depende das configurações do celular; o aplicativo não pode fixar notificações no topo.
          </p>
        </div>
      )}
      {!status.permissionGranted && (
        <p className="mt-3 text-xs text-amber-200">Permita notificações nas configurações do Android.</p>
      )}
      {error && <p role="alert" className="mt-3 text-xs text-rose-200">{error}</p>}
    </section>
  );
}
