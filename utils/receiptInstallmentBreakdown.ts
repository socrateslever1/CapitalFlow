import type { AgreementInstallment, LedgerEntry, Loan } from '../types';

export interface ReceiptInstallmentAllocation {
  installmentId: string;
  number: number;
  amount: number;
  scheduledAmount: number | null;
  coverage: 'INTEGRAL' | 'PARCIAL' | 'APLICADO';
}

export interface ReceiptInstallmentBreakdown {
  allocations: ReceiptInstallmentAllocation[];
  unidentifiedAmount: number;
}

const toCents = (value: unknown): number | null => {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !/^-?\d+(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) : null;
};

const validNumber = (value: unknown): number | null => {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
};

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;

/**
 * Read-only payment attribution. Never guess installments from the date,
 * amount or current balance, and never change the financial ledger.
 */
export function getReceiptInstallmentBreakdown(entry: LedgerEntry, loan: Loan): ReceiptInstallmentBreakdown {
  const received = toCents(entry.amount);
  const empty: ReceiptInstallmentBreakdown = { allocations: [], unidentifiedAmount: received === null ? 0 : received / 100 };
  if (received === null || received === 0 || !String(entry.type).includes('PAYMENT')) return empty;

  const agreements = [loan.activeAgreement, ...(loan.pastAgreements || [])].filter(
    (agreement): agreement is NonNullable<typeof agreement> => Boolean(agreement)
  );
  const findAgreementInstallment = (id: string, agreementId: string): AgreementInstallment | undefined =>
    agreements.filter(agreement => agreement.id === agreementId)
      .flatMap(agreement => agreement.installments || [])
      .find(installment => installment.id === id);

  const rows = new Map<string, { number: number; cents: number; scheduled: number | null }>();
  const add = (id: string, number: number | null, cents: number | null, scheduled: number | null) => {
    if (!id || number === null || cents === null || cents <= 0 || cents > received) return;
    const prior = rows.get(id);
    if (prior) {
      if (prior.number !== number) return;
      prior.cents += cents;
    } else {
      rows.set(id, { number, cents, scheduled });
    }
  };

  if (entry.type === 'AGREEMENT_PAYMENT') {
    const meta = record(entry.meta);
    const agreementId = String(meta?.agreement_id || entry.agreementId || '');
    const allocations = meta?.allocations;
    if (Array.isArray(allocations) && allocations.length > 0) {
      for (const raw of allocations) {
        const allocation = record(raw);
        if (!allocation) continue;
        const id = typeof allocation.installment_id === 'string' ? allocation.installment_id : '';
        const installment = findAgreementInstallment(id, agreementId);
        const number = installment ? validNumber(installment.number) : validNumber(allocation.installment_number);
        const scheduled = installment ? toCents(installment.amount) : null;
        const values = [allocation.principal, allocation.interest, allocation.late_fee];
        const hasBuckets = values.some(value => value !== undefined && value !== null);
        const bucketCents = hasBuckets ? values.reduce<number | null>((sum, value) => {
          const cents = value === undefined || value === null ? 0 : toCents(value);
          return sum === null || cents === null ? null : sum + cents;
        }, 0) : toCents(allocation.amount);
        add(id, number, bucketCents, scheduled);
      }
    } else {
      // Older agreement payments store one exact installment ID, not a breakdown array.
      const id = String(meta?.agreement_installment_id || entry.installmentId || '');
      const installment = findAgreementInstallment(id, agreementId);
      add(id, installment ? validNumber(installment.number) : null, received,
        installment ? toCents(installment.amount) : null);
    }
  } else {
    const grouped = (entry as LedgerEntry & { receiptParts?: LedgerEntry[] }).receiptParts;
    for (const part of Array.isArray(grouped) && grouped.length ? grouped : [entry]) {
      const id = String(part.installmentId || '');
      const installment = (loan.installments || []).find(item => item.id === id);
      add(id, installment ? validNumber(installment.number) : null,
        toCents(part.amount), installment ? toCents(installment.amount) : null);
    }
  }

  const applied = [...rows.values()].reduce((sum, row) => sum + row.cents, 0);
  // Reject inconsistent persisted allocation rather than displaying fictitious money.
  if (applied > received) return empty;

  return {
    allocations: [...rows.entries()].map(([installmentId, row]) => ({
      installmentId,
      number: row.number,
      amount: row.cents / 100,
      scheduledAmount: row.scheduled === null ? null : row.scheduled / 100,
      coverage: row.scheduled === null ? 'APLICADO'
        : row.cents === row.scheduled ? 'INTEGRAL'
        : row.cents < row.scheduled ? 'PARCIAL' : 'APLICADO'
    })),
    unidentifiedAmount: (received - applied) / 100
  };
}
