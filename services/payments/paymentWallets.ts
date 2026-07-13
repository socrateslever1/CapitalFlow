import { supabase } from '../../lib/supabase';
import type { CapitalSource } from '../../types';
import { ZERO_BALANCE_THRESHOLD } from '../../domain/finance/calculations';
import { isUUID, safeUUID } from '../../utils/uuid';
import { normalizeText, roundMoney } from './paymentUtils';

export function resolveCaixaLivreIdFromMemory(sources: CapitalSource[]): string | null {
  if (!Array.isArray(sources) || sources.length === 0) return null;

  const byFlag = (sources as any[]).find(
    (source) =>
      source?.is_caixa_livre === true ||
      source?.isCaixaLivre === true ||
      source?.is_profit_box === true
  );
  if (byFlag?.id && isUUID(byFlag.id)) return byFlag.id;

  const caixaLivre = sources.find((source) => {
    const name = normalizeText((source as any)?.name ?? (source as any)?.nome);
    return (
      name.includes('caixa livre') ||
      name.includes('lucro') ||
      name.includes('disponivel') ||
      name.includes('balance')
    );
  });

  if (caixaLivre?.id && isUUID(caixaLivre.id)) return caixaLivre.id;
  return null;
}

export async function resolveCaixaLivreIdFromDB(ownerId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('fontes')
    .select('id,nome')
    .eq('profile_id', ownerId)
    .limit(50);

  if (error || !data) return null;

  const found = data.find((source: any) => {
    const name = normalizeText(source?.nome);
    return (
      name.includes('caixa livre') ||
      name.includes('lucro') ||
      name.includes('disponivel') ||
      name.includes('balance')
    );
  });

  return found?.id && isUUID(found.id) ? found.id : null;
}

export async function adjustSourceBalanceSafe(sourceId: string | null, delta: number) {
  const safeId = safeUUID(sourceId);
  const amount = roundMoney(delta);
  if (!safeId || Math.abs(amount) <= ZERO_BALANCE_THRESHOLD) return;

  const { error: rpcError } = await supabase.rpc('adjust_source_balance', {
    p_source_id: safeId,
    p_delta: amount,
  });

  if (!rpcError) return;

  const { data, error: readError } = await supabase
    .from('fontes')
    .select('balance')
    .eq('id', safeId)
    .maybeSingle();

  if (readError) throw readError;

  const { error: updateError } = await supabase
    .from('fontes')
    .update({ balance: roundMoney(Number((data as any)?.balance || 0) + amount) })
    .eq('id', safeId);

  if (updateError) throw updateError;
}
