import React from 'react';
import type { UserProfile } from '../../types';
import { WalletOverviewPage } from './pages/WalletOverviewPage';
import { WalletCardsPage } from './pages/WalletCardsPage';
import { WalletAccountsPage } from './pages/WalletAccountsPage';
import { WalletPayablesPage } from './pages/WalletPayablesPage';
import { WalletIncomePage } from './pages/WalletIncomePage';
import { WalletChargePage } from './pages/WalletChargePage';

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
  if (route === 'cartoes') return <WalletCardsPage activeUser={activeUser} onNavigate={onNavigate}/>;
  if (route === 'contas') return <WalletAccountsPage activeUser={activeUser} onNavigate={onNavigate}/>;
  if (route === 'dividas') return <WalletPayablesPage activeUser={activeUser} onNavigate={onNavigate}/>;
  if (route === 'receitas') return <WalletIncomePage activeUser={activeUser} onNavigate={onNavigate}/>;
  if (route === 'cobranca') return <WalletChargePage activeUser={activeUser}/>;
  return <WalletOverviewPage activeUser={activeUser} onNavigate={onNavigate}/>;
};
