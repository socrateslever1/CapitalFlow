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

async function readJson(req: Request) {
  try {
    return await req.json();
  } catch {
    return null;
  }
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

    const body = await readJson(req);
    if (!body) return json(req, { ok: false, error: "Corpo da requisicao invalido" }, 400);

    const {
      amount,
      payer_name,
      payer_email,
      payer_doc,
      loan_id,
      installment_id,
      payment_type,
      source_id: body_source_id,
      profile_id: body_profile_id,
    } = body || {};

    const paymentAmount = Number(amount);
    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      return json(req, { ok: false, error: "Valor invalido para PIX" }, 400);
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let userId: string | null = null;
    const bearer = getBearerToken(req);
    if (bearer && bearer !== SUPABASE_ANON_KEY) {
      const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
      });
      const { data: authData } = await supabaseUser.auth.getUser();
      userId = authData?.user?.id || null;
    }

    let targetProfileId: string | null = null;
    let targetSourceId = body_source_id || null;

    if (userId) {
      const { data: callerProfile, error: callerErr } = await supabaseAdmin
        .from("perfis")
        .select("id, user_id")
        .eq("user_id", userId)
        .maybeSingle();

      if (callerErr || !callerProfile?.id) {
        return json(req, { ok: false, error: "Perfil do usuario nao encontrado" }, 403);
      }
      targetProfileId = callerProfile.id;
    } else if (body_profile_id) {
      const { data: profile } = await supabaseAdmin
        .from("perfis")
        .select("id")
        .eq("id", body_profile_id)
        .maybeSingle();

      if (!profile?.id) {
        return json(req, { ok: false, error: "Perfil informado nao encontrado" }, 403);
      }
      targetProfileId = profile.id;
    } else {
      return json(req, { ok: false, error: "Sessao expirada. Faça login novamente para gerar PIX." }, 401);
    }

    if (loan_id) {
      const { data: loan, error: loanErr } = await supabaseAdmin
        .from("contratos")
        .select("id, profile_id, owner_id, source_id")
        .eq("id", loan_id)
        .single();

      if (loanErr || !loan?.id) return json(req, { ok: false, error: "Contrato nao encontrado" }, 404);
      targetProfileId = loan.profile_id || loan.owner_id || targetProfileId;
      targetSourceId = targetSourceId || loan.source_id;
    }

    const { data: mpConfig } = await supabaseAdmin
      .from("perfis_config_mp")
      .select("mp_access_token")
      .eq("profile_id", targetProfileId)
      .maybeSingle();

    const accessToken = mpConfig?.mp_access_token || GLOBAL_MP_ACCESS_TOKEN;
    if (!accessToken) {
      return json(req, { ok: false, error: "Credenciais Mercado Pago nao configuradas para este perfil" }, 400);
    }

    const external_reference = crypto.randomUUID();
    const cleanDoc = payer_doc ? String(payer_doc).replace(/\D/g, "") : "";

    const mpPayload: Record<string, unknown> = {
      transaction_amount: paymentAmount,
      description: loan_id ? `Pagamento Contrato ${String(loan_id).slice(0, 8)}` : "Deposito em Conta",
      payment_method_id: "pix",
      external_reference,
      payer: {
        email: payer_email || "cliente@capitalflow.app",
        first_name: payer_name || "Cliente",
        ...(cleanDoc
          ? {
              identification: {
                type: cleanDoc.length > 11 ? "CNPJ" : "CPF",
                number: cleanDoc,
              },
            }
          : {}),
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

    const responseText = await mpRes.text();
    let mpData: any = null;
    try {
      mpData = responseText ? JSON.parse(responseText) : null;
    } catch {
      mpData = null;
    }

    if (!mpRes.ok) {
      const message =
        mpData?.message ||
        mpData?.error ||
        mpData?.cause?.[0]?.description ||
        responseText ||
        "Erro no Mercado Pago";
      return json(req, { ok: false, error: message, provider_status: mpRes.status }, 502);
    }

    return json(req, {
      ok: true,
      charge_id: external_reference,
      provider_payment_id: String(mpData?.id || ""),
      status: mpData?.status,
      provider_status: mpData?.status,
      qr_code: mpData?.point_of_interaction?.transaction_data?.qr_code || null,
      qr_code_base64: mpData?.point_of_interaction?.transaction_data?.qr_code_base64 || null,
      external_reference,
    });
  } catch (err: any) {
    return json(req, { ok: false, error: err?.message || "Internal error" }, 500);
  }
});
