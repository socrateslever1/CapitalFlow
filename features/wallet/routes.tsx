import React from 'react';
import type { UserProfile } from '../../types';
// Each section is downloaded only when opened: large card editors and PDF
// importers no longer slow the first view of the wallet.
const WalletOverviewPage = React.lazy(() => import('./pages/WalletOverviewPage').then(m => ({ default: m.WalletOverviewPage })));
const WalletCardsPage = React.lazy(() => import('./pages/WalletCardsPage').then(m => ({ default: m.WalletCardsPage })));
const WalletAccountsPage = React.lazy(() => import('./pages/WalletAccountsPage').then(m => ({ default: m.WalletAccountsPage })));
const WalletPayablesPage = React.lazy(() => import('./pages/WalletPayablesPage').then(m => ({ default: m.WalletPayablesPage })));
const WalletIncomePage = React.lazy(() => import('./pages/WalletIncomePage').then(m => ({ default: m.WalletIncomePage })));
const WalletChargePage = React.lazy(() => import('./pages/WalletChargePage').then(m => ({ default: m.WalletChargePage })));

export type WalletRouteKey = 'visao-geral' | 'cartoes' | 'contas' | 'dividas' | 'receitas' | 'cobranca';
export const WALLET_ROUTES: ReadonlyArray<{ key: WalletRouteKey; label: string }> = [
  { key: 'visao-geral', label: 'Visão geral' },
  { key: 'cartoes', label: 'Cartões' },
  { key: 'contas', label: 'Contas & PIX' },
  { key: 'dividas', label: 'Compromissos' },
  { key: 'receitas', label: 'Receitas' },
  { key: 'cobranca', label: 'Cobrar' },
];

export const getWalletRoute = (pathname: string): WalletRouteKey => {
  const segment = pathname.match(/^\/carteira\/([^/]+)/)?.[1] as WalletRouteKey | undefined;
  return segment && WALLET_ROUTES.some(route => route.key === segment) ? segment : 'visao-geral';
};

export const WalletRouteView: React.FC<{ route: WalletRouteKey; activeUser?: UserProfile | null; onNavigate: (path: string) => void }> = ({ route, activeUser, onNavigate }) => {
  const view = route === 'cartoes' ? <WalletCardsPage activeUser={activeUser} onNavigate={onNavigate}/>
    : route === 'contas' ? <WalletAccountsPage activeUser={activeUser} onNavigate={onNavigate}/>
    : route === 'dividas' ? <WalletPayablesPage activeUser={activeUser} onNavigate={onNavigate}/>
    : route === 'receitas' ? <WalletIncomePage activeUser={activeUser} onNavigate={onNavigate}/>
    : route === 'cobranca' ? <WalletChargePage activeUser={activeUser}/>
    : <WalletOverviewPage activeUser={activeUser} onNavigate={onNavigate}/>;
  return <React.Suspense fallback={<div role="status" aria-label="Carregando seção da Carteira"
    className="grid gap-3 animate-pulse sm:grid-cols-2">
      <div className="h-40 rounded-xl bg-slate-900"/>
      <div className="h-40 rounded-xl bg-slate-900"/>
    </div>}>{view}</React.Suspense>;
};
