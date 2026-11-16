import React, { useEffect, useState } from 'react';
import { localDiagnostics } from '../../services/localDiagnostics';
import {
  clearWalletLoadingMetrics,
  getWalletLoadingSummary,
  subscribeWalletLoadingMetrics,
} from '../../features/wallet/services/walletLoadingMetrics';
export function AdminDiagnostics() {
  const [entries, setEntries] = useState(localDiagnostics.list());
  const [walletMetrics, setWalletMetrics] = useState(getWalletLoadingSummary());
  const [feedback, setFeedback] = useState('');
  useEffect(() => localDiagnostics.subscribe(() => setEntries(localDiagnostics.list())), []);
  useEffect(() => subscribeWalletLoadingMetrics(() => setWalletMetrics(getWalletLoadingSummary())), []);
  const copy = async () => {
    try { await navigator.clipboard.writeText(localDiagnostics.exportReport()); setFeedback('Relatório copiado.'); }
    catch { setFeedback('Não foi possível copiar. Selecione o relatório abaixo e copie manualmente.'); }
  };
  const button = 'min-h-11 rounded-lg border border-slate-600 px-4 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 disabled:opacity-50';
  return <section aria-labelledby="diagnostics-heading" className="min-w-0 space-y-3 rounded-xl border border-slate-700 bg-slate-900 p-4">
    <h2 id="diagnostics-heading" className="font-bold text-white">Diagnóstico do sistema</h2>
    <p className="text-sm text-slate-300">Exclusivo do master. Erros deste aparelho durante a sessão autorizada, agrupados por até 7 dias (100 grupos). Classificação indicativa, sem confirmação da causa.</p>
    <p className="text-sm text-slate-300">Sem coleta remota, mensagens livres ou dados financeiros. Não inclui falhas nativas que encerram o APK ou erros anteriores à autorização.</p>
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={!entries.length} className={button} onClick={copy}>Copiar relatório</button>
      <button type="button" disabled={!entries.length && !walletMetrics} className={button} onClick={() => { localDiagnostics.clear(); clearWalletLoadingMetrics(); setFeedback('Diagnóstico local limpo.'); }}>Limpar diagnóstico</button>
    </div>
    {walletMetrics && (
      <p className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs text-slate-300">
        Carregamento da Carteira: {walletMetrics.count} leitura(s) · média {walletMetrics.avgMs} ms · pico {walletMetrics.maxMs} ms · cache {walletMetrics.cacheHitRatePercent}%
      </p>
    )}
    <p role="status" className="text-sm text-slate-300">{feedback || `${entries.length} ${entries.length === 1 ? 'grupo de erros registrado' : 'grupos de erros registrados'}.`}</p>
    {!entries.length ? <p className="text-sm text-slate-300">Nenhum erro registrado no período.</p> : <>
      <ul className="max-h-64 space-y-2 overflow-y-auto text-sm text-slate-200">{entries.map((entry, index) => <li key={index} className="break-words border-t border-slate-700 pt-2">
        <strong>{entry.category}</strong> · {entry.count} ocorrência(s) · {entry.source} · {entry.screen}<br/>
        {new Date(entry.last).toLocaleString('pt-BR')}{entry.frame && ` · ${entry.frame}`}
      </li>)}</ul>
      <details><summary className="min-h-11 cursor-pointer py-2 text-sm text-slate-200">Ver relatório para seleção manual</summary>
        <textarea aria-label="Relatório técnico copiável" readOnly value={localDiagnostics.exportReport()} className="h-56 w-full rounded-lg border border-slate-600 bg-slate-950 p-3 font-mono text-xs text-slate-200"/>
      </details>
    </>}
  </section>;
}
