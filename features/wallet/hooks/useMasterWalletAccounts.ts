import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';

export type MasterWalletAccount = {
  id: string;
  nickname: string;
  bank_name: string | null;
  account_type: string;
  balance: number;
  capital_source_id: string | null;
};

export function useMasterWalletAccounts() {
  const [isMaster, setIsMaster] = useState(false);
  const [accounts, setAccounts] = useState<MasterWalletAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    const { data: authorized, error: accessError } = await supabase.rpc('is_platform_super_admin');
    if (accessError) throw new Error('Não foi possível validar o acesso à Carteira.');
    if (!authorized) {
      setIsMaster(false);
      setAccounts([]);
      return;
    }
    const { data, error: listError } = await supabase
      .from('personal_wallet_accounts')
      .select('id,nickname,bank_name,account_type,balance,capital_source_id')
      .is('archived_at', null)
      .order('created_at', { ascending: true });
    if (listError) throw new Error('Não foi possível consultar suas contas.');
    setIsMaster(true);
    setAccounts((data || []) as MasterWalletAccount[]);
  }, []);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const { data: authorized, error: authError } = await supabase.rpc('is_platform_super_admin');
        if (authError) throw new Error('Falha ao verificar a permissão da Carteira.');
        if (!authorized) {
          if (mounted) { setIsMaster(false); setAccounts([]); }
          return;
        }
        const { data, error: listError } = await supabase
          .from('personal_wallet_accounts')
          .select('id,nickname,bank_name,account_type,balance,capital_source_id')
          .is('archived_at', null)
          .order('created_at', { ascending: true });
        if (listError) throw new Error('Não foi possível carregar suas contas.');
        if (mounted) {
          setIsMaster(true);
          setAccounts((data || []) as MasterWalletAccount[]);
        }
      } catch (cause: any) {
        if (mounted) setError(cause?.message || 'Falha ao consultar a Carteira.');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => { mounted = false; };
  }, []);

  const ensureCapitalSource = useCallback(async (accountId: string) => {
    if (!isMaster) throw new Error('Apenas o administrador master pode escolher uma conta.');
    if (!accounts.some(account => account.id === accountId)) {
      throw new Error('Conta não encontrada na Carteira.');
    }
    const { data, error: linkError } = await supabase.rpc('personal_wallet_ensure_capital_source', {
      p_account_id: accountId,
    });
    if (linkError) throw new Error(linkError.message);
    if (typeof data !== 'string') throw new Error('O vínculo com a conta não foi confirmado.');
    setAccounts(current => current.map(account => account.id === accountId
      ? { ...account, capital_source_id: data } : account));
    return data as string;
  }, [accounts, isMaster]);

  return { isMaster, accounts, loading, error, refresh, ensureCapitalSource };
}
