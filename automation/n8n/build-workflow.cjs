'use strict';

const fs = require('node:fs');
const path = require('node:path');

const [sourcePath, outputPath] = process.argv.slice(2);
if (!sourcePath || !outputPath) {
  throw new Error('Uso: node build-workflow.cjs <workflow-exportado.json> <saida.json>');
}

const workflows = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const workflow = Array.isArray(workflows) ? workflows[0] : workflows;
if (!workflow?.nodes || !workflow?.connections) throw new Error('Export de workflow inválido.');

const libraryPath = path.join(__dirname, 'normalize-waha-message.cjs');
const librarySource = fs
  .readFileSync(libraryPath, 'utf8')
  .replace(/^'use strict';\s*/, '')
  .replace(/module\.exports\s*=\s*\{[^}]+\};?\s*$/, '');

const farewellInstruction = 'Se a mensagem do cliente for despedida ou encerramento curto como tchau, xau, chau, ate mais, ate logo, falou, flw, valeu, vlw, ok, blz, beleza, ta bom, ta certo, combinado, bom dia, boa tarde, boa noite, obrigado, obrigada, era isso, resolvido, finalizar, encerrar ou sair, responda somente: Conversa encerrada. Se precisar do portal novamente, e so pedir por aqui.';

const code = `${librarySource}
let tenantMap = {};
try {
  tenantMap = JSON.parse($env.CAPITALFLOW_TENANT_MAP || '{}');
} catch {
  throw new Error('CAPITALFLOW_TENANT_MAP deve conter um objeto JSON válido.');
}

const accepted = [];
for (const item of $input.all()) {
  const result = normalizeWahaMessage(item.json, { tenantMap });
  if (result.accepted) accepted.push({ json: result.value });
}
return accepted;`;

const normalizeNode = {
  parameters: { jsCode: code },
  id: 'capitalflow-normalize-filter',
  name: 'Normalize and Filter',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [-620, 0],
};

const adminCommandNode = {
  parameters: {
    method: 'POST',
    url: 'https://hzchchbxkhryextaymkn.supabase.co/functions/v1/capitalflow-admin-whatsapp',
    sendHeaders: true,
    headerParameters: { parameters: [{ name: 'x-capitalflow-secret', value: '={{ $env.CAPITALFLOW_N8N_SECRET }}' }] },
    sendBody: true,
    contentType: 'raw',
    rawContentType: 'application/json',
    body: '={{ JSON.stringify({ organization_id: $("Normalize and Filter").item.json.organization_id, phone: $("Normalize and Filter").item.json.phone, message_id: $("Normalize and Filter").item.json.message_id, message: $("Normalize and Filter").item.json.message }) }}',
    options: { timeout: 15000 },
  },
  id: 'capitalflow-admin-command',
  name: 'Admin Command',
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: [-400, -160],
  onError: 'continueRegularOutput',
};

const adminGateNode = {
  parameters: {
    jsCode: 'const handled = $json.handled === true || String($json.handled) === "true";\nif (!handled) throw new Error("PUBLIC_FLOW");\nreturn $input.all();',
  },
  id: 'capitalflow-admin-gate',
  name: 'Admin Gate',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [-170, -160],
  onError: 'continueErrorOutput',
};

const adminReplyNode = {
  parameters: { jsCode: 'return [{ json: { reply: String($json.reply || "Comando administrativo processado.").slice(0, 3500) } }];' },
  id: 'capitalflow-admin-reply',
  name: 'Admin Reply',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [70, -260],
};
const backendNode = {
  parameters: {
    method: 'POST',
    url: 'https://hzchchbxkhryextaymkn.supabase.co/functions/v1/capitalflow-n8n-tools',
    sendHeaders: true,
    headerParameters: { parameters: [{ name: 'x-capitalflow-secret', value: '={{ $env.CAPITALFLOW_N8N_SECRET }}' }] },
    sendBody: true,
    contentType: 'raw',
    rawContentType: 'application/json',
    body: '={{ JSON.stringify({ action: "context", organization_id: $json.organization_id, phone: $json.phone, message_id: $json.message_id, message_type: $json.message_type, message: $json.message }) }}',
    options: { timeout: 15000 },
  },
  id: 'capitalflow-backend-context',
  name: 'Secure Client Context',
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: [-380, 0],
};

const deduplicateNode = {
  parameters: { jsCode: 'return $input.all().filter((item) => item.json.status !== "duplicate");' },
  id: 'capitalflow-drop-duplicates',
  name: 'Drop Duplicates',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [-140, 0],
};

