export type PayableStatus = 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'CANCELED';

type PayableLike = {
  total_amount?: number;
  outstanding_balance: number;
  due_date: string | null;
  status?: PayableStatus;
};

export function derivePayableStatus(payable: PayableLike, today = new Date().toISOString().slice(0, 10)): PayableStatus {
  if (payable.status === 'CANCELED') return 'CANCELED';
  const outstanding = Math.max(0, Number(payable.outstanding_balance) || 0);
  const total = Math.max(outstanding, Number(payable.total_amount ?? outstanding) || 0);
  if (outstanding === 0) return 'PAID';
  if (outstanding < total) return 'PARTIAL';
  if (payable.due_date && payable.due_date < today) return 'OVERDUE';
  return 'PENDING';
}

export function summarizePayables(payables: PayableLike[], today = new Date().toISOString().slice(0, 10)) {
  const end = new Date(`${today}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 30);
  const limit = end.toISOString().slice(0, 10);
  return payables.reduce((summary, payable) => {
    const status = derivePayableStatus(payable, today);
    if (status === 'PAID' || status === 'CANCELED') return summary;
    const outstanding = Math.max(0, Number(payable.outstanding_balance) || 0);
    summary.total += outstanding;
    summary.openCount += 1;
    if (payable.due_date && payable.due_date < today) summary.overdue += outstanding;
    if (payable.due_date && payable.due_date <= limit) summary.next30Days += outstanding;
    return summary;
  }, { total: 0, overdue: 0, next30Days: 0, openCount: 0 });
}
