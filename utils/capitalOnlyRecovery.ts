import { Loan } from '../types';

export const CAPITAL_ONLY_RECOVERY_MARKER = '[CAPITAL_ONLY_RECOVERY]';

export function isCapitalOnlyRecoveryLoan(loan: Partial<Loan> | null | undefined): boolean {
  return String(loan?.notes || '').includes(CAPITAL_ONLY_RECOVERY_MARKER);
}

export function addCapitalOnlyRecoveryMarker(notes: string | null | undefined): string {
  const current = String(notes || '').trim();
  if (current.includes(CAPITAL_ONLY_RECOVERY_MARKER)) return current;
  return `${current ? `${current}\n` : ''}${CAPITAL_ONLY_RECOVERY_MARKER} Somente capital: recuperar apenas o principal, sem juros ou encargos.`;
}

export function removeCapitalOnlyRecoveryMarker(notes: string | null | undefined): string {
  return String(notes || '')
    .split('\n')
    .filter((line) => !line.includes(CAPITAL_ONLY_RECOVERY_MARKER))
    .join('\n')
    .trim();
}

export function clientHasCapitalOnlyRecovery(loans: Loan[], client: { id?: string; name?: string; document?: string }): boolean {
  const doc = String(client.document || '').replace(/\D/g, '');
  const name = String(client.name || '').trim().toLowerCase();

  return loans.some((loan) => {
    if (!isCapitalOnlyRecoveryLoan(loan)) return false;
    if (client.id && loan.clientId === client.id) return true;
    if (doc && String(loan.debtorDocument || '').replace(/\D/g, '') === doc) return true;
    return !!name && String(loan.debtorName || '').trim().toLowerCase() === name;
  });
}
