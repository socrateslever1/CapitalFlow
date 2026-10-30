import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export const WalletPageFrame: React.FC<{
  title: string; description: string; error?: string; loading?: boolean;
  onRefresh?: () => void; actions?: React.ReactNode; children: React.ReactNode;
}> = ({ title, description, error, loading, onRefresh, actions, children }) => (
  <section className="mx-auto w-full max-w-[1500px] space-y-4 px-3 pb-24 sm:space-y-5 sm:px-6 lg:pb-10">
    <header className="flex flex-wrap items-start justify-between gap-4 pb-1">
      <div className="min-w-0">
        <h2 className="text-xl font-bold tracking-tight text-white sm:text-2xl">{title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-slate-400">{description}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {actions}
        {onRefresh && <button type="button" aria-label="Atualizar página" onClick={onRefresh}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-slate-700 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
          <RefreshCw size={17}/>
        </button>}
      </div>
    </header>
    {error && <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-700/40 bg-rose-950/20 p-4 text-xs text-rose-200">
      <AlertTriangle size={16}/>{error}
    </div>}
    {loading ? <div role="status" aria-label="Carregando carteira" className="grid animate-pulse gap-4 motion-reduce:animate-none lg:grid-cols-2">
      <div className="h-56 rounded-2xl bg-slate-900"/><div className="h-56 rounded-2xl bg-slate-900"/>
    </div> : children}
  </section>
);
