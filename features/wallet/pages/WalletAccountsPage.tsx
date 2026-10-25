import React from 'react';
import PersonalWalletPage from '../../../pages/PersonalWalletPage';
import type { UserProfile } from '../../../types';

export const WalletAccountsPage: React.FC<{ activeUser?: UserProfile | null; onNavigate: (path: string) => void }> = ({ activeUser, onNavigate }) =>
  <PersonalWalletPage activeUser={activeUser} initialTab="contas" moduleView="accounts" onTabChange={tab => onNavigate(tab === 'extrato' ? 'cartoes' : tab === 'contas' ? 'contas' : tab === 'dividas' ? 'dividas' : 'receitas')}/>;
