import type { Loan } from '../types';

const deletedContractsKey = (ownerId: string) => `cf_deleted_contract_ids_${ownerId}`;

const canUseLocalStorage = () => typeof localStorage !== 'undefined';

export const readDeletedContractIds = (ownerId?: string | null): Set<string> => {
  if (!ownerId || !canUseLocalStorage()) return new Set();

  try {
    const raw = localStorage.getItem(deletedContractsKey(ownerId));
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter(Boolean) : []);
  } catch {
    return new Set();
  }
};

export const markDeletedContracts = (ownerId: string | null | undefined, loanIds: Array<string | null | undefined>) => {
  if (!ownerId || !canUseLocalStorage()) return;

  const next = readDeletedContractIds(ownerId);
  loanIds.filter(Boolean).forEach((loanId) => next.add(String(loanId)));

  try {
    localStorage.setItem(deletedContractsKey(ownerId), JSON.stringify(Array.from(next)));
  } catch (error) {
    console.warn('[DeletedContracts] Falha ao persistir contratos removidos:', error);
  }
};

export const markDeletedContract = (ownerId: string | null | undefined, loanId: string | null | undefined) => {
  markDeletedContracts(ownerId, [loanId]);
};

export const filterDeletedLoans = <T extends Pick<Loan, 'id'>>(
  ownerId: string | null | undefined,
  loans: T[] | undefined
): T[] => {
  const deletedIds = readDeletedContractIds(ownerId);
  if (!deletedIds.size) return loans || [];
  return (loans || []).filter((loan) => !deletedIds.has(String(loan.id)));
};
