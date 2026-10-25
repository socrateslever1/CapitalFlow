import React, { useEffect, useState } from 'react';
import { WalletPixCharge } from '../../../components/wallet/WalletPixCharge';
import type { UserProfile } from '../../../types';
import { walletRepository, type WalletSnapshot } from '../services/walletRepository';

export const WalletChargePage: React.FC<{ activeUser?: UserProfile | null }> = ({ activeUser }) => {
  const [snapshot, setSnapshot] = useState<WalletSnapshot | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { let mounted = true; walletRepository.load().then(data => { if (mounted) setSnapshot(data); }).catch(reason => { if (mounted) setError(reason instanceof Error ? reason.message : 'Falha ao carregar contas.'); }); return () => { mounted = false; }; }, []);
  if (error) return <div role="alert" className="rounded-2xl border border-rose-500/30 bg-rose-950/20 p-5 text-sm text-rose-200">{error}</div>;
  if (!snapshot) return <div className="h-72 animate-pulse rounded-2xl bg-slate-900"/>;
  return <WalletPixCharge embedded accounts={snapshot.accounts} recipient={activeUser?.fullName || activeUser?.name || ''} city={activeUser?.city} onClose={() => {}}/>;
};
