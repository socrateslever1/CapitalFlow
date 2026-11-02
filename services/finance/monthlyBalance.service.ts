import { supabase } from '../../lib/supabase';
import { safeUUID } from '../../utils/uuid';
import type { FinancialMovement } from '../../domain/finance/monthlyBalance';

const PAGE_SIZE = 800;
const MAX_ROWS = 80000;
const FIELDS = 'id, profile_id, loan_id, source_id, date, type, category, amount, principal_delta, interest_delta, late_fee_delta, notes, idempotency_key';

/**
 * Fetch the complete authorized history, not a truncated "last 5000" snapshot.
 * RLS on public.transacoes is the final authorization boundary.
 * Any failed page rejects the whole report: partial results must never be shown
 * as a complete financial balance.
 */
export async function loadFinancialMovements(profileId: string, signal?: AbortSignal): Promise<FinancialMovement[]> {
  const id = safeUUID(profileId);
  if (!id) throw new Error('Não foi possível identificar o perfil para o balanço.');
  const entries: FinancialMovement[] = [];
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
    let query = supabase.from('transacoes').select(FIELDS)
      .eq('profile_id', id)
      .order('date', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    if (error) throw new Error('Não foi possível consultar todas as movimentações do balanço.');
    const batch = (data || []) as FinancialMovement[];
    if (batch.some(entry => entry.profile_id !== id)) {
      throw new Error('Inconsistência de segurança: a consulta retornou dados de outro perfil.');
    }
    entries.push(...batch);
    if (batch.length < PAGE_SIZE) return entries;
  }
  throw new Error('O histórico excede o limite de consulta segura. Nenhum balanço parcial será apresentado.');
}
