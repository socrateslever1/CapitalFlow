
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

declare const Deno: any;

const APP_ORIGIN = Deno.env.get("APP_ORIGIN") || "*";

const baseCorsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowOrigin = APP_ORIGIN === "*" ? "*" : origin === APP_ORIGIN ? origin : APP_ORIGIN;
  return { ...baseCorsHeaders, "Access-Control-Allow-Origin": allowOrigin };
}

function json(req: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

function getBearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { ok: false, error: "Method Not Allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const GLOBAL_MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN") || "";

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      return json(req, { ok: false, error: "Missing env vars" }, 500);
    }

    const token = getBearerToken(req);
    if (!token) return json(req, { ok: false, error: "Unauthorized" }, 401);

    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: authData, error: authErr } = await supabaseUser.auth.getUser();
    if (authErr || !authData?.user?.id) {
      return json(req, { ok: false, error: "Unauthorized: invalid token" }, 401);
    }

    const { data: callerProfile, error: callerErr } = await supabaseAdmin
      .from("perfis")
      .select("id, user_id")
      .eq("user_id", authData.user.id)
      .maybeSingle();

    if (callerErr || !callerProfile?.id) {
      return json(req, { ok: false, error: "Forbidden: profile not found" }, 403);
    }

    const body = await req.json();
    const { amount, payer_name, payer_email, payer_doc, loan_id, installment_id, payment_type, source_id: body_source_id } = body || {};

    let targetProfileId = callerProfile.id;
    let targetSourceId = body_source_id || null;

    // 1. Se informou loan_id, buscamos o Dono do Contrato (Operador)
    if (loan_id) {
      const { data: loan, error: loanErr } = await supabaseAdmin
        .from("contratos")
        .select("id, profile_id, source_id")
        .eq("id", loan_id)
        .single();

      if (loanErr || !loan?.id) return json(req, { ok: false, error: "Contrato não encontrado" }, 404);
      targetProfileId = loan.profile_id;
      targetSourceId = targetSourceId || loan.source_id;
    }

    // 2. Buscar Credenciais MP do Perfil alvo (Multi-Conta)
    const { data: mpConfig } = await supabaseAdmin
      .from("perfis_config_mp")
      .select("mp_access_token")
      .eq("profile_id", targetProfileId)
      .maybeSingle();

    const accessToken = mpConfig?.mp_access_token || GLOBAL_MP_ACCESS_TOKEN;

    if (!accessToken) {
      return json(req, { ok: false, error: "Credenciais Mercado Pago não configuradas para este perfil" }, 400);
    }

    const external_reference = crypto.randomUUID();

    const mpPayload = {
      transaction_amount: Number(amount),
      description: loan_id ? `Pagamento Contrato ${String(loan_id).slice(0, 8)}` : `Depósito em Conta`,
      payment_method_id: "pix",
      external_reference,
      payer: {
        email: payer_email || "cliente@capitalflow.app",
        first_name: payer_name || "Cliente",
        identification: payer_doc ? {
          type: String(payer_doc).replace(/\D/g, "").length > 11 ? "CNPJ" : "CPF",
          number: String(payer_doc).replace(/\D/g, ""),
        } : undefined,
      },
      metadata: {
        loan_id: loan_id || null,
        installment_id: installment_id || null,
        payment_type: payment_type || (loan_id ? "RENEW_INTEREST" : "WALLET_DEPOSIT"),
        profile_id: targetProfileId,
        source_id: targetSourceId,
      },
    };

    const mpRes = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": external_reference,
      },
      body: JSON.stringify(mpPayload),
    });

    const mpData = await mpRes.json();
    if (!mpRes.ok) return json(req, { ok: false, error: mpData?.message || "Erro no Mercado Pago" }, 502);

    return json(req, {
      ok: true,
      charge_id: external_reference,
      provider_payment_id: String(mpData.id),
      status: mpData.status,
      qr_code: mpData?.point_of_interaction?.transaction_data?.qr_code,
      qr_code_base64: mpData?.point_of_interaction?.transaction_data?.qr_code_base64,
      external_reference,
    });
  } catch (err: any) {
    return json(req, { ok: false, error: err?.message || "Internal error" }, 500);
  }
});
