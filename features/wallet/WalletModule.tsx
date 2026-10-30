import React, { useCallback } from 'react';
import { AlertTriangle, CalendarClock, CreditCard, Landmark, LayoutDashboard, LockKeyhole, TrendingUp, Wallet } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { UserProfile } from '../../types';
import { useWalletAccess } from './hooks/useWalletAccess';
import { useWalletRealtime } from './hooks/useWalletRealtime';
import { getWalletRoute, WALLET_ROUTES, WalletRouteView } from './routes';
import { WalletExpenseFab } from './components/WalletExpenseFab';

const StateCard: React.FC<{ kind: 'inactive' | 'error'; message: string }> = ({ kind, message }) => <section className="mx-auto mt-10 max-w-xl rounded-3xl border border-slate-800 bg-slate-900/80 p-8 text-center text-white shadow-2xl">
  {kind === 'inactive' ? <LockKeyhole className="mx-auto mb-4 text-amber-300" size={34}/> : <AlertTriangle className="mx-auto mb-4 text-rose-300" size={34}/>}
  <h1 className="text-xl font-black">{kind === 'inactive' ? 'Módulo Carteira não está ativo' : 'Carteira temporariamente indisponível'}</h1>
  <p className="mt-2 text-sm text-slate-400">{message}</p>
</section>;

const navigationIcons = { 'visao-geral': LayoutDashboard, cartoes: CreditCard, contas: Landmark, dividas: CalendarClock, receitas: TrendingUp, cobranca: Landmark };

const WalletModule: React.FC<{ activeUser?: UserProfile | null }> = ({ activeUser }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const access = useWalletAccess();
  const invalidate = useCallback(() => window.dispatchEvent(new Event('capitalflow:wallet-updated')), []);
  const realtimeStatus = useWalletRealtime(access.status === 'active' ? access.userId : null, invalidate);
  const route = getWalletRoute(location.pathname);
  const go = useCallback((path: string) => navigate(`/carteira/${path}`), [navigate]);

  if (access.status === 'loading') return <div aria-label="Carregando módulo Carteira" className="mx-auto mt-8 h-72 max-w-5xl animate-pulse rounded-3xl bg-slate-900"/>;
  if (access.status === 'inactive') return <StateCard kind="inactive" message="Ative a Carteira no seu plano para acessar contas, cartões, dívidas e cobranças PIX."/>;
  if (access.status === 'error') return <StateCard kind="error" message={access.message}/>;

  return <main className="w-full pb-28">
    <header className="mx-auto mb-3 flex w-full max-w-[1500px] min-w-0 items-center gap-3 border-b border-slate-800/70 px-3 pb-3 sm:px-6">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-cyan-300" aria-hidden="true"><Wallet size={20} strokeWidth={2.1}/></span>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-extrabold text-white sm:text-xl">Minha carteira</h1>
        <p className="hidden truncate text-xs text-slate-400 sm:block">Contas, cartões e compromissos</p>
      </div>
      <span role="status" className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium ${realtimeStatus === 'connected' ? 'text-emerald-300' : realtimeStatus === 'error' || realtimeStatus === 'disconnected' ? 'text-amber-200' : 'text-slate-400'}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${realtimeStatus === 'connected' ? 'bg-emerald-400' : 'bg-current'}`}/>
        {realtimeStatus === 'connected' ? 'Sincronizado' : realtimeStatus === 'error' || realtimeStatus === 'disconnected' ? 'Sem conexão ao vivo' : 'Conectando'}
      </span>
    </header>
    <div className="mx-auto mb-4 w-full max-w-[1500px] px-3 sm:px-6">
      <nav aria-label="Navegação da Carteira" className="grid w-full min-w-0 grid-cols-5 items-center gap-1 rounded-2xl border border-slate-800 bg-slate-900 p-1.5 sm:flex">
        {WALLET_ROUTES.filter(item => item.key !== 'cobranca').map(item => {
          const Icon = navigationIcons[item.key];
          return (
          <button
            key={item.key}
            type="button"
            aria-current={route === item.key ? 'page' : undefined}
            onClick={() => go(item.key)}
            aria-label={item.label}
            className={`flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 sm:min-h-11 sm:flex-row sm:gap-2 sm:px-4 sm:text-sm ${
              route === item.key
                ? 'bg-blue-600 text-white font-semibold'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Icon size={17} aria-hidden="true"/>
            <span className="sm:hidden">{item.key === 'visao-geral' ? 'Geral' : item.key === 'contas' ? 'Contas' : item.key === 'dividas' ? 'Dívidas' : item.label}</span>
            <span className="hidden sm:inline">{item.label}</span>
          </button>
        ); })}
      </nav>
    </div>
    <WalletRouteView route={route} activeUser={activeUser} onNavigate={go}/>

    <WalletExpenseFab />
  </main>;
};

export default WalletModule;

