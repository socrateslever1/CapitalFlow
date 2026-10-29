import type { LedgerEntry } from '../types';
import { getPaymentGroupKey, groupPaymentReceipts } from './paymentGroups';

/** A group is reversible only when its persisted identifiers allow an atomic RPC. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isLedgerReversal(entry: LedgerEntry): boolean {
  const type = String(entry.type || '').toUpperCase();
  return (
    ['ESTORNO', 'REVERSAL', 'AGREEMENT_PAYMENT_REVERSED', 'ESTORNO_INVALIDADO'].includes(type)
    || entry.category === 'ESTORNO' || !!entry.reversedOfTransactionId
  );
}

export function isLedgerAudit(entry: LedgerEntry): boolean {
  return entry.category === 'AUDIT' || entry.category === 'SISTEMA'
    || entry.type === 'SYSTEM' || entry.type === 'ADJUSTMENT'
    || String(entry.notes || '').trimStart().startsWith('{');
}

export function canReverseLedgerEntry(entry: LedgerEntry, reversedIds: Set<string>, reversedKeys: Set<string>): boolean {
  if (isLedgerReversal(entry) || isLedgerAudit(entry) || Number(entry.amount) <= 0
    || reversedIds.has(entry.id) || reversedKeys.has(getPaymentGroupKey(entry))
    || !!entry.meta?.reversed_at) return false;
  const kind = String(entry.type || '').toUpperCase();
  const key = getPaymentGroupKey(entry);
  if (kind === 'AGREEMENT_PAYMENT') {
    return UUID.test(key)
      && UUID.test(String(entry.meta?.agreement_id || entry.agreementId || ''))
      && UUID.test(String(entry.meta?.agreement_installment_id || entry.installmentId || ''))
      && UUID.test(String(entry.meta?.payment_group_id || ''));
  }
  if (kind.includes('PAYMENT')) return !!key;
  if (kind === 'LEND_MORE' || kind === 'NOVO_APORTE') return UUID.test(key);
  return false;
}

export function getLedgerReversalIndex(entries: LedgerEntry[]) {
  const reversedIds = new Set<string>();
  const reversedKeys = new Set<string>();
  for (const entry of entries) {
    if (!isLedgerReversal(entry)) continue;
    if (entry.reversedOfTransactionId) reversedIds.add(entry.reversedOfTransactionId);
    const key = String(entry.meta?.reversal_of_idempotency_key || '').trim();
    if (key) reversedKeys.add(key);
  }
  return { reversedIds, reversedKeys };
}

/** Accounting date first; createdAt is a tie-breaker for same-day operations. */
export function sortLedgerForDisplay(entries: LedgerEntry[]): LedgerEntry[] {
  const compare = (a: LedgerEntry, b: LedgerEntry) => {
    const ad = String(a.date || '').slice(0, 10);
    const bd = String(b.date || '').slice(0, 10);
    const dateCmp = bd.localeCompare(ad);
    if (dateCmp) return dateCmp;
    const at = Date.parse(a.createdAt || a.date || '') || 0;
    const bt = Date.parse(b.createdAt || b.date || '') || 0;
    if (at !== bt) return bt - at;
    return String(b.id).localeCompare(String(a.id));
  };
  return [...entries].sort(compare);
}

/** Never aggregate distinct payments merely because their date/amount match. */
export function getLedgerDisplayEvents(ledger: LedgerEntry[]): LedgerEntry[] {
  return sortLedgerForDisplay(groupPaymentReceipts(ledger));
}

export function getLedgerDayKey(entry: LedgerEntry): string {
  return String(entry.date || '').slice(0, 10);
}

/** UTC-midnight accounting dates do not represent a real payment time. */
export function formatLedgerTime(entry: LedgerEntry): string | null {
  const value = String(entry.date || '');
  if (!value || /^\d{4}-\d{2}-\d{2}(?:[T ]00:00:00(?:\.0+)?(?:Z|\+00(?::00)?)?)?$/.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
