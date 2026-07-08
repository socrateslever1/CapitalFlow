
// services/pix.service.ts
import { supabase } from "../lib/supabase";
import { safeUUID } from "../utils/uuid";

export type PixChargeCreateInput = {
  amount: number;
  payer_name?: string;
  payer_email?: string;
  payer_doc?: string | null;

  // Metadados para automação do fluxo
  source_id?: string | null; // Carteira de destino
  loan_id?: string | null;
  installment_id?: string | null;
  payment_type?: 'RENEW_INTEREST' | 'FULL' | 'LEND_MORE'; // Tipo de baixa
  profile_id?: string; // ID do operador (dono do contrato)
};

export type PixChargeCreateResponse = {
  ok: boolean;
  charge_id?: string;
  provider_payment_id?: string;
  status?: string;
  provider_status?: string;
  qr_code?: string | null;
  qr_code_base64?: string | null;
  external_reference?: string;
  error?: string;
  step?: string;
};

export async function createPixCharge(input: PixChargeCreateInput): Promise<PixChargeCreateResponse> {
  const { data, error } = await supabase.functions.invoke("mp-create-pix", {
    body: input,
  });

  if (error) {
    return { ok: false, step: "invoke_mp-create-pix", error: error.message };
  }
  return data as PixChargeCreateResponse;
}

export async function fetchChargeById(chargeId: string) {
  const safeId = safeUUID(chargeId);
  if (!safeId) return { data: null, error: new Error('ID da cobrança inválido') };

  // OBS: isso depende de policy SELECT no payment_charges
  return supabase
    .from("payment_charges")
    .select("id,status,provider_status,paid_at,updated_at,provider_payment_id,qr_code,qr_code_base64,amount")
    .eq("id", safeId)
    .single();
}