const localAiRequestNode = {
  parameters: {
    method: 'POST',
    url: '={{ $env.CAPITALFLOW_LOCAL_AI_URL || "http://koboldcpp:5001/v1/chat/completions" }}',
    sendBody: true,
    contentType: 'raw',
    rawContentType: 'application/json',
    body: '={{ JSON.stringify({ model: $env.CAPITALFLOW_LOCAL_AI_MODEL || "qwen3-4b-instruct", messages: [{ role: "system", content: "Converse em portugues como um atendente humano, direto e natural. Responda em no maximo duas frases, salvo quando precisar incluir um link. Dados financeiros devem vir exclusivamente dos campos *_display do contexto atual; memoria de conversa nunca e fonte financeira. Nunca converta 1,30 em 1.300 nem 2,59 em 2.590. Nao invente valores, datas, atrasos ou links. Para consulta financeira sem identificacao, peca CPF ou codigo uma unica vez e explique o motivo em uma frase. A pessoa pode encerrar, reiniciar ou trocar de cliente quando quiser. Se a mensagem for despedida ou encerramento curto como tchau, xau, ok, blz, ta bom, bom dia, boa tarde ou boa noite, encerre em uma frase curta. Emprestimo so entra na conversa se a pessoa pedir; nesse caso, encaminhe ao operador sem prometer aprovacao. Se houver divida, conduza para o portal do cliente; nunca envie link direto de pagamento externo. Preserve privacidade, nao ameace nem constranja e nao revele detalhes internos do sistema. Nada de renegociar, em hipotese alguma citar essa opcao." }, { role: "user", content: "Mensagem do cliente: " + $("Normalize and Filter").item.json.message + "\\nContexto disponivel: " + JSON.stringify($("Admin Command").item.json) }], temperature: 0.25, max_tokens: 260, stream: false }) }}',
    options: { timeout: 30000 },
  },
  id: 'capitalflow-local-ai-request',
  name: 'Local AI Request',
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: [1240, 300],
  onError: 'continueErrorOutput',
};

const localAiNormalizeNode = {
  parameters: {
    jsCode: `const payload = $json || {};
const rawReply = String(
  payload.choices?.[0]?.message?.content
  ?? payload.output
  ?? payload.response
  ?? payload.text
  ?? payload.data?.choices?.[0]?.message?.content
  ?? ""
).trim();
const reply = rawReply.replace(/<think>[\\s\\S]*?<\\/think>/gi, "").trim();

const semanticFailure = (value) => {\n  const normalized = String(value || "").normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase();\n  return /\\bnao entendi\\b|\\bnao compreendi\\b|\\bnao consegui entender\\b|\\bnao consegui identificar\\b|\\bnao foi possivel entender\\b|\\bexplique melhor sua (mensagem|solicitacao)\\b|\\breformule sua (mensagem|solicitacao)\\b/.test(normalized);\n};\n\nif (!reply || /<think>/i.test(reply) || semanticFailure(reply)) {
  throw new Error("A IA local nao produziu uma resposta final segura.");
}

return [{ json: { output: reply, local_ai: true } }];`,
  },
  id: 'capitalflow-local-ai-normalize',
  name: 'Local AI Normalize',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [1460, 300],
  onError: 'continueErrorOutput',
};

const googleModelNode = {
  parameters: {
    modelName: 'models/gemini-3.5-flash',
    options: { maxOutputTokens: 900, temperature: 0.3 },
  },
  id: 'capitalflow-google-gemini-model',
  name: 'Google Gemini Chat Model',
  type: '@n8n/n8n-nodes-langchain.lmChatGoogleGemini',
  typeVersion: 1,
  position: [1420, 700],
  credentials: {
    googlePalmApi: {
      id: 'eyFl8sR6CYsnqcVt',
      name: 'Google Gemini(PaLM) Api account',
    },
  },
};

