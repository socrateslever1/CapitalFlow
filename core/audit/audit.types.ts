
export interface AuditLogEntry {
  id: string;
  loan_id?: string;
  profile_id: string;
  source_id?: string;
  date: string;
  type: string; // 'ARCHIVE' | 'RESTORE' | 'PAYMENT_FULL' ...
  amount: number;
  principal_delta: number;
  interest_delta: number;
  late_fee_delta: number;
  notes?: string;
  category?: string;
}
