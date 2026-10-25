import React from 'react';
import PersonalWalletPage from '../../../pages/PersonalWalletPage';
import type { UserProfile } from '../../../types';

export const WalletIncomePage: React.FC<{ activeUser?: UserProfile | null; onNavigate: (path: string) => void }> = ({ activeUser, onNavigate }) =>
  <PersonalWalletPage activeUser={activeUser} initialTab="receitas" moduleView="income" onTabChange={tab => onNavigate(tab === 'extrato' ? 'cartoes' : tab === 'contas' ? 'contas' : tab === 'dividas' ? 'dividas' : 'receitas')}/>;
