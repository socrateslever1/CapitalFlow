import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.7';

const defaultOrigin = (Deno.env.get('APP_ORIGIN') || 'https://capflow.pages.dev').replace(/\/$/, '');
const allowedOrigins = new Set([
  defaultOrigin,
  'https://capflow.pages.dev',
  'https://capitalflow.app',
  'https://www.capitalflow.app',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
]);
const corsHeaders = (req: Request) => ({
  'Access-Control-Allow-Origin': allowedOrigins.has(req.headers.get('origin') || '') ? req.headers.get('origin')! : defaultOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
});

type Intent = 'READ' | 'DRAFT' | 'CONFIRM' | 'FORBIDDEN' | 'UNKNOWN';
type Provider = { id: string; kind: 'gemini' | 'openai'; model: string; baseUrl?: string; secretEnv: string };

const MAX_REQUEST_CHARS = 12_000;
const MAX_CONTEXT_CHARS = 24_000;
const json = (value: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(value), {
  status,
  headers: { ...headers, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

function classifyIntent(text: string): { intent: Intent; permissionMode: Intent } {
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/(senha|pin|cvv|cvc|numero completo|token|chave secreta|api key)/.test(normalized)) return { intent: 'FORBIDDEN', permissionMode: 'FORBIDDEN' };
  if (/(pague|pagar|baixe|dar baixa|estorne|cancele|altere meu saldo|crie uma compra|grave o gasto|registre o gasto)/.test(normalized)) return { intent: 'CONFIRM', permissionMode: 'CONFIRM' };
  if (/(registre|anote|rascunho|prepare|separe|classifique)/.test(normalized)) return { intent: 'DRAFT', permissionMode: 'DRAFT' };
  if (/(quanto|qual|quais|quando|vence|saldo|fatura|cartao|conta|extrato|gasto|compromisso|notificacao)/.test(normalized)) return { intent: 'READ', permissionMode: 'READ' };
  return { intent: 'UNKNOWN', permissionMode: 'READ' };
}

function parseProviders(): Provider[] {
  const configured = Deno.env.get('AI_PROVIDER_POOL_JSON');
  if (configured) {
    try {
      const parsed = JSON.parse(configured);
      if (Array.isArray(parsed)) {
        const valid = parsed.filter((item): item is Provider => item && typeof item.id === 'string' && (item.kind === 'gemini' || item.kind === 'openai') && typeof item.model === 'string' && typeof item.secretEnv === 'string');
        if (valid.length) return valid;
      }
    } catch { console.error('[ai-assistant] invalid_provider_pool'); }
  }
  return [{ id: 'gemini-default', kind: 'gemini', model: Deno.env.get('GEMINI_MODEL') || 'gemini-3.8-flash', secretEnv: 'GEMINI_API_KEY' }];
}

async function loadContext(client: ReturnType<typeof createClient>, profileId: string) {
  const [accounts, cards, payables, sources, loans, clientsCount] = await Promise.all([
    client.from('personal_wallet_accounts').select('nickname,bank_name,balance,account_type').eq('owner_user_id', profileId).order('nickname').limit(30),
    client.from('personal_wallet_cards').select('nickname,issuer,current_bill,credit_limit,used_limit,due_day,status').eq('owner_user_id', profileId).order('nickname').limit(30),
    client.from('personal_wallet_payables').select('creditor_name,description,outstanding_balance,due_date,status').eq('owner_user_id', profileId).not('status', 'in', '(PAID,CANCELED)').order('due_date').limit(30),
    client.from('fontes').select('name,balance,type').eq('profile_id', profileId).is('archived_at', null).order('name').limit(30),
    client.from('contratos').select('id,debtor_name,principal,total_to_receive,status,is_archived,parcelas(status,amount,paid_total,data_vencimento,due_date,principal_remaining,interest_remaining)').eq('owner_id', profileId).limit(100),
    client.from('clientes').select('id', { count: 'exact', head: true }).eq('owner_id', profileId),
  ]);
  return {
    accounts: accounts.error ? [] : accounts.data || [],
    cards: cards.error ? [] : cards.data || [],
    payables: payables.error ? [] : payables.data || [],
    sources: sources.error ? [] : sources.data || [],
    loans: loans.error ? [] : loans.data || [],
    clientsCount: clientsCount.error ? 0 : clientsCount.count || 0,
  };
}

type AssistantContext = Awaited<ReturnType<typeof loadContext>>;

function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number.isFinite(value) ? value : 0);
}