const conventionalFallbackNode = {
  parameters: {
    jsCode: `const context = $("Admin Command").item.json || {};
const message = String($("Normalize and Filter").item.json.message || "").toLowerCase();
const normalizedMessage = message.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase();
const operatorUrl = context.operator_contact?.whatsapp_url || "";
const money = (value) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const withOperator = (text) => operatorUrl ? text + " Fale com o operador por aqui: " + operatorUrl : text;
const formatDate = (value) => { const parts = String(value || "").slice(0, 10).split("-"); return parts.length === 3 ? parts[2] + "/" + parts[1] + "/" + parts[0] : String(value || ""); };
const greeting = () => {
  const hour = Number(new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Manaus", hour: "2-digit", hour12: false }).format(new Date()));
  if (hour < 5) return "Boa noite";
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
};
let output = null;

const clientName = context.client?.display_name ? context.client.display_name.split(" ")[0] : "";
const pending = Array.isArray(context.pending) ? context.pending : [];
const first = pending[0];
const openContractCount = new Set(pending.map((item) => item.contract_reference).filter(Boolean)).size || (context.contracts || []).filter((item) => item.has_pending_installment).length || pending.length || 1;

if (context.status === "session_ended") {
  output = "Conversa encerrada. Se precisar do portal novamente, \\u00e9 s\\u00f3 pedir por aqui.";
} else if (context.status === "ambiguous") {
  output = "Encontrei mais de um cadastro compat\\u00edvel. Para confirmar com seguran\\u00e7a, informe seu c\\u00f3digo de cliente.";
} else if (context.status === "not_identified") {
  const isHelp = /^(ajuda|como funciona|o que posso fazer|opcoes|comandos)/.test(message);
  const asksCompany = /\\b(que empresa|qual empresa|quem sao voces|quem e voces|capital flow|capitalflow|como funciona|do que se trata|o que e isso)\\b/.test(message);
  if (asksCompany) {
    output = "Somos a CapitalFlow. Este WhatsApp atende consultas de contratos, parcelas e pagamentos. Se j\\u00e1 for cliente, informe seu CPF ou c\\u00f3digo de cliente para eu localizar seu atendimento com seguran\\u00e7a.";
  } else if (isHelp) {
    output = "Posso ajudar com o b\\u00e1sico: consultar contrato e parcela, informar o valor atualizado e enviar o link para pagamento. Se j\\u00e1 \\u00e9 nosso cliente, digite seu CPF ou c\\u00f3digo do cliente.";
  } else {
    output = "Ol\\u00e1, somos a CapitalFlow. Se j\\u00e1 \\u00e9 nosso cliente, digite seu CPF ou c\\u00f3digo do cliente. Se quiser ajuda, digite 'ajuda'.";
  }
} else if (context.status === "identified") {
  if (first) {
    const refusesDetails = /^(n|nao|agora nao|depois|nao quero|nao preciso|nao precisa|deixa|deixa pra depois|mais tarde)\\b/.test(normalizedMessage);
    const wantsDetails = !refusesDetails && (context.payment_requested === true || /\\b(sim|quero|pode|manda|envia|ok|certo|detalhes|saber mais|pagar|pagamento|pix|quitar|contrato|parcela|pendencia|pendente|quem e|quem eh|do que)\\b/.test(normalizedMessage));
    const late = Number(first.days_late || 0);
    const dueText = late > 0
      ? "venceu em " + formatDate(first.due_date) + " e est\\u00e1 h\\u00e1 " + late + (late === 1 ? " dia em atraso" : " dias em atraso")
      : "vence em " + formatDate(first.due_date);
    if (refusesDetails) {
      output = "Certo. Se precisar consultar o portal depois, \\u00e9 s\\u00f3 pedir por aqui.";
    } else if (!wantsDetails) {
      output = greeting() + ", " + clientName + ". Encontrei " + openContractCount + " " + (openContractCount === 1 ? "contrato em aberto" : "contratos em aberto") + " no seu cadastro. Deseja ver os detalhes?";
    } else if (context.portal_link) {
      output = clientName + ", sua parcela " + (first.installment_number || "em aberto") + " " + dueText + ". Valor atualizado: " + money(first.total_due) + ".\\n\\nPortal do cliente:\\n" + context.portal_link;
    } else {
      output = withOperator(clientName + ", sua parcela " + (first.installment_number || "em aberto") + " " + dueText + ". Valor atualizado: " + money(first.total_due) + ". N\\u00e3o consegui localizar o portal agora; encaminhei para atendimento concluir com voc\\u00ea.");
    }
  } else {
    output = "Ol\\u00e1, " + clientName + "! Verifiquei aqui e n\\u00e3o consta nenhuma d\\u00edvida pendente. At\\u00e9 logo!";
  }
} else if (context.status === "lead_registered" || context.status === "prospective_client") {
  output = withOperator("Para se tornar cliente ou fazer uma an\\u00e1lise, o cadastro \\u00e9 feito diretamente pelo operador.");
}

return [{ json: { output, conventional_handled: !!output } }];`,
  },
  id: 'capitalflow-conventional-fallback',
  name: 'Conventional Bot Fallback',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [1100, 0],
};

const conventionalGateNode = {
  parameters: {
    jsCode: 'const handled = $json.conventional_handled === true || String($json.conventional_handled) === "true";\nif (!handled) throw new Error("AI_FLOW");\nreturn $input.all();',
  },
  id: 'capitalflow-conventional-gate',
  name: 'Conventional Gate',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [1300, 0],
  onError: 'continueErrorOutput',
};

