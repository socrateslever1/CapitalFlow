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
    headers: { "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  try {
    if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const GLOBAL_MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json({ ok: false, error: "Missing env vars" }, 500);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json();

    if (body?.type !== "payment" && body?.topic !== "payment") {
      return json({ ok: true, ignored: true });
    }

    const paymentId = body?.data?.id || body?.resource;
    if (!paymentId) return json({ ok: false, error: "Missing payment id" }, 400);

    const { data: charge } = await supabase
      .from("payment_charges")
      .select("profile_id, loan_id, installment_id")
      .eq("provider_payment_id", String(paymentId))
      .maybeSingle();

    let accessToken = GLOBAL_MP_ACCESS_TOKEN;
    if (charge?.profile_id) {
      const { data: mpConfig } = await supabase
        .from("perfis_config_mp")
        .select("mp_access_token")
        .eq("profile_id", charge.profile_id)
        .maybeSingle();

      if (mpConfig?.mp_access_token) {
        accessToken = mpConfig.mp_access_token;
      }
    }

    if (!accessToken) return json({ ok: false, error: "No access token available" }, 400);

    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!mpRes.ok) return json({ ok: false, error: "Failed to fetch payment from MP" }, 502);

    const payment = await mpRes.json();
    const status = payment?.status;
    const metadata = payment?.metadata || {};

    const updateCharge = async (patch: Record<string, unknown>) => {
      await supabase
        .from("payment_charges")
        .update({
          ...patch,
          provider_status: status,
          updated_at: new Date().toISOString(),
        })
        .eq("provider_payment_id", String(paymentId));
    };

    if (status !== "approved") {
      await updateCharge({
        status: "PENDING",
        paid_at: null,
      });
      return json({ ok: true, status });
    }

    const loanId = metadata.loan_id || charge?.loan_id;
    const instId = metadata.installment_id || charge?.installment_id;

    if (!loanId || !instId) {
      await updateCharge({ status: "PENDING", paid_at: null });
      return json({ ok: true, warning: "Missing metadata for processing" });
    }

    const { data: contract, error: contractErr } = await supabase
      .from("contratos")
      .select("id,profile_id,source_id")
      .eq("id", loanId)
      .maybeSingle();

    if (contractErr || !contract?.id) {
      await updateCharge({ status: "PENDING", paid_at: null });
      return json({ ok: false, error: "Contract not found for approved payment" }, 404);
    }

    const ownerProfileId = metadata.profile_id || charge?.profile_id || contract.profile_id;
    const sourceId = metadata.source_id || contract.source_id;

    if (!ownerProfileId || !sourceId) {
      await updateCharge({ status: "PENDING", paid_at: null });
      return json({ ok: false, error: "Missing owner/source for approved payment" }, 400);
    }

    const { data: installment, error: installmentErr } = await supabase
      .from("parcelas")
      .select("id,status,loan_id,principal_remaining,interest_remaining,late_fee_accrued")
      .eq("id", instId)
      .maybeSingle();

    if (installmentErr || !installment?.id || installment.loan_id !== loanId) {
      await updateCharge({ status: "PENDING", paid_at: null });
      return json({ ok: false, error: "Installment not found for approved payment" }, 404);
    }

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

    const approvedAmount = Number(payment.transaction_amount || 0);
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
          error: "Approved amount exceeds open installment balance. Manual reconciliation required.",
        },
        409,
      );
    }

    const caixaLivreId = await resolveCaixaLivreId(supabase, ownerProfileId);
    if (!caixaLivreId) {
      await updateCharge({ status: "PENDING", paid_at: null });
      return json({ ok: false, error: "Caixa Livre not found for contract owner" }, 400);
    }

    const mpMethod = payment.payment_method_id || "PIX";
    const methodMap: Record<string, string> = { pix: "PIX", bolbancario: "BOLETO" };
    const finalMethod = methodMap[mpMethod] || "CREDIT_CARD";

    const { error: rpcError } = await supabase.rpc("process_payment_v3_selective", {
      p_idempotency_key: `mp-${paymentId}`,
      p_loan_id: loanId,
      p_installment_id: instId,
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

    await supabase.from("payment_intents").insert({
      loan_id: loanId,
      installment_id: instId,
      profile_id: ownerProfileId,
      amount: approvedAmount,
      method: finalMethod,
      status: "APPROVED",
      notes: `Pagamento ${finalMethod} Automático (MP ID: ${paymentId})`,
    });

    return json({ ok: true, status });
  } catch (err: any) {
    return json({ ok: false, error: err.message }, 500);
  }
});