function summarizeCapitalFlowMetrics(context: AssistantContext) {
  const today = new Date().toISOString().slice(0, 10);
  const sourcesTotal = context.sources.reduce((sum, s) => sum + Number(s.balance || 0), 0);
  const walletAccountsTotal = context.accounts.reduce((sum, a) => sum + Number(a.balance || 0), 0);
  const cardsBillTotal = context.cards.reduce((sum, c) => sum + Number(c.current_bill || 0), 0);
  const payablesTotal = context.payables.reduce((sum, p) => sum + Number(p.outstanding_balance || 0), 0);

  const activeLoans = context.loans.filter(l => !l.is_archived && String(l.status || '').toUpperCase() !== 'PAID');
  let principalTotal = 0;
  let totalReceivable = 0;
  let overdueInstallments = 0;
  let overdueAmount = 0;
  let pendingInstallments = 0;

  for (const loan of activeLoans) {
    principalTotal += Number(loan.principal || 0);
    const parcelas = Array.isArray(loan.parcelas) ? (loan.parcelas as Array<Record<string, unknown>>) : [];
    if (parcelas.length === 0) {
      totalReceivable += Number(loan.total_to_receive || 0);
      continue;
    }
    for (const p of parcelas) {
      const st = String(p.status || '').toUpperCase();
      if (st === 'PAID') continue;
      pendingInstallments += 1;
      const remPrincipal = Number(p.principal_remaining ?? 0);
      const remInterest = Number(p.interest_remaining ?? 0);
      const fallbackRem = Math.max(0, Number(p.amount || 0) - Number(p.paid_total || 0));
      const openVal = remPrincipal + remInterest > 0 ? remPrincipal + remInterest : fallbackRem;
      totalReceivable += openVal;
      const dueRaw = String(p.data_vencimento || p.due_date || '').slice(0, 10);
      if (st === 'LATE' || (dueRaw && dueRaw < today)) {
        overdueInstallments += 1;
        overdueAmount += openVal;
      }
    }
  }

  return {
    sourcesTotal,
    walletAccountsTotal,
    cardsBillTotal,
    payablesTotal,
    activeLoansCount: activeLoans.length,
    totalLoansCount: context.loans.length,
    principalTotal,
    totalReceivable,
    overdueInstallments,
    overdueAmount,
    pendingInstallments,
    clientsCount: context.clientsCount,
  };
}

function buildBriefing(context: AssistantContext) {
  const alerts: Array<{ kind: 'balance' | 'payable'; severity: 'attention' | 'warning'; text: string }> = [];
  for (const account of context.accounts) {
    const balance = Number(account.balance);
    if (Number.isFinite(balance) && balance <= 0) {
      alerts.push({ kind: 'balance', severity: 'attention', text: `${String(account.nickname || account.bank_name || 'Conta')} está sem saldo registrado.` });
    }
  }
  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date(`${today}T00:00:00Z`);
  horizon.setUTCDate(horizon.getUTCDate() + 7);
  for (const payable of context.payables) {
    const dueDate = typeof payable.due_date === 'string' ? payable.due_date.slice(0, 10) : '';
    const outstanding = Number(payable.outstanding_balance);
    if (!dueDate || !Number.isFinite(outstanding) || outstanding <= 0) continue;
    const due = new Date(`${dueDate}T00:00:00Z`);
    if (Number.isNaN(due.getTime()) || due > horizon) continue;
    const label = String(payable.description || payable.creditor_name || 'Compromisso');
    const amount = formatBRL(outstanding);
    alerts.push({ kind: 'payable', severity: dueDate < today ? 'attention' : 'warning', text: `${label}: ${amount} com vencimento em ${dueDate.split('-').reverse().join('/')}.` });
  }
  return alerts.slice(0, 4);
}

