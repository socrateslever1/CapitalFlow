import React, { useEffect, useState } from 'react';
import { quickAccessSupported, walletQuickAccess, type QuickAccessStatus } from '../../services/walletQuickAccess';
export function AndroidQuickAccessSettings() {
  const [status, setStatus] = useState<QuickAccessStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!quickAccessSupported()) return;
    let active = true;
    const refresh = () => { void walletQuickAccess.getStatus().then(value => { if (active) setStatus(value); }).catch(() => {}); };
    refresh();
    window.addEventListener('capitalflow:quick-access-ready', refresh);
    window.addEventListener('focus', refresh);
    return () => { active = false; window.removeEventListener('capitalflow:quick-access-ready', refresh); window.removeEventListener('focus', refresh); };
  }, []);
  if (!status?.active) return null;
  const toggle = async () => {
    setBusy(true); setError('');
    try { setStatus(await walletQuickAccess.setEnabled({enabled: !status.enabled})); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível alterar a notificação.'); }
    finally { setBusy(false); }
  };
  return <section aria-labelledby="quick-access-heading" className="space-y-3 rounded-xl border border-slate-700 bg-slate-900 p-4">
    <h2 id="quick-access-heading" className="font-bold text-white">Lançamento rápido no Android</h2>
    <p className="text-sm text-slate-300">Notificação silenciosa com “Lançar gasto” e “Registrar entrada”. Abre o formulário; você confere e confirma no aplicativo. Sem sobreposição sobre outros apps e sem valores na tela bloqueada.</p>
    <p className="text-sm text-slate-300">O Android pode permitir dispensar a notificação. Após reiniciar o aparelho, abra o CapitalFlow para restaurá-la. A opção é guardada por perfil e a notificação é removida ao sair.</p>
    <button type="button" disabled={busy} aria-pressed={status.enabled} onClick={toggle} className="min-h-11 rounded-lg border border-slate-600 px-4 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 disabled:opacity-50">
      {busy ? 'Atualizando...' : status.enabled ? 'Desativar notificação de lançamento' : 'Ativar notificação de lançamento'}
    </button>
    {!status.permissionGranted && <p className="text-sm text-amber-200">É necessário permitir notificações nas configurações do Android.</p>}
    {error && <p role="alert" className="text-sm text-rose-200">{error}</p>}
  </section>;
}
