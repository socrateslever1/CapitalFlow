import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const DEV_PROFILE_ID = "62dcbb45-f02c-42ba-84a4-916af9854dea";
const APP_ORIGIN = (Deno.env.get("APP_ORIGIN") || "https://capflow.pages.dev").replace(/\/$/, "");
const allowedOrigins = new Set([APP_ORIGIN, "https://capflow.pages.dev", "https://capitalflow.app", "https://www.capitalflow.app", "http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3001"]);
const headers = (req: Request) => ({
  "Access-Control-Allow-Origin": allowedOrigins.has(req.headers.get("origin") || "") ? req.headers.get("origin")! : APP_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-capitalflow-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  Vary: "Origin",
});
const json = (req: Request, body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: headers(req) });
const digits = (value: unknown) => String(value || "").replace(/\D/g, "");
const sha256 = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))))
  .map((byte) => byte.toString(16).padStart(2, "0")).join("");
const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
const dateBr = (value: string) => value.split("T")[0].split("-").reverse().join("/");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: headers(req) });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);

  try {
    const body = await req.json();
    const action = String(body.action || "enqueue");
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

    if (action === "claim" || action === "ack") {
      const profileId = String(body.profile_id || "");
      const secret = req.headers.get("x-capitalflow-secret") || "";
      const { data: integration } = await admin.from("n8n_automation_integrations")
        .select("profile_id, session_name").eq("profile_id", profileId).eq("secret_hash", await sha256(secret)).eq("active", true).maybeSingle();
      if (!integration || profileId !== DEV_PROFILE_ID) return json(req, { error: "unauthorized" }, 401);

      if (action === "ack") {
        const success = body.success === true;
        const { error } = await admin.from("whatsapp_queue").update({
          status: success ? "SENT" : "ERROR",
          sent_at: success ? new Date().toISOString() : null,
          error_message: success ? null : String(body.error || "Falha no envio pelo WAHA").slice(0, 500),
        }).eq("profile_id", profileId).eq("id", String(body.queue_id || ""));
        if (error) throw error;
        return json(req, { ok: true });
      }

      const { data: pending, error: pendingError } = await admin.from("whatsapp_queue")
        .select("id, phone, message").eq("profile_id", profileId).eq("status", "PENDING").order("created_at").limit(10);
      if (pendingError) throw pendingError;
      const ids = (pending || []).map((item) => item.id);
      if (ids.length) {
        const { error } = await admin.from("whatsapp_queue").update({ status: "PROCESSING" }).in("id", ids).eq("status", "PENDING");
        if (error) throw error;
      }
      return json(req, { ok: true, messages: (pending || []).map((item) => ({
        queue_id: item.id,
        session: integration.session_name,
        chat_id: `${digits(item.phone).startsWith("55") ? digits(item.phone) : `55${digits(item.phone)}`}@c.us`,
        message: item.message,
      })) });
    }

    const authorization = req.headers.get("authorization") || "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData.user) return json(req, { error: "unauthorized" }, 401);

    const profileId = String(body.profile_id || "");
    if (profileId !== DEV_PROFILE_ID) return json(req, { error: "feature_not_enabled_for_profile" }, 403);
    const email = String(userData.user.email || "").toLowerCase();
    const { data: profile } = await admin.from("perfis").select("id").eq("id", profileId)
      .or(`user_id.eq.${userData.user.id},email.eq.${email},usuario_email.eq.${email}`).maybeSingle();
    if (!profile) return json(req, { error: "forbidden" }, 403);

    const loanId = String(body.loan_id || "");
    const { data: loan, error: loanError } = await admin.from("contratos")
      .select("id, debtor_name, debtor_phone, portal_token, portal_shortcode")
      .eq("id", loanId).or(`profile_id.eq.${profileId},owner_id.eq.${profileId}`).eq("is_archived", false).maybeSingle();
    if (loanError || !loan) return json(req, { error: "contract_not_found" }, 404);
    const phone = digits(loan.debtor_phone);
    if (phone.length < 10) return json(req, { error: "client_phone_missing" }, 400);
    const requestedType = String(body.message_type || "COLLECTION").toUpperCase();
    const allowedTypes = new Set(["COLLECTION", "WELCOME", "REMINDER", "LATE", "PAID"]);
    if (!allowedTypes.has(requestedType)) return json(req, { error: "invalid_message_type" }, 400);
    const firstName = String(loan.debtor_name || "Cliente").trim().split(/\s+/)[0];
    const portalLink = loan.portal_token && loan.portal_shortcode
      ? `${APP_ORIGIN}/?portal=${encodeURIComponent(loan.portal_token)}&portal_code=${encodeURIComponent(loan.portal_shortcode)}` : null;

    if (requestedType === "WELCOME" || requestedType === "PAID") {
      const message = requestedType === "WELCOME"
        ? `Olá, ${firstName}. Seu acesso ao CapitalFlow está disponível. Pelo portal você pode consultar contratos, parcelas e comprovantes com segurança${portalLink ? `: ${portalLink}` : "."}`
        : `Olá, ${firstName}. Recebemos o seu pagamento. Obrigado! O recibo e o saldo atualizado podem ser consultados no portal${portalLink ? `: ${portalLink}` : "."}`;
      const { data: queued, error: queueError } = await admin.from("whatsapp_queue").insert({
        profile_id: profileId, phone, message, status: "PENDING", loan_id: loanId,
      }).select("id").single();
      if (queueError) throw queueError;
      return json(req, { ok: true, queue_id: queued.id, status: "PENDING" }, 202);
    }

    const paid = ["PAID", "PAGO", "QUITADO", "QUITADA", "CANCELADO", "RENEGOCIADO"];
    const { data: installments, error: installmentError } = await admin.from("parcelas")
      .select("id, due_date, data_vencimento, status").eq("loan_id", loanId).eq("profile_id", profileId)
      .not("status", "in", `(${paid.map((status) => `"${status}"`).join(",")})`).order("due_date").limit(20);
    if (installmentError) throw installmentError;
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Manaus" });
    const open = (installments || []).map((item) => ({ ...item, effective_due: item.data_vencimento || item.due_date }))
      .sort((a, b) => String(a.effective_due).localeCompare(String(b.effective_due)))[0];
    if (!open?.id || !open.effective_due) return json(req, { error: "no_open_installment" }, 409);

    const { data: dueData, error: dueError } = await admin.rpc("prepare_installment_for_online_payment", {
      p_loan_id: loanId, p_installment_id: open.id, p_reference_date: today,
    });
    if (dueError) throw dueError;
    const due = Array.isArray(dueData) ? dueData[0] : dueData;
    const amount = Number(due?.total_due || 0);
    if (amount <= 0.05) return json(req, { error: "no_amount_due" }, 409);
    const daysLate = Number(due?.days_late || 0);
    const dueLabel = dateBr(open.effective_due);
    if (requestedType === "LATE" && daysLate <= 0) return json(req, { error: "installment_not_overdue" }, 409);
    const shouldUseLateTone = requestedType === "LATE" || (requestedType === "COLLECTION" && daysLate > 0);
    const message = shouldUseLateTone
      ? `Olá, ${firstName}. A parcela vencida em ${dueLabel}, com valor atualizado de ${money(amount)}, permanece em aberto. Precisamos do seu retorno para regularização. Você pode pagar ou consultar os detalhes pelo portal${portalLink ? `: ${portalLink}` : "."}`
      : daysLate > 0
        ? `Olá, ${firstName}. Este é um lembrete sobre a parcela vencida em ${dueLabel}. O valor atualizado é ${money(amount)}. Consulte os detalhes e as opções de pagamento pelo portal${portalLink ? `: ${portalLink}` : "."}`
        : `Olá, ${firstName}. Passando para lembrar que sua parcela de ${money(amount)} vence em ${dueLabel}. Você pode consultar os detalhes e as opções de pagamento pelo portal${portalLink ? `: ${portalLink}` : "."}`;

    const { data: queued, error: queueError } = await admin.from("whatsapp_queue").insert({
      profile_id: profileId, phone, message, status: "PENDING", loan_id: loanId, parcela_id: open.id,
    }).select("id").single();
    if (queueError) throw queueError;
    return json(req, { ok: true, queue_id: queued.id, status: "PENDING" }, 202);
  } catch (error) {
    console.error("[capitalflow-manual-collections]", error);
    return json(req, { error: error instanceof Error ? error.message : "internal_error" }, 500);
  }
});
