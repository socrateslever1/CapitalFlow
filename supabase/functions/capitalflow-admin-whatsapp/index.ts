import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.7";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const closed = ["PAID", "PAGO", "QUITADO", "QUITADA", "FINALIZADO", "CLOSED", "ENCERRADO", "CANCELADO", "RENEGOCIADO"];
const paid = ["PAID", "PAGO", "QUITADO", "QUITADA", "FINALIZADO", "CLOSED", "ENCERRADO", "CANCELADO"];
const money = (value: unknown) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
const dateBr = (value: unknown) => String(value || "").slice(0, 10).split("-").reverse().join("/");
const normalize = (value: unknown) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

const parseNumber = (value: string) => {
  const clean = value.replace(/\s/g, "");
  if (clean.includes(",")) return Number(clean.replace(/\./g, "").replace(",", "."));
  if (/^\d{1,3}(\.\d{3})+$/.test(clean)) return Number(clean.replace(/\./g, ""));
  return Number(clean);
};

function parseContractRequest(raw: string) {
  const message = String(raw || "").trim().replace(/\s+/g, " ");
  let match = message.match(/^(.+?)\s+(?:emprestou|pegou|tomou)\s+(?:r\$\s*)?([\d.,]+)\s+(?:para|por)\s+(\d+)\s+dias?\.?$/i);
  if (match) return { name: match[1].trim(), principal: parseNumber(match[2]), days: Number(match[3]) };
  match = message.match(/^emprestei\s+(?:r\$\s*)?([\d.,]+)\s+(?:para|a)\s+(.+?)\s+(?:por|para)\s+(\d+)\s+dias?\.?$/i);
  if (match) return { name: match[2].trim(), principal: parseNumber(match[1]), days: Number(match[3]) };
  match = message.match(/^(?:cadastre|registre|crie)(?:\s+(?:um|o))?(?:\s+(?:contrato|empr[eé]stimo))?(?:\s+de)?\s+(?:r\$\s*)?([\d.,]+)\s*(?:real|reais)?(?:\s+de\s+empr[eé]stimo)?\s+(?:para|a)\s+(?:o|a)?\s*(.+?)(?:,\s*[\s\S]*?|\s+(?:por|para)\s+)(\d+)\s+dias?/i);
  if (match) return { name: match[2].trim(), principal: parseNumber(match[1]), days: Number(match[3]) };
  return null;
}

function parsePaymentRequest(raw: string) {
  const message = String(raw || "").trim().replace(/\s+/g, " ");
  const patterns = [
    /^(?:recebi|recebemos)\s+(?:um\s+)?(?:pagamento\s+de\s+)?(?:r\$\s*)?([\d.,]+)\s*(?:real|reais)?\s+(?:de|da|do)\s+(.+?)[.!]?$/i,
    /^(?:registre|lance|cadastre|confirme|d[eê]\s+baixa\s+em)\s+(?:o\s+)?pagamento\s+(?:de\s+)?(?:r\$\s*)?([\d.,]+)\s*(?:real|reais)?\s+(?:para|de|da|do)\s+(.+?)[.!]?$/i,
    /^(?:marque|baixe)\s+(?:a\s+)?(?:parcela|d[ií]vida|conta)\s+(?:de|da|do)\s+(.+?)\s+(?:como\s+)?paga\s+(?:em|por)\s+(?:r\$\s*)?([\d.,]+)[.!]?$/i,
  ];
  for (let index = 0; index < patterns.length; index++) {
    const match = message.match(patterns[index]);
    if (!match) continue;
    return index === 2
      ? { name: match[1].trim(), amount: parseNumber(match[2]) }
      : { name: match[2].trim(), amount: parseNumber(match[1]) };
  }
  return null;
}

function parseCustomMessage(raw: string) {
  const message = String(raw || "").trim().replace(/\s+/g, " ");
  const match = message.match(/^(?:mande|envie|diga|avise|lembre)(?:\s+(?:um|uma))?(?:\s+(?:recado|mensagem|aviso|lembrete))?(?:\s+para)?\s+(.+?)\s+(?:que|:|—|-)\s*(.+)$/i);
  if (!match) return null;
  return { name: match[1].trim(), message: match[2].trim() };
}

function parseClientRegistrationRequest(raw: string) {
  const match = String(raw || "").trim().match(/^(?:cadastre|registre|crie|adicione)(?:\s+(?:um|o))?\s+cliente\s+(.+?)[.!]?$/i);
  return match ? { name: match[1].trim() } : null;
}

function parseClientDetails(raw: string) {
  const document = digits(raw.match(/(?:cpf|documento)\s*[:=-]?\s*([\d.\/-]{11,18})/i)?.[1]);
  const phone = digits(raw.match(/(?:whatsapp|telefone|fone|celular)\s*[:=-]?\s*(\+?[\d\s()\-]{10,22})/i)?.[1]);
  return { document, phone };
}