function isGreeting(text: string): boolean {
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[?!.,]+/g, '').trim();
  if (normalized.length > 28) return false;
  return /^(oi|ola|e ai|e aew|eai|opa|fala|bom dia|boa tarde|boa noite|tudo bem|como vai|ola tudo bem|oi tudo bem|flux|quem e voce|o que voce faz)$/i.test(normalized);
}

function buildFullDiagnosticText(context: AssistantContext): string {
  const m = summarizeCapitalFlowMetrics(context);
  const healthStatus = m.overdueInstallments === 0
    ? 'Saudável (sem parcelas em atraso)'
    : m.overdueInstallments <= 2
      ? `Atenção (${m.overdueInstallments} parcela(s) em atraso: ${formatBRL(m.overdueAmount)})`
      : `Alerta de inadimplência (${m.overdueInstallments} parcelas em atraso somando ${formatBRL(m.overdueAmount)})`;

  const lines: string[] = [
    `Diagnóstico completo da sua conta e do CapitalFlow:`,
    `• Status da operação: ${healthStatus}`,
    `• Fontes de Capital (${context.sources.length}): ${formatBRL(m.sourcesTotal)} disponíveis`,
    `• Contratos ativos: ${m.activeLoansCount} (Capital alocado: ${formatBRL(m.principalTotal)} | A receber: ${formatBRL(m.totalReceivable)})`,
    `• Clientes cadastrados: ${m.clientsCount}`,
    `• Minha Carteira (${context.accounts.length} conta(s)): ${formatBRL(m.walletAccountsTotal)}`,
  ];
  if (context.cards.length > 0 || m.cardsBillTotal > 0) {
    lines.push(`• Faturas de cartões (${context.cards.length}): ${formatBRL(m.cardsBillTotal)}`);
  }
  if (context.payables.length > 0 || m.payablesTotal > 0) {
    lines.push(`• Compromissos a pagar (${context.payables.length}): ${formatBRL(m.payablesTotal)}`);
  }
  return lines.join('\n');
}

