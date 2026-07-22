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
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
      conditions: [{ id: 'capitalflow-admin-handled', leftValue: '={{ String($json.handled) }}', rightValue: 'true', operator: { type: 'string', operation: 'equals', name: 'filter.operator.equals' } }],
      combinator: 'and',
    },
    options: {},
  },
  id: 'capitalflow-admin-gate',
  name: 'Admin Gate',
  type: 'n8n-nodes-base.if',
  typeVersion: 2.2,
  position: [-170, -160],
};

const adminReplyNode = {
  parameters: { jsCode: 'return [{ json: { reply: String($json.reply || "Comando administrativo processado.").slice(0, 1800) } }];' },
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
    body: '={{ JSON.stringify({ model: $env.CAPITALFLOW_LOCAL_AI_MODEL || "qwen3-4b-instruct", messages: [{ role: "system", content: "Converse em portugues como um atendente humano, direto e natural. Responda em no maximo duas frases, salvo quando precisar incluir um link. Dados financeiros devem vir exclusivamente dos campos *_display do contexto atual; memoria de conversa nunca e fonte financeira. Nunca converta 1,30 em 1.300 nem 2,59 em 2.590. Nao invente valores, datas, atrasos ou links. Para consulta financeira sem identificacao, peca CPF ou codigo uma unica vez e explique o motivo em uma frase. A pessoa pode encerrar, reiniciar ou trocar de cliente quando quiser. Emprestimo so entra na conversa se a pessoa pedir; nesse caso, encaminhe ao operador sem prometer aprovacao. Se houver divida, converse e ofereca ajuda para pagar apenas quando isso fizer sentido. Preserve privacidade, nao ameace nem constranja e nao revele detalhes internos do sistema." }, { role: "user", content: "Mensagem do cliente: " + $("Normalize and Filter").item.json.message + "\\nContexto disponivel: " + JSON.stringify($("Admin Command").item.json) }], temperature: 0.25, max_tokens: 260, stream: false }) }}',
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

const semanticFailure = (value) => {\n  const normalized = String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();\n  return /\bnao entendi\b|\bnao compreendi\b|\bnao consegui entender\b|\bnao consegui identificar\b|\bnao foi possivel entender\b|\bexplique melhor sua (mensagem|solicitacao)\b|\breformule sua (mensagem|solicitacao)\b/.test(normalized);\n};\n\nif (!reply || /<think>/i.test(reply) || semanticFailure(reply)) {
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
const operatorUrl = context.operator_contact?.whatsapp_url || "";
const money = (value) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (value) => {
  if (!value) return "";
  const parts = String(value).slice(0, 10).split("-");
  return parts.length === 3 ? parts[2] + "/" + parts[1] + "/" + parts[0] : String(value);
};
const withOperator = (text) => operatorUrl ? text + " Fale com o operador por aqui: " + operatorUrl : text;
let output = "Olá! Como posso ajudar?";

if (context.status === "session_ended") {
  output = "Conversa encerrada. Na próxima mensagem, você poderá se identificar como outro cliente.";
} else if (context.status === "ambiguous") {
  output = "Encontrei mais de um cadastro compatível. Para confirmar com segurança, informe seu código de cliente.";
} else if (context.status === "lead_registered") {
  output = withOperator("Entendi seu interesse. A análise e as condições são tratadas diretamente pelo operador, sem promessa de aprovação.");
} else if (context.status === "prospective_client") {
  output = withOperator("Claro. O cadastro e o funcionamento do serviço são explicados diretamente pelo operador, sem compromisso.");
} else if (context.status === "proof_received") {
  output = "Recebi seu comprovante. O pagamento será conferido antes da confirmação da baixa.";
} else if (context.status === "human_handoff_registered") {
  output = withOperator("Certo, seu atendimento foi encaminhado para uma pessoa.");
} else if (context.status === "amount_disputed") {
  output = withOperator("Entendo. O valor precisa ser revisado pelo operador antes de qualquer pagamento.");
} else if (context.status === "not_identified") {
  const financial = /contrato|parcela|venc|atras|d[ií]vida|valor|pagar|pagamento|portal|saldo/.test(message);
  const wantsOperator = /cliente|cadastro|empr[eé]stimo|cr[eé]dito|atendente|operador/.test(message);
  if (financial) output = "Para consultar dados financeiros com segurança, informe seu CPF ou código de cliente.";
  else if (wantsOperator) output = withOperator("O cadastro, a análise e as condições são tratados pelo operador.");
  else output = "Olá! Posso explicar como funciona o atendimento ou ajudar clientes identificados a consultar contratos, parcelas e pagamentos.";
} else if (context.status === "identified") {
  const pending = Array.isArray(context.pending) ? context.pending : [];
  const first = pending[0];
  if (context.payment_link) {
    output = "Aqui está o link para pagar o valor atualizado hoje: " + context.payment_link;
  } else if (context.payment_requested && first) {
    output = withOperator("Não consegui gerar o link de pagamento agora. O valor atualizado é " + money(first.total_due) + ".");
  } else if (/portal/.test(message) && context.portal_link) {
    output = "Você pode acessar seu portal por aqui: " + context.portal_link;
  } else if (first) {
    const late = Number(first.days_late || 0);
    output = "A parcela " + (first.installment_number || "pendente") + " vence em " + date(first.due_date) +
      " e o valor atualizado é " + money(first.total_due) + ".";
    if (late > 0) output += " Ela está em atraso há " + late + (late === 1 ? " dia." : " dias.");
    output += " Deseja receber o link para pagamento?";
  } else if (/portal/.test(message) && !context.portal_link) {
    output = withOperator("O link do portal não está disponível agora.");
  } else {
    output = "Não encontrei parcelas pendentes no momento. Como mais posso ajudar?";
  }
}

return [{ json: { output, conventional_fallback: true } }];`,
  },
  id: 'capitalflow-conventional-fallback',
  name: 'Conventional Bot Fallback',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [2020, 560],
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
const asksContractValue = /\\b(valor|quanto|total|saldo)\\b[\\s\\S]*\\b(contrato|parcela|d.?vida|devo)\\b|\\b(contrato|parcela|d.?vida)\\b[\\s\\S]*\\b(valor|quanto|total|saldo)\\b/i.test(customerMessage);
let reply = raw;
const normalizedCustomerMessage = customerMessage.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const asksLoan = /\bemprestimo\b|\bemprestar\b|\bme empresta\b|\bcredito\b/.test(normalizedCustomerMessage);
const asksPayment = /\bpagar\b|\bpagamento\b|\bquitar\b|\bpix\b|\blink\b/.test(normalizedCustomerMessage) && !/\bnao\b|\bdepois\b|\bagora nao\b/.test(normalizedCustomerMessage);
const asksDebtStatus = /\bd[iÃ­]vida\b|\bparcela\b|\bvenc(e|imento)\b|\batras(o|ada)\b|\bjuros\b/.test(normalizedCustomerMessage);
const isAffirmative = /^(sim|isso|quero|pode|me ajuda|pode ser|manda|envia|ok|certo)\b/.test(normalizedCustomerMessage);\nconst asksInterestOnly = /\bjuros\b/.test(normalizedCustomerMessage) && !/\b(total|parcela|divida|pagamento|pagar tudo)\b/.test(normalizedCustomerMessage);\nconst identityDigits = customerMessage.replace(/\D/g, "");\nconst isIdentityMessage = identityDigits.length === 11 || /^[a-z0-9-]{3,30}$/i.test(customerMessage.trim()) && /\d/.test(customerMessage);
const formatDate = (value) => { const parts = String(value || "").slice(0, 10).split("-"); return parts.length === 3 ? parts[2] + "/" + parts[1] + "/" + parts[0] : String(value || ""); };
if (context.status === "lead_registered") {
  reply = context.operator_contact?.whatsapp_url
    ? "Entendi que vocÃª quer um novo emprÃ©stimo. Vou encaminhar seu pedido ao operador para analisar com vocÃª, sem promessa de aprovaÃ§Ã£o. Fale com ele aqui: " + context.operator_contact.whatsapp_url
    : "Entendi que vocÃª quer um novo emprÃ©stimo. Registrei seu pedido para o operador analisar com vocÃª, sem promessa de aprovaÃ§Ã£o.";
} else if (context.status === "identified" && asksLoan) {
  reply = context.operator_contact?.whatsapp_url
    ? "Entendi. Para um novo emprÃ©stimo, o operador precisa conversar com vocÃª e avaliar as condiÃ§Ãµes. Fale com ele aqui: " + context.operator_contact.whatsapp_url
    : "Entendi. Para um novo emprÃ©stimo, o operador precisa conversar com vocÃª e avaliar as condiÃ§Ãµes.";
} else if (context.status === "identified" && isIdentityMessage && pendingInstallment) {
  reply = "Cliente identificado. Para ver mais detalhes e acessar o pagamento atualizado, veja aqui: " + (context.payment_link || context.portal_link || "o portal do cliente");
} else if (context.status === "identified" && asksInterestOnly) {
  reply = context.operator_contact?.whatsapp_url
    ? "O pagamento de juros isoladamente precisa ser tratado pelo atendimento humano. Fale por aqui: " + context.operator_contact.whatsapp_url
    : "O pagamento de juros isoladamente precisa ser tratado pelo atendimento humano.";
} else if (context.status === "identified" && (asksPayment || (isAffirmative && pendingInstallment)) && !asksInterestOnly) {
  reply = context.payment_link
    ? "Certo. Este Ã© o link atualizado para pagamento: " + context.payment_link
    : pendingInstallment
      ? "Certo. A parcela em aberto estÃ¡ atualizada em " + pendingInstallment.total_due_display + ". NÃ£o consegui gerar o link agora; posso encaminhar vocÃª ao operador para concluir o pagamento."
      : "Certo. NÃ£o encontrei parcela pendente confirmada agora. Posso consultar o operador para ajudar.";
} else if (context.status === "identified" && asksDebtStatus && pendingInstallment) {
  const late = Number(pendingInstallment.days_late || 0);
  reply = "A parcela " + (pendingInstallment.installment_number || "pendente") + " vence em " + formatDate(pendingInstallment.due_date) + " e estÃ¡ atualizada em " + pendingInstallment.total_due_display + ".";
  reply += late > 0 ? " Ela estÃ¡ em atraso hÃ¡ " + late + (late === 1 ? " dia." : " dias.") : " Ela ainda nÃ£o estÃ¡ em atraso.";
  reply += " Se quiser, posso enviar o link atualizado para pagamento.";
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
  reply = "Conversa encerrada. Na próxima mensagem, você poderá se identificar como outro cliente.";
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
          'Quando identificado, use contracts, pending, portal_link e payment_link. total_due é o valor atualizado; só existe atraso quando days_late for maior que zero.',
          'Se a pessoa quiser pagar, envie payment_link quando existir. Se não existir, ou se ela discordar do valor, encaminhe ao operator_contact sem repetir respostas prontas.',
          'Não ofereça empréstimo. Se a pessoa pedir, converse normalmente e encaminhe ao operador, sem prometer aprovação, taxa ou condição.',
          'Quem ainda não é cliente pode tirar dúvidas gerais e ser encaminhado ao operador para cadastro.',
          'Proteja a privacidade, não mostre CPF completo nem IDs internos. Não ameace, constranja, revele dívida a terceiros ou confirme pagamento sem confirmação real.',
          'Em comprovante, negociação, revisão de valor ou decisão de crédito, acolha o pedido e encaminhe ao operador quando a decisão humana for necessária.',
        ].join(' '),
      };
      node.parameters.options.systemMessage = 'Converse em portugues como um atendente humano, direto e natural. Use no maximo duas frases, salvo quando incluir um link. Dados financeiros vem exclusivamente dos campos *_display do contexto atual; memoria nunca e fonte financeira. current_contract e o contrato da parcela prioritaria. Nunca transforme R$ 1,30 em R$ 1.300,00 nem R$ 2,59 em R$ 2.590,00. Nao invente valores, datas, contratos, atrasos, pagamentos ou links. Se a pessoa discordar, encaminhe ao operador. Nao ofereca emprestimo. Continue a conversa sem mencionar que houve falha ou troca de IA. Se a mensagem for informal ou ambigua, responda de forma humana e faca uma unica pergunta curta para entender a necessidade. Quando houver contexto identificado, conduza naturalmente para o contrato, parcela, vencimento ou pagamento; quando nao houver identificacao, peca CPF ou codigo do cliente. Nunca encerre com uma resposta engessada se ainda houver uma pergunta util a fazer.';
      node.onError = 'continueErrorOutput';
    }
    if (node.name === 'WAHA1') {
      node.parameters.session = '={{ $("Normalize and Filter").item.json.whatsapp_session }}';
      node.parameters.chatId = '={{ $("Normalize and Filter").item.json.remote_jid }}';
      node.parameters.text = '={{ $json.reply }}';
    }
    return node;
  });
workflow.nodes.push(normalizeNode, adminCommandNode);
workflow.nodes.push(deduplicateNode);
localAiRequestNode.parameters.body = localAiRequestNode.parameters.body.replace(
  'content: "Converse em portugues',
  'content: "/no_think\\nConverse em portugues. Nunca exponha raciocinio interno ou tags think. ',
);
workflow.nodes.push(localAiRequestNode, localAiNormalizeNode);
const primaryAgent = workflow.nodes.find((node) => node.name === 'AI Agent');
if (!primaryAgent) throw new Error('Nó AI Agent não encontrado.');
const fallbackAgent = JSON.parse(JSON.stringify(primaryAgent));
fallbackAgent.id = 'capitalflow-groq-fallback-agent';
fallbackAgent.name = 'Groq Fallback Agent';
fallbackAgent.position = [1780, 420];
fallbackAgent.onError = 'continueErrorOutput';
fallbackAgent.parameters.text = '={{ "Mensagem do cliente: " + $("Normalize and Filter").item.json.message + "\\nContexto seguro: " + JSON.stringify($("Admin Command").item.json) }}';
fallbackAgent.parameters.options = { systemMessage: 'Assuma esta conversa de forma humana e natural, sem dizer que e fallback ou que outra IA falhou. Responda ao que a pessoa quis dizer, mesmo que seja informal. Se ainda faltar informacao, faca uma unica pergunta objetiva. Use o contexto seguro para conduzir a pessoa ao contrato, parcela, vencimento, valor atualizado ou pagamento; se nao estiver identificada, peca CPF ou codigo. Nao invente dados, nao ofereca emprestimo e nao use menus engessados.' };
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
  'Admin Command': { main: [[{ node: 'Drop Duplicates', type: 'main', index: 0 }]] },
  'Drop Duplicates': { main: [[{ node: 'Local AI Request', type: 'main', index: 0 }]] },
  'Local AI Request': { main: [[{ node: 'Local AI Normalize', type: 'main', index: 0 }], [{ node: 'AI Agent', type: 'main', index: 0 }]] },
  'Local AI Normalize': { main: [[{ node: 'Output Guard', type: 'main', index: 0 }], [{ node: 'AI Agent', type: 'main', index: 0 }]] },
  'Redis Chat Memory': memoryConnections,
  'Google Gemini Chat Model': { ai_languageModel: [[{ node: 'AI Agent', type: 'ai_languageModel', index: 0 }]] },
  'Groq Chat Model': { ai_languageModel: [[{ node: 'Groq Fallback Agent', type: 'ai_languageModel', index: 0 }]] },
  'AI Agent': { main: [[{ node: 'Gemini Semantic Gate', type: 'main', index: 0 }], [{ node: 'Groq Fallback Agent', type: 'main', index: 0 }]] },
  'Gemini Semantic Gate': { main: [[{ node: 'Output Guard', type: 'main', index: 0 }], [{ node: 'Groq Fallback Agent', type: 'main', index: 0 }]] },
  'Groq Fallback Agent': { main: [[{ node: 'Groq Semantic Gate', type: 'main', index: 0 }], [{ node: 'Conventional Bot Fallback', type: 'main', index: 0 }]] },
  'Groq Semantic Gate': { main: [[{ node: 'Output Guard', type: 'main', index: 0 }], [{ node: 'Conventional Bot Fallback', type: 'main', index: 0 }]] },
  'Conventional Bot Fallback': { main: [[{ node: 'Output Guard', type: 'main', index: 0 }]] },
  'Output Guard': { main: [[{ node: 'WAHA1', type: 'main', index: 0 }]] },
};

delete workflow.versionId;
delete workflow.triggerCount;
delete workflow.shared;
delete workflow.tags;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify([workflow], null, 2)}\n`, 'utf8');
