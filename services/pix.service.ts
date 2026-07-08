
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

function readSupabaseEnv() {
  const env = (import.meta as any).env || {};
  return {
    url: String(env.VITE_SUPABASE_URL || 'https://hzchchbxkhryextaymkn.supabase.co').trim(),
    anonKey: String(env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6Y2hjaGJ4a2hyeWV4dGF5bWtuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3NTk2ODcsImV4cCI6MjA4MzMzNTY4N30.kX6FlTuPkl7XfycwVuZN2mI6e3ed8NaDUoyAHy9L3nc').trim(),
  };
}

async function invokeFunctionWithReadableError(functionName: string, body: Record<string, any>) {
  const { url, anonKey } = readSupabaseEnv();
  const { data: { session } } = await supabase.auth.getSession();
  const bearer = session?.access_token || anonKey;

  const response = await fetch(`${url}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${bearer}`,
    },
    body: JSON.stringify(body),
  });

  const raw = await response.text();
  let payload: any = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    return {
      ok: false,
      step: `invoke_${functionName}`,
      error: payload?.error || payload?.message || raw || `Falha na funcao ${functionName}.`,
    };
  }

  return payload;
}

export async function createPixCharge(input: PixChargeCreateInput): Promise<PixChargeCreateResponse> {
  const result = await invokeFunctionWithReadableError("mp-create-pix", input) as PixChargeCreateResponse;
  if (!result?.ok && result?.error?.includes("Sessao expirada")) {
    return {
      ...result,
      error: "Sessao expirada. Saia e entre novamente para gerar o PIX do Mercado Pago.",
    };
  }
  return result;
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
