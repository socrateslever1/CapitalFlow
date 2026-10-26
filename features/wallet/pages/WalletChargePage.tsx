import React from 'react';
import { WalletPixCharge } from '../../../components/wallet/WalletPixCharge';
import type { UserProfile } from '../../../types';
import { useWalletSnapshot } from '../hooks/useWalletSnapshot';

export const WalletChargePage: React.FC<{ activeUser?: UserProfile | null }> = ({ activeUser }) => {
  const { data: snapshot, loading, error, refresh } = useWalletSnapshot();
  if (error) return <div role="alert" className="rounded-2xl border border-rose-500/30 bg-rose-950/20 p-5 text-sm text-rose-200">{error}</div>;
  if (loading || !snapshot) return <div className="h-72 animate-pulse rounded-2xl bg-slate-900"/>;
  return <WalletPixCharge embedded accounts={snapshot.accounts} recipient={activeUser?.fullName || activeUser?.name || ''}
    city={activeUser?.city} onClose={() => {}} onSaved={async () => { await refresh(); }}/>;
};
