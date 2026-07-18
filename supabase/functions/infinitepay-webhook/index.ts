import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

declare const Deno: any;

const PAYMENT_CHECK_URL = "https://api.checkout.infinitepay.io/payment_check";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

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

function centsToMoney(value: unknown) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return round(numeric / 100);
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

function mapPaymentMethod(captureMethod: string | null | undefined) {
  const method = normalize(captureMethod);
  if (method.includes("pix")) return "PIX";
  if (method.includes("boleto")) return "BOLETO";
  return "CREDIT_CARD";
}

async function notifyOperatorWhatsApp(
  supabase: any,
  supabaseUrl: string,
  serviceRoleKey: string,
  profileId: string,
  message: string,
) {
  try {
    const { data: profile } = await supabase
      .from("perfis")
      .select("*")
      .eq("id", profileId)
      .maybeSingle();
    const phone = String(
      profile?.contato_whatsapp ||
      profile?.support_phone ||
      profile?.telefone ||
      profile?.phone ||
      profile?.whatsapp ||
      "",
    ).replace(/\D/g, "");
    if (phone.length < 10) return;

    await fetch(`${supabaseUrl}/functions/v1/whatsapp-send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceRoleKey}`,
        "apikey": serviceRoleKey,
      },
      body: JSON.stringify({
        profile_id: profileId,
        phone,
        message,
      }),
    });
  } catch (err) {
    console.warn("[infinitepay-webhook] Falha ao notificar operador por WhatsApp:", err);
  }
}

