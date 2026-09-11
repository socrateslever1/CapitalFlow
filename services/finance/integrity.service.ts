import { supabase } from '../../lib/supabase';
import { safeUUID } from '../../utils/uuid';

export type FinancialIntegrityIssue = {
  type: string;
  severity: 'ERROR' | 'WARN';
  profile_id: string | null;
  table: string;
  entity_id: string;
  amount_a: number | null;
  amount_b: number | null;
  details: Record<string, unknown>;
};

export type FinancialIntegrityReport = {
  checked_at: string;
  profile_id: string | null;
  healthy: boolean;
  error_count: number;
  warning_count: number;
  by_type: Record<string, number>;
  issues: FinancialIntegrityIssue[];
};

export async function getFinancialIntegrityReport(profileId?: string | null): Promise<FinancialIntegrityReport> {
  const safeProfileId = profileId ? safeUUID(profileId) : null;
  if (profileId && !safeProfileId) throw new Error('Perfil invalido para auditoria financeira.');

  const { data, error } = await supabase.rpc('financial_integrity_report', {
    p_profile_id: safeProfileId,
  });

  if (error) throw new Error(`Falha na auditoria de integridade financeira: ${error.message}`);
  return data as unknown as FinancialIntegrityReport;
}
