import { supabase } from '../../lib/supabase';
import { safeUUID } from '../../utils/uuid';

export async function revalidateInstallment(instId: string) {
  const safeId = safeUUID(instId);
  if (!safeId) return null;

  const { data, error } = await supabase
    .from('parcelas')
    .select('id,status,principal_remaining,interest_remaining,late_fee_accrued,loan_id,paid_total,paid_principal,paid_interest,paid_late_fee,paid_date,due_date,data_vencimento,payment_offer_status,payment_offer_type,payment_offer_agreed_date,payment_offer_valid_until,payment_offer_amount,payment_offer_discount_applied,payment_offer_waive_late_fee,payment_offer_late_fee_forgiven')
    .eq('id', safeId)
    .maybeSingle();

  if (error) throw new Error('Falha ao revalidar parcela no banco: ' + error.message);
  if (!data) throw new Error('Parcela não encontrada. Atualize a página e tente novamente.');
  return data as any;
}
