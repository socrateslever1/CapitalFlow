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
      loan_id,
      installment_id,
      payment_type,
      return_url,
      portal_token,
      portal_code,
    } = body || {};

    if (!loan_id) return json(req, { ok: false, error: "Contrato nao informado" }, 400);
    if (!amount || Number(amount) <= 0) return json(req, { ok: false, error: "Valor invalido para pagamento" }, 400);

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let authenticatedUserId: string | null = null;
    const bearer = getBearerToken(req);
    if (bearer && bearer !== SUPABASE_ANON_KEY) {
      const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
      });

      const { data: authData, error: authErr } = await supabaseUser.auth.getUser();
      if (!authErr && authData?.user?.id) {
        authenticatedUserId = authData.user.id;
      }
    }

    if (!authenticatedUserId && (!portal_token || !portal_code)) {
      return json(req, { ok: false, error: "Acesso nao autorizado para gerar pagamento" }, 401);
    }

    const { data: loan, error: loanErr } = await supabaseAdmin
      .from("contratos")
      .select("id, profile_id, owner_id, source_id, portal_token, portal_shortcode, status, is_archived")
      .eq("id", loan_id)
      .single();

    if (loanErr || !loan?.id) return json(req, { ok: false, error: "Contrato nao encontrado" }, 404);

    const targetProfileId = loan.profile_id || loan.owner_id;

    if (authenticatedUserId) {
      const { data: allowedProfile } = await supabaseAdmin
        .from("perfis")
        .select("id")
        .eq("id", targetProfileId)
        .eq("user_id", authenticatedUserId)
        .maybeSingle();

      if (!allowedProfile?.id) {
        return json(req, { ok: false, error: "Usuario sem permissao para este contrato" }, 403);
      }
    } else {
      const tokenMatches = String(loan.portal_token || "").toLowerCase() === String(portal_token || "").toLowerCase();
      const codeMatches = String(loan.portal_shortcode || "") === String(portal_code || "");
      const archived = Boolean(loan.is_archived);
      const blockedStatuses = [
        "ARQUIVADO",
        "ARCHIVED",
        "CANCELADO",
        "CANCELED",
        "DELETADO",
        "DELETED",
        "EXCLUIDO",
        "EXCLUÍDO",
      ];
      const statusBlocked = blockedStatuses.includes(String(loan.status || "").toUpperCase());

      if (!tokenMatches || !codeMatches || archived || statusBlocked) {
        return json(req, { ok: false, error: "Acesso do portal invalido para este contrato" }, 403);
      }
    }

    const { data: mpConfig } = await supabaseAdmin
      .from("perfis_config_mp")
      .select("mp_access_token")
      .eq("profile_id", targetProfileId)
      .maybeSingle();

    const accessToken = mpConfig?.mp_access_token || GLOBAL_MP_ACCESS_TOKEN;
    if (!accessToken) {
      return json(req, { ok: false, error: "Credenciais Mercado Pago nao configuradas" }, 400);
    }

    const external_reference = crypto.randomUUID();
    const safeReturnUrl = return_url || "https://capitalflow.app/portal";

    const mpPayload = {
      items: [
        {
          id: String(installment_id || loan.id),
          title: `Pagamento Contrato ${String(loan.id).slice(0, 8)}`,
          quantity: 1,
          unit_price: Number(amount),
          currency_id: "BRL",
        },
      ],
      payer: {
        name: payer_name || "Cliente",
        email: payer_email || "cliente@capitalflow.app",
      },
      external_reference,
      statement_descriptor: "CAPITALFLOW",
      payment_methods: {
        excluded_payment_methods: [],
        excluded_payment_types: [],
        installments: 12,
      },
      metadata: {
        loan_id: loan.id,
        installment_id: installment_id || null,
        payment_type: payment_type || "PORTAL_PAYMENT",
        profile_id: targetProfileId,
        source_id: loan.source_id,
        portal_payment: !authenticatedUserId,
      },
      back_urls: {
        success: safeReturnUrl,
        failure: safeReturnUrl,
        pending: safeReturnUrl,
      },
      auto_return: "approved",
    };

    const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
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
      const mpMessage = mpData?.message || mpData?.error || responseText || "Erro no Mercado Pago";
      return json(req, { ok: false, error: mpMessage, provider_status: mpRes.status }, 502);
    }

    return json(req, {
      ok: true,
      preference_id: mpData?.id,
      init_point: mpData?.init_point,
      sandbox_init_point: mpData?.sandbox_init_point,
      external_reference,
    });
  } catch (err: any) {
    return json(req, { ok: false, error: err?.message || "Internal error" }, 500);
  }
});
