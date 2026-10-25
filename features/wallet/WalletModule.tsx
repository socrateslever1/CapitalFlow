import React, { useCallback, useState } from 'react';
import { AlertTriangle, LockKeyhole, WalletCards } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { UserProfile } from '../../types';
import { useWalletAccess } from './hooks/useWalletAccess';
import { useWalletRealtime } from './hooks/useWalletRealtime';
import { getWalletRoute, WALLET_ROUTES, WalletRouteView } from './routes';

const StateCard: React.FC<{ kind: 'inactive' | 'error'; message: string }> = ({ kind, message }) => <section className="mx-auto mt-10 max-w-xl rounded-3xl border border-slate-800 bg-slate-900/80 p-8 text-center text-white shadow-2xl">
  {kind === 'inactive' ? <LockKeyhole className="mx-auto mb-4 text-amber-300" size={34}/> : <AlertTriangle className="mx-auto mb-4 text-rose-300" size={34}/>}
  <h1 className="text-xl font-black">{kind === 'inactive' ? 'Módulo Carteira não está ativo' : 'Carteira temporariamente indisponível'}</h1>
  <p className="mt-2 text-sm text-slate-400">{message}</p>
</section>;

const WalletModule: React.FC<{ activeUser?: UserProfile | null }> = ({ activeUser }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const access = useWalletAccess();
  const [revision, setRevision] = useState(0);
  const invalidate = useCallback(() => setRevision(value => value + 1), []);
  const realtimeStatus = useWalletRealtime(access.status === 'active' ? access.userId : null, invalidate);
  const route = getWalletRoute(location.pathname);
  const go = useCallback((path: string) => navigate(`/carteira/${path}`), [navigate]);

  if (access.status === 'loading') return <div aria-label="Carregando módulo Carteira" className="mx-auto mt-8 h-72 max-w-5xl animate-pulse rounded-3xl bg-slate-900"/>;
  if (access.status === 'inactive') return <StateCard kind="inactive" message="Ative a Carteira no seu plano para acessar contas, cartões, dívidas e cobranças PIX."/>;
  if (access.status === 'error') return <StateCard kind="error" message={access.message}/>;

  return <main className="w-full pb-28">
    <header className="mx-auto mb-4 flex max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
      <div className="flex items-center gap-3"><span className="rounded-2xl bg-emerald-600/20 p-3 text-emerald-300"><WalletCards size={22}/></span><div><h1 className="text-lg font-black text-white">Minha Carteira</h1><p className="text-[10px] uppercase tracking-widest text-slate-500">Módulo independente · {realtimeStatus === 'connected' ? 'sincronizado' : 'sincronizando'}</p></div></div>
    </header>
    <nav aria-label="Navegação da Carteira" className="sticky top-0 z-40 mx-auto mb-5 flex max-w-7xl gap-1 overflow-x-auto border-y border-slate-800 bg-slate-950/90 px-4 py-2 backdrop-blur-md sm:px-6 lg:top-2 lg:rounded-2xl lg:border">
      {WALLET_ROUTES.map(item => <button key={item.key} type="button" aria-current={route === item.key ? 'page' : undefined} onClick={() => go(item.key)} className={`shrink-0 rounded-xl px-3 py-2 text-xs font-bold transition-colors ${route === item.key ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-900 hover:text-white'}`}>{item.label}</button>)}
    </nav>
    <WalletRouteView key={`${route}:${revision}`} route={route} activeUser={activeUser} onNavigate={go}/>
  </main>;
};

export default WalletModule;
