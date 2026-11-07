import type { WalletStatementRow } from '../services/personalWallet.service';
import type { ParsedStatementRow } from './walletStatementPdf';

/** Conservative cross-file match; it is only a warning, never a deduplication key in the ledger. */
const normalized = (s: string): string => s.normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
const signature = (date: string, description: string, amount: number): string =>
  date + '|' + Math.round(amount * 100) + '|' + normalized(description);

export function detectPreviouslyImported(
  incoming: readonly ParsedStatementRow[],
  existing: readonly WalletStatementRow[],
  kind: 'ACCOUNT' | 'CARD',
  targetId: string,
): ReadonlySet<string> {
  const signatures = new Set(existing.filter(row => row.target_kind === kind && row.target_id === targetId)
    .map(row => signature(row.entry_date, row.description, Number(row.amount))));
  return new Set(incoming.filter(row => signatures.has(signature(row.date, row.description, row.amount)))
    .map(row => row.rowKey));
}
