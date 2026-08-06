import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.7";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8" },
});

const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");
const phoneVariantMinLength = 10;

function phoneVariants(value: unknown) {
  const raw = digits(value);
  const variants = new Set<string>();

  const add = (candidate: string) => {
    const clean = digits(candidate);
    if (clean.length < phoneVariantMinLength) return;

    variants.add(clean);
    variants.add(clean.slice(-11));
    variants.add(clean.slice(-10));

    if (clean.startsWith("55") && clean.length >= 12) {
      const national = clean.slice(2);
      variants.add(national);
      variants.add(national.slice(-11));
      variants.add(national.slice(-10));
    } else if (clean.length === 10 || clean.length === 11) {
      variants.add(`55${clean}`);
    }
  };

  add(raw);

  const national = raw.startsWith("55") && raw.length >= 12 ? raw.slice(2) : raw;
  add(national);

  if (national.length === 11 && national[2] === "9") {
    add(`${national.slice(0, 2)}${national.slice(3)}`);
  }

  if (national.length === 10) {
    add(`${national.slice(0, 2)}9${national.slice(2)}`);
  }

  return [...variants].filter((item) => item.length >= phoneVariantMinLength);
}

function samePhone(left: unknown, right: unknown) {
  const rightVariants = new Set(phoneVariants(right));
  return phoneVariants(left).some((candidate) => rightVariants.has(candidate));
}

