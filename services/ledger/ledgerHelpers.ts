// services/ledger/ledgerHelpers.ts
import { LedgerEntry, UserProfile } from '../../types';
import { safeUUID } from '../../utils/uuid';

export type NormalizedTransaction = {
  id: string;
  type: string;
  amount: number;
  sourceId: string | null;
  installmentId: string | null;
  principalDelta: number;
  interestDelta: number;
  lateFeeDelta: number;
  notes: string;
  meta?: any;
};

export function getOwnerId(activeUser: UserProfile): string {
  const anyUser = activeUser as any;
  return anyUser?.supervisor_id || activeUser.id;
}

export function clampNonNegative(n: number): number {
  return Math.max(0, Number(n) || 0);
}

export function toNumber(n: any): number {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

export function normalizeTransaction(transaction: LedgerEntry): NormalizedTransaction {
  const t: any = transaction as any;

  const id = String(t.id || '');
  const type = String(t.type || '');

  const amount = toNumber(t.amount);

  const sourceId = t.sourceId ?? t.source_id ?? null;
  const installmentId = t.installmentId ?? t.installment_id ?? null;

  const principalDelta = toNumber(t.principalDelta ?? t.principal_delta ?? 0);
  const interestDelta = toNumber(t.interestDelta ?? t.interest_delta ?? 0);
  const lateFeeDelta = toNumber(t.lateFeeDelta ?? t.late_fee_delta ?? 0);

  const notes = String(t.notes || '');
  const meta = t.meta ?? null;

  return {
    id,
    type,
    amount,
    sourceId: safeUUID(sourceId),
    installmentId: safeUUID(installmentId),
    principalDelta,
    interestDelta,
    lateFeeDelta,
    notes,
    meta,
  };
}

export function isPaymentTx(txType: string): boolean {
  return typeof txType === 'string' && txType.includes('PAYMENT');
}

/**
 * Transações de "saída de capital" que devem ser estornadas devolvendo o capital ao caixa.
 * - LEND_MORE: empréstimo / aporte (saída)
 * - NOVO_APORTE: renovação com aporte (saída)
 */
export function isLendMoreTx(txType: string): boolean {
  return txType === 'LEND_MORE' || txType === 'NOVO_APORTE';
}

export function isAporteTx(txType: string): boolean {
  return txType === 'NOVO_APORTE';
}

/**
 * Regras:
 * - Pagamento: estorno do caixa (fonte) = -principalDelta (remove capital recebido)
 * - LEND_MORE / NOVO_APORTE: estorno do caixa (fonte) = +amount (devolve ao caixa)
 */
export function calcSourceBalanceDelta(tx: NormalizedTransaction): number {
  if (isPaymentTx(tx.type)) return -toNumber(tx.principalDelta);
  if (isLendMoreTx(tx.type)) return toNumber(tx.amount);
  return 0;
}

/**
 * Regras:
 * - Pagamento: lucro a remover = juros + multa
 * - Outros: 0
 */
export function calcProfitToRemove(tx: NormalizedTransaction): number {
  if (!isPaymentTx(tx.type)) return 0;
  return toNumber(tx.interestDelta) + toNumber(tx.lateFeeDelta);
}