async function sha256(value: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hasPermission(admin: any, permission: string) {
  return admin.role === "OWNER" || admin.role === "ADMIN" || (admin.permissions || []).includes(permission);
}

async function findClient(adminDb: any, profileId: string, query: string) {
  const cleaned = query.replace(/^(a|o|da|do|de|para|cliente|a cliente|o cliente)\s+/i, "").replace(/[?.!,]+$/g, "").trim();
  if (cleaned.length < 2) return { error: "Diga o nome ou código do cliente." };
  const { data, error } = await adminDb.from("clientes").select("id,name,phone,client_number")
    .eq("owner_id", profileId).or(`name.ilike.%${cleaned.replace(/[%_,()]/g, "")}%,client_number.eq.${cleaned}`).limit(6);
  if (error) throw error;
  if (!data?.length) return { error: `Não encontrei cliente com “${cleaned}”.` };
  if (data.length > 1) return { error: `Encontrei mais de um: ${data.map((item: any) => item.name).join(", ")}. Diga o nome completo.` };
  return { client: data[0] };
}

async function loadClientPosition(adminDb: any, profileId: string, client: any) {
  const { data: contracts, error } = await adminDb.from("contratos")
    .select("id,status,principal,total_to_receive,start_date,debtor_phone,portal_token,portal_shortcode,source_id")
    .eq("client_id", client.id).or(`profile_id.eq.${profileId},owner_id.eq.${profileId}`).eq("is_archived", false);
  if (error) throw error;
  const active = (contracts || []).filter((item: any) => !closed.includes(String(item.status || "").toUpperCase()));
  const ids = active.map((item: any) => item.id);
  let positions: any[] = [];
  if (ids.length) {
    const { data: installments, error: installmentError } = await adminDb.from("parcelas")
      .select("id,loan_id,due_date,data_vencimento,numero_parcela,status").eq("profile_id", profileId).in("loan_id", ids)
      .not("status", "in", `(${paid.map((status) => `"${status}"`).join(",")})`).order("due_date").limit(100);
    if (installmentError) throw installmentError;
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Manaus" });
    for (const installment of installments || []) {
      const calculated = await adminDb.rpc("prepare_installment_for_online_payment", {
        p_loan_id: installment.loan_id, p_installment_id: installment.id, p_reference_date: today,
      });
      if (calculated.error) throw calculated.error;
      const due = Array.isArray(calculated.data) ? calculated.data[0] : calculated.data;
      if (Number(due?.total_due || 0) <= 0.05) continue;
      positions.push({ ...installment, due_date_effective: installment.data_vencimento || installment.due_date, ...due });
    }
  }
  positions.sort((a, b) => Number(b.days_late || 0) - Number(a.days_late || 0) || String(a.due_date_effective).localeCompare(String(b.due_date_effective)));
  const installment = positions[0] || null;
  const contract = active.find((item: any) => item.id === installment?.loan_id) || active[0] || null;
  const appOrigin = (Deno.env.get("APP_ORIGIN") || "https://capflow.pages.dev").replace(/\/$/, "");
  const portal = contract?.portal_token && contract?.portal_shortcode
    ? `${appOrigin}/?portal=${encodeURIComponent(contract.portal_token)}&portal_code=${encodeURIComponent(contract.portal_shortcode)}` : null;
  return { active, contract, installment, positions, portal };
}

function targetFrom(message: string, intent: string) {
  const patterns: Record<string, RegExp> = {
    charge: /^(?:cobre|cobrar|mande (?:uma )?cobranca|envie (?:uma )?cobranca)(?: para)?\s+(.+?)(?:\s+(?:de forma |mais )?(?:cordial|suave|objetiva|direta|mediadora|firme|incisiva))?$|^(?:envia|envie|mande)\s+(?:uma\s+)?mensagem\s+para\s+(.+?)(?:\s+(?:cobrando|sobre|do contrato|a parcela|o contrato).*)?$/i,
    portal: /^(?:mande|envie|mostrar|mostre)?\s*(?:o )?(?:link do )?portal(?: para| da| do)?\s+(.+)$/i,
    due: /^(?:quando vence|qual (?:e )?o vencimento)(?: o contrato| a parcela)?(?: da| do| de)?\s+(.+)$/i,
    amount: /^(?:quanto|qual (?:e )?o valor|valor|saldo)(?: a| o)?\s*(.+?)(?:\s+(?:deve|esta devendo|do contrato|da parcela))?$/i,
    debt: /^(?:(?:liste|listar|mostre|mostrar|detalhe|detalhes|consulte|consultar)\s+)?(?:a\s+)?(?:divida|debitos?|parcelas? abertas?|saldo devedor)(?:\s+(?:da|do|de|para))?\s+(.+)$/i,
    status: /^(?:(?:me\s+)?(?:mostre|mostra|mostrar)|quero\s+(?:ver|consultar)|consulte|ver)?\s*(?:o\s+)?(?:contrato|situacao|status)(?:\s+ativo)?(?:\s+da|\s+do|\s+de)?\s+(.+)$/i,
    automation: /^(?:ative|ativar|pause|pausar|desative|desativar)(?: a)? cobranca(?: automatica)?(?: diaria| semanal)?(?: para| da| do)?\s+(.+)$/i,
  };
if (intent === "charge" && /^(?:envia|envie|mande)\s+(?:uma\s+)?mensagem\s+para\s+/i.test(message)) {
    return message
      .replace(/^(?:envia|envie|mande)\s+(?:uma\s+)?mensagem\s+para\s+/i, "")
      .replace(/\s+(?:cobrando|sobre|do contrato|a parcela|o contrato)[\s\S]*$/i, "")
      .trim();
  }
  const rawTarget = (match?.[1] || match?.[2] || "").trim();
  if (intent === "debt") {
    const natural = message.match(/^(?:quanto|o que)\s+(.+?)\s+(?:ainda\s+)?deve[?.!]*$/i);
    return (natural?.[1] || rawTarget).replace(/^(?:a|o|da|do|de|para|cliente)\s+/i, "").trim();
  }
  if (intent !== "charge") return rawTarget;
  // Permite comandos naturais: “cobre a Maria”, “cobre o contrato vencido da Maria”.
  return rawTarget
    .replace(/^(?:o|a)\s+(?:cliente\s+)?/i, "")
    .replace(/^(?:contrato|parcela)\s+(?:vencido|vencida|em atraso|atrasado|atrasada)?\s*(?:do|da|de)\s+/i, "")
    .trim();
}

function detectIntent(raw: string) {
  const message = normalize(raw);
  if (/^(oi|ola|bom dia|boa tarde|boa noite|fala|e ai)$/.test(message)) return "greeting";
  if (/^(ajuda|comandos|menu|o que voce faz)$/.test(message)) return "help";
  if (/^(confirmar|confirma|sim)(\s+\d{4})?$/.test(message) || /^\d{4}$/.test(message)) return "confirm";
  if (/^(cancelar|cancela|nao)$/.test(message)) return "cancel";
  if (/\b(resumo|carteira|painel)\b/.test(message)) return "portfolio";
  if (/\b(vence hoje|vencem hoje|vencimentos de hoje|quem vence hoje)\b/.test(message)) return "due_today";
  if (/^(cobre|cobrar)\s+(todos|todas|[0-9, e]+)$/.test(message)) return "charge_selection";
  if (/\b(atrasados|inadimplentes|vencidos)\b/.test(message) && !/cobr/.test(message)) return "overdue";
  if (/\b(divida|debitos?|parcelas? abertas?|saldo devedor)\b/.test(message) || /^(?:quanto|o que)\s+.+\s+(?:ainda\s+)?deve\b/.test(message)) return "debt";
  if (/\b(ultimas cobrancas|fila de cobranca|mensagens enviadas|falhas de envio)\b/.test(message)) return "dispatches";
  // A cobrança é uma intenção explícita mesmo sem as palavras “vencido” ou
  // “contrato”: “cobre a Maria” já deve abrir a prévia da cobrança.
  if (/^(?:cobre|cobrar|mande|envie|envia|lembre|avise)\b/.test(message) &&
      /\b(?:cobranca|mensagem|lembrete|aviso|cliente|contrato|parcela|vencid|atrasad|para|da|do|de)\b/.test(message)) return "charge";
  if (/portal/.test(message)) return "portal";
  if (/^(ative|ativar|pause|pausar|desative|desativar).*cobranca/.test(message)) return "automation";
  if (/^(quando vence|qual .*vencimento)/.test(message)) return "due";
  if (/\b(?:saldo|limite|disponivel|disponibilidade)\b[\s\S]*\b(?:carteiras?|fontes?)\b|\b(?:carteiras?|fontes?)\b[\s\S]*\b(?:saldo|limite|disponivel|disponibilidade)\b/.test(message)) return "wallet";
  if (/^(quanto|qual .*valor|valor|saldo)/.test(message)) return "amount";
  if (/\b(contrato|situacao|status)\b/.test(message) && /^(?:(?:me )?(?:mostre|mostra|mostrar)|quero (?:ver|consultar)|consulte|ver|como esta|situacao|status|contrato)/.test(message)) return "status";  if (/\b(quem pagou|pagamentos recebidos|pagamentos de hoje|recebimentos de hoje)\b/.test(message)) return "payments_today";
  if (/\b(quem pediu|solicitacoes? de atendimento|atendimento humano|handoffs?)\b/.test(message)) return "handoffs";
  if (/\b(resumo de hoje|o que aconteceu hoje|atividades de hoje)\b/.test(message)) return "daily_summary";
  if (/\b(status do sistema|status das integracoes|integracoes|n8n|whatsapp esta funcionando|whatsapp conectado|automacoes falharam)\b/.test(message)) return "system_status";  if (/\b(todos os contratos|contratos ativos|listar contratos|liste contratos)\b/.test(message)) return "contracts";
  if (/\b(todos os clientes|listar clientes|liste clientes|clientes cadastrados)\b/.test(message)) return "clients";
  return "unknown";
}

async function prepareContractDraft(adminDb: any, profileId: string, admin: any, request: any, details: any = {}) {
  if (!Number.isFinite(request.principal) || request.principal <= 0 || request.principal > 100000000) return "Informe um valor válido para o empréstimo.";
  if (!Number.isInteger(request.days) || request.days < 1 || request.days > 3660) return "Informe um prazo válido entre 1 e 3660 dias.";

  const cleanedName = String(request.name || "").replace(/^(a|o|para)\s+/i, "").trim();
  const safeName = cleanedName.replace(/[%_,()]/g, "");
  const { data: clients, error: clientError } = await adminDb.from("clientes")
    .select("id,name,phone,document").eq("owner_id", profileId).ilike("name", `%${safeName}%`).limit(6);
  if (clientError) throw clientError;
  if ((clients || []).length > 1) return `Encontrei mais de um cliente: ${clients.map((item: any) => item.name).join(", ")}. Envie o nome completo.`;

  const client = clients?.[0] || null;
  const phone = digits(details.phone || client?.phone);
  const document = digits(details.document || client?.document);
  if (!client && (phone.length < 10 || ![11, 14].includes(document.length))) {
    await adminDb.from("whatsapp_admin_commands").update({ status: "EXPIRED" })
      .eq("profile_id", profileId).eq("admin_user_id", admin.id).eq("intent", "CONTRACT_DRAFT").eq("status", "PENDING");
    const { error } = await adminDb.from("whatsapp_admin_commands").insert({
      profile_id: profileId, admin_user_id: admin.id, intent: "CONTRACT_DRAFT",
      payload: { request: { ...request, name: cleanedName }, phone: phone || null, document: document || null },
      confirmation_code: null, expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    });
    if (error) throw error;
    return `Não encontrei ${cleanedName} como cliente. Para criar o cadastro, envie em uma mensagem:\nCPF: 000.000.000-00 | WhatsApp: 5592999999999`;
  }

  const [{ data: profile, error: profileError }, { data: sources, error: sourceError }] = await Promise.all([
    adminDb.from("perfis").select("default_interest_rate,default_fine_percent,default_daily_interest_percent").eq("id", profileId).single(),
    adminDb.from("fontes").select("id,name,type,balance").eq("profile_id", profileId).gte("balance", request.principal).order("balance", { ascending: false }),
  ]);
  if (profileError) throw profileError;
  if (sourceError) throw sourceError;
  if (!sources?.length) return `Não há fonte de capital com saldo suficiente para liberar ${money(request.principal)}.`;
  const source = sources.find((item: any) => normalize(item.name) === "carteira principal") || sources[0];
  const interestRate = Number(profile.default_interest_rate || 0);
  const finePercent = Number(profile.default_fine_percent || 0);
  const dailyInterestPercent = Number(profile.default_daily_interest_percent || 0);
  const total = Math.round(request.principal * (1 + interestRate / 100) * 100) / 100;
  const start = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Manaus" }));
  const due = new Date(start); due.setDate(due.getDate() + request.days);
  const dueDate = due.toLocaleDateString("en-CA", { timeZone: "America/Manaus" });
  const payload = {
    client: client || { id: null, name: cleanedName, phone, document },
    principal: request.principal, days: request.days, due_date: dueDate,
    source, interest_rate: interestRate, fine_percent: finePercent,
    daily_interest_percent: dailyInterestPercent, total,
  };
  return await createPending(adminDb, profileId, admin, "CREATE_CONTRACT", payload,
    `Criar contrato para ${payload.client.name}?\nPrincipal: ${money(request.principal)}\nPrazo: ${request.days} dias — vence em ${dateBr(dueDate)}\nJuros do período: ${interestRate}% — total ${money(total)}\nFonte: ${source.name} (saldo ${money(source.balance)})`);
}

async function preparePaymentDraft(adminDb: any, profileId: string, admin: any, request: any) {
  if (!Number.isFinite(request.amount) || request.amount <= 0) return "Informe um valor de pagamento válido.";
  const found = await findClient(adminDb, profileId, request.name);
  if (found.error) return found.error;
  const position = await loadClientPosition(adminDb, profileId, found.client);
  if (!position.contract || !position.installment) return `${found.client.name} não possui parcela pendente para receber.`;
  const currentDue = Number(position.installment.total_due || 0);
  if (request.amount > currentDue + 0.005) {
    return `O valor informado, ${money(request.amount)}, supera o saldo atualizado de ${money(currentDue)}. Revise antes de registrar.`;
  }
  const remainingAfter = Math.max(0, Math.round((currentDue - request.amount) * 100) / 100);
  return await createPending(adminDb, profileId, admin, "RECORD_PAYMENT", {
    client: found.client,
    loan_id: position.contract.id,
    installment_id: position.installment.id,
    source_id: position.contract.source_id,
    amount: request.amount,
    current_due: currentDue,
  }, `Registrar pagamento de ${money(request.amount)} para ${found.client.name}?\nSaldo atual: ${money(currentDue)}\nApós o pagamento: ${money(remainingAfter)}${remainingAfter <= 0.05 ? " — parcela será baixada" : " — pagamento parcial"}`);
}

async function startClientRegistration(adminDb: any, profileId: string, admin: any, name: string, afterAction: any = null) {
  const safeName = String(name || "").trim();
  if (safeName.length < 2) return "Informe o nome completo do novo cliente.";
  const existing = await findClient(adminDb, profileId, safeName);
  if (existing.client) return `${existing.client.name} já está cadastrado.`;
  if (existing.error?.startsWith("Encontrei mais de um")) return existing.error;
  await adminDb.from("whatsapp_admin_commands").update({ status: "EXPIRED" })
    .eq("profile_id", profileId).eq("admin_user_id", admin.id).eq("intent", "CLIENT_REGISTRATION_DRAFT").eq("status", "PENDING");
  const { error } = await adminDb.from("whatsapp_admin_commands").insert({
    profile_id: profileId, admin_user_id: admin.id, intent: "CLIENT_REGISTRATION_DRAFT",
    payload: { name: safeName, after_action: afterAction }, confirmation_code: null,
    expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  });
  if (error) throw error;
  return `Para cadastrar ${safeName}, envie em uma mensagem:\nCPF: 000.000.000-00 | WhatsApp: 5592999999999`;
}

async function createPending(adminDb: any, profileId: string, admin: any, intent: string, payload: any, description: string) {
  await adminDb.from("whatsapp_admin_commands").update({ status: "EXPIRED" })
    .eq("profile_id", profileId).eq("admin_user_id", admin.id).eq("status", "PENDING").lt("expires_at", new Date().toISOString());
  const code = String(crypto.getRandomValues(new Uint16Array(1))[0] % 10000).padStart(4, "0");
  const { error } = await adminDb.from("whatsapp_admin_commands").insert({
    profile_id: profileId, admin_user_id: admin.id, intent, payload, confirmation_code: code,
  });
  if (error) throw error;
  return `${description}\nResponda CONFIRMAR ${code} em até 5 minutos, ou CANCELAR.`;
}

async function executePending(adminDb: any, profileId: string, admin: any, rawMessage: string) {
  const code = rawMessage.match(/\d{4}/)?.[0];
  let query = adminDb.from("whatsapp_admin_commands").select("*").eq("profile_id", profileId)
    .eq("admin_user_id", admin.id).eq("status", "PENDING").gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(1);
  if (code) query = query.eq("confirmation_code", code);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) return "Não encontrei comando pendente válido. Envie o comando novamente.";
  const payload = data.payload || {};
  let result: any = {};
  if (data.intent === "CREATE_CLIENT") {
    if (!hasPermission(admin, "CONTRACT_CREATE")) throw new Error("Seu número não possui permissão para cadastrar clientes.");
    const phone = digits(payload.phone);
    const document = digits(payload.document);
    let { data: client } = await adminDb.from("clientes").select("id,name,phone")
      .eq("owner_id", profileId).or(`document.eq.${document},phone.eq.${phone}`).limit(1).maybeSingle();
    if (!client) {
      const inserted = await adminDb.from("clientes").insert({
        owner_id: profileId, name: payload.name, phone, document,
        cpf: document.length === 11 ? document : null,
        access_code: String(crypto.getRandomValues(new Uint16Array(1))[0] % 10000).padStart(4, "0"),
        client_number: String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000)),
        notes: "Cliente criado e confirmado pelo administrador via WhatsApp",
      }).select("id,name,phone").single();
      if (inserted.error) throw inserted.error;
      client = inserted.data;
    }
    let queueId = null;
    if (payload.after_action?.type === "CUSTOM_MESSAGE" && payload.after_action.message) {
      const queued = await adminDb.from("whatsapp_queue").insert({
        profile_id: profileId, phone, message: String(payload.after_action.message).slice(0, 1200), status: "PENDING",
      }).select("id").single();
      if (queued.error) throw queued.error;
      queueId = queued.data.id;
    }
    result = { client_id: client.id, client: client.name, queue_id: queueId };
  } else if (data.intent === "RECORD_PAYMENT") {
    if (!hasPermission(admin, "PAYMENT")) throw new Error("Seu número não possui permissão para registrar pagamentos.");
    const position = await loadClientPosition(adminDb, profileId, payload.client);
    if (!position.contract || !position.installment || position.installment.id !== payload.installment_id) {
      throw new Error("A parcela mudou desde a prévia. Envie o comando novamente.");
    }
    const amount = Number(payload.amount || 0);
    const totalDue = Number(position.installment.total_due || 0);
    if (amount <= 0 || amount > totalDue + 0.005) throw new Error("Valor incompatível com o saldo atual.");
    let remaining = amount;
    const lateFeePaid = Math.min(remaining, Number(position.installment.late_fee_due || 0));
    remaining -= lateFeePaid;
    const interestPaid = Math.min(remaining, Number(position.installment.interest_due || 0));
    remaining -= interestPaid;
    const principalPaid = Math.min(remaining, Number(position.installment.principal_due || 0));
    const { data: profitSources, error: profitSourceError } = await adminDb.from("fontes")
      .select("id,name").eq("profile_id", profileId).limit(100);
    if (profitSourceError) throw profitSourceError;
    const caixaLivre = (profitSources || []).find((item: any) => /caixa livre|lucro|disponivel/.test(normalize(item.name)));
    const { error: paymentError } = await adminDb.rpc("process_payment_v3_selective", {
      p_idempotency_key: data.id,
      p_loan_id: position.contract.id,
      p_installment_id: position.installment.id,
      p_profile_id: profileId,
      p_operator_id: admin.user_id || profileId,
      p_principal_paid: principalPaid,
      p_interest_paid: interestPaid,
      p_late_fee_paid: lateFeePaid,
      p_late_fee_forgiven: 0,
      p_interest_forgiven: 0,
      p_payment_date: new Date().toLocaleDateString("en-CA", { timeZone: "America/Manaus" }),
      p_capitalize_remaining: false,
      p_source_id: position.contract.source_id,
      p_caixa_livre_id: caixaLivre?.id || null,
    });
    if (paymentError) throw paymentError;
    result = { amount, client: payload.client.name, settled: totalDue - amount <= 0.05 };
  } else if (data.intent === "CUSTOM_MESSAGE") {
    if (!hasPermission(admin, "MESSAGE")) throw new Error("Seu número não possui permissão para enviar mensagens.");
    const phone = digits(payload.client?.phone);
    if (phone.length < 10) throw new Error("Cliente sem WhatsApp válido.");
    const { data: queued, error: queueError } = await adminDb.from("whatsapp_queue").insert({
      profile_id: profileId, phone, message: String(payload.message || "").slice(0, 1200), status: "PENDING",
    }).select("id").single();
    if (queueError) throw queueError;
    result = { queue_id: queued.id, client: payload.client.name };
  } else if (data.intent === "CREATE_CONTRACT") {
    if (!hasPermission(admin, "CONTRACT_CREATE")) throw new Error("Seu número não possui permissão para criar contratos.");
    const { data: created, error: createError } = await adminDb.rpc("whatsapp_admin_create_monthly_contract", {
      p_profile_id: profileId,
      p_admin_user_id: admin.id,
      p_client_id: payload.client?.id || null,
      p_client_name: payload.client?.name,
      p_client_phone: payload.client?.phone || null,
      p_client_document: payload.client?.document || null,
      p_principal: payload.principal,
      p_days: payload.days,
      p_source_id: payload.source?.id,
      p_interest_rate: payload.interest_rate,
      p_fine_percent: payload.fine_percent,
      p_daily_interest_percent: payload.daily_interest_percent,
      p_idempotency_key: `whatsapp-admin:${data.id}`,
    });
    if (createError) throw createError;
    result = created;
  } else if (data.intent === "CHARGE" || data.intent === "PORTAL_SEND") {
    const position = await loadClientPosition(adminDb, profileId, payload.client);
    if (!position.contract) throw new Error("Contrato ativo não encontrado.");
    const phone = digits(payload.client.phone || position.contract.debtor_phone);
    if (phone.length < 10) throw new Error("Cliente sem WhatsApp válido.");
    let message: string;
    if (data.intent === "PORTAL_SEND") {
      if (!position.portal) throw new Error("Portal não disponível para este contrato.");
      message = `Olá, ${String(payload.client.name).split(/\s+/)[0]}. Você pode acessar seu contrato e documentos pelo portal: ${position.portal}`;
    } else {
      if (!position.installment) throw new Error("Não há parcela pendente para cobrar.");
      const tone = String(payload.tone || "OBJECTIVE");
      const late = Number(position.installment.days_late || 0);
      const opening = tone === "FIRM_RESPECTFUL" ? "Precisamos do seu retorno para regularização." : tone === "MEDIATOR" ? "Queremos conversar para encontrar a melhor forma de regularizar." : "Passando para lembrar desta pendência.";
      message = `Olá, ${String(payload.client.name).split(/\s+/)[0]}. ${opening} A parcela vencida em ${dateBr(position.installment.due_date_effective)} está atualizada em ${money(position.installment.total_due)}${late > 0 ? ` e tem ${late} dia${late === 1 ? "" : "s"} de atraso` : ""}.${position.portal ? ` Consulte ou pague pelo portal: ${position.portal}` : ""}`;
    }
    const { data: queued, error: queueError } = await adminDb.from("whatsapp_queue").insert({
      profile_id: profileId, phone, message, status: "PENDING", loan_id: position.contract.id,
      parcela_id: position.installment?.id || null,
    }).select("id").single();
    if (queueError) throw queueError;
    result = { queue_id: queued.id, client: payload.client.name };
  } else if (data.intent === "BATCH_CHARGE") {
    const queued: any[] = [];
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Manaus" });
    for (const item of payload.items || []) {
      const { data: contract } = await adminDb.from("contratos").select("id,debtor_phone,portal_token,portal_shortcode").eq("id", item.loan_id).maybeSingle();
      if (!contract) continue;
      const calculated = await adminDb.rpc("prepare_installment_for_online_payment", { p_loan_id: item.loan_id, p_installment_id: item.installment_id, p_reference_date: today });
      if (calculated.error) throw calculated.error;
      const due = Array.isArray(calculated.data) ? calculated.data[0] : calculated.data;
      if (Number(due?.total_due || 0) <= 0.05) continue;
      const phone = digits(item.phone || contract.debtor_phone);
      if (phone.length < 10) continue;
      const appOrigin = (Deno.env.get("APP_ORIGIN") || "https://capflow.pages.dev").replace(/\/$/, "");
      const portal = contract.portal_token && contract.portal_shortcode ? `${appOrigin}/?portal=${encodeURIComponent(contract.portal_token)}&portal_code=${encodeURIComponent(contract.portal_shortcode)}` : null;
      const message = `Olá, ${String(item.name).split(/\s+/)[0]}. Passando para lembrar que sua parcela de ${money(due.total_due)} vence hoje, ${dateBr(item.due_date)}.${portal ? ` Você pode consultar ou pagar pelo portal: ${portal}` : ""}`;
      const inserted = await adminDb.from("whatsapp_queue").insert({ profile_id: profileId, phone, message, status: "PENDING", loan_id: item.loan_id, parcela_id: item.installment_id }).select("id").single();
      if (inserted.error) throw inserted.error;
      queued.push({ queue_id: inserted.data.id, client: item.name });
    }
    result = { queued };
  } else if (data.intent === "AUTOMATION") {
    const position = await loadClientPosition(adminDb, profileId, payload.client);
    if (!position.contract) throw new Error("Contrato ativo não encontrado.");
    const policy = {
      profile_id: profileId, loan_id: position.contract.id,
      enabled: payload.enabled, paused: !payload.enabled,
      overdue_cadence: payload.cadence || "MANUAL", tone: payload.tone || "OBJECTIVE",
      pause_reason: payload.enabled ? null : "Pausado pelo administrador via WhatsApp",
      updated_at: new Date().toISOString(),
    };
    const { error: policyError } = await adminDb.from("n8n_collection_policies").upsert(policy, { onConflict: "profile_id,loan_id" });
    if (policyError) throw policyError;
    result = { client: payload.client.name, ...policy };
  }
  await adminDb.from("whatsapp_admin_commands").update({ status: "EXECUTED", confirmed_at: new Date().toISOString(), executed_at: new Date().toISOString(), result }).eq("id", data.id);
  if (data.intent === "CREATE_CLIENT") return `${result.client} foi cadastrado com sucesso.${result.queue_id ? " O recado foi adicionado à fila de envio." : ""}`;
  if (data.intent === "RECORD_PAYMENT") return `Pagamento de ${money(result.amount)} registrado para ${result.client}.${result.settled ? " Parcela baixada; o contrato também será baixado se não houver outra parcela aberta." : " O saldo restante permanece em aberto."} O cliente receberá o comprovante automaticamente.`;
  if (data.intent === "CUSTOM_MESSAGE") return `Mensagem adicionada à fila para ${result.client}.`;
  if (data.intent === "CREATE_CONTRACT") return `Contrato criado para ${payload.client.name}: ${money(result.principal)} liberados, total de ${money(result.total)}, vencimento ${dateBr(result.due_date)}. Código ${String(result.contract_id).slice(0, 8)}.`;
  if (data.intent === "CHARGE") return `Cobrança adicionada à fila para ${payload.client.name}.`;
  if (data.intent === "PORTAL_SEND") return `Link do portal adicionado à fila para ${payload.client.name}.`;
  if (data.intent === "BATCH_CHARGE") return `${result.queued.length} cobrança${result.queued.length === 1 ? " adicionada" : "s adicionadas"} à fila.`;
  return `Automação de ${payload.client.name} atualizada.`;
}

