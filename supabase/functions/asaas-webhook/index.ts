
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

declare const Deno: any;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, asaas-access-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function round(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalize(value: string | null | undefined) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function allocatePaymentAmount(
  amount: number,
  balances: { principal: number; interest: number; lateFee: number },
) {
  let remaining = round(amount);
  const lateFeePaid = Math.min(remaining, round(Math.max(0, balances.lateFee)));
  remaining = round(remaining - lateFeePaid);
  const interestPaid = Math.min(remaining, round(Math.max(0, balances.interest)));
  remaining = round(remaining - interestPaid);
  const principalPaid = Math.min(remaining, round(Math.max(0, balances.principal)));
  remaining = round(remaining - principalPaid);

  return {
    principalPaid: round(principalPaid),
    interestPaid: round(interestPaid),
    lateFeePaid: round(lateFeePaid),
    overpayment: round(Math.max(0, remaining)),
  };
}

async function resolveCaixaLivreId(supabase: any, profileId: string) {
  const { data, error } = await supabase
    .from("fontes")
    .select("id,nome")
    .eq("profile_id", profileId)
    .limit(50);

  if (error || !data) return null;

  const found = data.find((item: any) => {
    const name = normalize(item?.nome);
    return name.includes("caixa livre") || name.includes("lucro") || name.includes("disponivel") || name.includes("balance");
  });

  return found?.id || null;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function mapStatus(asaasEvent: string): "PENDING" | "PAID" | "FAILED" {
  switch (asaasEvent) {
    case "PAYMENT_RECEIVED":
    case "PAYMENT_CONFIRMED":
      return "PAID";
    case "PAYMENT_OVERDUE":
    case "PAYMENT_DELETED":
    case "PAYMENT_REFUNDED":
    case "PAYMENT_CHARGEBACK_REQUESTED":
      return "FAILED";
    default:
      return "PENDING";
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") return json({ ok: false, error: "Method Not Allowed" }, 405);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const ASAAS_WEBHOOK_TOKEN = Deno.env.get("ASAAS_WEBHOOK_TOKEN");

    // Validação opcional de Token de autenticação se estiver configurado nas secrets do Supabase
    if (ASAAS_WEBHOOK_TOKEN) {
      const receivedToken = req.headers.get("asaas-access-token");
      if (receivedToken !== ASAAS_WEBHOOK_TOKEN) {
        console.warn("Unauthorized webhook attempt - Tokens matching failed.");
        return json({ ok: false, error: "Unauthorized" }, 401);
      }
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json({ ok: false, error: "Missing env vars" }, 500);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json();

    const eventType = body.event;
    const payment = body.payment;

    if (!payment || !payment.id) {
      return json({ ok: true, ignored: true, reason: "No payment data" });
    }

    const mappedStatus = mapStatus(eventType);

    // 1. Localizar a cobrança no nosso banco
    const { data: charge } = await supabase
      .from("payment_charges")
      .select("profile_id, loan_id, installment_id")
      .eq("provider_payment_id", String(payment.id))
      .maybeSingle();

    if (!charge) {
      return json({ ok: false, error: "Charge not found", provider_payment_id: payment.id }, 404);
    }

    const updateCharge = async (patch: Record<string, unknown>) => {
      await supabase
        .from("payment_charges")
        .update({
          ...patch,
          provider_status: payment.status,
          updated_at: new Date().toISOString(),
        })
        .eq("provider_payment_id", String(payment.id));
    };

    // Se não for PAID, apenas atualizamos o status da charge
    if (mappedStatus !== "PAID") {
      await updateCharge({ status: mappedStatus });
      return json({ ok: true, event: eventType, status: mappedStatus });
    }

    // --- Lógica de Liquidação (Apenas para PAID) ---

    // 2. Verificar se a parcela já está paga
    const { data: installment, error: instErr } = await supabase
      .from("parcelas")
      .select("id, status, principal_remaining, interest_remaining, late_fee_accrued")
      .eq("id", charge.installment_id)
      .maybeSingle();

    if (instErr || !installment) {
      return json({ ok: false, error: "Installment not found" }, 404);
    }

    if (String(installment.status).toUpperCase() === "PAID") {
      await updateCharge({ status: "PAID", paid_at: new Date().toISOString() });
      return json({ ok: true, status: "PAID", warning: "Already settled" });
    }

    // 3. Alocar valores
    const approvedAmount = Number(payment.value || 0);
    const allocation = allocatePaymentAmount(approvedAmount, {
      principal: Number(installment.principal_remaining || 0),
      interest: Number(installment.interest_remaining || 0),
      lateFee: Number(installment.late_fee_accrued || 0),
    });

    // 4. Buscar Caixa Livre do Operador
    const caixaLivreId = await resolveCaixaLivreId(supabase, charge.profile_id);
    if (!caixaLivreId) {
       return json({ ok: false, error: "Caixa Livre source not found for profile" }, 400);
    }

    // 5. Buscar Source ID do Contrato
    const { data: contract } = await supabase
      .from("contratos")
      .select("source_id")
      .eq("id", charge.loan_id)
      .single();

    // 6. Baixar parcela via RPC
    const { error: rpcError } = await supabase.rpc("process_payment_v3_selective", {
      p_idempotency_key: `asaas-${payment.id}`,
      p_loan_id: charge.loan_id,
      p_installment_id: charge.installment_id,
      p_profile_id: charge.profile_id,
      p_operator_id: charge.profile_id,
      p_principal_paid: allocation.principalPaid,
      p_interest_paid: allocation.interestPaid,
      p_late_fee_paid: allocation.lateFeePaid,
      p_late_fee_forgiven: 0,
      p_payment_date: new Date().toISOString(),
      p_capitalize_remaining: false,
      p_source_id: contract?.source_id,
      p_caixa_livre_id: caixaLivreId,
    });

    if (rpcError && !rpcError.message?.includes("já está paga") && !rpcError.message?.includes("já quitada")) {
      return json({ ok: false, error: rpcError.message }, 500);
    }

    // 6.1 Registrar Tarifa do Asaas como Despesa (Dedução no Caixa)
    const fee = Number(payment.fee || 0) || round(approvedAmount - Number(payment.netValue || approvedAmount));
    if (fee > 0) {
      console.log(`Recording Asaas fee: R$ ${fee} for payment ${payment.id}`);
      await supabase.from("transacoes").insert({
        profile_id: charge.profile_id,
        loan_id: charge.loan_id,
        installment_id: charge.installment_id,
        amount: -fee, // Valor negativo para representar saída/despesa
        category: "DESPESA",
        type: "FINANCEIRO",
        description: `Tarifa Transação Asaas - Cobrança ${payment.id}`,
        date: new Date().toISOString(),
        source_id: caixaLivreId,
        idempotency_key: `asaas-fee-${payment.id}`,
        meta: {
          provider: "asaas",
          event: eventType,
          provider_payment_id: payment.id,
          gross_value: approvedAmount,
          net_value: payment.netValue
        }
      });
    }

    // 7. Atualizar Charge
    await updateCharge({
      status: "PAID",
      paid_at: new Date().toISOString()
    });

    // 8. Audit Log
    await supabase.from("payment_intents").insert({
      loan_id: charge.loan_id,
      installment_id: charge.installment_id,
      profile_id: charge.profile_id,
      amount: approvedAmount,
      method: payment.billingType === 'PIX' ? 'PIX' : (payment.billingType === 'BOLETO' ? 'BOLETO' : 'CREDIT_CARD'),
      status: "APPROVED",
      notes: `Pagamento Asaas Confirmado (ID: ${payment.id}, Evento: ${eventType})`
    });

    return json({ ok: true, event: eventType, status: "PAID" });

  } catch (err: any) {
    console.error("Asaas Webhook Error:", err.message);
    return json({ ok: false, error: err.message }, 500);
  }
});