function generateDeterministicContextResponse(prompt: string, context: AssistantContext): string {
  const normalized = prompt.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  // 1. Diagnóstico, saúde do CapitalFlow, visão geral ou perguntas amplas sobre o sistema
  if (/(diagnostico|capitalflow|capital flow|estabom|esta bom|ta bom|como esta|saude|resumo|visao geral|panorama|analise|avaliacao|relatorio|situacao)/.test(normalized)) {
    return buildFullDiagnosticText(context);
  }

  // 2. Empréstimos, contratos, parcelas, recebíveis ou clientes
  if (/(contrato|contratos|emprestimo|emprestimos|parcela|parcelas|inadimplen|atraso|atrasad|receber|clientes|carteira de credito|lucro|juros)/.test(normalized)) {
    const m = summarizeCapitalFlowMetrics(context);
    return [
      `Resumo da operação de crédito no CapitalFlow:`,
      `• Contratos ativos: ${m.activeLoansCount} (de ${m.totalLoansCount} registrados)`,
      `• Capital principal ativo: ${formatBRL(m.principalTotal)}`,
      `• Total em aberto a receber: ${formatBRL(m.totalReceivable)} (${m.pendingInstallments} parcela(s) em aberto)`,
      `• Parcelas em atraso: ${m.overdueInstallments} (${formatBRL(m.overdueAmount)})`,
      `• Clientes cadastrados: ${m.clientsCount}`,
    ].join('\n');
  }

  // 3. Fontes de capital
  if (/(fonte|fontes|caixa livre|capital disponivel)/.test(normalized)) {
    if (!context.sources.length) return 'Não há fontes de capital ativas cadastradas no momento.';
    const m = summarizeCapitalFlowMetrics(context);
    const lines = context.sources.slice(0, 10).map(s => `• ${String(s.name || 'Fonte')}: ${formatBRL(Number(s.balance || 0))}`);
    return `Fontes de Capital no CapitalFlow (Total: ${formatBRL(m.sourcesTotal)}):\n${lines.join('\n')}`;
  }

  // 4. Saldo e contas bancárias
  if (/(saldo|conta|contas|dinheiro|extrato|banco)/.test(normalized)) {
    const m = summarizeCapitalFlowMetrics(context);
    const parts: string[] = [];
    if (context.accounts.length) {
      const accLines = context.accounts.map(acc => `• ${String(acc.nickname || acc.bank_name || 'Conta')}: ${formatBRL(Number(acc.balance || 0))}`);
      parts.push(`Contas da Minha Carteira (Total: ${formatBRL(m.walletAccountsTotal)}):\n${accLines.join('\n')}`);
    } else {
      parts.push('Minha Carteira: nenhuma conta bancária com saldo registrado.');
    }
    if (context.sources.length) {
      const srcLines = context.sources.slice(0, 6).map(s => `• ${String(s.name || 'Fonte')}: ${formatBRL(Number(s.balance || 0))}`);
      parts.push(`Fontes do CapitalFlow (Total: ${formatBRL(m.sourcesTotal)}):\n${srcLines.join('\n')}`);
    }
    return parts.join('\n\n');
  }

  // 5. Cartões e faturas
  if (/(fatura|cartao|cartoes|limite)/.test(normalized)) {
    if (!context.cards.length) return 'Não há cartões cadastrados na sua carteira.';
    const lines = context.cards.map(c => {
      const name = String(c.nickname || c.issuer || 'Cartão');
      const bill = Number(c.current_bill || 0);
      const limit = Number(c.credit_limit || 0);
      return `• ${name}: Fatura atual ${formatBRL(bill)} (Limite: ${formatBRL(limit)})`;
    });
    return `Resumo dos seus cartões de crédito:\n${lines.join('\n')}`;
  }

  // 6. Compromissos e contas a pagar
  if (/(vence|vencimento|compromisso|divida|pagar|contas a pagar|boleto)/.test(normalized)) {
    if (!context.payables.length) return 'Não constam compromissos pendentes no momento.';
    const lines = context.payables.slice(0, 5).map(p => {
      const name = String(p.description || p.creditor_name || 'Compromisso');
      const val = Number(p.outstanding_balance || 0);
      const due = String(p.due_date || '').slice(0, 10).split('-').reverse().join('/');
      return `• ${name}: ${formatBRL(val)} (vencimento: ${due || 'não informado'})`;
    });
    return `Próximos compromissos registrados:\n${lines.join('\n')}`;
  }

  // 7. Qualquer outra pergunta recebe o diagnóstico consolidado em vez de repetir saudação em loop
  return buildFullDiagnosticText(context);
}

function buildSystemInstruction(intent: Intent, context: unknown) {
  const compactContext = JSON.stringify(context).slice(0, MAX_CONTEXT_CHARS);
  return [
    'Você é o mascote interno do CapitalFlow e conversa somente com o perfil master.',
    'Responda em português do Brasil, com texto curto, natural e objetivo.',
    'Use exclusivamente o contexto fornecido. Se não houver dado, diga que não encontrou.',
    'Nunca invente saldo, valor, data, fatura, cliente ou lançamento.',
    'Não exponha tokens, senhas, PIN, CVV, CVC ou número completo de cartão.',
    'Não execute mutações financeiras. Para qualquer pagamento, estorno, alteração ou gravação, explique que será necessário confirmar em uma tela segura.',
    `Classificação desta solicitação: ${intent}.`,
    `Contexto canônico atual: ${compactContext}`,
  ].join('\n');
}

