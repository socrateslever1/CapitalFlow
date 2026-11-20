import React, { useMemo, useState } from 'react';
import { CheckCircle2, History, Sparkles, Wrench } from 'lucide-react';
import {
  SYSTEM_CHANGELOG,
  type ChangelogEntryKind,
} from '../../../src/constants/changelog';
import { SYSTEM_VERSION } from '../../../src/constants/version';

type FilterKind = 'TODAS' | ChangelogEntryKind;

const KIND_META: Record<
  ChangelogEntryKind,
  { label: string; badgeClass: string; icon: React.ReactNode }
> = {
  NOVIDADE: {
    label: 'Novidade',
    badgeClass: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    icon: <Sparkles size={12} aria-hidden="true" />,
  },
  MELHORIA: {
    label: 'Melhoria',
    badgeClass: 'border-blue-500/30 bg-blue-500/10 text-blue-300',
    icon: <CheckCircle2 size={12} aria-hidden="true" />,
  },
  CORRECAO: {
    label: 'Correção',
    badgeClass: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    icon: <Wrench size={12} aria-hidden="true" />,
  },
};

const FILTERS: Array<{ key: FilterKind; label: string }> = [
  { key: 'TODAS', label: 'Todas' },
  { key: 'NOVIDADE', label: 'Novidades' },
  { key: 'MELHORIA', label: 'Melhorias' },
  { key: 'CORRECAO', label: 'Correções' },
];

export const ProfileChangelog: React.FC = () => {
  const [filter, setFilter] = useState<FilterKind>('TODAS');

  const visibleReleases = useMemo(() => {
    if (filter === 'TODAS') return SYSTEM_CHANGELOG;
    return SYSTEM_CHANGELOG.map((release) => ({
      ...release,
      items: release.items.filter((item) => item.kind === filter),
    })).filter((release) => release.items.length > 0);
  }, [filter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <History size={18} className="text-blue-400 shrink-0" aria-hidden="true" />
          <div>
            <h3 className="text-base font-bold text-white">
              Histórico de Atualizações
            </h3>
            <p className="text-xs text-slate-400">
              Acompanhe as novidades, melhorias e correções entregues em cada versão do sistema.
            </p>
          </div>
        </div>

        <div className="inline-flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-950/30 px-3 py-1.5 text-xs">
          <span className="text-slate-400">Versão atual</span>
          <strong className="font-mono text-blue-300">v{SYSTEM_VERSION.version}</strong>
        </div>
      </div>

      <div
        role="group"
        aria-label="Filtrar atualizações por tipo"
        className="flex flex-wrap gap-2"
      >
        {FILTERS.map((option) => {
          const active = filter === option.key;
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => setFilter(option.key)}
              aria-pressed={active}
              className={`min-h-9 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                active
                  ? 'border-blue-500/40 bg-blue-600/20 text-blue-200'
                  : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700 hover:text-slate-200'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <div className="space-y-4">
        {visibleReleases.map((release, index) => (
          <article
            key={release.version}
            className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 sm:p-5 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md border border-blue-500/30 bg-blue-500/10 px-2.5 py-0.5 font-mono text-xs font-bold text-blue-300">
                  v{release.version}
                </span>
                {index === 0 && filter === 'TODAS' && (
                  <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
                    Mais recente
                  </span>
                )}
              </div>
              <time className="text-xs font-medium text-slate-400 tabular-nums">
                {release.date}
              </time>
            </div>

            <div>
              <h4 className="text-sm font-bold text-white">{release.title}</h4>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                {release.summary}
              </p>
            </div>

            <ul className="space-y-2 pt-1">
              {release.items.map((item, itemIdx) => {
                const meta = KIND_META[item.kind];
                return (
                  <li
                    key={`${release.version}-${itemIdx}`}
                    className="flex items-start gap-2.5 rounded-lg border border-slate-800/80 bg-slate-900/60 p-2.5 text-xs text-slate-200"
                  >
                    <span
                      className={`mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase ${meta.badgeClass}`}
                    >
                      {meta.icon}
                      {meta.label}
                    </span>
                    <span className="min-w-0 flex-1 leading-relaxed">{item.text}</span>
                  </li>
                );
              })}
            </ul>
          </article>
        ))}

        {visibleReleases.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-800 p-6 text-center text-xs text-slate-400">
            Nenhum registro encontrado para este filtro.
          </p>
        )}
      </div>
    </div>
  );
};
