import React from 'react';
import PersonalWalletPage from '../../../pages/PersonalWalletPage';
import type { UserProfile } from '../../../types';

export const WalletOverviewPage: React.FC<{ activeUser?: UserProfile | null; onNavigate: (path: string) => void }> = ({ activeUser, onNavigate }) =>
  <PersonalWalletPage activeUser={activeUser} initialTab="extrato" moduleView="overview" onTabChange={tab => onNavigate(tab === 'extrato' ? 'cartoes' : tab === 'contas' ? 'contas' : tab === 'dividas' ? 'dividas' : 'receitas')}/>;