async function operatorQuery(adminDb: any, profileId: string, intent: string) {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  if (intent === "payments_today") {
    const { data, error } = await adminDb.from("payment_intents").select("amount,method,status,created_at").eq("profile_id", profileId).eq("status", "APPROVED").gte("created_at", since.toISOString()).order("created_at", { ascending: false }).limit(100);
    if (error) throw error;
    const total = (data || []).reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0);
    const lines = (data || []).slice(0, 20).map((item: any, index: number) => `${index + 1}. ${money(item.amount)} — ${item.method || "InfinitePay"} — ${new Date(item.created_at).toLocaleTimeString("pt-BR", { timeZone: "America/Manaus" })}`).join("\n");
    return `💰 *Pagamentos recebidos hoje*\n\n• Registros: *${data?.length || 0}*\n• Total: *${money(total)}*\n\n${lines || "Nenhum pagamento confirmado hoje."}`;
  }
  if (intent === "handoffs") {
    const { data, error } = await adminDb.from("n8n_handoffs").select("client_id,reason,status,created_at").eq("profile_id", profileId).in("status", ["OPEN", "IN_PROGRESS"]).order("created_at", { ascending: false }).limit(50);
    if (error) throw error;
    const ids = [...new Set((data || []).map((item: any) => item.client_id).filter(Boolean))];
    const { data: clients } = ids.length ? await adminDb.from("clientes").select("id,name").in("id", ids) : { data: [] };
    const names = new Map((clients || []).map((item: any) => [item.id, item.name]));
    const lines = (data || []).map((item: any, index: number) => `${index + 1}. 👤 *${names.get(item.client_id) || "Contato não identificado"}* — ${item.reason}`).join("\n");
    return `🤝 *Solicitações de atendimento*\n\n${lines || "Nenhuma solicitação pendente."}\n\nTotal pendente: *${data?.length || 0}*`;
  }
  if (intent === "system_status") {
    const [{ data: integration }, { data: queue }] = await Promise.all([
      adminDb.from("n8n_automation_integrations").select("session_name,active,updated_at").eq("profile_id", profileId).maybeSingle(),
      adminDb.from("whatsapp_queue").select("status,error_message").eq("profile_id", profileId).order("created_at", { ascending: false }).limit(100),
    ]);
    const counts = (queue || []).reduce((acc: any, item: any) => ({ ...acc, [item.status]: (acc[item.status] || 0) + 1 }), {});
    return `📊 *Status do CapitalFlow*\n\n📲 WhatsApp: *${integration?.active ? "configurado" : "inativo"}*\n⚙️ n8n: *workflow ativo no container*\n📤 Fila: ${counts.PENDING || 0} pendentes, ${counts.SENT || 0} enviados, ${counts.ERROR || 0} com erro\n🕒 Última atualização: ${integration?.updated_at ? new Date(integration.updated_at).toLocaleString("pt-BR", { timeZone: "America/Manaus" }) : "não disponível"}`;
  }
  if (intent === "clients") {
    const { data, error } = await adminDb.from("clientes").select("name,client_number,created_at").eq("owner_id", profileId).order("created_at", { ascending: false }).limit(50);
    if (error) throw error;
    const lines = (data || []).slice(0, 30).map((item: any, index: number) => `${index + 1}. 👤 *${item.name}* — código ${item.client_number || "—"}`).join("\n");
    return `👤 *Clientes cadastrados*\n\n• Total exibido: *${data?.length || 0}*\n\n${lines || "Nenhum cliente encontrado."}`;
  }
  if (intent === "contracts") {
    const { data, error } = await adminDb.from("contratos").select("status,principal,total_to_receive,debtor_name,start_date").or(`profile_id.eq.${profileId},owner_id.eq.${profileId}`).eq("is_archived", false).order("start_date", { ascending: false }).limit(50);
    if (error) throw error;
    const active = (data || []).filter((item: any) => !closed.includes(String(item.status || "").toUpperCase()));
    const total = active.reduce((sum: number, item: any) => sum + Number(item.total_to_receive || 0), 0);
    const lines = active.slice(0, 20).map((item: any, index: number) => `${index + 1}. 👤 ${item.debtor_name || "Cliente"} — ${money(item.total_to_receive)} — ${item.status}`).join("\n");
    return `📄 *Contratos ativos*\n\n• Contratos: *${active.length}*\n• Total contratado: *${money(total)}*\n\n${lines || "Nenhum contrato ativo encontrado."}`;
  }  if (intent === "daily_summary") {
    const [{ data: payments }, { data: handoffs }, { data: events }, { data: queue }] = await Promise.all([
      adminDb.from("payment_intents").select("amount").eq("profile_id", profileId).eq("status", "APPROVED").gte("created_at", since.toISOString()),
      adminDb.from("n8n_handoffs").select("id,status").eq("profile_id", profileId).gte("created_at", since.toISOString()),
      adminDb.from("n8n_message_events").select("id,status").eq("profile_id", profileId).gte("created_at", since.toISOString()),
      adminDb.from("whatsapp_queue").select("status").eq("profile_id", profileId).gte("created_at", since.toISOString()),
    ]);
    const total = (payments || []).reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0);
    return `📊 *Resumo de hoje*\n\n💰 Pagamentos: *${payments?.length || 0}* — total *${money(total)}*\n🤝 Atendimentos: *${handoffs?.length || 0}*\n📩 Mensagens recebidas: *${events?.length || 0}*\n📤 Envios com erro: *${(queue || []).filter((item: any) => item.status === "ERROR").length}*`;
  }
  return "Consulta administrativa não disponível.";
}
Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const body = await req.json();
    const profileId = String(body.organization_id || "");
    const phone = digits(body.phone);
    const secret = req.headers.get("x-capitalflow-secret") || "";
    if (!uuidPattern.test(profileId) || phone.length < 10 || secret.length < 32) return json({ error: "unauthorized" }, 401);
    const adminDb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const { data: integration } = await adminDb.from("n8n_automation_integrations").select("profile_id").eq("profile_id", profileId).eq("secret_hash", await sha256(secret)).eq("active", true).maybeSingle();
    if (!integration) return json({ error: "unauthorized" }, 401);
    const phoneHash = await sha256(phone);
    const { data: admin } = await adminDb.from("whatsapp_admin_users").select("*").eq("profile_id", profileId).eq("phone_hash", phoneHash).eq("active", true).maybeSingle();
    if (!admin) {
      const response = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/capitalflow-n8n-tools`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-capitalflow-secret": secret },
        body: JSON.stringify(body),
      });
      return new Response(await response.text(), { status: response.status, headers: { "content-type": "application/json; charset=utf-8" } });
    }
    const rawMessage = String(body.message || "").trim().slice(0, 1000);
    const intent = detectIntent(rawMessage);
    const adminName = String(admin.display_name || "Sócrates").trim().split(/\s+/)[0];
    const hour = Number(new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", hour12: false, timeZone: "America/Manaus" }).format(new Date()));
    const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
    if (intent === "greeting") return json({ handled: true, admin: true, reply: `${greeting}, ${adminName}. Estou à sua disposição para consultar a carteira, acompanhar vencimentos e executar cobranças. O que deseja fazer?` });
    const contractRequest = parseContractRequest(rawMessage);
    if (contractRequest) {
      if (!hasPermission(admin, "CONTRACT_CREATE")) return json({ handled: true, admin: true, reply: "Seu número não possui permissão para criar contratos." });
      return json({ handled: true, admin: true, reply: await prepareContractDraft(adminDb, profileId, admin, contractRequest) });
    }
    const paymentRequest = parsePaymentRequest(rawMessage);
    if (paymentRequest) {
      if (!hasPermission(admin, "PAYMENT")) return json({ handled: true, admin: true, reply: "Seu número não possui permissão para registrar pagamentos." });
      return json({ handled: true, admin: true, reply: await preparePaymentDraft(adminDb, profileId, admin, paymentRequest) });
    }
    const customMessage = parseCustomMessage(rawMessage);
    if (customMessage) {
      if (!hasPermission(admin, "MESSAGE")) return json({ handled: true, admin: true, reply: "Seu número não possui permissão para enviar mensagens." });
      const found = await findClient(adminDb, profileId, customMessage.name);
      if (found.error) return json({ handled: true, admin: true, reply: await startClientRegistration(adminDb, profileId, admin, customMessage.name, { type: "CUSTOM_MESSAGE", message: customMessage.message }) });
      if (digits(found.client.phone).length < 10) return json({ handled: true, admin: true, reply: `${found.client.name} não possui WhatsApp válido no cadastro.` });
      const reply = await createPending(adminDb, profileId, admin, "CUSTOM_MESSAGE", {
        client: found.client, message: customMessage.message,
      }, `Enviar para ${found.client.name}:\n“${customMessage.message}”`);
      return json({ handled: true, admin: true, reply });
    }
    const registrationRequest = parseClientRegistrationRequest(rawMessage);
    if (registrationRequest) {
      if (!hasPermission(admin, "CONTRACT_CREATE")) return json({ handled: true, admin: true, reply: "Seu número não possui permissão para cadastrar clientes." });
      return json({ handled: true, admin: true, reply: await startClientRegistration(adminDb, profileId, admin, registrationRequest.name) });
    }
    if (intent === "unknown") {
      const details = parseClientDetails(rawMessage);
      if (details.phone || details.document) {
        const { data: draft, error: draftError } = await adminDb.from("whatsapp_admin_commands").select("*")
          .eq("profile_id", profileId).eq("admin_user_id", admin.id).in("intent", ["CONTRACT_DRAFT", "CLIENT_REGISTRATION_DRAFT"])
          .eq("status", "PENDING").gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (draftError) throw draftError;
        if (draft) {
          const merged = { phone: details.phone || draft.payload?.phone, document: details.document || draft.payload?.document };
          if (digits(merged.phone).length < 10 || ![11, 14].includes(digits(merged.document).length)) {
            return json({ handled: true, admin: true, reply: "Ainda preciso dos dois dados: CPF e WhatsApp com DDD. Exemplo: CPF: 000.000.000-00 | WhatsApp: 5592999999999" });
          }
          await adminDb.from("whatsapp_admin_commands").update({ status: "EXPIRED" }).eq("id", draft.id);
          if (draft.intent === "CLIENT_REGISTRATION_DRAFT") {
            const reply = await createPending(adminDb, profileId, admin, "CREATE_CLIENT", {
              name: draft.payload.name, phone: merged.phone, document: merged.document,
              after_action: draft.payload.after_action || null,
            }, `Cadastrar ${draft.payload.name}?\nCPF final ${digits(merged.document).slice(-4)}\nWhatsApp final ${digits(merged.phone).slice(-4)}`);
            return json({ handled: true, admin: true, reply });
          }
          return json({ handled: true, admin: true, reply: await prepareContractDraft(adminDb, profileId, admin, draft.payload.request, merged) });
        }
      }
    }
    if (["payments_today", "handoffs", "system_status", "daily_summary", "clients", "contracts"].includes(intent)) {
      if (!hasPermission(admin, "READ")) return json({ handled: true, admin: true, reply: "Seu número não possui permissão para consultar informações administrativas." });
      return json({ handled: true, admin: true, reply: await operatorQuery(adminDb, profileId, intent) });
    }    if (intent === "help") return json({ handled: true, admin: true, reply: `${adminName}, posso consultar contratos, valores, vencimentos, carteira e atrasados; enviar cobranças e portais; configurar automações; e criar contratos com confirmação.` });
    if (intent === "unknown") return json({ handled: true, admin: true, reply: "Não consegui classificar essa solicitação como uma operação administrativa. Pode reformular dizendo o que deseja consultar ou executar? Posso pesquisar clientes, contratos, vencimentos, atrasos, pagamentos, comprovantes, atendimentos e status das integrações." });
    if (intent === "confirm") return json({ handled: true, admin: true, reply: await executePending(adminDb, profileId, admin, rawMessage) });
    if (intent === "cancel") {
      await adminDb.from("whatsapp_admin_commands").update({ status: "CANCELLED" }).eq("profile_id", profileId).eq("admin_user_id", admin.id).eq("status", "PENDING");
      return json({ handled: true, admin: true, reply: "Comando pendente cancelado." });
    }
    if (!hasPermission(admin, "READ")) return json({ handled: true, admin: true, reply: "Seu número não possui permissão para consultar a carteira." });
    if (intent === "portfolio") {
      const { data: contracts } = await adminDb.from("contratos").select("id,status,total_to_receive").or(`profile_id.eq.${profileId},owner_id.eq.${profileId}`).eq("is_archived", false);
      const active = (contracts || []).filter((item: any) => !closed.includes(String(item.status || "").toUpperCase()));
      const total = active.reduce((sum: number, item: any) => sum + Number(item.total_to_receive || 0), 0);
      return json({ handled: true, admin: true, reply: `Carteira: ${active.length} contrato${active.length === 1 ? " ativo" : "s ativos"}, total contratado de ${money(total)}. Envie “atrasados” para ver as prioridades.` });
    }
    if (/\b(?:saldo|limite|disponivel|disponibilidade)\b[\s\S]*\b(?:carteiras?|fontes?)\b|\b(?:carteiras?|fontes?)\b[\s\S]*\b(?:saldo|limite|disponivel|disponibilidade)\b/.test(normalize(rawMessage))) {
      const { data: sources, error: sourceError } = await adminDb.from("fontes")
        .select("name,type,balance").eq("profile_id", profileId).order("balance", { ascending: false });
      if (sourceError) throw sourceError;
      if (!sources?.length) return json({ handled: true, admin: true, reply: "Não há fontes de capital cadastradas." });
      const lines = sources.map((source: any) => `${source.name}: ${money(source.balance)}`).join("\n");
      return json({ handled: true, admin: true, reply: `Disponibilidade para novos contratos:\n${lines}\nO sistema bloqueia liberações acima do saldo da fonte escolhida.` });
    }
    if (intent === "dispatches") {
      const { data } = await adminDb.from("whatsapp_queue").select("status,error_message,created_at").eq("profile_id", profileId).order("created_at", { ascending: false }).limit(50);
      const counts = (data || []).reduce((acc: any, item: any) => ({ ...acc, [item.status]: (acc[item.status] || 0) + 1 }), {});
      return json({ handled: true, admin: true, reply: `Últimas mensagens: ${counts.SENT || 0} enviadas, ${counts.PENDING || 0} pendentes, ${counts.PROCESSING || 0} processando e ${counts.ERROR || 0} com erro.` });
    }
    if (intent === "due_today") {
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Manaus" });
      const { data: installments, error: installmentError } = await adminDb.from("parcelas")
        .select("id,loan_id,due_date,data_vencimento,status").eq("profile_id", profileId)
        .or(`due_date.eq.${today},data_vencimento.eq.${today}`)
        .not("status", "in", `(${paid.map((status) => `"${status}"`).join(",")})`).limit(50);
      if (installmentError) throw installmentError;
      if (!installments?.length) return json({ handled: true, admin: true, reply: `${adminName}, não há parcelas vencendo hoje.` });
      const loanIds = [...new Set(installments.map((item: any) => item.loan_id))];
      const { data: contracts, error: contractError } = await adminDb.from("contratos").select("id,client_id,debtor_name,debtor_phone,status").in("id", loanIds).eq("is_archived", false);
      if (contractError) throw contractError;
      const contractMap = new Map((contracts || []).filter((item: any) => !closed.includes(String(item.status || "").toUpperCase())).map((item: any) => [item.id, item]));
      const items: any[] = [];
      for (const installment of installments) {
        const contract: any = contractMap.get(installment.loan_id);
        if (!contract) continue;
        const calculated = await adminDb.rpc("prepare_installment_for_online_payment", { p_loan_id: installment.loan_id, p_installment_id: installment.id, p_reference_date: today });
        if (calculated.error) throw calculated.error;
        const due = Array.isArray(calculated.data) ? calculated.data[0] : calculated.data;
        if (Number(due?.total_due || 0) <= 0.05) continue;
        items.push({ name: contract.debtor_name || "Cliente", phone: contract.debtor_phone, loan_id: installment.loan_id, installment_id: installment.id, due_date: installment.data_vencimento || installment.due_date, amount: Number(due.total_due) });
      }
      if (!items.length) return json({ handled: true, admin: true, reply: `${adminName}, não há parcelas vencendo hoje.` });
      await adminDb.from("whatsapp_admin_commands").update({ status: "EXPIRED" }).eq("profile_id", profileId).eq("admin_user_id", admin.id).eq("intent", "DUE_TODAY_LIST").eq("status", "PENDING");
      const { error: listError } = await adminDb.from("whatsapp_admin_commands").insert({ profile_id: profileId, admin_user_id: admin.id, intent: "DUE_TODAY_LIST", payload: { items }, confirmation_code: null, expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString() });
      if (listError) throw listError;
      const list = items.map((item, index) => `${index + 1}. ${item.name} — ${money(item.amount)}`).join("\n");
      return json({ handled: true, admin: true, reply: `${adminName}, vencem hoje:\n${list}\n\nResponda “cobre todos” ou escolha: “cobre 1” / “cobre 1, 3”.` });
    }
    if (intent === "charge_selection") {
      if (!hasPermission(admin, "CHARGE")) return json({ handled: true, admin: true, reply: "Seu número não possui permissão para cobrar clientes." });
      const { data: list, error: listError } = await adminDb.from("whatsapp_admin_commands").select("*").eq("profile_id", profileId).eq("admin_user_id", admin.id).eq("intent", "DUE_TODAY_LIST").eq("status", "PENDING").gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (listError) throw listError;
      if (!list) return json({ handled: true, admin: true, reply: "A lista venceu ou ainda não foi aberta. Envie “vence hoje” novamente." });
      const allItems = list.payload?.items || [];
      const normalized = normalize(rawMessage);
      const selected = /todos|todas/.test(normalized) ? allItems : [...new Set((normalized.match(/\d+/g) || []).map(Number))].map((number) => allItems[number - 1]).filter(Boolean);
      if (!selected.length) return json({ handled: true, admin: true, reply: "Não reconheci os números. Exemplo: cobre 1, 3." });
      const names = selected.map((item: any) => item.name).join(", ");
      const total = selected.reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0);
      const reply = await createPending(adminDb, profileId, admin, "BATCH_CHARGE", { items: selected }, `Enviar ${selected.length} lembrete${selected.length === 1 ? "" : "s"} de vencimento hoje para ${names}, total de ${money(total)}?`);
      return json({ handled: true, admin: true, reply });
    }
    if (intent === "overdue") {
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Manaus" });
      const { data: installments } = await adminDb.from("parcelas").select("loan_id,due_date,data_vencimento,status").eq("profile_id", profileId).lt("due_date", today).not("status", "in", `(${paid.map((status) => `"${status}"`).join(",")})`).limit(100);
      const loanIds = [...new Set((installments || []).map((item: any) => item.loan_id))];
      if (!loanIds.length) return json({ handled: true, admin: true, reply: "Não há parcelas vencidas em aberto agora." });
      const { data: contracts } = await adminDb.from("contratos").select("id,debtor_name").in("id", loanIds).limit(10);
      return json({ handled: true, admin: true, reply: `Atrasados (${loanIds.length} contratos): ${(contracts || []).map((item: any) => item.debtor_name).join(", ")}${loanIds.length > 10 ? " e outros" : ""}.` });
    }
    const query = targetFrom(normalize(rawMessage), intent);
    const found = await findClient(adminDb, profileId, query);
    if (found.error) return json({ handled: true, admin: true, reply: found.error });
    const position = await loadClientPosition(adminDb, profileId, found.client);
    if (intent === "due") return json({ handled: true, admin: true, reply: position.installment ? `${found.client.name}: a parcela vence em ${dateBr(position.installment.due_date_effective)}${Number(position.installment.days_late || 0) > 0 ? ` e está atrasada há ${position.installment.days_late} dias` : ""}.` : `${found.client.name} não tem parcela pendente.` });
    if (intent === "amount") return json({ handled: true, admin: true, reply: position.installment ? `${found.client.name} tem ${money(position.installment.total_due)} atualizado em aberto. O contrato ativo tem total de ${money(position.contract?.total_to_receive)}.` : `${found.client.name} não tem valor pendente confirmado.` });
    if (intent === "debt") {
      if (!position.positions?.length) return json({ handled: true, admin: true, reply: `${found.client.name} não possui dívida ou parcela em aberto.` });
      const total = position.positions.reduce((sum: number, item: any) => sum + Number(item.total_due || 0), 0);
      const lines = position.positions.slice(0, 20).map((item: any, index: number) => {
        const late = Number(item.days_late || 0);
        return `${index + 1}. 📄 Parcela ${item.numero_parcela || index + 1} — ${money(item.total_due)}${late > 0 ? ` — ${late} dia${late === 1 ? "" : "s"} em atraso` : ` — vence em ${dateBr(item.due_date_effective)}`} `;
      });
      return json({ handled: true, admin: true, reply: `💰 *Dívida de ${found.client.name}*\n\n${lines.join("\n")}\n\n*Total atualizado em aberto:* ${money(total)}${position.positions.length > 20 ? `\n\nMostrando 20 de ${position.positions.length} parcelas.` : ""}` });
    }
    if (intent === "status") {
      if (!position.contract) return json({ handled: true, admin: true, reply: `${found.client.name} não possui contrato ativo.` });
      if (!position.installment) return json({ handled: true, admin: true, reply: `${found.client.name} possui contrato ativo, sem parcela pendente.` });
      const late = Number(position.installment.days_late || 0);
      const timing = late > 0
        ? `A parcela venceu em ${dateBr(position.installment.due_date_effective)} e está atrasada há ${late} dia${late === 1 ? "" : "s"}`
        : `A parcela vence em ${dateBr(position.installment.due_date_effective)}`;
      return json({ handled: true, admin: true, reply: `${found.client.name}: contrato em aberto. ${timing}, com valor atualizado de ${money(position.installment.total_due)}.${position.portal ? ` Portal: ${position.portal}` : ""}` });
    }
    if (intent === "portal") {
      if (!position.portal) return json({ handled: true, admin: true, reply: `O portal de ${found.client.name} não está disponível.` });
      if (/^(mande|envie)/.test(normalize(rawMessage))) {
        if (!hasPermission(admin, "CHARGE")) return json({ handled: true, admin: true, reply: "Seu número não possui permissão para enviar mensagens." });
        const reply = await createPending(adminDb, profileId, admin, "PORTAL_SEND", { client: found.client }, `Enviar o portal para ${found.client.name}?`);
        return json({ handled: true, admin: true, reply });
      }
      return json({ handled: true, admin: true, reply: `Portal de ${found.client.name}: ${position.portal}` });
    }
    if (intent === "charge") {
      if (!hasPermission(admin, "CHARGE")) return json({ handled: true, admin: true, reply: "Seu número não possui permissão para cobrar clientes." });
      if (!position.installment) return json({ handled: true, admin: true, reply: `${found.client.name} não tem parcela pendente para cobrança.` });
      const normalized = normalize(rawMessage);
      const tone = /firme|incisiva|atrasad|vencid/.test(normalized) ? "FIRM_RESPECTFUL" : /mediador/.test(normalized) ? "MEDIATOR" : /cordial|suave/.test(normalized) ? "CORDIAL" : "OBJECTIVE";
      const toneLabel = tone === "FIRM_RESPECTFUL" ? "firme e respeitoso" : tone === "MEDIATOR" ? "mediador" : tone === "CORDIAL" ? "cordial" : "objetivo";
      const reply = await createPending(adminDb, profileId, admin, "CHARGE", { client: found.client, tone }, `Cobrar ${found.client.name} em tom ${toneLabel}, no valor atualizado de ${money(position.installment.total_due)}?`);
      return json({ handled: true, admin: true, reply });
    }
    if (intent === "automation") {
      if (!hasPermission(admin, "AUTOMATION")) return json({ handled: true, admin: true, reply: "Seu número não possui permissão para alterar automações." });
      const normalized = normalize(rawMessage);
      const enabled = !/pause|pausar|desative|desativar/.test(normalized);
      const cadence = /semanal/.test(normalized) ? "WEEKLY" : /diaria/.test(normalized) ? "DAILY" : enabled ? "DAILY" : "MANUAL";
      const reply = await createPending(adminDb, profileId, admin, "AUTOMATION", { client: found.client, enabled, cadence }, `${enabled ? "Ativar" : "Pausar"} cobrança automática ${enabled ? cadence.toLowerCase() : ""} para ${found.client.name}?`);
      return json({ handled: true, admin: true, reply });
    }
    return json({ handled: true, admin: true, reply: "Não entendi o comando. Envie AJUDA para ver exemplos." });
  } catch (error) {
    console.error("capitalflow-admin-whatsapp", error instanceof Error ? error.message : "unknown_error");
    return json({ handled: true, admin: true, reply: `Não consegui executar: ${error instanceof Error ? error.message : "erro interno"}` }, 200);
  }
});
