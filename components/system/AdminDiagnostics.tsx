import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  FileCode2,
  Trash2,
} from 'lucide-react';
import {
  localDiagnostics,
  type DiagnosticEntry,
  type DiagnosticSource,
} from '../../services/localDiagnostics';
import {
  clearWalletLoadingMetrics,
  getWalletLoadingSummary,
  subscribeWalletLoadingMetrics,
} from '../../features/wallet/services/walletLoadingMetrics';

type SourceFilter = 'ALL' | DiagnosticSource;

const SOURCE_LABELS: Record<DiagnosticSource, string> = {
  runtime: 'Execução',
  promise: 'Promessa',
  console: 'Console',
  react: 'Interface React',
  interface: 'Aviso tratado',
};

const CATEGORY_BADGE: Record<string, string> = {
  'Conexão': 'border-amber-500/35 bg-amber-500/10 text-amber-300',
  'Sessão ou permissão': 'border-rose-500/35 bg-rose-500/10 text-rose-300',
  'Carregamento': 'border-cyan-500/35 bg-cyan-500/10 text-cyan-300',
  'Renderização': 'border-purple-500/35 bg-purple-500/10 text-purple-300',
  'Servidor de dados': 'border-orange-500/35 bg-orange-500/10 text-orange-300',
  'Falha inesperada': 'border-rose-500/35 bg-rose-500/10 text-rose-300',
};

const SOURCE_FILTERS: Array<{ key: SourceFilter; label: string }> = [
  { key: 'ALL', label: 'Todas as origens' },
  { key: 'react', label: 'React' },
  { key: 'runtime', label: 'Execução' },
  { key: 'promise', label: 'Promessas' },
  { key: 'console', label: 'Console' },
  { key: 'interface', label: 'Avisos' },
];

