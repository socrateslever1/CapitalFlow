import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.7";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8" },
});

const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const closedStatuses = ["PAID", "PAGO", "QUITADO", "QUITADA", "FINALIZADO", "CLOSED", "ENCERRADO", "CANCELADO", "RENEGOCIADO"];
const paidInstallmentStatuses = ["PAID", "PAGO", "QUITADO", "QUITADA", "FINALIZADO", "CLOSED", "ENCERRADO", "CANCELADO"];

async function sha256(value: string) {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const body = await req.json();
    const organizationId = String(body.organization_id ?? "");
    const secret = req.headers.get("x-capitalflow-secret") ?? "";
    if (!uuidPattern.test(organizationId) || secret.length < 32) return json({ error: "unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const { data: integration } = await supabase
      .from("n8n_automation_integrations")
      .select("profile_id, session_name, active")
      .eq("profile_id", organizationId)
      .eq("secret_hash", await sha256(secret))
      .eq("active", true)
      .maybeSingle();
    if (!integration) return json({ error: "unauthorized" }, 401);

    const action = String(body.action ?? "context");
    const phone = digits(body.phone);
    if (phone.length < 10) return json({ error: "invalid_phone" }, 400);
    const phoneHash = await sha256(phone);

    if (action === "context") {
      const messageId = String(body.message_id ?? "");
      if (!messageId) return json({ error: "missing_message_id" }, 400);
      const { error: eventError } = await supabase.from("n8n_message_events").insert({
        profile_id: organizationId,
        message_id: messageId,
        phone_hash: phoneHash,
        direction: "INBOUND",
        message_type: String(body.message_type ?? "text"),
      });
      if (eventError?.code === "23505") return json({ status: "duplicate" });
      if (eventError) throw eventError;

      const message = String(body.message ?? "").trim().slice(0, 1000);
      const { data: operator } = await supabase.from("perfis")
        .select("nome_operador, nome_exibicao, nome_completo, contato_whatsapp, phone")
        .eq("id", organizationId).maybeSingle();
      const operatorPhone = digits(operator?.contato_whatsapp || operator?.phone);
      const operatorContact = operatorPhone.length >= 10 ? {
        name: operator?.nome_operador || operator?.nome_exibicao || operator?.nome_completo || "operador",
        whatsapp_url: `https://wa.me/${operatorPhone}`,
      } : null;

      const endsConversation = /^(encerrar|encerrar conversa|finalizar conversa|sair|trocar usu[aá]rio|trocar cliente|esquecer cliente)$/i
        .test(message.normalize("NFC"));
      if (endsConversation) {
        const { error: endError } = await supabase.from("n8n_client_sessions")
          .delete().eq("profile_id", organizationId).eq("phone_hash", phoneHash);
        if (endError) throw endError;
        await supabase.from("n8n_message_events").update({ status: "PROCESSED" })
          .eq("profile_id", organizationId).eq("message_id", messageId).eq("direction", "INBOUND");
        return json({
          status: "session_ended",
          conversation_id: crypto.randomUUID(),
          operator_contact: operatorContact,
        });
      }

      const { data: savedSession } = await supabase.from("n8n_client_sessions")
        .select("client_id, conversation_id").eq("profile_id", organizationId).eq("phone_hash", phoneHash)
        .gt("expires_at", new Date().toISOString()).maybeSingle();

      let clients: Array<{ id: string; name: string }> = [];
      let matchedBy = "PHONE";
      if (savedSession?.client_id) {
        const saved = await supabase.from("clientes").select("id, name")
          .eq("owner_id", organizationId).eq("id", savedSession.client_id).maybeSingle();
        if (saved.data) clients = [saved.data];
      }

      if (!clients.length) {
        const suffix = phone.slice(-10);
        const byPhone = await supabase.from("clientes").select("id, name, phone")
          .eq("owner_id", organizationId).not("phone", "is", null).limit(500);
        if (byPhone.error) throw byPhone.error;
        clients = (byPhone.data ?? [])
          .filter((candidate) => digits(candidate.phone).slice(-10) === suffix)
          .slice(0, 2)
          .map(({ id, name }) => ({ id, name }));
      }

      if (!clients.length && message) {
        const suppliedDigits = digits(message);
        if (suppliedDigits.length === 11) {
          matchedBy = "CPF";
          const byCpf = await supabase.from("clientes").select("id, name, cpf, document").eq("owner_id", organizationId)
            .limit(500);
          if (byCpf.error) throw byCpf.error;
          clients = (byCpf.data ?? [])
            .filter((candidate) => digits(candidate.cpf || candidate.document) === suppliedDigits)
            .slice(0, 2)
            .map(({ id, name }) => ({ id, name }));
        } else if (/^[a-z0-9-]{3,30}$/i.test(message)) {
          matchedBy = "CODE";
          const byCode = await supabase.from("clientes").select("id, name").eq("owner_id", organizationId)
            .eq("client_number", message).limit(2);
          if (byCode.error) throw byCode.error;
          clients = byCode.data ?? [];
        } else if (/^[\p{L}][\p{L}\s.'-]{4,159}$/u.test(message) && message.includes(" ")) {
          matchedBy = "NAME";
          const byName = await supabase.from("clientes").select("id, name").eq("owner_id", organizationId)
            .ilike("name", message).limit(2);
          if (byName.error) throw byName.error;
          clients = byName.data ?? [];
        }
      }

      const wantsLoan = /\b(empr[eé]stimo|dinheiro emprestado|cr[eé]dito)\b/i.test(message);
      const wantsHuman = /\b(atendente|humano|pessoa|falar com algu[eé]m)\b/i.test(message);
      const isProof = ["image", "document"].includes(String(body.message_type ?? "")) && /comprovante|pix|pagamento/i.test(message || "comprovante");
      const wantsLoanNatural = /\b(empr[e\u00e9]stimo|dinheiro emprestado|cr[e\u00e9]dito)\b/i.test(message);
      const wantsHumanNatural = /\b(atendente|humano|pessoa|falar com algu[e\u00e9]m)\b/i.test(message);
      const wantsToBecomeClient = /\b(quero|gostaria|desejo|como fa[cç]o|posso)\b/i.test(message)
        && /\b(ser|virar|tornar|me cadastrar|cadastro)\b/i.test(message)
        && /\b(cliente|usu[aá]rio)\b/i.test(message);
      if (wantsToBecomeClient) {
        const reason = "Pessoa ainda não identificada deseja se tornar cliente.";
        await supabase.from("n8n_handoffs").insert({ profile_id: organizationId, client_id: clients[0]?.id ?? null, phone_hash: phoneHash, reason });
        await supabase.from("notificacoes").insert({ profile_id: organizationId, titulo: "Novo interessado em ser cliente", mensagem: reason, item_type: "WHATSAPP_HANDOFF" });
        return json({ status: "prospective_client", operator_contact: operatorContact });
      }
      if (wantsLoan || wantsLoanNatural) {
        await supabase.from("n8n_loan_leads").insert({ profile_id: organizationId, client_id: clients[0]?.id ?? null, phone_hash: phoneHash, full_name: clients[0]?.name ?? null });
        await supabase.from("notificacoes").insert({ profile_id: organizationId, titulo: "Novo interesse em empréstimo", mensagem: "Novo interessado solicitou contato pelo WhatsApp.", item_type: "WHATSAPP_LEAD" });
        return json({ status: "lead_registered", operator_contact: operatorContact });
      }
      if (wantsHuman || wantsHumanNatural || isProof) {
        const reason = isProof ? "Comprovante recebido pelo WhatsApp para conferência manual." : "Cliente solicitou atendimento humano pelo WhatsApp.";
        await supabase.from("n8n_handoffs").insert({ profile_id: organizationId, client_id: clients[0]?.id ?? null, phone_hash: phoneHash, reason });
        await supabase.from("notificacoes").insert({ profile_id: organizationId, titulo: isProof ? "Comprovante recebido" : "Atendimento humano solicitado", mensagem: reason, item_type: "WHATSAPP_HANDOFF" });
        return json({ status: isProof ? "proof_received" : "human_handoff_registered", operator_contact: operatorContact });
      }
      if (!clients?.length) return json({
        status: "not_identified",
        audience: "public",
        operator_contact: operatorContact,
        public_capabilities: [
          "Explicar de forma geral como funciona o atendimento e o acompanhamento de contratos.",
          "Orientar quem deseja se tornar cliente a falar com o operador.",
          "Responder dúvidas gerais sem prometer crédito, aprovação, taxas ou condições.",
        ],
      });
      if (clients.length > 1) return json({ status: "ambiguous", request: "cpf_or_client_code" });

      const client = clients[0];
      const sessionResult = await supabase.from("n8n_client_sessions").upsert({
        profile_id: organizationId,
        phone_hash: phoneHash,
        client_id: client.id,
        verified_by: matchedBy,
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        updated_at: new Date().toISOString(),
      }).select("conversation_id").single();
      if (sessionResult.error) throw sessionResult.error;
      const { data: contracts, error: contractError } = await supabase
        .from("contratos")
        .select("id, status, principal, total_to_receive, start_date, portal_token, portal_shortcode")
        .eq("client_id", client.id)
        .or(`profile_id.eq.${organizationId},owner_id.eq.${organizationId}`)
        .eq("is_archived", false);
      if (contractError) throw contractError;
      const activeContracts = (contracts ?? []).filter((contract) =>
        !closedStatuses.includes(String(contract.status || "").toUpperCase())
      );
      const loanIds = activeContracts.map((contract) => contract.id);
      let pending: Array<Record<string, unknown>> = [];
      if (loanIds.length) {
        const result = await supabase
          .from("parcelas")
          .select("id, loan_id, due_date, data_vencimento, numero_parcela, status")
          .eq("profile_id", organizationId)
          .in("loan_id", loanIds)
          .not("status", "in", `(${paidInstallmentStatuses.map((status) => `"${status}"`).join(",")})`)
          .order("due_date", { ascending: true })
          .limit(20);
        if (result.error) throw result.error;
        for (const installment of result.data ?? []) {
          const calculated = await supabase.rpc("prepare_installment_for_online_payment", {
            p_loan_id: installment.loan_id,
            p_installment_id: installment.id,
            p_reference_date: new Date().toISOString().slice(0, 10),
          });
          if (calculated.error) throw calculated.error;
          const due = Array.isArray(calculated.data) ? calculated.data[0] : calculated.data;
          if (Number(due?.total_due || 0) <= 0.05) continue;
          pending.push({
            _installment_id: installment.id,
            _loan_id: installment.loan_id,
            installment_number: installment.numero_parcela,
            due_date: installment.data_vencimento || installment.due_date,
            principal_due: Number(due.principal_due || 0),
            interest_due: Number(due.interest_due || 0),
            late_fee_due: Number(due.late_fee_due || 0),
            total_due: Number(due.total_due || 0),
            days_late: Number(due.days_late || 0),
          });
        }
      }

      const portalContract = activeContracts.find((contract) => contract.portal_token && contract.portal_shortcode);
      const appOrigin = (Deno.env.get("APP_ORIGIN") || "https://capitalflow.app").replace(/\/$/, "");
      const portalLink = portalContract
        ? `${appOrigin}/?portal=${encodeURIComponent(portalContract.portal_token)}&portal_code=${encodeURIComponent(portalContract.portal_shortcode)}`
        : null;

      const disputesAmount = /\b(discordo|errado|incorreto|n[aã]o concordo|valor diferente|contestar|revisar|revis[aã]o)\b/i.test(message);
      if (disputesAmount) {
        const reason = "Cliente discorda do valor informado pelo WhatsApp.";
        await supabase.from("n8n_handoffs").insert({ profile_id: organizationId, client_id: client.id, phone_hash: phoneHash, reason });
        await supabase.from("notificacoes").insert({ profile_id: organizationId, titulo: "Revisão de valor solicitada", mensagem: reason, item_type: "WHATSAPP_HANDOFF" });
        return json({ status: "amount_disputed", operator_contact: operatorContact });
      }

      const wantsPayment = /\b(pagar|pagamento|link de pagamento|pix|checkout|quitar)\b/i.test(message)
        && !/\b(n[aã]o|depois|agora n[aã]o)\b/i.test(message);
      let paymentLink: string | null = null;
      if (wantsPayment && pending.length) {
        const target = pending[0];
        const targetContract = activeContracts.find((contract) => contract.id === target._loan_id);
        if (targetContract?.portal_token && targetContract.portal_shortcode) {
          const checkoutResponse = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/infinitepay-create-checkout`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              "apikey": Deno.env.get("SUPABASE_ANON_KEY") || "",
            },
            body: JSON.stringify({
              amount: target.total_due,
              payer_name: client.name,
              payer_phone: phone,
              loan_id: target._loan_id,
              installment_id: target._installment_id,
              portal_token: targetContract.portal_token,
              portal_code: targetContract.portal_shortcode,
              return_url: portalLink || appOrigin,
            }),
          });
          const checkout = await checkoutResponse.json().catch(() => null);
          if (checkoutResponse.ok && checkout?.ok && checkout.checkout_url) {
            const shortCode = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
            const shortLink = await supabase.from("n8n_short_links").insert({
              code: shortCode,
              profile_id: organizationId,
              target_url: String(checkout.checkout_url),
            });
            paymentLink = shortLink.error
              ? String(checkout.checkout_url)
              : `${Deno.env.get("SUPABASE_URL")}/functions/v1/capitalflow-short-link?c=${shortCode}`;
          }
        }
      }

      await supabase.from("n8n_message_events").update({ status: "PROCESSED", client_id: client.id })
        .eq("profile_id", organizationId).eq("message_id", messageId).eq("direction", "INBOUND");
      return json({
        status: "identified",
        conversation_id: sessionResult.data.conversation_id,
        client: { display_name: client.name },
        contracts: activeContracts.map(({ status, principal, total_to_receive, start_date }, index) => ({ reference: index + 1, status, principal, total_to_receive, start_date })),
        pending: pending.map(({ _installment_id, _loan_id, ...safe }) => safe),
        portal_link: portalLink,
        payment_link: paymentLink,
        payment_requested: wantsPayment,
        operator_contact: operatorContact,
      });
    }

    if (action === "loan_interest") {
      const fullName = String(body.full_name ?? "").trim().slice(0, 160) || null;
      const { error } = await supabase.from("n8n_loan_leads").insert({ profile_id: organizationId, phone_hash: phoneHash, full_name: fullName });
      if (error) throw error;
      await supabase.from("notificacoes").insert({ profile_id: organizationId, titulo: "Novo interesse em empréstimo", mensagem: fullName ? `${fullName} solicitou contato.` : "Novo interessado solicitou contato.", item_type: "WHATSAPP_LEAD" });
      return json({ status: "registered" });
    }

    if (action === "human_handoff") {
      const reason = String(body.reason ?? "Solicitação de atendimento humano").slice(0, 500);
      const { error } = await supabase.from("n8n_handoffs").insert({ profile_id: organizationId, phone_hash: phoneHash, reason });
      if (error) throw error;
      await supabase.from("notificacoes").insert({ profile_id: organizationId, titulo: "Atendimento humano solicitado", mensagem: reason, item_type: "WHATSAPP_HANDOFF" });
      return json({ status: "registered" });
    }

    return json({ error: "unsupported_action" }, 400);
  } catch (error) {
    console.error("capitalflow-n8n-tools", error instanceof Error ? error.message : "unknown_error");
    return json({ error: "internal_error" }, 500);
  }
});
