import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CalendarClock, CreditCard, Landmark, LayoutDashboard, LockKeyhole, TrendingUp, WifiOff } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { UserProfile } from '../../types';
import { useWalletAccess } from './hooks/useWalletAccess';
import { useWalletRealtime } from './hooks/useWalletRealtime';
import { getWalletRoute, WALLET_ROUTES, WalletRouteView } from './routes';
import { WalletExpenseFab } from './components/WalletExpenseFab';
import { NativeWalletFileInbox } from './NativeWalletFileInbox';
import { PageHeader } from '../../components/ui/PageHeader';
import { WalletBalanceDock } from './components/WalletBalanceDock';
import { walletRepository } from './services/walletRepository';

const StateCard: React.FC<{ kind: 'inactive' | 'error'; message: string; onRetry?: () => void }> = ({ kind, message, onRetry }) => <section className="mx-auto mt-10 max-w-xl rounded-3xl border border-slate-800 bg-slate-900/80 p-8 text-center text-white shadow-2xl">
  {kind === 'inactive' ? <LockKeyhole className="mx-auto mb-4 text-amber-300" size={34}/> : <AlertTriangle className="mx-auto mb-4 text-rose-300" size={34}/>}
  <h1 className="text-xl font-black">{kind === 'inactive' ? 'Módulo Carteira não está ativo' : 'Carteira temporariamente indisponível'}</h1>
  <p className="mt-2 text-sm text-slate-400">{message}</p>
  {onRetry && <button type="button" onClick={onRetry} className="mt-5 min-h-11 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white">Tentar novamente</button>}
</section>;

const navigationIcons = { 'visao-geral': LayoutDashboard, cartoes: CreditCard, contas: Landmark, dividas: CalendarClock, receitas: TrendingUp, cobranca: Landmark, relatorio: LayoutDashboard, notificacoes: LayoutDashboard };

const WalletModule: React.FC<{ activeUser?: UserProfile | null }> = ({ activeUser }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const access = useWalletAccess();
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && navigator.onLine === false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState(false);
  const invalidate = useCallback(() => window.dispatchEvent(new Event('capitalflow:wallet-updated')), []);
  // Sincronização permanece automática; o status não ocupa espaço no cabeçalho.
  useWalletRealtime(access.status === 'active' ? access.userId : null, invalidate);
  const route = getWalletRoute(location.pathname);
  const go = useCallback((path: string) => navigate(`/carteira/${path}`), [navigate]);
  const prefetchWallet = useCallback(async (force: boolean) => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    setSyncing(true);
    setSyncError(false);
    const complete = await walletRepository.prefetchFull({ force });
    setSyncing(false);
    setSyncError(!complete);
  }, []);

  useEffect(() => {
    const syncNetwork = () => {
      const nowOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
      setOffline(nowOffline);
      if (!nowOffline && access.status === 'active') void prefetchWallet(true);
    };
    window.addEventListener('online', syncNetwork);
    window.addEventListener('offline', syncNetwork);
    return () => {
      window.removeEventListener('online', syncNetwork);
      window.removeEventListener('offline', syncNetwork);
    };
  }, [access.status, prefetchWallet]);

  useEffect(() => {
    if (access.status !== 'active') return;
    // Baixa todos os módulos lazy e dados completos da Carteira uma única vez para navegação instantânea e uso offline.
    void import('./pages/WalletCardsPage').catch(() => undefined);
    void import('./pages/WalletAccountsPage').catch(() => undefined);
    void import('./pages/WalletPayablesPage').catch(() => undefined);
    void import('./pages/WalletIncomePage').catch(() => undefined);
    void import('./pages/WalletReportPage').catch(() => undefined);
    if (!offline) {
      void prefetchWallet(false);
    }
  }, [access.status, offline, prefetchWallet]);

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
    <nav aria-label="Navegação da Carteira"
      className="mb-4 grid w-full min-w-0 grid-cols-5 gap-1 rounded-xl border border-slate-800 bg-slate-900/70 p-1 sm:flex sm:flex-wrap sm:gap-1.5">
      {WALLET_ROUTES.filter(item => item.key !== 'cobranca').map(item => {
        const Icon = navigationIcons[item.key];
        const active = route === item.key;
        const mobileLabel = item.key === 'visao-geral' ? 'Geral'
          : item.key === 'contas' ? 'Contas'
          : item.key === 'dividas' ? 'Pagar'
          : item.label;
        return (
          <button key={item.key} type="button"
            aria-current={active ? 'page' : undefined}
            onClick={() => go(item.key)} aria-label={item.label}
            className={`group flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-0.5 py-2 text-center transition-colors duration-150 active:scale-[0.98] sm:min-h-11 sm:flex-row sm:gap-2 sm:px-4 sm:py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400 ${
              active
                ? 'bg-blue-600/20 text-blue-100 ring-1 ring-inset ring-blue-500/50'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}>
            <Icon size={18} strokeWidth={active ? 2.2 : 1.9} aria-hidden="true"
              className={active ? 'text-blue-300' : 'text-slate-400 group-hover:text-slate-200'}/>
            <span className="whitespace-nowrap text-[10px] font-semibold leading-tight sm:hidden">{mobileLabel}</span>
            <span className="hidden whitespace-nowrap text-sm font-semibold sm:inline">{item.label}</span>
          </button>
        );
      })}
    </nav>
    <WalletBalanceDock />
    {offline && (
      <div role="status" className="mb-3 flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-950/25 px-3.5 py-2.5 text-xs text-amber-200">
        <WifiOff size={15} className="shrink-0 text-amber-300" />
        <span>Modo offline — exibindo dados salvos neste aparelho (somente consulta).</span>
      </div>
    )}
    {!offline && syncing && (
      <div role="status" className="mb-3 rounded-xl border border-blue-500/30 bg-blue-950/25 px-3.5 py-2.5 text-xs text-blue-200">
        Atualizando dados da Carteira para uso offline...
      </div>
    )}
    {!offline && syncError && !syncing && (
      <div role="alert" className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-950/25 px-3.5 py-2.5 text-xs text-amber-200">
        <span>Não foi possível atualizar a Carteira. Os dados salvos continuam disponíveis.</span>
        <button type="button" className="shrink-0 font-semibold underline" onClick={() => void prefetchWallet(true)}>Tentar novamente</button>
      </div>
    )}
    <WalletRouteView route={route} activeUser={activeUser} onNavigate={go}/>

    <WalletExpenseFab />
    <NativeWalletFileInbox />
  </main>;
};

export default WalletModule;

