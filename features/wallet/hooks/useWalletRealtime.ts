import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabase';

export type WalletRealtimeStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';

const TABLES = [
  'personal_wallet_accounts', 'personal_wallet_cards', 'personal_wallet_expenses',
  'personal_wallet_expense_installments', 'personal_wallet_invoice_payments',
  'personal_wallet_account_operations', 'personal_wallet_statement_rows',
  'personal_wallet_payables', 'personal_wallet_payable_payments',
  'personal_wallet_recurring_incomes', 'personal_wallet_recurring_receipts',
  'personal_wallet_recurring_obligations', 'personal_wallet_recurring_obligation_issues',
] as const;

export const useWalletRealtime = (userId: string | null | undefined, onInvalidate: () => void) => {
  const [status, setStatus] = useState<WalletRealtimeStatus>('idle');
  const callbackRef = useRef(onInvalidate);
  callbackRef.current = onInvalidate;

  useEffect(() => {
    if (!userId || userId === 'DEMO') { setStatus('idle'); return; }
    let timer: ReturnType<typeof setTimeout> | undefined;
    setStatus('connecting');
    const scheduleRefresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => callbackRef.current(), 180);
    };
    let channel = supabase.channel(`wallet:${userId}`);
    for (const table of TABLES) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `owner_user_id=eq.${userId}` }, scheduleRefresh);
    }
    channel.subscribe(connection => {
      if (connection === 'SUBSCRIBED') setStatus('connected');
      else if (connection === 'CHANNEL_ERROR' || connection === 'TIMED_OUT') setStatus('error');
      else if (connection === 'CLOSED') setStatus('disconnected');
    });
    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  return status;
};
