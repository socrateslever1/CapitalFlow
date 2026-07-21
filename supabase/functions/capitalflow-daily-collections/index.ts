import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.7";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8" },
});
const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");
const closed = ["PAID", "PAGO", "QUITADO", "QUITADA", "FINALIZADO", "CLOSED", "ENCERRADO", "CANCELADO", "RENEGOCIADO"];
const paid = ["PAID", "PAGO", "QUITADO", "QUITADA", "FINALIZADO", "CLOSED", "ENCERRADO", "CANCELADO"];

async function sha256(value: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
const dateBr = (value: string) => value.split("-").reverse().join("/");

function buildMessage(input: {
  name: string; stage: string; dueDate: string; amount: number; daysLate: number; tone: string; portalLink: string | null;
}) {
  const firstName = input.name.trim().split(/\s+/)[0] || "Olá";
  const due = dateBr(input.dueDate);
  const amount = money(input.amount);
  let text = "";
  if (input.stage === "DUE_MINUS_2") {
    text = `Olá, ${firstName}. Passando para lembrar do seu compromisso: a parcela de ${amount} vence em dois dias, em ${due}. Se precisar, podemos conversar por aqui.`;
  } else if (input.stage === "DUE_TODAY") {
    text = `Olá, ${firstName}. Sua parcela de ${amount} vence hoje. Quer que eu ajude com as informações para pagamento?`;
  } else if (input.tone === "MEDIATOR") {
    text = `Olá, ${firstName}. A parcela vencida em ${due} está há ${input.daysLate} dia${input.daysLate === 1 ? "" : "s"} em atraso, com valor atualizado de ${amount}. Se houve algum imprevisto, podemos conversar para encontrar o melhor encaminhamento.`;
  } else if (input.tone === "FIRM_RESPECTFUL") {
    text = `Olá, ${firstName}. A parcela vencida em ${due} permanece em aberto há ${input.daysLate} dia${input.daysLate === 1 ? "" : "s"}. O valor atualizado é ${amount}. Por favor, responda para regularizar ou conversar com o operador.`;
  } else if (input.tone === "OBJECTIVE") {
    text = `Olá, ${firstName}. Consta uma parcela vencida em ${due}, há ${input.daysLate} dia${input.daysLate === 1 ? "" : "s"}, no valor atualizado de ${amount}. Deseja receber ajuda para pagar ou falar com o operador?`;
  } else {
    text = `Olá, ${firstName}. Identificamos que a parcela vencida em ${due} continua em aberto. O valor atualizado hoje é ${amount}. Quer conversar sobre isso ou receber ajuda para pagar?`;
  }
  return input.portalLink ? `${text}\n\nPortal seguro: ${input.portalLink}` : text;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const body = await req.json();
    const profileId = String(body.profile_id || "");
    const secret = req.headers.get("x-capitalflow-secret") || "";
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: integration } = await supabase.from("n8n_automation_integrations")
      .select("profile_id, session_name, secret_hash, active")
      .eq("profile_id", profileId).eq("secret_hash", await sha256(secret)).eq("active", true).maybeSingle();
    if (!integration) return json({ error: "unauthorized" }, 401);

    if (body.action === "ack") {
      const status = body.success === true ? "SENT" : "ERROR";
      const { error } = await supabase.from("n8n_collection_dispatches").update({
        status,
        sent_at: status === "SENT" ? new Date().toISOString() : null,
        error_message: status === "ERROR" ? String(body.error || "Falha no envio").slice(0, 500) : null,
      }).eq("profile_id", profileId).eq("id", String(body.dispatch_id || ""));
      if (error) throw error;
      return json({ ok: true });
    }

    const dryRun = body.dry_run === true;
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Manaus" });
    const { data: policies, error: policyError } = await supabase.from("n8n_collection_policies")
      .select("*").eq("profile_id", profileId);
    if (policyError) throw policyError;
    const defaultPolicy = (policies || []).find((policy) => !policy.loan_id);
    if (!defaultPolicy?.enabled || defaultPolicy.paused) return json({ ok: true, messages: [], reason: "automation_disabled" });
    const currentHour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Manaus", hour: "2-digit", hour12: false }).format(new Date()));
    if (!dryRun && currentHour !== Number(defaultPolicy.send_hour)) {
      return json({ ok: true, messages: [], reason: "outside_configured_hour" });
    }
    const overrides = new Map((policies || []).filter((policy) => policy.loan_id).map((policy) => [policy.loan_id, policy]));

    const { data: contracts, error: contractError } = await supabase.from("contratos")
      .select("id, client_id, status, portal_token, portal_shortcode")
      .or(`profile_id.eq.${profileId},owner_id.eq.${profileId}`).eq("is_archived", false);
    if (contractError) throw contractError;
    const activeContracts = (contracts || []).filter((contract) => !closed.includes(String(contract.status || "").toUpperCase()));
    const contractIds = activeContracts.map((contract) => contract.id);
    const clientIds = [...new Set(activeContracts.map((contract) => contract.client_id).filter(Boolean))];
    if (!contractIds.length || !clientIds.length) return json({ ok: true, messages: [] });

    const [{ data: clients, error: clientError }, { data: installments, error: installmentError }] = await Promise.all([
      supabase.from("clientes").select("id, name, phone").eq("owner_id", profileId).in("id", clientIds),
      supabase.from("parcelas").select("id, loan_id, due_date, data_vencimento, numero_parcela, status")
        .eq("profile_id", profileId).in("loan_id", contractIds)
        .not("status", "in", `(${paid.map((status) => `"${status}"`).join(",")})`)
        .order("due_date", { ascending: true }).limit(500),
    ]);
    if (clientError) throw clientError;
    if (installmentError) throw installmentError;
    const clientMap = new Map((clients || []).map((client) => [client.id, client]));
    const contractMap = new Map(activeContracts.map((contract) => [contract.id, contract]));
    const appOrigin = (Deno.env.get("APP_ORIGIN") || "https://capitalflow.app").replace(/\/$/, "");
    const messages = [];
    const handledClients = new Set<string>();

    for (const installment of installments || []) {
      const contract = contractMap.get(installment.loan_id);
      const client = contract ? clientMap.get(contract.client_id) : null;
      const phone = digits(client?.phone);
      if (!contract || !client || phone.length < 10) continue;
      if (handledClients.has(client.id)) continue;
      const policy = overrides.get(contract.id) || defaultPolicy;
      if (!policy.enabled || policy.paused) continue;
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const [recentReply, openHandoff, activePromise] = await Promise.all([
        supabase.from("n8n_message_events").select("id", { head: true, count: "exact" })
          .eq("profile_id", profileId).eq("client_id", client.id).eq("direction", "INBOUND").gte("created_at", sevenDaysAgo),
        supabase.from("n8n_handoffs").select("id", { head: true, count: "exact" })
          .eq("profile_id", profileId).eq("client_id", client.id).in("status", ["OPEN", "IN_PROGRESS"]),
        supabase.from("n8n_payment_promises").select("id", { head: true, count: "exact" })
          .eq("profile_id", profileId).eq("client_id", client.id).eq("status", "ACTIVE").gte("promised_for", today),
      ]);
      if (Number(recentReply.count || 0) > 0 || Number(openHandoff.count || 0) > 0 || Number(activePromise.count || 0) > 0) continue;
      const dueDate = installment.data_vencimento || installment.due_date;
      if (!dueDate) continue;
      const dayDiff = Math.round((new Date(`${dueDate}T12:00:00Z`).getTime() - new Date(`${today}T12:00:00Z`).getTime()) / 86400000);
      let stage: "DUE_MINUS_2" | "DUE_TODAY" | "OVERDUE" | null = null;
      if (dayDiff === 2 && policy.remind_two_days_before) stage = "DUE_MINUS_2";
      else if (dayDiff === 0 && policy.remind_due_today) stage = "DUE_TODAY";
      else if (dayDiff < 0) {
        const daysLate = Math.abs(dayDiff);
        if (daysLate === 1 && policy.remind_first_overdue_day) stage = "OVERDUE";
        else if (policy.overdue_cadence === "DAILY") stage = "OVERDUE";
        else if (policy.overdue_cadence === "WEEKLY" && (daysLate - 1) % 7 === 0) stage = "OVERDUE";
      }
      if (!stage) continue;
      const { count } = await supabase.from("n8n_collection_dispatches").select("id", { count: "exact", head: true })
        .eq("profile_id", profileId).eq("installment_id", installment.id).eq("stage", "OVERDUE").in("status", ["QUEUED", "SENT"]);
      if (stage === "OVERDUE" && Number(count || 0) >= Number(policy.max_consecutive_messages || 10)) continue;
      const { data: dueData, error: dueError } = await supabase.rpc("prepare_installment_for_online_payment", {
        p_loan_id: contract.id, p_installment_id: installment.id, p_reference_date: today,
      });
      if (dueError) throw dueError;
      const due = Array.isArray(dueData) ? dueData[0] : dueData;
      const amount = Number(due?.total_due || 0);
      if (amount <= 0.05) continue;
      const portalLink = contract.portal_token && contract.portal_shortcode
        ? `${appOrigin}/?portal=${encodeURIComponent(contract.portal_token)}&portal_code=${encodeURIComponent(contract.portal_shortcode)}` : null;
      const message = buildMessage({ name: client.name, stage, dueDate, amount, daysLate: Number(due.days_late || 0), tone: policy.tone, portalLink });
      let dispatchId: string | null = null;
      if (!dryRun) {
        const inserted = await supabase.from("n8n_collection_dispatches").insert({
          profile_id: profileId, loan_id: contract.id, installment_id: installment.id, stage, scheduled_date: today,
          phone_hash: await sha256(phone), amount, days_late: Number(due.days_late || 0), tone: policy.tone, message, status: "QUEUED",
        }).select("id").maybeSingle();
        if (inserted.error?.code === "23505") continue;
        if (inserted.error) throw inserted.error;
        dispatchId = inserted.data?.id || null;
      }
      handledClients.add(client.id);
      messages.push({ dispatch_id: dispatchId, session: integration.session_name, chat_id: `${phone}@c.us`, message, stage, dry_run: dryRun });
    }
    return json({ ok: true, date: today, messages });
  } catch (error) {
    console.error("capitalflow-daily-collections", error instanceof Error ? error.message : "unknown_error");
    return json({ error: "internal_error" }, 500);
  }
});
