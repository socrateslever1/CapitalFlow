import React, { useMemo } from 'react';
import type { UserProfile } from '../../../types';
import { RecurringIncomePanel } from '../../../components/wallet/RecurringIncomePanel';
import { useWalletSnapshot } from '../hooks/useWalletSnapshot';
import { WalletPageFrame } from '../components/WalletPageFrame';

export const WalletIncomePage: React.FC<{ activeUser?: UserProfile | null; onNavigate: (path: string) => void }> = () => {
  const { data, loading, error, refresh } = useWalletSnapshot();
  const month = new Date().toLocaleDateString('en-CA').slice(0, 7);
  const receivedIds = useMemo(() => new Set((data?.recurringReceipts || [])
    .filter(receipt => String(receipt.reference_month).slice(0, 7) === month)
    .map(receipt => receipt.income_id)), [data, month]);
  return <WalletPageFrame title="Receitas" description="Salários e recebimentos recorrentes confirmados."
    error={error} loading={loading} onRefresh={() => { void refresh().catch(() => {}); }}>
    {data && <div className="grid lg:grid-cols-12">
      <div className="min-w-0 lg:col-span-12">
        <RecurringIncomePanel accounts={data.accounts} incomes={data.recurringIncomes}
          receivedIds={receivedIds} onSaved={async () => { await refresh(); }}/>
      </div>
    </div>}
  </WalletPageFrame>;
};