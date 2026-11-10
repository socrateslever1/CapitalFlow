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

const MASTER_CHECK_TTL_MS = 5 * 60_000;
const MASTER_STORAGE_KEY = 'cf_flux_master_enabled';
let masterCheckCache: { userId: string | null; allowed: boolean; expiresAt: number } | null = null;

export async function isMasterAssistantEnabled(): Promise<boolean> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData?.session?.user?.id || null;
  const now = Date.now();
  if (masterCheckCache && masterCheckCache.userId === userId && now < masterCheckCache.expiresAt) {
    return masterCheckCache.allowed;
  }
  if (userId && typeof sessionStorage !== 'undefined') {
    try {
      const raw = sessionStorage.getItem(MASTER_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { userId?: string; allowed?: boolean; expiresAt?: number };
        if (parsed.userId === userId && typeof parsed.allowed === 'boolean' && Number(parsed.expiresAt) > now) {
          masterCheckCache = { userId, allowed: parsed.allowed, expiresAt: Number(parsed.expiresAt) };
          return parsed.allowed;
        }
      }
    } catch { /* ignora cache inválido no sessionStorage */ }
  }
  const { data, error } = await supabase.rpc('is_platform_super_admin');
  const allowed = !error && data === true;
  if (!error) {
    const expiresAt = now + MASTER_CHECK_TTL_MS;
    masterCheckCache = { userId, allowed, expiresAt };
    if (userId && typeof sessionStorage !== 'undefined') {
      try {
        sessionStorage.setItem(MASTER_STORAGE_KEY, JSON.stringify({ userId, allowed, expiresAt }));
      } catch { /* sessionStorage opcional */ }
    }
  }
  return allowed;
}

function isLocalGreetingOrHelp(text: string): boolean {
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[?!.,]+/g, '').trim();
  if (normalized.length > 42) return false;
  return /^(oi|ola|e ai|e aew|eai|opa|fala|bom dia|boa tarde|boa noite|tudo bem|como vai|ola tudo bem|oi tudo bem|flux|quem e voce|o que voce faz|quais suas capacidades|ajuda|me ajuda|como funciona)$/i.test(normalized);
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
      if (data.model === 'unavailable' && isLocalGreetingOrHelp(input.message)) {
        return {
          ...data,
          response: 'Olá! Sou o Flux, assistente master do CapitalFlow. Posso fazer o diagnóstico completo, consultar fontes, contratos, parcelas em atraso, contas da carteira, cartões e compromissos. O que você deseja verificar?',
          provider: 'flux-local',
          model: 'conversational-fallback',
        };
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
