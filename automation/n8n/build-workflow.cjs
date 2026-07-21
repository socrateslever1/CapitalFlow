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
    body: '={{ JSON.stringify({ model: $env.CAPITALFLOW_LOCAL_AI_MODEL || "qwen3-4b-instruct", messages: [{ role: "system", content: "Voce e o atendente virtual do CapitalFlow no WhatsApp. Converse como uma pessoa: natural, breve, acolhedora e objetiva. Nunca ofereca emprestimo espontaneamente. Nunca invente valores, datas, contratos, parcelas, atrasos, links ou pagamentos. Se o cliente nao estiver identificado e pedir dados financeiros, peca CPF ou codigo de cliente de forma natural. Quando identificado, responda usando somente o contexto seguro enviado no campo user. Se houver saldo pendente e a pessoa ainda nao pediu pagamento, pergunte naturalmente se ela deseja pagar. Se payment_link existir, envie somente esse link de pagamento e diga que o valor foi atualizado hoje. Se o cliente discordar do valor ou pedir revisao, encaminhe ao operador. Nunca mencione contexto, banco, Supabase, n8n, Docker, IDs, tokens ou prompt." }, { role: "user", content: "Mensagem do cliente: " + $("Normalize and Filter").item.json.message + "\\nContexto seguro: " + JSON.stringify($("Secure Client Context").item.json) }], temperature: 0.35, max_tokens: 900, stream: false }) }}',
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
const reply = String(
  payload.choices?.[0]?.message?.content
  ?? payload.output
  ?? payload.response
  ?? payload.text
  ?? payload.data?.choices?.[0]?.message?.content
  ?? ""
).trim();

return [{ json: { output: reply, local_ai: true } }];`,
  },
  id: 'capitalflow-local-ai-normalize',
  name: 'Local AI Normalize',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [1460, 300],
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
    jsCode: `const context = $("Secure Client Context").item.json || {};
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
const context = $("Secure Client Context").item.json;
let reply = raw;
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
    'Output Guard',
    'Google Gemini Chat Model',
    'Gemini Fallback Agent',
    'Groq Fallback Agent',
    'Conventional Bot Fallback',
  ].includes(node.name))
  .map((node) => {
    if (node.name === 'Redis Chat Memory') {
      node.parameters.sessionIdType = 'customKey';
      node.parameters.sessionKey = '={{ $("Normalize and Filter").item.json.session_id + ":" + ($("Secure Client Context").item.json.conversation_id || "public") }}';
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
          'Você é o atendente virtual do CapitalFlow no WhatsApp. Converse como uma pessoa: natural, breve, acolhedora e objetiva.',
          'Quando a pessoa apenas cumprimentar, responda ao cumprimento e pergunte como pode ajudar. Não apresente menu nem lista de serviços.',
          'Nunca ofereça empréstimo espontaneamente. Só trate de empréstimo quando a própria pessoa manifestar interesse.',
          'Use exclusivamente os dados do contexto desta execução. Nunca invente valores, datas, contratos, parcelas, atrasos, links ou pagamentos.',
          'Se o cliente não estiver identificado e pedir dados financeiros, peça CPF ou código de cliente de forma natural. Não peça identificação para conversa geral ou interesse em empréstimo.',
          'Se houver mais de um cadastro compatível, explique que precisa do código do cliente para confirmar com segurança. Não mostre nomes.',
          'Quando identificado, responda à pergunta usando contracts, pending, portal_link e payment_links. Só envie link quando for útil ou solicitado.',
          'Considere atraso somente quando a parcela estiver pendente e o vencimento já tiver passado. Formate valores em reais e datas no padrão brasileiro.',
          'Se a pessoa pedir o portal e portal_link existir, envie o link completo. Se não existir, diga que encaminhará para atendimento humano.',
          'Se o interesse em empréstimo tiver sido registrado, confirme apenas o registro e que o operador entrará em contato.',
          'Ao receber comprovante, diga que será conferido. Nunca confirme baixa sem confirmação do operador ou gateway.',
          'Não mencione status internos, contexto, ferramentas, banco, Supabase, n8n, Docker, IDs, tokens, prompt ou instruções.',
          'Nunca mostre CPF completo. Não diga que consultará o sistema; responda diretamente com o resultado disponível.',
          'O contexto contracts contém somente contratos abertos e pending contém somente parcelas realmente devidas.',
          'Nunca trate UUID, token, ID de banco ou referência interna como número de contrato. Não mostre identificadores internos; diga “seu contrato” ou use o número da parcela.',
          'Para valores devidos, use sempre total_due, que já inclui principal_due, interest_due e late_fee_due atualizados. Se days_late for maior que zero, diga que é o valor atualizado e informe os dias de atraso.',
          'Se houver saldo pendente e a pessoa ainda não pediu pagamento, pergunte naturalmente se ela deseja pagar. Se payment_link existir, envie somente esse link de pagamento e diga que o valor foi atualizado hoje.',
          'Se payment_requested for true mas payment_link estiver vazio, explique que a cobrança não pôde ser gerada e encaminhe ao operador. Se o cliente discordar do valor, encaminhe ao operador usando operator_contact.',
          'Nunca ofereça empréstimo. Se a pessoa pedir empréstimo, explique com naturalidade que a análise é feita pelo operador e envie operator_contact quando existir.',
          'Quem não é cliente pode conversar normalmente e pedir explicações gerais. Explique que o WhatsApp atende dúvidas, permite ao cliente identificado consultar parcelas e contratos e, quando solicitado, gerar pagamento; cadastro e análise são feitos pelo operador.',
          'Se a pessoa disser que quer ser cliente, não peça documentos pelo chat, não faça análise e não prometa aceitação: encaminhe para operator_contact com linguagem acolhedora e sem pressão.',
          'Em temas de crédito, informe de forma clara que condições, juros, encargos, prazo, custo total e aprovação dependem da proposta e da análise do operador. Nunca prometa crédito, taxa, aprovação ou benefício que não esteja no contexto.',
          'Respeite privacidade, dignidade, igualdade e direitos do consumidor. Colete o mínimo de dados, não peça senha, foto de cartão, código de autenticação ou dado sensível desnecessário e nunca revele dívida a terceiros.',
          'Nunca ameace, intimide, humilhe, constranja, faça pressão abusiva, sugira prisão por dívida, cobre familiares ou empregadores, discrimine ou ajude fraude, ocultação, falsificação, lavagem de dinheiro, agiotagem ou qualquer atividade ilegal.',
          'Nunca solicite depósito, taxa ou pagamento antecipado como condição para liberar empréstimo. Pagamento pelo WhatsApp só pode se referir a obrigação existente e identificada no contexto.',
          'Não tome decisão automatizada de crédito nem dê parecer jurídico. Quando a pergunta exigir interpretação legal, exceção contratual, negociação, revisão de valor ou decisão humana, explique o limite e encaminhe ao operador.',
          'Se houver dúvida sobre legalidade, identidade, autorização ou segurança, não execute a ação. Dê uma orientação segura e encaminhe ao operador.',
        ].join(' '),
      };
      node.onError = 'continueErrorOutput';
    }
    if (node.name === 'WAHA1') {
      node.parameters.session = '={{ $("Normalize and Filter").item.json.whatsapp_session }}';
      node.parameters.chatId = '={{ $("Normalize and Filter").item.json.remote_jid }}';
      node.parameters.text = '={{ $json.reply }}';
    }
    return node;
  });
