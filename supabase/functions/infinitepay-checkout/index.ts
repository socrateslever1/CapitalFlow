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
    const GLOBAL_INFINITEPAY_TAG = Deno.env.get("INFINITEPAY_TAG") || "";

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      return json(req, { ok: false, error: "Missing env vars" }, 500);
    }

    const body = await req.json();
    const { amount, loan_id, installment_id, payment_type, return_url, portal_token, portal_code } = body || {};

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let isAuthorized = false;

    // 1. Se vier do Portal do Cliente, validamos via portal_token e portal_code
    if (portal_token && portal_code) {
      const { data: isValid } = await supabaseAdmin.rpc('validate_portal_access', {
        p_token: portal_token,
        p_shortcode: portal_code
      });
      if (isValid === true) {
        // Confirma se o portal_token pertence ao loan_id
        const { data: loanCheck } = await supabaseAdmin
          .from('contratos')
          .select('id, portal_token')
          .eq('id', loan_id)
          .maybeSingle();
        
        if (loanCheck && (loanCheck.portal_token === portal_token || String(loanCheck.portal_token).toLowerCase() === String(portal_token).toLowerCase())) {
          isAuthorized = true;
        }
      }
    }

    // 2. Se não for do Portal, exige autenticação de operador
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

    // 3. Buscar o Dono do Contrato (Operador)
    const { data: loan, error: loanErr } = await supabaseAdmin
      .from("contratos")
      .select("id, profile_id, owner_id, source_id")
      .eq("id", loan_id)
      .single();

    if (loanErr || !loan?.id) return json(req, { ok: false, error: "Contrato não encontrado" }, 404);
    const targetProfileId = loan.profile_id || loan.owner_id;

    // 4. Buscar Credenciais InfinitePay do Perfil alvo (Multi-Conta)
    const { data: ipConfig } = await supabaseAdmin
      .from("perfis_config_infinitepay")
      .select("infinite_tag")
      .eq("profile_id", targetProfileId)
      .maybeSingle();

    const infiniteTag = ipConfig?.infinite_tag || GLOBAL_INFINITEPAY_TAG;

    if (!infiniteTag) {
      return json(req, { ok: false, error: "InfiniteTag não configurada para este perfil de operador" }, 400);
    }

    const external_reference = crypto.randomUUID();
    const webhookUrl = `${SUPABASE_URL}/functions/v1/infinitepay-webhook`;

    // 5. Salvar na payment_charges para rastreio
    const { error: insertErr } = await supabaseAdmin
      .from("payment_charges")
      .insert({
        id: external_reference,
        provider: "INFINITEPAY",
        status: "PENDING",
        loan_id,
        installment_id,
        amount: Number(amount),
        currency: "BRL",
        external_reference,
        payer_name: "Cliente Portal",
        payer_email: "cliente@capitalflow.app",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

    if (insertErr) {
      console.error("Erro ao salvar payment_charges:", insertErr);
      return json(req, { ok: false, error: "Falha ao registrar intenção de pagamento no sistema." }, 500);
    }

    const payload = {
      handle: infiniteTag,
      redirect_url: return_url || "https://capitalflow.app/obrigado",
      webhook_url: webhookUrl,
      order_nsu: external_reference,
      items: [
        {
          name: `Pagamento Contrato #${String(loan_id).slice(0, 6).toUpperCase()}`,
          price: Math.round(Number(amount) * 100), // InfinitePay quer centavos
          quantity: 1
        }
      ]
    };

    // 6. Criar o link no InfinitePay
    const ipRes = await fetch("https://api.checkout.infinitepay.io/links", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const ipData = await ipRes.json();
    if (!ipRes.ok) {
      console.error("Erro na API do InfinitePay:", ipData);
      return json(req, { ok: false, error: ipData?.message || "Erro ao conectar com InfinitePay" }, 502);
    }

    const paymentLink = ipData.payment_link || ipData.url || "";

    // 7. Atualizar payment_charges com a checkout_url
    if (paymentLink) {
      await supabaseAdmin
        .from("payment_charges")
        .update({
          checkout_url: paymentLink,
          provider_payment_id: ipData.slug || null
        })
        .eq("id", external_reference);
    }

    return json(req, {
      ok: true,
      checkout_url: paymentLink,
      external_reference,
    });

  } catch (err: any) {
    console.error("Erro interno no checkout:", err);
    return json(req, { ok: false, error: err?.message || "Internal error" }, 500);
  }
});