const outputGuardNode = {
  parameters: {
    jsCode: `const raw = String($json.output || "").trim();
const forbidden = /not_identified|contexto seguro|organization_id|client_id|supabase|n8n|docker|ferramenta|prompt|instru[cç][aã]o interna/i;
const unlawfulOrAbusive = /amea[cç]a|pris[aã]o por d[ií]vida|expor (a |sua )?d[ií]vida|cobrar (de |pela )?(fam[ií]lia|empregador|vizinhos)|humilhar|constranger|dep[oó]sito antecipado para liberar|aprova[cç][aã]o garantida/i;
const context = $("Admin Command").item.json;
const customerMessage = String($("Normalize and Filter").item.json.message || "");
const currentContract = context.current_contract || null;
const pendingInstallment = Array.isArray(context.pending) ? context.pending[0] : null;
const openContractCount = new Set((context.pending || []).map((item) => item.contract_reference).filter(Boolean)).size || (context.contracts || []).filter((item) => item.has_pending_installment).length || (context.pending || []).length || 1;
const asksContractValue = /\\b(valor|quanto|total|saldo)\\b[\\s\\S]*\\b(contrato|parcela|d.?vida|devo)\\b|\\b(contrato|parcela|d.?vida)\\b[\\s\\S]*\\b(valor|quanto|total|saldo)\\b/i.test(customerMessage);
let reply = raw;
const normalizedCustomerMessage = customerMessage.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase();
const farewellReply = "Conversa encerrada. Se precisar do portal novamente, \\u00e9 s\\u00f3 pedir por aqui.";
const refusalReply = "Certo. Se precisar consultar o portal depois, \\u00e9 s\\u00f3 pedir por aqui.";
const isFarewellMessage = /^(tchau|xau|chau|ate mais|ate logo|falou|flw|valeu|vlw|ok|blz|beleza|ta bom|ta certo|combinado|bom dia|boa tarde|boa noite|obrigado|obrigada|ok obrigado|ok obrigada|era isso|por enquanto e so|resolvido|finalizar|encerrar|encerrar conversa|finalizar conversa|sair)$/i.test(normalizedCustomerMessage);
const refusesDetails = /^(n|nao|agora nao|depois|nao quero|nao preciso|nao precisa|deixa|deixa pra depois|mais tarde)\\b/.test(normalizedCustomerMessage);
const asksLoan = /\\bemprestimo\\b|\\bemprestar\\b|\\bme empresta\\b|\\bcredito\\b/.test(normalizedCustomerMessage);
const asksPayment = /\\bpagar\\b|\\bpagamento\\b|\\bquitar\\b|\\bpix\\b|\\blink\\b/.test(normalizedCustomerMessage) && !/\\bnao\\b|\\bdepois\\b|\\bagora nao\\b/.test(normalizedCustomerMessage);
const asksDebtStatus = /\\bdivida\\b|\\bparcela\\b|\\bvenc(e|imento)\\b|\\batras(o|ada)\\b|\\bjuros\\b|\\bcontrato\\b|\\bpendencia\\b|\\bpendente\\b|\\bquem e\\b|\\bquem eh\\b|\\bdo que\\b/.test(normalizedCustomerMessage);
const isAffirmative = /^(sim|isso|quero|pode|me ajuda|pode ser|manda|envia|ok|certo|contrato|parcela)\\b/.test(normalizedCustomerMessage);\nconst asksInterestOnly = /\\bjuros\\b/.test(normalizedCustomerMessage) && !/\\b(total|parcela|divida|pagamento|pagar tudo)\\b/.test(normalizedCustomerMessage);\nconst identityDigits = customerMessage.replace(/\\D/g, "");\nconst isIdentityMessage = identityDigits.length === 11 || /^[a-z0-9-]{3,30}$/i.test(customerMessage.trim()) && /\\d/.test(customerMessage);
const formatDate = (value) => { const parts = String(value || "").slice(0, 10).split("-"); return parts.length === 3 ? parts[2] + "/" + parts[1] + "/" + parts[0] : String(value || ""); };
const duePhrase = (item) => { const late = Number(item?.days_late || 0); return late > 0 ? "venceu em " + formatDate(item?.due_date) + " e est\\u00e1 h\\u00e1 " + late + (late === 1 ? " dia em atraso" : " dias em atraso") : "vence em " + formatDate(item?.due_date); };
if (context.status === "session_ended" || (context.status === "identified" && isFarewellMessage)) {
  reply = farewellReply;
} else if (context.status === "identified" && refusesDetails) {
  reply = refusalReply;
} else if (context.status === "lead_registered") {
  reply = context.operator_contact?.whatsapp_url
    ? "Entendi que voc\\u00ea quer um novo empr\\u00e9stimo. Vou encaminhar seu pedido ao operador para analisar com voc\\u00ea, sem promessa de aprova\\u00e7\\u00e3o. Fale com ele aqui: " + context.operator_contact.whatsapp_url
    : "Entendi que voc\\u00ea quer um novo empr\\u00e9stimo. Registrei seu pedido para o operador analisar com voc\\u00ea, sem promessa de aprova\\u00e7\\u00e3o.";
} else if (context.status === "identified" && asksLoan) {
  reply = context.operator_contact?.whatsapp_url
    ? "Entendi. Para um novo empr\\u00e9stimo, o operador precisa conversar com voc\\u00ea e avaliar as condi\\u00e7\\u00f5es. Fale com ele aqui: " + context.operator_contact.whatsapp_url
    : "Entendi. Para um novo empr\\u00e9stimo, o operador precisa conversar com voc\\u00ea e avaliar as condi\\u00e7\\u00f5es.";
} else if (context.status === "identified" && isIdentityMessage && pendingInstallment) {
  reply = "Cliente identificado. Encontrei " + openContractCount + " " + (openContractCount === 1 ? "contrato em aberto" : "contratos em aberto") + " no seu cadastro. Deseja ver os detalhes?";
} else if (context.status === "identified" && asksInterestOnly) {
  reply = context.operator_contact?.whatsapp_url
    ? "O pagamento de juros isoladamente precisa ser tratado pelo atendimento humano. Fale por aqui: " + context.operator_contact.whatsapp_url
    : "O pagamento de juros isoladamente precisa ser tratado pelo atendimento humano.";
} else if (context.status === "identified" && (asksPayment || (isAffirmative && pendingInstallment)) && !asksInterestOnly) {
  const link = context.portal_link;
  reply = pendingInstallment && link
    ? "Certo, " + (context.client?.display_name ? context.client.display_name.split(" ")[0] : "cliente") + ". Sua parcela " + (pendingInstallment.installment_number || "em aberto") + " " + duePhrase(pendingInstallment) + ". Valor atualizado: " + pendingInstallment.total_due_display + ".\\n\\nPortal do cliente:\\n" + link
    : pendingInstallment
      ? "Certo. A parcela em aberto est\\u00e1 atualizada em " + pendingInstallment.total_due_display + ". N\\u00e3o consegui localizar o portal agora; encaminhei para atendimento concluir com voc\\u00ea."
      : "Certo. N\\u00e3o encontrei parcela pendente confirmada agora. Encaminhei para atendimento verificar.";
} else if (context.status === "identified" && asksDebtStatus && pendingInstallment) {
  const late = Number(pendingInstallment.days_late || 0);
  reply = "A parcela " + (pendingInstallment.installment_number || "pendente") + " vence em " + formatDate(pendingInstallment.due_date) + " e est\\u00e1 atualizada em " + pendingInstallment.total_due_display + ".";
  reply += late > 0 ? " Ela est\\u00e1 em atraso h\\u00e1 " + late + (late === 1 ? " dia." : " dias.") : " Ela ainda n\\u00e3o est\\u00e1 em atraso.";
  reply += context.portal_link ? " Para ver detalhes, acesse o portal do cliente: " + context.portal_link : " N\\u00e3o consegui localizar o portal agora; encaminhei para atendimento verificar.";
}
if (context.admin === true && context.handled === true && context.reply) {
  reply = String(context.reply);
}
if (context.status === "identified" && asksContractValue && currentContract) {
  const contractValue = currentContract.total_to_receive_display || currentContract.principal_display;
  const dueValue = pendingInstallment?.total_due_display;
  reply = dueValue
    ? "O valor do contrato \\u00e9 " + contractValue + ". A parcela em aberto est\\u00e1 atualizada em " + dueValue + "."
    : "O valor do contrato \\u00e9 " + contractValue + ". N\\u00e3o encontrei parcela pendente agora.";
}
if (context.status === "session_ended") {
  reply = farewellReply;
}
if ($json.error && !reply) {
  reply = context.operator_contact?.whatsapp_url
    ? "Nosso atendimento automático está instável neste momento. Você pode falar com o operador por aqui: " + context.operator_contact.whatsapp_url
    : "Nosso atendimento automático está instável neste momento. Tente novamente em alguns minutos.";
}
if (!reply || forbidden.test(reply) || unlawfulOrAbusive.test(reply)) {
  if (context.status === "ambiguous") reply = "Encontrei mais de um cadastro com esses dados. Para sua segurança, informe o código do cliente.";
  else if (context.status === "lead_registered") reply = context.operator_contact?.whatsapp_url
    ? "Entendi. Esse assunto é tratado diretamente pelo operador. Você pode falar com ele por aqui: " + context.operator_contact.whatsapp_url
    : "Entendi. Registrei seu interesse e o operador entrará em contato com você.";
  else if (context.status === "prospective_client") reply = context.operator_contact?.whatsapp_url
    ? "Que bom saber do seu interesse. O cadastro e as condições são explicados pelo operador, sem compromisso. Você pode falar com ele aqui: " + context.operator_contact.whatsapp_url
    : "Que bom saber do seu interesse. Registrei seu pedido para o operador explicar o cadastro e as condições, sem compromisso.";
  else if (context.status === "proof_received") reply = "Recebi seu comprovante. Vamos conferir o pagamento e avisaremos assim que ele for confirmado.";
  else if (context.status === "human_handoff_registered") reply = "Certo, encaminhei seu atendimento para uma pessoa. Em breve entraremos em contato.";
  else reply = "Olá! Como posso ajudar?";
}
if (context.status === "identified" && /R\\$\\s*[\\d.]+,\\d{2}/g.test(reply)) {
  const allowedAmounts = new Set([
    context.current_contract?.principal_display,
    context.current_contract?.total_to_receive_display,
    ...(context.contracts || []).flatMap((item) => [item.principal_display, item.total_to_receive_display]),
    ...(context.pending || []).flatMap((item) => [item.principal_due_display, item.interest_due_display, item.late_fee_due_display, item.total_due_display]),
  ].filter(Boolean).map((value) => String(value).replace(/\\s/g, " ")));
  const mentioned = reply.match(/R\\$\\s*[\\d.]+,\\d{2}/g) || [];
  if (mentioned.some((value) => !allowedAmounts.has(value.replace(/\\s/g, " ")))) {
    reply = pendingInstallment
      ? "O valor atualizado da parcela em aberto \\u00e9 " + pendingInstallment.total_due_display + ". Para conferir o contrato, acesse " + (context.portal_link || "o portal do cliente") + "."
      : "N\\u00e3o encontrei valor pendente confirmado agora.";
  }
}
if (reply.length > 650) reply = reply.slice(0, 647).trimEnd() + "...";
if (context.status === "amount_disputed") reply = context.operator_contact?.whatsapp_url
  ? "Entendo. Para revisar esse valor com você, fale diretamente com o operador por aqui: " + context.operator_contact.whatsapp_url
  : "Entendo. Encaminhei o valor para revisão do operador.";
const protectedUrls = [];
reply = reply.replace(new RegExp("https?://[^ ]+", "g"), (url) => {
  protectedUrls.push(url);
  return "__SAFE_URL_" + (protectedUrls.length - 1) + "__";
});
reply = reply.replace(new RegExp("[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}", "gi"), "contrato");
reply = reply.replace(new RegExp("__SAFE_URL_([0-9]+)__", "g"), (_, index) => protectedUrls[Number(index)] || "");
return [{ json: { reply: reply.slice(0, 1800) } }];`,
  },
  id: 'capitalflow-output-guard',
  name: 'Output Guard',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [100, 0],
};

