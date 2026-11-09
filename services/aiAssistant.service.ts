import { supabase } from '../lib/supabase';
import type { AssistantTurn } from '../supabase/functions/ai-assistant/core';
import { describeFluxTransportFailure, readFunctionsError } from './ai/fluxTransport';

export type AssistantIntent = 'READ' | 'DRAFT' | 'CONFIRM' | 'FORBIDDEN' | 'UNKNOWN';
export type { AssistantTurn };

export interface AssistantReply {
  requestId: string;
  conversationId: string;
  intent: AssistantIntent;
  permissionMode: AssistantIntent;
  response: string;
  provider?: string;
  model?: string;
  consultedFinancialData?: boolean;
  /** Present only on transport failures: HTTP status (null = server unreachable) and diagnostic code. */
  transportStatus?: number | null;
  transportCode?: string;
}

export interface AssistantHistoryItem {
  id: string;
  conversation_id: string;
  request_id: string;
  request_text: string;
  response_text: string | null;
  intent: AssistantIntent;
  permission_mode: AssistantIntent;
  status: string;
  provider?: string | null;
  model?: string | null;
  created_at: string;
}

export interface AssistantBriefingAlert {
  kind: 'balance' | 'payable';
  severity: 'attention' | 'warning';
  text: string;
}

export async function isMasterAssistantEnabled(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_platform_super_admin');
  return !error && data === true;
}

function isLocalGreetingOrHelp(text: string): boolean {
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[?!.,]+/g, '').trim();
  if (normalized.length > 42) return false;
  return /^(oi|ola|e ai|e aew|eai|opa|fala|bom dia|boa tarde|boa noite|tudo bem|como vai|ola tudo bem|oi tudo bem|flux|quem e voce|o que voce faz|quais suas capacidades|ajuda|me ajuda|como funciona)$/i.test(normalized);
}

function buildCanonicalFallbackPrompt(text: string): string {
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/(fatura|cartao|cartoes|limite|nubank|c6|picpay|mercado pago)/.test(normalized)) return 'fatura e cartoes';
  if (/(compromiss|contas a pagar|boleto|venciment|divida pessoal|pagar)/.test(normalized)) return 'compromissos a pagar';
  if (/(fonte|fontes|caixa livre|capital disponivel)/.test(normalized)) return 'fontes de capital';
  if (/(saldo|conta|contas|dinheiro|extrato|banco|minha carteira|recargapay)/.test(normalized)) return 'saldo bancario';
  if (/(contrat|emprestim|parcela|inadimplen|atras|receb|devendo|devedor|client|lucro|juros)/.test(normalized)) return 'contratos e parcelas';
  return 'diagnostico financeiro completo';
}

/**
 * Short-term conversation lives in React memory and travels between providers.
 * On transport failure, NEVER trigger a full wallet+contracts read as fallback.
 */
export async function askMasterAssistant(input: {
  message: string;
  conversationId: string;
  requestId: string;
  turns?: AssistantTurn[];
  fresh?: boolean;
}): Promise<AssistantReply> {
  let failure = describeFluxTransportFailure(null);
  try {
    const cleanTurns = (input.turns || []).slice(-10);
    const { data, error } = await supabase.functions.invoke<AssistantReply>('ai-assistant', {
      body: {
        message: input.message,
        conversationId: input.conversationId,
        requestId: input.requestId,
        turns: cleanTurns,
        fresh: input.fresh === true,
      },
    });
    if (!error && data && typeof data.response === 'string' && data.response.trim()) {
      if (data.model === 'unavailable' && data.response.startsWith('Os provedores de IA estão indisponíveis')) {
        if (isLocalGreetingOrHelp(input.message)) {
          return {
            ...data,
            response: 'Olá! Sou o Flux, seu assistente financeiro do CapitalFlow. Posso consultar seu diagnóstico completo, contratos e parcelas em atraso, fontes de capital, contas da Minha Carteira, faturas de cartões e compromissos. O que você deseja verificar agora?',
            provider: 'flux-local',
            model: 'conversational-fallback',
          };
        }
        const retryPrompt = buildCanonicalFallbackPrompt(input.message);
        const retry = await supabase.functions.invoke<AssistantReply>('ai-assistant', {
          body: {
            message: retryPrompt,
            conversationId: input.conversationId,
            requestId: input.requestId,
            turns: [],
            fresh: input.fresh === true,
          },
        });
        if (!retry.error && retry.data && typeof retry.data.response === 'string' && retry.data.response.trim() && retry.data.model !== 'unavailable') {
          return retry.data;
        }
      }
      return data;
    }
    if (error) {
      const { status, serverError } = await readFunctionsError(error);
      failure = describeFluxTransportFailure(status, serverError);
    } else {
      failure = describeFluxTransportFailure(200);
    }
  } catch {
    failure = describeFluxTransportFailure(null);
  }
  console.warn('[flux] transport_failure', failure.code, failure.status);
  return {
    requestId: input.requestId,
    conversationId: input.conversationId,
    intent: 'UNKNOWN',
    permissionMode: 'READ',
    response: failure.message,
    provider: 'flux-safe',
    model: 'transport-fallback',
    transportStatus: failure.status,
    transportCode: failure.code,
  };
}

/** Historical database reads happen only when the user explicitly asks for them. */
export async function loadMasterAssistantHistory(conversationId: string): Promise<AssistantHistoryItem[]> {
  const { data, error } = await supabase.functions.invoke<{ history?: AssistantHistoryItem[]; error?: string }>('ai-assistant', {
    body: { action: 'history', conversationId },
  });
  if (error) {
    const { status, serverError } = await readFunctionsError(error);
    throw new Error(describeFluxTransportFailure(status, serverError).message.replace(/ Nenhuma consulta.*$/, '') ||
      'Não foi possível carregar o histórico do Flux.');
  }
  return data?.history || [];
}

/** Alerts are a manual, limited read and never start while the mascot is closed. */
export async function loadMasterAssistantBriefing(): Promise<AssistantBriefingAlert[]> {
  const { data, error } = await supabase.functions.invoke<{ alerts?: AssistantBriefingAlert[]; error?: string }>('ai-assistant', {
    body: { action: 'briefing', fresh: true },
  });
  if (error) {
    const { status, serverError } = await readFunctionsError(error);
    throw new Error(describeFluxTransportFailure(status, serverError).message.replace(/ Nenhuma consulta.*$/, '') ||
      'Não foi possível consultar os alertas do Flux.');
  }
  return data?.alerts || [];
}
