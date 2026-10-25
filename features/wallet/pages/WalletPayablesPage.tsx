import React from 'react';
import PersonalWalletPage from '../../../pages/PersonalWalletPage';
import type { UserProfile } from '../../../types';

export const WalletPayablesPage: React.FC<{ activeUser?: UserProfile | null; onNavigate: (path: string) => void }> = ({ activeUser, onNavigate }) =>
  <PersonalWalletPage activeUser={activeUser} initialTab="dividas" moduleView="payables" onTabChange={tab => onNavigate(tab === 'extrato' ? 'cartoes' : tab === 'contas' ? 'contas' : tab === 'dividas' ? 'dividas' : 'receitas')}/>;