function isAutomatedServiceMessage(value: unknown) {
  const message = String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return [
    /mensagem enviada pela inteligencia artificial da vivo/,
    /\b(app vivo|produtos e servicos da vivo|sms da vivo|recarga.*vivo)\b/,
    /termos e condicoes de uso da vivo/,
    /escolha uma das opcoes apresentadas/,
    /limite de tentativas excedido/,
    /codigo (pix|perde a validade|tem validade)/,
    /protocolo de atendimento:\s*\d{8,}/,
    /ocorreu um erro inesperado.*tente novamente mais tarde/,
    /um erro inesperado me impediu de te ajudar/,
  ].some((pattern) => pattern.test(message));
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const closedStatuses = ["PAID", "PAGO", "QUITADO", "QUITADA", "FINALIZADO", "CLOSED", "ENCERRADO", "CANCELADO", "RENEGOCIADO"];
const paidInstallmentStatuses = ["PAID", "PAGO", "QUITADO", "QUITADA", "FINALIZADO", "CLOSED", "ENCERRADO", "CANCELADO"];
const infinitePayLinksUrl = "https://api.checkout.infinitepay.io/links";
const moneyBr = (value: unknown) => new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
}).format(Number(value || 0));
const cents = (value: unknown) => Math.round(Number(value || 0) * 100);

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
      const message = String(body.message ?? "").trim().slice(0, 1000);
      const { error: eventError } = await supabase.from("n8n_message_events").insert({
        profile_id: organizationId,
        message_id: messageId,
        phone_hash: phoneHash,
        direction: "INBOUND",
        message_type: String(body.message_type ?? "text"),
        metadata: {
          message,
          source: "whatsapp",
        },
      });
      if (eventError?.code === "23505") return json({ status: "duplicate" });
      if (eventError) throw eventError;

      if (isAutomatedServiceMessage(message)) {
        await supabase.from("n8n_message_events").update({ status: "IGNORED" })
          .eq("profile_id", organizationId).eq("message_id", messageId);
        return json({ status: "ignored_automation" });
      }
      const { data: operator } = await supabase.from("perfis")
        .select("nome_operador, nome_exibicao, nome_completo, contato_whatsapp, phone")
        .eq("id", organizationId).maybeSingle();
      const operatorPhone = digits(operator?.contato_whatsapp || operator?.phone);
      const operatorContact = operatorPhone.length >= 10 ? {
        name: "operador",
        whatsapp_url: `https://wa.me/${operatorPhone}`,
      } : null;

      const normalizedMessage = message.normalize("NFC");
      const suppliedDigits = digits(message);
      const suppliedCode = /^[a-z0-9-]{3,30}$/i.test(message) && /\d/.test(message) ? message : null;
      const hasExplicitIdentity = suppliedDigits.length === 11 || Boolean(suppliedCode);
      const plainMessage = normalizedMessage.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const requestsIdentityReset = /^(trocar usuario|trocar cliente|esquecer cliente|reiniciar atendimento|comecar de novo|reiniciar conversa|outro cliente)$/i
        .test(plainMessage)
        || (/\b(trocar|mudar|alterar|outro|outra|reiniciar|recomecar|comecar de novo|esquecer)\b.*\b(cliente|usuario|cadastro|cpf|conversa|atendimento|dados?)\b|\b(esse nao sou eu|essa pessoa nao sou eu|pessoa errada)\b/i
          .test(plainMessage) && !hasExplicitIdentity);
      const saysGoodbye = /^(encerrar|encerrar conversa|finalizar|finalizar conversa|sair)$/i
        .test(plainMessage);
      const wantsIdentityChange = /\b(trocar|mudar|alterar|outro|outra|reiniciar|recomeçar|começar de novo|esquecer)\b.*\b(cliente|usuário|cadastro|cpf|conversa|atendimento|dados?)\b|\b(esse não sou eu|essa pessoa não sou eu|pessoa errada)\b/i
        .test(normalizedMessage);
      const endsConversation = /^(encerrar|encerrar conversa|finalizar conversa|sair|trocar usuário|trocar cliente|esquecer cliente|reiniciar atendimento|começar de novo)$/i
        .test(normalizedMessage) || (wantsIdentityChange && !hasExplicitIdentity);
      const savedSessionResult = await supabase.from("n8n_client_sessions")
        .select("client_id, conversation_id").eq("profile_id", organizationId).eq("phone_hash", phoneHash)
        .gt("expires_at", new Date().toISOString()).maybeSingle();
      if (savedSessionResult.error) throw savedSessionResult.error;
      let savedSession = savedSessionResult.data;
      if (!savedSession) {
        const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
        const { count: recentCount, error: rateError } = await supabase.from("n8n_message_events")
          .select("id", { head: true, count: "exact" })
          .eq("profile_id", organizationId).eq("phone_hash", phoneHash)
          .eq("direction", "INBOUND").gte("created_at", oneMinuteAgo);
        if (rateError) throw rateError;
        if (Number(recentCount || 0) > 6) {
          await supabase.from("n8n_message_events").update({ status: "IGNORED" })
            .eq("profile_id", organizationId).eq("message_id", messageId);
          return json({ status: "ignored_automation" });
        }
      }
      if (requestsIdentityReset) {
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
      if (saysGoodbye && savedSession?.client_id) {
        const conversationId = crypto.randomUUID();
        const retainUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        const { error: endError } = await supabase.from("n8n_client_sessions")
          .update({ expires_at: retainUntil, updated_at: new Date().toISOString(), conversation_id: conversationId })
          .eq("profile_id", organizationId)
          .eq("phone_hash", phoneHash);
        if (endError) throw endError;
        await supabase.from("n8n_message_events").update({ status: "PROCESSED" })
          .eq("profile_id", organizationId).eq("message_id", messageId).eq("direction", "INBOUND");
        return json({
          status: "session_ended",
          conversation_id: conversationId,
          retain_until: retainUntil,
          operator_contact: operatorContact,
        });
      }

      let clients: Array<{ id: string; name: string }> = [];
      let matchedBy = "PHONE";

      if (savedSession?.client_id && !wantsIdentityChange && !hasExplicitIdentity) {
        const saved = await supabase.from("clientes").select("id, name")
          .eq("owner_id", organizationId).eq("id", savedSession.client_id).maybeSingle();
        if (saved.data) {
          clients = [saved.data];
          matchedBy = "SESSION";
        }
      }

      if (!clients.length && suppliedDigits.length === 11) {
        matchedBy = "CPF";
        const byCpf = await supabase.from("clientes").select("id, name, cpf, document").eq("owner_id", organizationId)
          .limit(500);
        if (byCpf.error) throw byCpf.error;
        clients = (byCpf.data ?? [])
          .filter((candidate) => digits(candidate.cpf || candidate.document) === suppliedDigits)
          .slice(0, 2)
          .map(({ id, name }) => ({ id, name }));
      } else if (!clients.length && suppliedCode) {
        matchedBy = "CODE";
        const byCode = await supabase.from("clientes").select("id, name").eq("owner_id", organizationId)
          .eq("client_number", suppliedCode).limit(2);
        if (byCode.error) throw byCode.error;
        clients = byCode.data ?? [];
      }

      if (!clients.length && savedSession?.client_id && !hasExplicitIdentity && wantsIdentityChange) {
        const saved = await supabase.from("clientes").select("id, name")
          .eq("owner_id", organizationId).eq("id", savedSession.client_id).maybeSingle();
        if (saved.data) clients = [saved.data];
      }

      if (!clients.length && !hasExplicitIdentity) {
        matchedBy = "PHONE";
        const byPhone = await supabase.from("clientes").select("id, name, phone")
          .eq("owner_id", organizationId).not("phone", "is", null).limit(500);
        if (byPhone.error) throw byPhone.error;
        clients = (byPhone.data ?? [])
          .filter((candidate) => samePhone(candidate.phone, phone))
          .slice(0, 2)
          .map(({ id, name }) => ({ id, name }));
      }

      if (!clients.length && !hasExplicitIdentity) {
        matchedBy = "CONTRACT_PHONE";
        const byContractPhone = await supabase.from("contratos")
          .select("client_id, debtor_name, debtor_phone")
          .or(`profile_id.eq.${organizationId},owner_id.eq.${organizationId}`)
          .eq("is_archived", false)
          .not("debtor_phone", "is", null)
          .limit(1000);
        if (byContractPhone.error) throw byContractPhone.error;

        const clientIds = [...new Set((byContractPhone.data ?? [])
          .filter((contract) => samePhone(contract.debtor_phone, phone))
          .map((contract) => contract.client_id)
          .filter(Boolean))].slice(0, 6);

        if (clientIds.length) {
          const byContractClient = await supabase.from("clientes")
            .select("id, name")
            .eq("owner_id", organizationId)
            .in("id", clientIds)
            .limit(6);
          if (byContractClient.error) throw byContractClient.error;
          clients = byContractClient.data ?? [];
        }
      }

      if (!clients.length && message && !hasExplicitIdentity) {
        if (/^[\p{L}][\p{L}\s.'-]{4,159}$/u.test(message) && message.includes(" ")) {
          matchedBy = "NAME";
          const byName = await supabase.from("clientes").select("id, name").eq("owner_id", organizationId)
            .ilike("name", message).limit(2);
          if (byName.error) throw byName.error;
          clients = byName.data ?? [];
        }
      }

      if (!clients?.length) {
        let reply = "Olá! Como posso ajudar?\n\n1️⃣ 🤝 Quero ser Cliente (Empréstimo)\n2️⃣ 🙋 Falar com Atendente";
        if (suppliedDigits === "1") {
          await supabase.from("n8n_loan_leads").insert({ profile_id: organizationId, client_id: null, phone_hash: phoneHash, full_name: null });
          await supabase.from("notificacoes").insert({ profile_id: organizationId, titulo: "Novo interesse em empréstimo", mensagem: "Novo interessado solicitou contato pelo WhatsApp.", item_type: "WHATSAPP_LEAD" });
          reply = "Ótimo! Um de nossos atendentes entrará em contato em breve para conversar sobre o empréstimo.";
        } else if (suppliedDigits === "2") {
          await supabase.from("n8n_handoffs").insert({ profile_id: organizationId, client_id: null, phone_hash: phoneHash, reason: "Contato não identificado pediu para falar com atendente." });
          await supabase.from("notificacoes").insert({ profile_id: organizationId, titulo: "Atendimento humano solicitado", mensagem: "Contato não identificado pediu para falar com atendente.", item_type: "WHATSAPP_HANDOFF" });
          reply = "Certo! Transferindo você para um atendente humano. Aguarde um instante.";
        } else if (normalizedMessage && !/^\s*$/.test(normalizedMessage)) {
          reply = "Desculpe, não entendi. Por favor, digite o NÚMERO da opção desejada:\n\n1️⃣ 🤝 Quero ser Cliente (Empréstimo)\n2️⃣ 🙋 Falar com Atendente";
        }
        return json({
          handled: true,
          reply,
          status: "not_identified",
          audience: "public",
          operator_contact: operatorContact,
        });
      }
      if (clients.length > 1) return json({ status: "ambiguous", request: "cpf_or_client_code" });

      const client = clients[0];
      const verifiedBy = ["PHONE", "CPF", "CODE", "NAME"].includes(matchedBy) ? matchedBy : "PHONE";
      const sessionResult = await supabase.from("n8n_client_sessions").upsert({
        profile_id: organizationId,
        phone_hash: phoneHash,
        client_id: client.id,
        verified_by: verifiedBy,
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

      const primaryPending = [...pending].sort((a, b) => {
        const lateDifference = Number(b.days_late || 0) - Number(a.days_late || 0);
        if (lateDifference !== 0) return lateDifference;
        return String(a.due_date || "").localeCompare(String(b.due_date || ""));
      })[0];
      const primaryContract = activeContracts.find((contract) => contract.id === primaryPending?._loan_id)
        || activeContracts[0]
        || null;
      const contractReferences = new Map(activeContracts.map((contract, index) => [contract.id, index + 1]));
      const portalContract = primaryContract?.portal_token && primaryContract.portal_shortcode
        ? primaryContract
        : activeContracts.find((contract) => contract.portal_token && contract.portal_shortcode);
      const appOrigin = (Deno.env.get("APP_ORIGIN") || "https://capflow.pages.dev").replace(/\/$/, "");
      const portalLink = portalContract
        ? `${appOrigin}/?portal=${encodeURIComponent(portalContract.portal_token)}&portal_code=${encodeURIComponent(portalContract.portal_shortcode)}`
        : null;
      let portalShortLink: string | null = null;
      if (portalLink) {
        const shortCode = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
        const shortLink = await supabase.from("n8n_short_links").insert({
          code: shortCode,
          profile_id: organizationId,
          target_url: portalLink,
        });
        portalShortLink = shortLink.error
          ? portalLink
          : portalLink;
      }

      let reply = `Olá, ${client.name.split(" ")[0]}! Como posso ajudar?\n\n1️⃣ 📄 Ver Meu Contrato\n2️⃣ 💰 Pagar Parcela (Boleto/Pix)\n3️⃣ 🙋 Falar com Atendente`;
      
      if (suppliedDigits === "1") {
        reply = `Seu contrato atual está ${primaryContract?.status === 'ACTIVE' ? 'ativo' : 'em andamento'}.\nVocê pode ver todos os detalhes acessando o portal:\n${portalShortLink || portalLink}`;
      } else if (suppliedDigits === "2") {
        reply = `Para pagar sua parcela, acesse o portal pelo link abaixo para gerar o Pix ou Boleto:\n${portalShortLink || portalLink}`;
      } else if (suppliedDigits === "3") {
        await supabase.from("n8n_handoffs").insert({ profile_id: organizationId, client_id: client.id, phone_hash: phoneHash, reason: "Cliente selecionou falar com atendente." });
        await supabase.from("notificacoes").insert({ profile_id: organizationId, titulo: "Atendimento humano solicitado", mensagem: "Cliente pediu para falar com atendente.", item_type: "WHATSAPP_HANDOFF" });
        reply = "Certo! Transferindo você para um atendente humano. Aguarde um instante.";
      } else if (normalizedMessage && !/^\s*$/.test(normalizedMessage)) {
        reply = "Desculpe, não entendi. Por favor, digite o NÚMERO da opção desejada:\n\n1️⃣ 📄 Ver Meu Contrato\n2️⃣ 💰 Pagar Parcela (Boleto/Pix)\n3️⃣ 🙋 Falar com Atendente";
      }
      await supabase.from("n8n_message_events").update({ status: "PROCESSED", client_id: client.id })
        .eq("profile_id", organizationId).eq("message_id", messageId).eq("direction", "INBOUND");
      return json({
        status: "identified",
        conversation_id: sessionResult.data.conversation_id,
        client: { display_name: client.name },
        current_contract: primaryContract ? {
          reference: contractReferences.get(primaryContract.id),
          status: primaryContract.status,
          principal: Number(primaryContract.principal || 0),
          principal_display: moneyBr(primaryContract.principal),
          total_to_receive: Number(primaryContract.total_to_receive || 0),
          total_to_receive_display: moneyBr(primaryContract.total_to_receive),
          start_date: primaryContract.start_date,
        } : null,
        contracts: activeContracts.map(({ id, status, principal, total_to_receive, start_date }, index) => ({
          reference: index + 1,
          status,
          principal: Number(principal || 0),
          principal_display: moneyBr(principal),
          total_to_receive: Number(total_to_receive || 0),
          total_to_receive_display: moneyBr(total_to_receive),
          start_date,
          has_pending_installment: pending.some((item) => item._loan_id === id),
        })),
        pending: pending.map(({ _installment_id, _loan_id, ...safe }) => ({
          ...safe,
          contract_reference: contractReferences.get(_loan_id),
          principal_due_display: moneyBr(safe.principal_due),
          interest_due_display: moneyBr(safe.interest_due),
          late_fee_due_display: moneyBr(safe.late_fee_due),
          total_due_display: moneyBr(safe.total_due),
        })),
        portal_link: portalShortLink || portalLink,
        portal_original_link: portalLink,
        handled: true,
        reply,
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
