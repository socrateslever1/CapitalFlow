import type { CapitalSource } from '../../../types';
import type { PersonalWalletAccount } from '../../../services/personalWallet.service';

/** Crédito/limite não é dinheiro em caixa e contas espelho não constituem fundos extras. */
export const canMoveCapitalSource = (
  source: CapitalSource,
  accounts: readonly PersonalWalletAccount[],
): boolean => {
  const state = source as CapitalSource & { archived_at?: string | null };
  return !state.archived_at
    && !['CARD', 'MISTO'].includes(source.type)
    && Number.isFinite(Number(source.balance))
    && Number(source.balance) > 0
    && !accounts.some(account =>
      !account.archived_at && account.capital_source_id === source.id);
};

export const getMovableCapitalTotal = (
  sources: readonly CapitalSource[],
  accounts: readonly PersonalWalletAccount[],
): number => sources.reduce((total, source) =>
  total + (canMoveCapitalSource(source, accounts)
    ? Math.round(Number(source.balance) * 100) : 0), 0) / 100;

export const validateCapitalMovement = (
  amount: number,
  source: CapitalSource | undefined,
  account: PersonalWalletAccount | undefined,
  accounts: readonly PersonalWalletAccount[],
): string | null => {
  if (!source || !canMoveCapitalSource(source, accounts)) return 'Escolha uma fonte com saldo transferível.';
  if (!account || account.archived_at) return 'Escolha uma conta ativa da Minha Carteira.';
  if (account.capital_source_id === source.id) return 'Conta e fonte são o mesmo saldo. Não é possível duplicá-lo.';
  if (!Number.isFinite(amount) || amount <= 0 || amount !== Math.round(amount * 100) / 100) return 'Informe um valor válido em reais e centavos.';
  if (Math.round(amount * 100) > Math.round(Number(source.balance) * 100)) return 'O valor excede o saldo da fonte.';
  return null;
};
