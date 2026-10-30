import React, { useCallback } from 'react';
import { AlertTriangle, CalendarClock, CreditCard, Landmark, LayoutDashboard, LockKeyhole, TrendingUp } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { UserProfile } from '../../types';
import { useWalletAccess } from './hooks/useWalletAccess';
import { useWalletRealtime } from './hooks/useWalletRealtime';
import { getWalletRoute, WALLET_ROUTES, WalletRouteView } from './routes';
import { WalletExpenseFab } from './components/WalletExpenseFab';
import { NativeWalletFileInbox } from './NativeWalletFileInbox';
import { PageHeader } from '../../components/ui/PageHeader';

const StateCard: React.FC<{ kind: 'inactive' | 'error'; message: string; onRetry?: () => void }> = ({ kind, message, onRetry }) => <section className="mx-auto mt-10 max-w-xl rounded-3xl border border-slate-800 bg-slate-900/80 p-8 text-center text-white shadow-2xl">
  {kind === 'inactive' ? <LockKeyhole className="mx-auto mb-4 text-amber-300" size={34}/> : <AlertTriangle className="mx-auto mb-4 text-rose-300" size={34}/>}
  <h1 className="text-xl font-black">{kind === 'inactive' ? 'Módulo Carteira não está ativo' : 'Carteira temporariamente indisponível'}</h1>
  <p className="mt-2 text-sm text-slate-400">{message}</p>\n  {onRetry && <button type="button" onClick={onRetry} className="mt-5 min-h-11 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white">Tentar novamente</button>}
</section>;

const navigationIcons = { 'visao-geral': LayoutDashboard, cartoes: CreditCard, contas: Landmark, dividas: CalendarClock, receitas: TrendingUp, cobranca: Landmark };

const WalletModule: React.FC<{ activeUser?: UserProfile | null }> = ({ activeUser }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const access = useWalletAccess();
  const invalidate = useCallback(() => window.dispatchEvent(new Event('capitalflow:wallet-updated')), []);
  // Sincronização permanece automática; o status não ocupa espaço no cabeçalho.
  useWalletRealtime(access.status === 'active' ? access.userId : null, invalidate);
  const route = getWalletRoute(location.pathname);
  const go = useCallback((path: string) => navigate(`/carteira/${path}`), [navigate]);

  if (access.status === 'loading') return <div aria-label="Carregando módulo Carteira" className="mx-auto mt-8 h-72 max-w-5xl animate-pulse rounded-3xl bg-slate-900"/>;
  if (access.status === 'inactive') return <StateCard kind="inactive" message="Ative a Carteira no seu plano para acessar contas, cartões, dívidas e cobranças PIX."/>;
  if (access.status === 'error') return <StateCard kind="error" message={access.message} onRetry={access.retry}/>;

  return <main className="w-full pb-28">
    <div className="mb-3 w-full">
      <PageHeader className="border-b-0 pb-0" icon={<CreditCard size={22}/>}
        iconClassName="border-blue-500/30 bg-blue-600 text-white shadow-blue-950/30"
        title={<>Minha <span className="text-blue-500">Carteira</span></>}
        subtitle="Contas, cartões e compromissos"/>
    </div>
    <nav aria-label="Navegação da Carteira" className="mb-4 grid w-full min-w-0 grid-cols-5 border-b border-slate-800/80 sm:flex sm:gap-1">
      {WALLET_ROUTES.filter(item => item.key !== 'cobranca').map(item => {
        const Icon = navigationIcons[item.key];
        const active = route === item.key;
        return (
          <button key={item.key} type="button"
            aria-current={active ? 'page' : undefined}
            onClick={() => go(item.key)} aria-label={item.label}
            className={`relative flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 border-b-2 px-0.5 py-2 text-[11px] font-medium transition-colors sm:min-h-11 sm:flex-row sm:gap-2 sm:px-4 sm:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400 ${
              active
                ? 'border-blue-500 bg-blue-500/10 font-semibold text-white'
                : 'border-transparent text-slate-400 hover:bg-slate-800/40 hover:text-slate-100'
            }`}>
            <Icon size={17} aria-hidden="true"/>
            <span className="sm:hidden">{item.key === 'visao-geral' ? 'Geral' : item.label}</span>
            <span className="hidden sm:inline">{item.label}</span>
          </button>
        );
      })}
    </nav>
    <WalletRouteView route={route} activeUser={activeUser} onNavigate={go}/>

    <WalletExpenseFab />
    <NativeWalletFileInbox />
  </main>;
};

export default WalletModule;

