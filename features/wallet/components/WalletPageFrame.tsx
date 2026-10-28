import React from 'react';
import { AlertTriangle, LoaderCircle, RefreshCw } from 'lucide-react';

export const WalletPageFrame: React.FC<{
  title: string; description: string; error?: string; loading?: boolean;
  onRefresh?: () => void; actions?: React.ReactNode; children: React.ReactNode;
}> = ({ title, description, error, loading, onRefresh, actions, children }) => (
  <section className="mx-auto w-full max-w-[1500px] space-y-5 px-4 pb-24 sm:px-6 lg:pb-10">
    <header className="flex items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-black text-white">{title}</h2>
        <p className="mt-1 text-xs text-slate-400">{description}</p>
      </div>
      <div className="flex items-center gap-2">
        {actions}
        {onRefresh && <button type="button" aria-label="Atualizar página" onClick={onRefresh}
          className="rounded-xl border border-slate-700 p-2.5 text-slate-300 hover:text-white">
          <RefreshCw size={17}/>
        </button>}
      </div>
    </header>
    {error && <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-700/40 bg-rose-950/20 p-4 text-xs text-rose-200">
      <AlertTriangle size={16}/>{error}
    </div>}
    {loading ? <div className="flex h-52 items-center justify-center rounded-2xl bg-slate-900 text-slate-400">
      <LoaderCircle className="animate-spin" size={24}/>
    </div> : children}
  </section>
);
