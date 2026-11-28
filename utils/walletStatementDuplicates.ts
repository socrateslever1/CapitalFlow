import type { WalletStatementRow } from '../services/personalWallet.service';
import type { ParsedStatementRow } from './walletStatementPdf';

/** Conservative cross-file match; it is only a warning, never a deduplication key in the ledger. */
const normalized = (s: string): string => s.normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
const signature = (date: string, description: string, amount: number): string =>
  date + '|' + Math.round(amount * 100) + '|' + normalized(description);
const cardSignature = (date: string, description: string, amount: number): string =>
  date + '|' + Math.abs(Math.round(amount * 100)) + '|' + normalized(description);

export function detectPreviouslyImported(
  incoming: readonly ParsedStatementRow[],
  existing: readonly WalletStatementRow[],
  kind: 'ACCOUNT' | 'CARD',
  targetId: string,
  documentHash?: string,
): ReadonlySet<string> {
  const scoped = existing.filter(row => row.target_kind === kind && row.target_id === targetId);
  const crossFileSignatures = new Set(
    scoped
      .filter(row => !documentHash || row.document_hash !== documentHash)
      .map(row => kind === 'CARD'
        ? cardSignature(row.entry_date, row.description, Number(row.amount))
        : signature(row.entry_date, row.description, Number(row.amount)))
  );
  const sameFileKeys = new Set(
    documentHash
      ? scoped.filter(row => row.document_hash === documentHash).map(row => row.row_key)
      : []
  );
  return new Set(
    incoming
      .filter(row =>
        sameFileKeys.has(row.rowKey) ||
        crossFileSignatures.has(kind === 'CARD'
          ? cardSignature(row.date, row.description, row.amount)
          : signature(row.date, row.description, row.amount))
      )
      .map(row => row.rowKey)
  );
}

/**
 * Somente uma linha da MESMA origem documental, do MESMO cartão e ainda
 * sem compra contábil pode ser retomada. Nunca ignora duplicatas de outros
 * documentos ou itens financeiros concluídos.
 */
export function detectRecoverableStatementRows(
  incoming: readonly ParsedStatementRow[],
  existing: readonly WalletStatementRow[],
  kind: 'ACCOUNT' | 'CARD',
  targetId: string,
  documentHash: string,
): ReadonlySet<string> {
  if (kind !== 'CARD' || !documentHash) return new Set<string>();
  const scoped = existing.filter(previous =>
    previous.target_kind === 'CARD' && previous.target_id === targetId
  );
  return new Set(incoming.filter(row => {
    const exactMatches = scoped.filter(previous =>
      cardSignature(previous.entry_date, previous.description, Number(previous.amount))
        === cardSignature(row.date, row.description, row.amount)
    );
    // Same-document retries are idempotent even after the item was recorded.
    if (exactMatches.some(previous =>
      previous.document_hash === documentHash && previous.row_key === row.rowKey
    )) return true;

    // The RPC reuses one matching source row per call. It checks that the
    // linked expense is pending and unpaid before replacing it.
    return exactMatches.some(previous => previous.document_hash !== documentHash);
  }).map(row => row.rowKey));
}
