import React from 'react';
import { WalletPixCharge } from '../../../components/wallet/WalletPixCharge';
import type { UserProfile } from '../../../types';
import { useWalletSnapshot } from '../hooks/useWalletSnapshot';
import { WalletPageFrame } from '../components/WalletPageFrame';

export const WalletChargePage: React.FC<{ activeUser?: UserProfile | null }> = ({ activeUser }) => {
  const { data: snapshot, loading, error, refresh } = useWalletSnapshot();
  return <WalletPageFrame title="Cobranças" description="Crie e acompanhe cobranças PIX vinculadas às suas contas."
    error={error} loading={loading} onRefresh={() => { void refresh().catch(() => {}); }}>
    {snapshot && <WalletPixCharge embedded accounts={snapshot.accounts} recipient={activeUser?.fullName || activeUser?.name || ''}
      city={activeUser?.city} onClose={() => {}} onSaved={async () => { await refresh(); }}/>}
  </WalletPageFrame>;
};
