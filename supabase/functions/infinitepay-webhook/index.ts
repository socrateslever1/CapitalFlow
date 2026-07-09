import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

declare const Deno: any;

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
    .select("id,name")
    .eq("profile_id", profileId)
    .limit(50);

  if (error || !data) return null;

  const found = data.find((item: any) => {
    const name = normalize(item?.name);
    return name.includes("caixa livre") || name.includes("lucro") || name.includes("disponivel") || name.includes("balance");
  });

  return found?.id || null;
}

async function verifySignature(secret: string, bodyText: string, signatureHeader: string): Promise<boolean> {
  if (!signatureHeader || !secret) return false;
  
  const encoder = new TextEncoder();
  const keyBuf = encoder.encode(secret);
  const dataBuf = encoder.encode(bodyText);
  
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBuf,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify", "sign"]
  );
  
  const signed = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    dataBuf
  );
  
  const signedArr = new Uint8Array(signed);
  let hex = "";
  for (let i = 0; i < signedArr.length; i++) {
    hex += signedArr[i].toString(16).padStart(2, "0");
  }
  
  return hex === signatureHeader.trim().toLowerCase();
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  try {
    if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json({ ok: false, error: "Missing env vars" }, 500);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const rawBody = await req.text();
    const body = JSON.parse(rawBody);

    const externalRef = body?.order_nsu || body?.orderId;
    if (!externalRef) {
      return json({ ok: true, ignored: "Missing order_nsu" });
    }

    // 1. Localizar a intenção de pagamento correspondente
    const { data: charge, error: chargeErr } = await supabase
      .from("payment_charges")
      .select("*")
      .eq("id", externalRef)
      .maybeSingle();

    if (chargeErr || !charge) {
      return json({ ok: false, error: "Payment charge not found" }, 404);
    }

    if (charge.status === "PAID") {
      return json({ ok: true, message: "Já processado" });
    }

    // 2. Obter Credenciais para validar a assinatura
    let clientSecret = Deno.env.get("INFINITEPAY_CLIENT_SECRET") || "";
    if (charge.profile_id) {
      const { data: ipConfig } = await supabase
        .from("perfis_config_infinitepay")
        .select("client_secret")
        .eq("profile_id", charge.profile_id)
        .maybeSingle();

      if (ipConfig?.client_secret) {
        clientSecret = ipConfig.client_secret;
      }
    }

    // 3. Validar assinatura do Webhook (HMAC-SHA256)
    const signatureHeader = req.headers.get("x-webhook-signature") || "";
    if (signatureHeader && clientSecret) {
      const isValid = await verifySignature(clientSecret, rawBody, signatureHeader);
      if (!isValid) {
        return json({ ok: false, error: "Invalid webhook signature" }, 403);
      }
    } else {
      console.warn("Webhook recebido sem x-webhook-signature ou sem clientSecret cadastrado. Processando modo tolerante.");
    }

    const status = body?.status || body?.event;
    const isPaid = status === "paid" || status === "approved" || status === "payment.succeeded";

    const updateCharge = async (patch: Record<string, unknown>) => {
      await supabase
        .from("payment_charges")
        .update({
          ...patch,
          provider_status: status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", externalRef);
    };

    if (!isPaid) {
      await updateCharge({
        status: "PENDING",
        paid_at: null,
      });
      return json({ ok: true, status });
    }

    // 4. Buscar o contrato e a parcela
    const { data: contract, error: contractErr } = await supabase
      .from("contratos")
      .select("id, profile_id, source_id")
      .eq("id", charge.loan_id)
      .maybeSingle();

    if (contractErr || !contract?.id) {
      await updateCharge({ status: "PENDING", paid_at: null });
      return json({ ok: false, error: "Contract not found" }, 404);
    }

    const { data: installment, error: installmentErr } = await supabase
      .from("parcelas")
      .select("id, status, loan_id, principal_remaining, interest_remaining, late_fee_accrued")
      .eq("id", charge.installment_id)
      .maybeSingle();

    if (installmentErr || !installment?.id || installment.loan_id !== contract.id) {
      await updateCharge({ status: "PENDING", paid_at: null });
      return json({ ok: false, error: "Installment not found" }, 404);
    }

    // 5. Verificar se já está pago no banco
    const totalOpen =
      Number(installment.principal_remaining || 0) +
      Number(installment.interest_remaining || 0) +
      Number(installment.late_fee_accrued || 0);

    if (String(installment.status || "").toUpperCase() === "PAID" || totalOpen <= 0.05) {
      await updateCharge({
        status: "PAID",
        paid_at: new Date().toISOString(),
      });
      return json({ ok: true, status, warning: "Installment already settled" });
    }

    // 6. Alocar valores
    const approvedAmount = Number(body.amount || 0) / 100; // InfinitePay envia em centavos
    if (!Number.isFinite(approvedAmount) || approvedAmount <= 0) {
      await updateCharge({ status: "PENDING", paid_at: null });
      return json({ ok: false, error: "Invalid approved amount" }, 400);
    }

    const allocation = allocatePaymentAmount(approvedAmount, {
      principal: Number(installment.principal_remaining || 0),
      interest: Number(installment.interest_remaining || 0),
      lateFee: Number(installment.late_fee_accrued || 0),
    });

    if (allocation.overpayment > 0.05) {
      await updateCharge({ status: "PENDING", paid_at: null });
      return json(
        {
          ok: false,
          error: "Approved amount exceeds open installment balance.",
        },
        409,
      );
    }

    const ownerProfileId = charge.profile_id || contract.profile_id;
    const sourceId = contract.source_id;
    const caixaLivreId = await resolveCaixaLivreId(supabase, ownerProfileId);
    if (!caixaLivreId) {
      await updateCharge({ status: "PENDING", paid_at: null });
      return json({ ok: false, error: "Caixa Livre not found for contract owner" }, 400);
    }

    // 7. Processar pagamento via RPC
    const { error: rpcError } = await supabase.rpc("process_payment_v3_selective", {
      p_idempotency_key: charge.id,
      p_loan_id: contract.id,
      p_installment_id: installment.id,
      p_profile_id: ownerProfileId,
      p_operator_id: ownerProfileId,
      p_principal_paid: allocation.principalPaid,
      p_interest_paid: allocation.interestPaid,
      p_late_fee_paid: allocation.lateFeePaid,
      p_late_fee_forgiven: 0,
      p_payment_date: new Date().toISOString(),
      p_capitalize_remaining: false,
      p_source_id: sourceId,
      p_caixa_livre_id: caixaLivreId,
    });

    if (rpcError && !rpcError.message?.includes("Parcela já está paga") && !rpcError.message?.includes("Parcela já quitada")) {
      await updateCharge({ status: "PENDING", paid_at: null });
      return json({ ok: false, error: rpcError.message }, 500);
    }

    await updateCharge({
      status: "PAID",
      paid_at: new Date().toISOString(),
    });

    return json({ ok: true, status: "paid_processed" });

  } catch (err: any) {
    console.error("Erro interno no webhook:", err);
    return json({ ok: false, error: err?.message || "Internal error" }, 500);
  }
});
