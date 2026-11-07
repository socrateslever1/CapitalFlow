import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export const WalletPageFrame: React.FC<{
  title: string; description: string; error?: string; loading?: boolean;
  onRefresh?: () => void; actions?: React.ReactNode; children: React.ReactNode;
}> = ({ title, description, error, loading, onRefresh, actions, children }) => (
  <section className="w-full min-w-0 space-y-4 pb-24 sm:space-y-5 lg:pb-10">
    <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-2 pb-1 sm:items-center">
      <div className="min-w-0">
        <h2 className="text-lg font-bold tracking-tight text-white sm:text-xl">{title}</h2>
        <p className="mt-1 max-w-[62ch] text-xs leading-snug text-slate-400 sm:text-sm">{description}</p>
      </div>
      <div className="flex items-center justify-end gap-2 self-start sm:self-center">
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