const semanticGate = (name, id, position) => ({
  parameters: {
    jsCode: [
      'const reply = String($json.output || $json.text || "").trim();',
      'const normalized = reply.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase();',
      'const semanticFailure = /\\bnao entendi\\b|\\bnao compreendi\\b|\\bnao consegui entender\\b|\\bnao consegui identificar\\b|\\bnao foi possivel entender\\b|\\bexplique melhor sua (mensagem|solicitacao)\\b|\\breformule sua (mensagem|solicitacao)\\b/.test(normalized);',
      'if (!reply || semanticFailure) throw new Error("A IA respondeu sem compreender a mensagem.");',
      'return [{ json: { ...$json, output: reply, semantic_retry_passed: true } }];',
    ].join(String.fromCharCode(10)),
  },
  id,
  name,
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position,
  onError: 'continueErrorOutput',
});
workflow.name = 'CapitalFlow - Atendimento WhatsApp';
workflow.nodes = workflow.nodes
  .filter((node) => ![
    'Edit Fields',
    'Switch',
    'Normalize and Filter',
    'Secure Client Context',
    'Drop Duplicates',
    'Local AI Request',
    'Local AI Normalize',
    'Gemini Semantic Gate',
    'Groq Semantic Gate',
    'Output Guard',
    'Google Gemini Chat Model',
    'Gemini Fallback Agent',
    'Groq Fallback Agent',
    'Conventional Bot Fallback',
    'Conventional Gate',
    'IA Local Qwen - Agente Offline',
    'Admin Command',
    'Admin Gate',
    'Admin Reply',
  ].includes(node.name))
  .map((node) => {
    if (node.name === 'Redis Chat Memory') {
      node.parameters.sessionIdType = 'customKey';
      node.parameters.sessionKey = '={{ $("Normalize and Filter").item.json.session_id + ":" + ($("Admin Command").item.json.conversation_id || "public") + ":" + ($("Admin Command").item.json.current_contract?.total_to_receive_display || "none") + ":" + ($("Admin Command").item.json.pending?.[0]?.total_due_display || "none") }}';
      node.parameters.sessionTTL = 86400;
    }
    if (node.name === 'Groq Chat Model') {
      node.parameters.options = {
        maxTokensToSample: 900,
        temperature: 0.3,
      };
    }
    if (node.name === 'AI Agent') {
      node.parameters.promptType = 'define';
      node.parameters.text = '={{ "Mensagem do cliente: " + $("Normalize and Filter").item.json.message + "\\nContexto seguro: " + JSON.stringify($json) }}';
      node.parameters.options = {
        systemMessage: [
          'Converse em português como um atendente humano: natural, breve, acolhedor e direto. Responda primeiro ao que a pessoa perguntou, sem menus ou discursos burocráticos.',
          'Use somente os dados financeiros recebidos nesta execução. Não invente valores, datas, contratos, atrasos, pagamentos ou links.',
          'Para consultar dados pessoais sem identificação, peça CPF ou código do cliente uma única vez e explique o motivo em uma frase. A pessoa pode encerrar, reiniciar ou trocar de cliente quando quiser.',
          'Quando identificado, use contracts, pending e portal_link. total_due é o valor atualizado; só existe atraso quando days_late for maior que zero.',
          'Se a pessoa quiser pagar ou ver detalhes, envie sempre o portal_link. Se não existir portal_link, ou se ela discordar do valor, encaminhe ao operator_contact sem repetir respostas prontas.',
          'Não ofereça empréstimo. Se a pessoa pedir, converse normalmente e encaminhe ao operador, sem prometer aprovação, taxa ou condição.',
          'Quem ainda não é cliente pode tirar dúvidas gerais e ser encaminhado ao operador para cadastro.',
          'Proteja a privacidade, não mostre CPF completo nem IDs internos. Não ameace, constranja, revele dívida a terceiros ou confirme pagamento sem confirmação real.',
          'Em comprovante, negociação, revisão de valor ou decisão de crédito, acolha o pedido e encaminhe ao operador quando a decisão humana for necessária.',
        ].join(' '),
      };
      node.parameters.options.systemMessage = farewellInstruction + ' Converse em portugues como um atendente humano, direto e natural. Use no maximo duas frases, salvo quando incluir o portal do cliente. Dados financeiros vem exclusivamente dos campos *_display do contexto atual; memoria nunca e fonte financeira. current_contract e o contrato da parcela prioritaria. Nunca transforme R$ 1,30 em R$ 1.300,00 nem R$ 2,59 em R$ 2.590,00. Nao invente valores, datas, contratos, atrasos, pagamentos ou links. Se a pessoa discordar, encaminhe ao operador. Nao ofereca emprestimo. Continue a conversa sem mencionar que houve falha ou troca de IA. Se a mensagem for informal ou ambigua, responda de forma humana e faca uma unica pergunta curta para entender a necessidade. Quando houver contexto identificado, conduza naturalmente para o contrato, parcela, vencimento ou portal do cliente; quando nao houver identificacao, peca CPF ou codigo do cliente. Nunca envie link direto de pagamento externo.';
      node.onError = 'continueErrorOutput';
    }
    if (node.name === 'WAHA1') {
      node.name = 'Send WhatsApp Reply';
      node.type = 'n8n-nodes-base.httpRequest';
      node.typeVersion = 4.2;
      delete node.credentials;
      node.parameters = {
        method: 'POST',
        url: 'http://waha:3000/api/sendText',
        sendBody: true,
        contentType: 'raw',
        rawContentType: 'application/json',
        body: '={{ JSON.stringify({ session: $("Normalize and Filter").item.json.whatsapp_session, chatId: $("Normalize and Filter").item.json.remote_jid, text: $json.reply }) }}',
        options: { timeout: 15000 },
      };
      node.onError = 'continueRegularOutput';
    }
    return node;
  });
