import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

declare const Deno: any;

const APP_ORIGIN = Deno.env.get("APP_ORIGIN") || "https://capitalflow.app";

const baseCorsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowOrigin = origin === APP_ORIGIN ? origin : APP_ORIGIN;
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

    const body = await req.json();
    const { amount, payer_name, payer_email, loan_id, installment_id, payment_type, return_url, portal_token, portal_code } = body || {};

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let isAuthorized = false;

    if (portal_token && portal_code) {
      // Busca o contrato associado ao token da URL para obter o client_id e validar o shortcode
      const { data: urlContract } = await supabaseAdmin
        .from('contratos')
        .select('client_id, portal_shortcode')
        .eq('portal_token', portal_token)
        .maybeSingle();

      if (urlContract && String(urlContract.portal_shortcode) === String(portal_code)) {
        // Confirma se o contrato que está sendo pago pertence ao mesmo cliente
        const { data: targetContract } = await supabaseAdmin
          .from('contratos')
          .select('client_id')
          .eq('id', loan_id)
          .maybeSingle();

        if (targetContract && targetContract.client_id === urlContract.client_id) {
          isAuthorized = true;
        }
      }
    }

    // Se não for do Portal, exige autenticação padrão de operador
    if (!isAuthorized) {
      const token = getBearerToken(req);
      if (!token) return json(req, { ok: false, error: "Unauthorized" }, 401);

      const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });

      const { data: authData, error: authErr } = await supabaseUser.auth.getUser();
      if (authErr || !authData?.user?.id) {
        return json(req, { ok: false, error: "Unauthorized: invalid token" }, 401);
      }
    }

    // 1. Buscar o Dono do Contrato (Operador)
    const { data: loan, error: loanErr } = await supabaseAdmin
      .from("contratos")
      .select("id, profile_id, owner_id, source_id")
      .eq("id", loan_id)
      .single();

    if (loanErr || !loan?.id) return json(req, { ok: false, error: "Contrato não encontrado" }, 404);

    const targetProfileId = loan.profile_id || loan.owner_id;

    // 2. Buscar Credenciais MP do Operador (Multi-Conta)
    const { data: mpConfig } = await supabaseAdmin
      .from("perfis_config_mp")
      .select("mp_access_token")
      .eq("profile_id", targetProfileId)
      .maybeSingle();

    let accessToken = (mpConfig?.mp_access_token || GLOBAL_MP_ACCESS_TOKEN || "").trim();
    if (accessToken === "undefined" || accessToken === "null") accessToken = "";

    if (!accessToken) {
      return json(req, { ok: false, error: "Credenciais Mercado Pago não configuradas para este perfil. Verifique as configurações de pagamento." });
    }

    const external_reference = crypto.randomUUID();

    // 3. Montar o Payload da Preference (Checkout Pro)
    const mpPayload = {
      items: [
        {
          id: String(installment_id || loan_id),
          title: `Pagamento Contrato ${String(loan.id).slice(0, 8)}`,
          quantity: 1,
          unit_price: Number(amount),
          currency_id: "BRL"
        }
      ],
      payer: {
        name: payer_name || "Cliente",
        email: payer_email || "cliente@capitalflow.app"
      },
      external_reference,
      statement_descriptor: "CAPITALFLOW",
      payment_methods: {
        excluded_payment_methods: [
          // Excluir metodos de pagamento em dinheiro (loteria, etc) se quiser forçar apenas CC e PIX
          // { id: "ticket" }
        ],
        excluded_payment_types: [
            // { id: "ticket" }
        ],
        installments: 12 // Permite até 12x
      },
      metadata: {
        loan_id: loan.id,
        installment_id,
        payment_type: payment_type || "RENEW_INTEREST",
        profile_id: loan.profile_id,
        source_id: loan.source_id,
      },
      back_urls: {
        success: return_url || "https://capitalflow.app/sucesso",
        failure: return_url || "https://capitalflow.app/falha",
        pending: return_url || "https://capitalflow.app/pendente"
      },
      notification_url: "https://hzchchbxkhryextaymkn.supabase.co/functions/v1/mp-webhook"
    };

    // 4. Criar a Preference na API do Mercado Pago
    const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(mpPayload),
    });

    const mpData = await mpRes.json();
    if (!mpRes.ok) return json(req, { ok: false, error: JSON.stringify(mpData) }, 200);

    // 5. Retornar a URL de Pagamento (init_point)
    return json(req, {
      ok: true,
      preference_id: mpData.id,
      init_point: mpData.init_point, // URL de pagamento
      external_reference,
    });
  } catch (err: any) {
    return json(req, { ok: false, error: err?.message || "Internal error" }, 500);
  }
});