async function callProvider(provider: Provider, prompt: string, systemInstruction: string) {
  const apiKey = Deno.env.get(provider.secretEnv) || Deno.env.get('GEMINI_API_KEY') || Deno.env.get('GOOGLE_API_KEY');
  if (!apiKey) throw new Error('MISSING_PROVIDER_KEY');
  if (provider.kind === 'gemini') {
    const candidateModels = Array.from(new Set([provider.model, 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash']));
    const basePayload = { systemInstruction: { parts: [{ text: systemInstruction }] }, contents: [{ role: 'user', parts: [{ text: prompt }] }] };
    const payloads = [
      { ...basePayload, generationConfig: { maxOutputTokens: 900 } },
      { ...basePayload, generationConfig: { maxOutputTokens: 900, thinkingConfig: { thinkingLevel: 'low' } } },
    ];
    let lastProviderError = 'PROVIDER_UNAVAILABLE';
    for (const modelName of candidateModels) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent`;
      for (const requestPayload of payloads) {
        const response = await fetch(endpoint, {
          method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify(requestPayload),
          signal: AbortSignal.timeout(25_000),
        });
        if (!response.ok) {
          const errorBody = await response.text();
          let providerMessage = '';
          try {
            const parsed = JSON.parse(errorBody);
            providerMessage = typeof parsed?.error?.message === 'string' ? parsed.error.message : '';
          } catch { /* mantém o erro genérico */ }
          lastProviderError = `PROVIDER_${response.status}${providerMessage ? `:${providerMessage.slice(0, 120)}` : ''}`;
          if (response.status === 404) break; // tenta próximo modelo candidato
          if (response.status !== 400) break;
          continue;
        }
        const payload = await response.json();
        const text = payload?.candidates?.[0]?.content?.parts?.map((part: { text?: unknown }) => typeof part.text === 'string' ? part.text : '').join('');
        if (!text) {
          lastProviderError = 'EMPTY_PROVIDER_RESPONSE';
          continue;
        }
        return text;
      }
    }
    throw new Error(lastProviderError);
  }
  const baseUrl = (provider.baseUrl || '').replace(/\/$/, '');
  if (!baseUrl) throw new Error('MISSING_PROVIDER_URL');
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: provider.model, temperature: 0.2, max_tokens: 900, messages: [{ role: 'system', content: systemInstruction }, { role: 'user', content: prompt }] }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) throw new Error(`PROVIDER_${response.status}`);
  const payload = await response.json();
  const text = payload?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw new Error('EMPTY_PROVIDER_RESPONSE');
  return text;
}

Deno.serve(async (req) => {
  const responseHeaders = corsHeaders(req);
  const respond = (value: unknown, status = 200) => json(value, status, responseHeaders);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: responseHeaders });
  if (req.method !== 'POST') return respond({ error: 'Método não permitido.' }, 405);
  const authorization = req.headers.get('authorization') || '';
  if (!/^Bearer\s+[^\s]+$/i.test(authorization)) return respond({ error: 'Autenticação necessária.' }, 401);
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) return respond({ error: 'Serviço indisponível.' }, 503);
  const token = authorization.replace(/^Bearer\s+/i, '');
  const client = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: auth, error: authError } = await client.auth.getUser(token);
  if (authError || !auth.user) return respond({ error: 'Sessão inválida.' }, 401);
  const { data: isMaster, error: masterError } = await client.rpc('is_platform_super_admin');
  if (masterError || isMaster !== true) return respond({ error: 'Mascote disponível somente para o perfil master.' }, 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return respond({ error: 'Solicitação inválida.' }, 400); }
  const action = body.action === 'history' ? 'history' : body.action === 'briefing' ? 'briefing' : 'message';
  const requestedConversationId = typeof body.conversationId === 'string' && body.conversationId ? body.conversationId : null;
  if (action === 'history') {
    let historyQuery = client.from('ai_assistant_requests')
      .select('id,conversation_id,request_id,request_text,response_text,intent,permission_mode,status,provider,model,created_at')
      .eq('profile_id', auth.user.id);
    if (requestedConversationId) historyQuery = historyQuery.eq('conversation_id', requestedConversationId);
    const history = await historyQuery.order('created_at', { ascending: true }).limit(50);
    if (history.error) return respond({ error: 'Não foi possível carregar o histórico.' }, 500);
    return respond({ conversationId: requestedConversationId, history: history.data || [] });
  }
  if (action === 'briefing') {
    const context = await loadContext(client, auth.user.id);
    return respond({ alerts: buildBriefing(context), generatedAt: new Date().toISOString() });
  }
  const prompt = typeof body.message === 'string' ? body.message.trim() : '';
  if (!prompt || prompt.length > MAX_REQUEST_CHARS) return respond({ error: 'Mensagem vazia ou extensa demais.' }, 400);
  const requestId = typeof body.requestId === 'string' && body.requestId ? body.requestId : crypto.randomUUID();
  const conversationId = typeof body.conversationId === 'string' && body.conversationId ? body.conversationId : crypto.randomUUID();
  const classification = classifyIntent(prompt);
  const insert = await client.from('ai_assistant_requests').insert({ profile_id: auth.user.id, conversation_id: conversationId, request_id: requestId, request_text: prompt, intent: classification.intent, permission_mode: classification.permissionMode, status: classification.permissionMode === 'CONFIRM' ? 'CONFIRMATION_REQUIRED' : 'RECEIVED' }).select('id').single();
  if (insert.error && !String(insert.error.message).toLowerCase().includes('duplicate')) return respond({ error: 'Não foi possível registrar a solicitação.' }, 500);

  if (classification.intent === 'FORBIDDEN') {
    const responseText = 'Não posso processar dados secretos ou credenciais. Posso ajudar com informações financeiras sem expor esses dados.';
    await client.from('ai_assistant_requests').update({ response_text: responseText, status: 'RESPONDED', updated_at: new Date().toISOString() }).eq('profile_id', auth.user.id).eq('request_id', requestId);
    return respond({ requestId, conversationId, intent: classification.intent, permissionMode: classification.permissionMode, response: responseText });
  }
  if (classification.permissionMode === 'CONFIRM') {
    const responseText = 'Posso preparar essa operação, mas a gravação exige confirmação explícita na tela segura do CapitalFlow.';
    await client.from('ai_assistant_requests').update({ response_text: responseText, status: 'CONFIRMATION_REQUIRED', updated_at: new Date().toISOString() }).eq('profile_id', auth.user.id).eq('request_id', requestId);
    return respond({ requestId, conversationId, intent: classification.intent, permissionMode: classification.permissionMode, response: responseText });
  }

  const context = await loadContext(client, auth.user.id);

  if (isGreeting(prompt)) {
    const greetingText = 'Olá! Sou o Flux, assistente master do CapitalFlow. Posso te ajudar com saldos de contas, faturas de cartões, próximos compromissos e orientações financeiras. O que deseja consultar?';
    await client.from('ai_assistant_requests').update({ response_text: greetingText, status: 'RESPONDED', provider: 'flux-assistant', model: 'greeting-v1', updated_at: new Date().toISOString() }).eq('profile_id', auth.user.id).eq('request_id', requestId);
    return respond({ requestId, conversationId, intent: 'READ', permissionMode: 'READ', provider: 'flux-assistant', model: 'greeting-v1', response: greetingText });
  }

  const systemInstruction = buildSystemInstruction(classification.intent, context);
  let lastError = 'NO_PROVIDER_AVAILABLE';
  for (const provider of parseProviders()) {
    try {
      const responseText = await callProvider(provider, prompt, systemInstruction);
      await client.from('ai_assistant_requests').update({ response_text: responseText, status: 'RESPONDED', provider: provider.id, model: provider.model, metadata: { context_version: 'wallet-v1' }, updated_at: new Date().toISOString() }).eq('profile_id', auth.user.id).eq('request_id', requestId);
      return respond({ requestId, conversationId, intent: classification.intent, permissionMode: classification.permissionMode, provider: provider.id, model: provider.model, response: responseText });
    } catch (error) {
      lastError = error instanceof Error ? error.message.slice(0, 80) : 'PROVIDER_FAILURE';
      console.error('[ai-assistant]', JSON.stringify({ event: 'provider_failed', provider: provider.id, reason: lastError }));
    }
  }

  // Fallback analítico determinístico seguro com os dados canônicos do usuário
  const fallbackAnswer = generateDeterministicContextResponse(prompt, context);
  await client.from('ai_assistant_requests').update({ response_text: fallbackAnswer, status: 'RESPONDED', provider: 'flux-local', model: 'deterministic-v1', metadata: { context_version: 'wallet-v1', provider_last_error: lastError }, updated_at: new Date().toISOString() }).eq('profile_id', auth.user.id).eq('request_id', requestId);
  return respond({ requestId, conversationId, intent: classification.intent, permissionMode: classification.permissionMode, provider: 'flux-local', model: 'deterministic-v1', response: fallbackAnswer });
});