workflow.nodes.push(normalizeNode, adminCommandNode, adminGateNode, adminReplyNode);
workflow.nodes.push(deduplicateNode);
localAiRequestNode.parameters.body = localAiRequestNode.parameters.body.replace(
  'content: "Converse em portugues',
  'content: "/no_think\\nConverse em portugues. Nunca exponha raciocinio interno ou tags think. ',
);
workflow.nodes.push(conventionalGateNode, localAiRequestNode, localAiNormalizeNode);
const primaryAgent = workflow.nodes.find((node) => node.name === 'AI Agent');
if (!primaryAgent) throw new Error('Nó AI Agent não encontrado.');
const fallbackAgent = JSON.parse(JSON.stringify(primaryAgent));
fallbackAgent.id = 'capitalflow-groq-fallback-agent';
fallbackAgent.name = 'Groq Fallback Agent';
fallbackAgent.position = [1780, 420];
fallbackAgent.onError = 'continueErrorOutput';
fallbackAgent.parameters.text = '={{ "Mensagem do cliente: " + $("Normalize and Filter").item.json.message + "\\nContexto seguro: " + JSON.stringify($("Admin Command").item.json) }}';
fallbackAgent.parameters.options = { systemMessage: farewellInstruction + ' Assuma esta conversa de forma humana e natural, sem dizer que e fallback ou que outra IA falhou. Responda ao que a pessoa quis dizer, mesmo que seja informal. Se ainda faltar informacao, faca uma unica pergunta objetiva. Use o contexto seguro para conduzir a pessoa ao contrato, parcela, vencimento, valor atualizado ou portal do cliente; se nao estiver identificada, peca CPF ou codigo. Nao invente dados, nao ofereca emprestimo, nao envie link direto de pagamento externo e nao use menus engessados.' };
workflow.nodes.push(
  googleModelNode,
  semanticGate('Gemini Semantic Gate', 'capitalflow-gemini-semantic-gate', [1670, 300]),
  fallbackAgent,
  semanticGate('Groq Semantic Gate', 'capitalflow-groq-semantic-gate', [1890, 420]),
  conventionalFallbackNode,
  outputGuardNode,
);