serve(async (req) => {
  try {
    if (req.method !== "POST") return json({ success: false, message: "Method Not Allowed" }, 405);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json({ success: false, message: "Missing env vars" }, 500);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json();

    const orderNsu = String(body?.order_nsu || "").trim();
    const transactionNsu = String(body?.transaction_nsu || "").trim();
    const invoiceSlug = String(body?.invoice_slug || body?.slug || "").trim();
    const receiptUrl = body?.receipt_url || null;

    if (!orderNsu || !transactionNsu || !invoiceSlug) {
      return json({ success: false, message: "Payload InfinitePay incompleto." }, 400);
    }

    const { data: charge, error: chargeErr } = await supabase
      .from("payment_charges")
      .select("id, loan_id, installment_id, amount, status, provider_payload")
      .eq("provider", "INFINITEPAY")
      .eq("external_reference", orderNsu)
      .maybeSingle();

    if (chargeErr || !charge?.id) {
      return json({ success: false, message: "Cobranca nao encontrada." }, 400);
    }

    const payload = charge.provider_payload || {};
    const handle = String(payload?.handle || "").trim();
    if (!handle) return json({ success: false, message: "Handle InfinitePay ausente." }, 400);

    const updateCharge = async (patch: Record<string, unknown>) => {
      await supabase
        .from("payment_charges")
        .update({
          ...patch,
          provider_payment_id: transactionNsu,
          provider_payload: {
            ...payload,
            webhook_payload: body,
            transaction_nsu: transactionNsu,
            invoice_slug: invoiceSlug,
            receipt_url: receiptUrl,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", charge.id);
    };

    if (String(charge.status || "").toUpperCase() === "PAID") {
      await updateCharge({ status: "PAID", paid_at: new Date().toISOString(), provider_status: "PAID" });
      return json({ success: true, message: null });
    }

    const checkRes = await fetch(PAYMENT_CHECK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        handle,
        order_nsu: orderNsu,
        transaction_nsu: transactionNsu,
        slug: invoiceSlug,
      }),
    });

    const checkData = await checkRes.json().catch(() => ({}));
    if (!checkRes.ok || checkData?.success === false) {
      await updateCharge({ status: "PENDING", provider_status: "CHECK_FAILED" });
      return json({ success: false, message: "Falha ao revalidar pagamento InfinitePay." }, 400);
    }

    if (checkData?.paid !== true) {
      await updateCharge({ status: "PENDING", provider_status: "PENDING" });
      return json({ success: true, message: null });
    }

    const approvedAmount = centsToMoney(checkData?.amount || body?.amount) || Number(charge.amount || 0);
    if (!Number.isFinite(approvedAmount) || approvedAmount <= 0) {
      await updateCharge({ status: "PENDING", provider_status: "INVALID_AMOUNT" });
      return json({ success: false, message: "Valor pago invalido." }, 400);
    }

    const loanId = charge.loan_id;
    const installmentId = charge.installment_id;
    if (!loanId || !installmentId) {
      await updateCharge({ status: "PENDING", provider_status: "MISSING_TARGET" });
      return json({ success: false, message: "Cobranca sem contrato ou parcela." }, 400);
    }

    const { data: contract } = await supabase
      .from("contratos")
      .select("id, owner_id, profile_id, source_id, client_id")
      .eq("id", loanId)
      .maybeSingle();

    if (!contract?.id) {
      await updateCharge({ status: "PENDING", provider_status: "CONTRACT_NOT_FOUND" });
      return json({ success: false, message: "Contrato nao encontrado." }, 400);
    }

    const ownerProfileId = contract.profile_id || contract.owner_id;
    const sourceId = contract.source_id;
    if (!ownerProfileId || !sourceId) {
      await updateCharge({ status: "PENDING", provider_status: "MISSING_OWNER_OR_SOURCE" });
      return json({ success: false, message: "Contrato sem perfil ou fonte." }, 400);
    }

    const { data: installment } = await supabase
      .from("parcelas")
      .select("id, loan_id, status, principal_remaining, interest_remaining, late_fee_accrued")
      .eq("id", installmentId)
      .maybeSingle();

    if (!installment?.id || installment.loan_id !== loanId) {
      await updateCharge({ status: "PENDING", provider_status: "INSTALLMENT_NOT_FOUND" });
      return json({ success: false, message: "Parcela nao encontrada." }, 400);
    }

    const totalOpen =
      Number(installment.principal_remaining || 0) +
      Number(installment.interest_remaining || 0) +
      Number(installment.late_fee_accrued || 0);

    if (String(installment.status || "").toUpperCase() === "PAID" || totalOpen <= 0.05) {
      await updateCharge({ status: "PAID", paid_at: new Date().toISOString(), provider_status: "PAID" });
      return json({ success: true, message: null });
    }

    const allocation = allocatePaymentAmount(approvedAmount, {
      principal: Number(installment.principal_remaining || 0),
      interest: Number(installment.interest_remaining || 0),
      lateFee: Number(installment.late_fee_accrued || 0),
    });

    if (allocation.overpayment > 0.05) {
      await updateCharge({ status: "PENDING", provider_status: "OVERPAYMENT" });
      return json({ success: false, message: "Valor pago maior que saldo aberto. Reconciliacao manual necessaria." }, 400);
    }

    const caixaLivreId = await resolveCaixaLivreId(supabase, ownerProfileId);
    if (!caixaLivreId) {
      await updateCharge({ status: "PENDING", provider_status: "CAIXA_LIVRE_NOT_FOUND" });
      return json({ success: false, message: "Caixa Livre nao encontrado." }, 400);
    }

    const { error: rpcError } = await supabase.rpc("process_payment_v3_selective", {
      p_idempotency_key: charge.id,
      p_loan_id: loanId,
      p_installment_id: installmentId,
      p_profile_id: ownerProfileId,
      p_operator_id: ownerProfileId,
      p_principal_paid: allocation.principalPaid,
      p_interest_paid: allocation.interestPaid,
      p_late_fee_paid: allocation.lateFeePaid,
      p_late_fee_forgiven: 0,
      p_interest_forgiven: 0,
      p_payment_date: new Date().toISOString().split("T")[0],
      p_capitalize_remaining: false,
      p_source_id: sourceId,
      p_caixa_livre_id: caixaLivreId,
    });

    if (rpcError && !rpcError.message?.includes("quitada") && !rpcError.message?.includes("paga")) {
      await updateCharge({ status: "PENDING", provider_status: "RPC_ERROR" });
      return json({ success: false, message: rpcError.message }, 400);
    }

    await updateCharge({
      status: "PAID",
      paid_at: new Date().toISOString(),
      provider_status: "PAID",
    });

    const readAt = new Date().toISOString();
    await supabase
      .from("notificacoes")
      .update({ read_at: readAt })
      .eq("profile_id", ownerProfileId)
      .eq("item_type", "parcela")
      .eq("item_id", installmentId)
      .is("read_at", null);
    await supabase
      .from("notificacoes")
      .update({ read_at: readAt })
      .eq("profile_id", ownerProfileId)
      .eq("item_type", "parcela")
      .like("item_id", `${installmentId}:%`)
      .is("read_at", null);

    if (contract.client_id) {
      await supabase.from("payment_intents").insert({
        client_id: contract.client_id,
        loan_id: loanId,
        profile_id: ownerProfileId,
        tipo: "INFINITEPAY",
        status: "APPROVED",
        comprovante_url: receiptUrl,
        method: mapPaymentMethod(checkData?.capture_method || body?.capture_method),
      });
    }

    await supabase.from("notificacoes").insert({
      profile_id: ownerProfileId,
      titulo: "Pagamento InfinitePay recebido",
      mensagem: "URGENTE: pagamento de R$ " + approvedAmount.toFixed(2).replace(".", ",") + " confirmado pelo portal e baixado automaticamente.",
      item_type: "pagamento",
      item_id: transactionNsu || charge.id,
      metadata: { loan_id: loanId, installment_id: installmentId, payment_id: transactionNsu, provider: "INFINITEPAY", urgent: true },
    });

    await notifyOperatorWhatsApp(
      supabase,
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      ownerProfileId,
      "CapitalFlow: pagamento InfinitePay de R$ " + approvedAmount.toFixed(2).replace(".", ",") + " recebido e baixado automaticamente.",
    );

    return json({ success: true, message: null });
  } catch (err: any) {
    return json({ success: false, message: err?.message || "Internal error" }, 500);
  }
});