function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function AdminDiagnostics() {
  const [entries, setEntries] = useState<DiagnosticEntry[]>(localDiagnostics.list());
  const [walletMetrics, setWalletMetrics] = useState(getWalletLoadingSummary());
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('ALL');
  const [feedback, setFeedback] = useState('');

  useEffect(() => localDiagnostics.subscribe(() => setEntries(localDiagnostics.list())), []);
  useEffect(() => subscribeWalletLoadingMetrics(() => setWalletMetrics(getWalletLoadingSummary())), []);

  const totalOccurrences = useMemo(
    () => entries.reduce((sum, entry) => sum + entry.count, 0),
    [entries]
  );

  const visibleEntries = useMemo(
    () => (sourceFilter === 'ALL' ? entries : entries.filter((e) => e.source === sourceFilter)),
    [entries, sourceFilter]
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(localDiagnostics.exportReport());
      setFeedback('Relatório copiado.');
    } catch {
      setFeedback('Não foi possível copiar. Selecione o relatório abaixo e copie manualmente.');
    }
  };

  const downloadReport = () => {
    try {
      const blob = new Blob([localDiagnostics.exportReport()], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `capitalflow-diagnostico-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setFeedback('Arquivo JSON baixado.');
    } catch {
      setFeedback('Não foi possível baixar. Use a cópia manual abaixo.');
    }
  };

  const buttonClass =
    'inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-700 bg-slate-950/70 px-3.5 py-2 text-xs font-semibold text-slate-100 hover:border-slate-500 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 disabled:opacity-40 transition-colors';

  return (
    <section
      aria-labelledby="diagnostics-heading"
      className="min-w-0 space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="space-y-1">
          <h2 id="diagnostics-heading" className="flex items-center gap-2 text-base font-bold text-white">
            <Activity size={18} className="text-blue-400" aria-hidden="true" />
            Diagnóstico do sistema
          </h2>
          <p className="text-xs leading-relaxed text-slate-300">
            Exclusivo do master. Erros deste aparelho durante a sessão autorizada, agrupados por até 7 dias (100 grupos). Classificação indicativa, sem confirmação da causa.
          </p>
          <p className="text-xs leading-relaxed text-slate-400">
            Sem coleta remota, mensagens livres ou dados financeiros. Não inclui falhas nativas que encerram o APK ou erros anteriores à autorização.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!entries.length} className={buttonClass} onClick={copy}>
            <Copy size={14} aria-hidden="true" />
            Copiar relatório
          </button>
          <button type="button" disabled={!entries.length} className={buttonClass} onClick={downloadReport}>
            <Download size={14} aria-hidden="true" />
            Baixar JSON
          </button>
          <button
            type="button"
            disabled={!entries.length && !walletMetrics}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-rose-500/35 bg-rose-950/20 px-3.5 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-950/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-400 disabled:opacity-40 transition-colors"
            onClick={() => {
              localDiagnostics.clear();
              clearWalletLoadingMetrics();
              setFeedback('Diagnóstico local limpo.');
            }}
          >
            <Trash2 size={14} aria-hidden="true" />
            Limpar diagnóstico
          </button>
        </div>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
          <p className="text-[11px] font-medium text-slate-400">Grupos registrados</p>
          <p className="mt-1 text-lg font-black tabular-nums text-white">{entries.length}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
          <p className="text-[11px] font-medium text-slate-400">Total de ocorrências</p>
          <p className="mt-1 text-lg font-black tabular-nums text-amber-300">{totalOccurrences}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
          <p className="text-[11px] font-medium text-slate-400">Último evento</p>
          <p className="mt-1 text-xs font-semibold tabular-nums text-slate-200">
            {entries[0] ? formatDateTime(entries[0].last) : 'Nenhum'}
          </p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
          <p className="text-[11px] font-medium text-slate-400">Leitura da Carteira</p>
          <p className="mt-1 text-xs font-semibold tabular-nums text-emerald-300">
            {walletMetrics
              ? `${walletMetrics.avgMs} ms média · cache ${walletMetrics.cacheHitRatePercent}%`
              : 'Sem leituras'}
          </p>
        </div>
      </div>

      {walletMetrics && (
        <p className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-300">
          Carregamento da Carteira: <strong>{walletMetrics.count}</strong> leitura(s) · média{' '}
          <strong>{walletMetrics.avgMs} ms</strong> · pico <strong>{walletMetrics.maxMs} ms</strong> · cache{' '}
          <strong>{walletMetrics.cacheHitRatePercent}%</strong>
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p role="status" className="text-xs font-medium text-slate-300">
          {feedback ||
            `${entries.length} ${entries.length === 1 ? 'grupo de erros registrado' : 'grupos de erros registrados'}.`}
        </p>

        {entries.length > 0 && (
          <div role="group" aria-label="Filtrar diagnóstico por origem" className="flex flex-wrap gap-1.5">
            {SOURCE_FILTERS.map((opt) => {
              const active = sourceFilter === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSourceFilter(opt.key)}
                  className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    active
                      ? 'border-blue-500/40 bg-blue-600/20 text-blue-200'
                      : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {!entries.length ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-950/15 p-4 text-xs text-emerald-300">
          <CheckCircle2 size={16} aria-hidden="true" />
          <span>Nenhum erro registrado no período.</span>
        </div>
      ) : (
        <>
          <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {visibleEntries.map((entry, index) => {
              const badge = CATEGORY_BADGE[entry.category] || CATEGORY_BADGE['Falha inesperada'];
              return (
                <li
                  key={`${entry.source}-${entry.category}-${entry.frame}-${entry.screen}-${index}`}
                  className="rounded-xl border border-slate-800 bg-slate-950/75 p-3 text-xs text-slate-200 space-y-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-bold ${badge}`}
                      >
                        <AlertTriangle size={11} aria-hidden="true" />
                        {entry.category}
                      </span>
                      {entry.errorType && entry.errorType !== 'Unknown' && (
                        <span className="rounded-md border border-slate-700 bg-slate-900 px-2 py-0.5 font-mono text-[11px] text-slate-300">
                          {entry.errorType}
                        </span>
                      )}
                      <span className="rounded-md border border-slate-800 bg-slate-900/80 px-2 py-0.5 text-[11px] text-slate-300">
                        {SOURCE_LABELS[entry.source] || entry.source}
                      </span>
                      <span className="rounded-md border border-slate-800 bg-slate-900/80 px-2 py-0.5 font-mono text-[11px] text-cyan-300">
                        {entry.screen}
                      </span>
                    </div>
                    <span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-0.5 text-[11px] font-bold tabular-nums text-white">
                      {entry.count} ocorrência(s)
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                    <span className="inline-flex items-center gap-1.5 font-mono text-slate-300">
                      <FileCode2 size={12} className="text-slate-500" aria-hidden="true" />
                      {entry.frame || 'Sem referência de arquivo (log direto)'}
                    </span>
                    <span className="tabular-nums">
                      {entry.count > 1
                        ? `De ${formatDateTime(entry.first)} até ${formatDateTime(entry.last)}`
                        : formatDateTime(entry.last)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>

          <details className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
            <summary className="min-h-10 cursor-pointer py-2 text-xs font-semibold text-slate-200">
              Ver relatório para seleção manual
            </summary>
            <textarea
              aria-label="Relatório técnico copiável"
              readOnly
              value={localDiagnostics.exportReport()}
              className="mt-2 h-56 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 font-mono text-xs text-slate-200"
            />
          </details>
        </>
      )}
    </section>
  );
}
