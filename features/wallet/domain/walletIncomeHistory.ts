/** Pure classification of historical incoming operations; none is a pending receivable.
 * Opening balances, balance corrections, refunds and internal transfers are not income.
 * Their original ledger rows remain available in account statements. */
export type IncomeOperation = {
  id: string;
  operation_type: string;
  operation_date: string;
  amount: number;
  description: string;
  category?: string | null;
  voided_at?: string | null;
  voids_operation_id?: string | null;
};
const normalized = (value: string): string => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function isExternalIncome(op: IncomeOperation, operations: readonly IncomeOperation[]): boolean {
  // Estorno e registro anulado permanecem no livro de auditoria,
  // mas nunca são receita válida no histórico operacional.
  if (op.voided_at || op.voids_operation_id) return false;
  if (op.operation_type !== 'INCOME') return false;
  const category = normalized(op.category || '');
  const description = normalized(op.description || '');
  if (/(saldo inicial|ajuste de saldo|estorno de lancamento|reconciliacao)/.test(category) ||
      /^(saldo inicial|reajuste de saldo|estorno:)/.test(description)) return false;
  // A matching transfer on the same date and amount is a movement of money,
  // not new revenue. Without this corroboration, do not silently recategorize.
  if (/transferencia|transferir/.test(description) &&
    operations.some(other => other.operation_type === 'TRANSFER' &&
      other.operation_date.slice(0, 10) === op.operation_date.slice(0, 10) &&
      Math.round(Number(other.amount) * 100) === Math.round(Number(op.amount) * 100))) return false;
  return Number.isFinite(Number(op.amount)) && Number(op.amount) > 0;
}
