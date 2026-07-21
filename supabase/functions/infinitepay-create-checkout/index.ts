import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

declare const Deno: any;

const APP_ORIGIN = Deno.env.get("APP_ORIGIN") || "https://capitalflow.app";
const INFINITEPAY_LINKS_URL = "https://api.checkout.infinitepay.io/links";

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

function cents(value: number) {
  return Math.round(Number(value || 0) * 100);
}

function roundMoney(value: unknown) {
  const numeric = Number(value || 0);
  return Math.round((numeric + Number.EPSILON) * 100) / 100;
}

async function readResponseBody(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return await response.json().catch(() => null);
  }
  return await response.text().catch(() => "");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { ok: false, error: "Method Not Allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const GLOBAL_INFINITEPAY_HANDLE = Deno.env.get("INFINITEPAY_HANDLE") || "";

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      return json(req, { ok: false, error: "Missing env vars" }, 500);
    }

    const body = await req.json();
    const {
      amount,
      payer_name,
      payer_email,
      payer_doc,
      payer_phone,
      loan_id,
      installment_id,
      portal_token,
      portal_code,
      return_url,
    } = body || {};

    const requestedAmount = Number(amount || 0);
    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
      return json(req, { ok: false, error: "Valor invalido.", code: "INVALID_AMOUNT" });
    }
    if (!loan_id || !installment_id) {
      return json(req, { ok: false, error: "Contrato ou parcela nao informado.", code: "MISSING_REFERENCE" });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let isAuthorized = false;
    const isInternalServiceCall =
      req.headers.get("authorization") === `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`;
    let callerProfileId: string | null = null;

    if (portal_token && portal_code) {
      const { data: urlContract } = await supabaseAdmin
        .from("contratos")
        .select("client_id, portal_shortcode")
        .eq("portal_token", portal_token)
        .maybeSingle();

      if (!urlContract || String(urlContract.portal_shortcode) !== String(portal_code)) {
        return json(req, {
          ok: false,
          error: "Credenciais do portal invalidas.",
          code: "INVALID_PORTAL_CREDENTIALS",
        });
      }

      const { data: targetContract } = await supabaseAdmin
        .from("contratos")
        .select("client_id")
        .eq("id", loan_id)
        .maybeSingle();

      if (!targetContract || targetContract.client_id !== urlContract.client_id) {
        return json(req, {
          ok: false,
          error: "Contrato nao pertence ao cliente do portal.",
          code: "PORTAL_CONTRACT_MISMATCH",
        });
      }

      isAuthorized = true;
    }

    if (!isAuthorized && !isInternalServiceCall) {
      const token = getBearerToken(req);
      if (!token) return json(req, { ok: false, error: "Unauthorized" }, 401);

      const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });

      const { data: authData, error: authErr } = await supabaseUser.auth.getUser();
      if (authErr || !authData?.user?.id) {
        return json(req, {
          ok: false,
          error: "Unauthorized: invalid token",
          code: "UNAUTHORIZED",
        });
      }

      const { data: callerProfile } = await supabaseAdmin
        .from("perfis")
        .select("id")
        .eq("user_id", authData.user.id)
        .maybeSingle();

      if (!callerProfile?.id) {
        return json(req, {
          ok: false,
          error: "Perfil nao encontrado.",
          code: "PROFILE_NOT_FOUND",
        });
      }

      callerProfileId = callerProfile.id;
      isAuthorized = true;
    }

    const { data: loan, error: loanErr } = await supabaseAdmin
      .from("contratos")
      .select("id, owner_id, profile_id, source_id, client_id, debtor_name")
      .eq("id", loan_id)
      .maybeSingle();

    if (loanErr || !loan?.id) {
      return json(req, {
        ok: false,
        error: "Contrato nao encontrado.",
        code: "CONTRACT_NOT_FOUND",
      });
    }

    const targetProfileId = loan.profile_id || loan.owner_id || callerProfileId;
    if (!targetProfileId) {
      return json(req, {
        ok: false,
        error: "Perfil do contrato nao encontrado.",
        code: "CONTRACT_PROFILE_NOT_FOUND",
      });
    }

    if (!isInternalServiceCall && callerProfileId && String(targetProfileId) !== String(callerProfileId)) {
      const { data: relatedProfiles } = await supabaseAdmin
        .from("perfis")
        .select("id, supervisor_id")
        .in("id", [callerProfileId, targetProfileId]);

      const caller = (relatedProfiles || []).find(
        (profile: any) => String(profile.id) === String(callerProfileId),
      );
      const target = (relatedProfiles || []).find(
        (profile: any) => String(profile.id) === String(targetProfileId),
      );
      const canAccess =
        String(target?.supervisor_id || "") === String(callerProfileId) ||
        String(caller?.supervisor_id || "") === String(targetProfileId);

      if (!canAccess) {
        return json(req, {
          ok: false,
          error: "Acesso negado para gerar cobranca deste contrato.",
          code: "ACCESS_DENIED",
        });
      }
    }

    const referenceDate = new Date().toISOString().slice(0, 10);
    const { data: dueData, error: dueError } = await supabaseAdmin.rpc(
      "prepare_installment_for_online_payment",
      {
        p_loan_id: loan_id,
        p_installment_id: installment_id,
        p_reference_date: referenceDate,
      },
    );

    if (dueError) {
      return json(req, {
        ok: false,
        error: "Falha ao calcular o valor atualizado da parcela: " + dueError.message,
        code: "DUE_CALCULATION_FAILED",
      });
    }

    const due = Array.isArray(dueData) ? dueData[0] : dueData;
    const chargeAmount = roundMoney(due?.total_due);
    const principalDue = roundMoney(due?.principal_due);
    const interestDue = roundMoney(due?.interest_due);
    const lateFeeDue = roundMoney(due?.late_fee_due);
    const daysLate = Math.max(0, Number(due?.days_late || 0));

    if (!Number.isFinite(chargeAmount) || chargeAmount <= 0.05) {
      return json(req, {
        ok: false,
        error: "Parcela ja esta quitada.",
        code: "INSTALLMENT_PAID",
      });
    }

    const amountAdjusted = Math.abs(chargeAmount - requestedAmount) > 0.05;

    const { data: config } = await supabaseAdmin
      .from("perfis_config_infinitepay")
      .select("infinitepay_handle")
      .eq("profile_id", targetProfileId)
      .maybeSingle();

    const handle = String(
      config?.infinitepay_handle || GLOBAL_INFINITEPAY_HANDLE || "",
    ).trim().replace(/^[@$]+/, "");

    if (!handle) {
      return json(req, {
        ok: false,
        error: "InfinitePay nao configurado para este perfil.",
        code: "HANDLE_NOT_CONFIGURED",
      });
    }

    const orderNsu = crypto.randomUUID();
    const webhookUrl = `${SUPABASE_URL}/functions/v1/infinitepay-webhook`;
    const redirectUrl = String(return_url || APP_ORIGIN || "").startsWith("http")
      ? return_url
      : APP_ORIGIN;

    const checkoutPayload: Record<string, unknown> = {
      handle,
      redirect_url: redirectUrl,
      webhook_url: webhookUrl,
      order_nsu: orderNsu,
      items: [
        {
          quantity: 1,
          price: cents(chargeAmount),
          description: daysLate > 0
            ? `Parcela atualizada com encargos - Contrato ${String(loan_id).slice(0, 8)}`
            : `Pagamento de parcela - Contrato ${String(loan_id).slice(0, 8)}`,
        },
      ],
    };

    const customerName = String(payer_name || loan.debtor_name || "").trim();
    const customerEmail = String(payer_email || "").trim();
    const customerPhone = String(payer_phone || "").trim();

    if (customerName || customerEmail || customerPhone) {
      checkoutPayload.customer = {
        name: customerName || "Cliente",
        email: customerEmail || "cliente@capitalflow.app",
        phone_number: customerPhone || undefined,
      };
    }

    const providerRes = await fetch(INFINITEPAY_LINKS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(checkoutPayload),
    });

    const providerData = await readResponseBody(providerRes);
    if (!providerRes.ok || !providerData?.url) {
      const providerMessage =
        typeof providerData === "string"
          ? providerData
          : (
              providerData &&
              typeof providerData === "object" &&
              ("message" in providerData || "error" in providerData)
            )
            ? String((providerData as any).message || (providerData as any).error || "")
            : "";

      return json(req, {
        ok: false,
        error: providerMessage || "Erro ao gerar checkout InfinitePay.",
        code: "PROVIDER_REJECTED",
        provider_status: providerRes.status,
        provider_body: providerData,
      });
    }

    const { data: charge, error: chargeErr } = await supabaseAdmin
      .from("payment_charges")
      .insert({
        provider: "INFINITEPAY",
        provider_payment_id: null,
        status: "PENDING",
        loan_id,
        installment_id,
        amount: chargeAmount,
        currency: "BRL",
        external_reference: orderNsu,
        payer_email: payer_email || null,
        payer_name: payer_name || null,
        payer_doc: payer_doc || null,
        checkout_url: providerData.url,
        provider_payload: {
          provider: "INFINITEPAY",
          handle,
          order_nsu: orderNsu,
          source_id: loan.source_id || null,
          profile_id: targetProfileId,
          client_id: loan.client_id || null,
          checkout_url: providerData.url,
          requested_amount: requestedAmount,
          charged_amount: chargeAmount,
          amount_adjusted: amountAdjusted,
          calculation_reference_date: referenceDate,
          principal_due: principalDue,
          interest_due: interestDue,
          late_fee_due: lateFeeDue,
          days_late: daysLate,
        },
      })
      .select("id")
      .single();

    if (chargeErr) {
      return json(req, {
        ok: false,
        error: "Checkout gerado, mas falhou ao registrar cobranca: " + chargeErr.message,
        code: "CHARGE_PERSISTENCE_FAILED",
      });
    }

    return json(req, {
      ok: true,
      checkout_url: providerData.url,
      charge_id: charge?.id,
      external_reference: orderNsu,
      webhook_url: webhookUrl,
      requested_amount: requestedAmount,
      charged_amount: chargeAmount,
      amount_adjusted: amountAdjusted,
      breakdown: {
        principal: principalDue,
        interest: interestDue,
        late_fee: lateFeeDue,
        days_late: daysLate,
      },
    });
  } catch (err: any) {
    return json(req, {
      ok: false,
      error: err?.message || "Internal error",
      code: "INTERNAL_ERROR",
    });
  }
});
