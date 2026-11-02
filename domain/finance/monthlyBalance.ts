/** Projeção exclusivamente de leitura: nenhum lançamento é criado ou alterado. */
export interface FinancialMovement {
  id: string;
  loan_id: string | null;
  source_id: string | null;
  date: string;
  type: string | null;
  category: string | null;
  amount: number | string | null;
  principal_delta: number | string | null;
  interest_delta: number | string | null;
  late_fee_delta: number | string | null;
  notes?: string | null;
  idempotency_key?: string | null;
}
export interface BalanceLine {
  id: string;
  date: string;
  loanId: string | null;
  sourceId: string | null;
  type: string;
  category: 'RECEBIMENTO' | 'APLICACAO' | 'RETIRADA' | 'PERDA' | 'PENDENCIA';
  principal: number;
  profit: number;
  unclassified: number;
  lent: number;
  withdrawal: number;
  loss: number;
  notes: string;
}
export interface MonthlyBalance {
  month: string;
  principal: number;
  profit: number;
  totalReceived: number;
  unclassified: number;
  lent: number;
  withdrawal: number;
  loss: number;
  reversed: number;
  count: number;
  entries: BalanceLine[];
}

const paymentTypes = new Set(['PAYMENT','PAYMENT_RECEIVED','PAYMENT_PROFIT','PAYMENT_PRINCIPAL',
  'PAYMENT_FULL','PAYMENT_PARTIAL','AGREEMENT_PAYMENT']);
const reversalTypes = new Set(['ESTORNO','REVERSAL','AGREEMENT_PAYMENT_REVERSED']);
const disbursementTypes = new Set(['LOAN_INITIAL','LOAN_CREATED','NEW_LOAN','LEND_MORE','NOVO_APORTE','APORTE']);
const lossTypes = new Set(['LOSS','BAD_DEBT_WRITE_OFF','WRITE_OFF']);
const toCents = (value: unknown): number => {
  if (typeof value !== 'string' && typeof value !== 'number') return 0;
  const n = Number(value);
  return Number.isFinite(n) && Math.abs(n) <= 1e12 ? Math.round(n * 100) : 0;
};
const money = (cents: number): number => Math.round(cents) / 100;

/** Accounting month follows the business timezone, not UTC midnight. */
export const localAccountingMonth = (value: string): string | null => {
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Manaus',
    year: 'numeric', month: '2-digit' }).format(date).replace(/^(\d{2})\/(\d{4})$/, '$2-$1');
};
const empty = (month: string): MonthlyBalance => ({ month, principal: 0, profit: 0,
  totalReceived: 0, unclassified: 0, lent: 0, withdrawal: 0, loss: 0,
  reversed: 0, count: 0, entries: [] });

/** Independent projection of persisted, signed ledger components in integer centavos. */
export function buildMonthlyBalances(
  movements: readonly FinancialMovement[],
  excludedSourceIds: ReadonlySet<string> = new Set(),
): MonthlyBalance[] {
  type Bucket = { month: string; capital: number; gain: number; received: number;
    unknown: number; lent: number; withdrawal: number; loss: number;
    reversal: number; lines: BalanceLine[] };
  const buckets = new Map<string, Bucket>();
  const seen = new Set<string>();
  for (const movement of movements) {
    if (!movement.id || seen.has(movement.id)) continue;
    seen.add(movement.id);
    if (movement.source_id && excludedSourceIds.has(movement.source_id)) continue;
    if (['TEST', 'TESTE', 'SANDBOX', 'HOMOLOGACAO'].includes(String(movement.category || '').toUpperCase())) continue;
    const month = localAccountingMonth(movement.date);
    if (!month) continue;
    const type = String(movement.type || '').toUpperCase();
    const amount = toCents(movement.amount);
    const principal = toCents(movement.principal_delta);
    const profit = toCents(movement.interest_delta) + toCents(movement.late_fee_delta);
    let capitalCents = 0, profitCents = 0, unknownCents = 0, lentCents = 0, withdrawalCents = 0, lossCents = 0;
    let category: BalanceLine['category'];
    if (paymentTypes.has(type) || reversalTypes.has(type)) {
      // Reversals must reduce the original month's totals only when posted there;
      // a reversal posted later is reflected in the later accounting month.
      if (reversalTypes.has(type) && amount >= 0 && principal >= 0 && profit >= 0) continue;
      capitalCents = principal;
      profitCents = profit;
      unknownCents = amount - principal - profit;
      category = unknownCents !== 0 ? 'PENDENCIA' : 'RECEBIMENTO';
    } else if (disbursementTypes.has(type)) {
      lentCents = Math.abs(amount);
      category = 'APLICACAO';
    } else if (type === 'PROFIT_WITHDRAWAL' || type === 'WITHDRAWAL') {
      withdrawalCents = Math.abs(amount);
      category = 'RETIRADA';
    } else if (lossTypes.has(type)) {
      lossCents = Math.abs(amount);
      category = 'PERDA';
    } else {
      continue; // audit, capitalizations, source transfers, forecasts are not receipts
    }
    if (![capitalCents,profitCents,unknownCents,lentCents,withdrawalCents,lossCents].some(Boolean)) continue;
    const bucket = buckets.get(month) || { month,capital:0,gain:0,received:0,unknown:0,lent:0,withdrawal:0,loss:0,reversal:0,lines:[] };
    bucket.capital += capitalCents;
    bucket.gain += profitCents;
    bucket.received += capitalCents + profitCents;
    bucket.unknown += unknownCents;
    bucket.lent += lentCents;
    bucket.withdrawal += withdrawalCents;
    bucket.loss += lossCents;
    if (reversalTypes.has(type)) bucket.reversal += amount;
    bucket.lines.push({
      id: movement.id, date: movement.date, loanId: movement.loan_id,
      sourceId: movement.source_id, type, category,
      principal: money(capitalCents), profit: money(profitCents),
      unclassified: money(unknownCents), lent: money(lentCents),
      withdrawal: money(withdrawalCents), loss: money(lossCents),
      notes: String(movement.notes || '').slice(0,250),
    });
    buckets.set(month, bucket);
  }
  return [...buckets.values()].sort((a,b)=>b.month.localeCompare(a.month)).map(bucket => ({
    month: bucket.month,principal: money(bucket.capital),profit: money(bucket.gain),
    totalReceived: money(bucket.received),unclassified: money(bucket.unknown),
    lent: money(bucket.lent),withdrawal: money(bucket.withdrawal),
    loss: money(bucket.loss),reversed: money(bucket.reversal),
    count: bucket.lines.length,
    entries: bucket.lines.sort((a,b)=>b.date.localeCompare(a.date) || b.id.localeCompare(a.id)),
  }));
}