const memoryConnections = workflow.connections['Redis Chat Memory'];
if (memoryConnections?.ai_memory?.[0]) {
  memoryConnections.ai_memory[0] = [
    { node: 'AI Agent', type: 'ai_memory', index: 0 },
    { node: 'Groq Fallback Agent', type: 'ai_memory', index: 0 },
  ];
}

workflow.connections = {
  Webhook: { main: [[{ node: 'Normalize and Filter', type: 'main', index: 0 }]] },
  'Normalize and Filter': { main: [[{ node: 'Admin Command', type: 'main', index: 0 }]] },
  'Admin Command': { main: [[{ node: 'Admin Gate', type: 'main', index: 0 }]] },
  'Admin Gate': { main: [[{ node: 'Admin Reply', type: 'main', index: 0 }], [{ node: 'Drop Duplicates', type: 'main', index: 0 }]] },
  'Admin Reply': { main: [[{ node: 'Send WhatsApp Reply', type: 'main', index: 0 }]] },
  'Drop Duplicates': { main: [[{ node: 'Conventional Bot Fallback', type: 'main', index: 0 }]] },
  'Conventional Bot Fallback': { main: [[{ node: 'Conventional Gate', type: 'main', index: 0 }]] },
  'Conventional Gate': { main: [[{ node: 'Output Guard', type: 'main', index: 0 }], [{ node: 'Local AI Request', type: 'main', index: 0 }]] },
  'Local AI Request': { main: [[{ node: 'Local AI Normalize', type: 'main', index: 0 }], [{ node: 'AI Agent', type: 'main', index: 0 }]] },
  'Local AI Normalize': { main: [[{ node: 'Output Guard', type: 'main', index: 0 }], [{ node: 'AI Agent', type: 'main', index: 0 }]] },
  'Redis Chat Memory': memoryConnections,
  'Google Gemini Chat Model': { ai_languageModel: [[{ node: 'AI Agent', type: 'ai_languageModel', index: 0 }]] },
  'Groq Chat Model': { ai_languageModel: [[{ node: 'Groq Fallback Agent', type: 'ai_languageModel', index: 0 }]] },
  'AI Agent': { main: [[{ node: 'Gemini Semantic Gate', type: 'main', index: 0 }], [{ node: 'Groq Fallback Agent', type: 'main', index: 0 }]] },
  'Gemini Semantic Gate': { main: [[{ node: 'Output Guard', type: 'main', index: 0 }], [{ node: 'Groq Fallback Agent', type: 'main', index: 0 }]] },
  'Groq Fallback Agent': { main: [[{ node: 'Groq Semantic Gate', type: 'main', index: 0 }], [{ node: 'Conventional Bot Fallback', type: 'main', index: 0 }]] },
  'Groq Semantic Gate': { main: [[{ node: 'Output Guard', type: 'main', index: 0 }], [{ node: 'Conventional Bot Fallback', type: 'main', index: 0 }]] },
  'Output Guard': { main: [[{ node: 'Send WhatsApp Reply', type: 'main', index: 0 }]] },
};

delete workflow.versionId;
delete workflow.triggerCount;
delete workflow.shared;
delete workflow.tags;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify([workflow], null, 2)}\n`, 'utf8');
