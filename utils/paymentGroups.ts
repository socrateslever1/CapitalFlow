import type { LedgerEntry } from '../types';

export function getPaymentGroupKey(entry: { idempotencyKey?: string | null; idempotency_key?: string | null }): string {
  return String(entry.idempotencyKey ?? entry.idempotency_key ?? '').trim().replace(/(_lucro|_profit|-OVERPAY)$/i, '');
}

// Never infer a financial event from its date or amount: separate payments can
// share both. Only a persisted event key authorizes grouping its accounting legs.
export type GroupedReceipt<T extends LedgerEntry> = T & { receiptParts?: T[] };

export function groupPaymentReceipts<T extends LedgerEntry>(ledger: T[]): GroupedReceipt<T>[] {
  const result: GroupedReceipt<T>[] = [];
  const groups = new Map<string, GroupedReceipt<T>>();
  const seen = new Set<string>();
  for (const entry of ledger) {
    if (entry.id && seen.has(entry.id)) continue;
    if (entry.id) seen.add(entry.id);
    const key = getPaymentGroupKey(entry);
    const payment = String(entry.type).includes('PAYMENT') && entry.type !== 'AGREEMENT_PAYMENT'
      && Number(entry.amount) > 0 && !entry.reversedOfTransactionId
      && ['PAGAMENTO', 'LUCRO', 'RECEBIMENTO'].includes(String(entry.category));
    if (!key || !payment) { result.push(entry); continue; }
    const scopeKey = `${String((entry as T & { loanId?: string }).loanId || '')}:${key}`;
    const current = groups.get(scopeKey);
    if (!current) {
      const grouped = { ...entry, idempotencyKey: key, receiptParts: [entry] };
      groups.set(scopeKey, grouped); result.push(grouped); continue;
    }
    for (const field of ['amount', 'principalDelta', 'interestDelta', 'lateFeeDelta'] as const) {
      current[field] = Math.round((Number(current[field] || 0) + Number(entry[field] || 0)) * 100) / 100;
    }
    current.category = 'RECEBIMENTO';
    current.notes = 'Recebimento registrado (capital + lucro).';
    current.receiptParts!.push(entry);
  }
  return result;
}