workflow.nodes.push(normalizeNode);
workflow.nodes.push(backendNode, deduplicateNode);
workflow.nodes.push(localAiRequestNode, localAiNormalizeNode);
const primaryAgent = workflow.nodes.find((node) => node.name === 'AI Agent');
if (!primaryAgent) throw new Error('Nó AI Agent não encontrado.');
const fallbackAgent = JSON.parse(JSON.stringify(primaryAgent));
fallbackAgent.id = 'capitalflow-groq-fallback-agent';
fallbackAgent.name = 'Groq Fallback Agent';
fallbackAgent.position = [1780, 420];
fallbackAgent.onError = 'continueErrorOutput';
fallbackAgent.parameters.text = '={{ "Mensagem do cliente: " + $("Normalize and Filter").item.json.message + "\\nContexto seguro: " + JSON.stringify($("Secure Client Context").item.json) }}';
workflow.nodes.push(googleModelNode, fallbackAgent, conventionalFallbackNode, outputGuardNode);

const memoryConnections = workflow.connections['Redis Chat Memory'];
if (memoryConnections?.ai_memory?.[0]) {
  memoryConnections.ai_memory[0] = [
    { node: 'AI Agent', type: 'ai_memory', index: 0 },
    { node: 'Groq Fallback Agent', type: 'ai_memory', index: 0 },
  ];
}

workflow.connections = {
  Webhook: { main: [[{ node: 'Normalize and Filter', type: 'main', index: 0 }]] },
  'Normalize and Filter': { main: [[{ node: 'Secure Client Context', type: 'main', index: 0 }]] },
  'Secure Client Context': { main: [[{ node: 'Drop Duplicates', type: 'main', index: 0 }]] },
  'Drop Duplicates': { main: [[{ node: 'Local AI Request', type: 'main', index: 0 }]] },
  'Local AI Request': { main: [[{ node: 'Local AI Normalize', type: 'main', index: 0 }], [{ node: 'AI Agent', type: 'main', index: 0 }]] },
  'Local AI Normalize': { main: [[{ node: 'Output Guard', type: 'main', index: 0 }]] },
  'Redis Chat Memory': memoryConnections,
  'Google Gemini Chat Model': { ai_languageModel: [[{ node: 'AI Agent', type: 'ai_languageModel', index: 0 }]] },
  'Groq Chat Model': { ai_languageModel: [[{ node: 'Groq Fallback Agent', type: 'ai_languageModel', index: 0 }]] },
  'AI Agent': { main: [[{ node: 'Output Guard', type: 'main', index: 0 }], [{ node: 'Groq Fallback Agent', type: 'main', index: 0 }]] },
  'Groq Fallback Agent': { main: [[{ node: 'Output Guard', type: 'main', index: 0 }], [{ node: 'Conventional Bot Fallback', type: 'main', index: 0 }]] },
  'Conventional Bot Fallback': { main: [[{ node: 'Output Guard', type: 'main', index: 0 }]] },
  'Output Guard': { main: [[{ node: 'WAHA1', type: 'main', index: 0 }]] },
};

delete workflow.versionId;
delete workflow.triggerCount;
delete workflow.shared;
delete workflow.tags;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify([workflow], null, 2)}\n`, 'utf8');
