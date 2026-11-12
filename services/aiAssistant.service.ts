import { supabase } from '../lib/supabase';
import { normalizeAssistantTurns, type AssistantTurn } from '../supabase/functions/ai-assistant/core';
import { describeFluxTransportFailure, readFunctionsError } from './ai/fluxTransport';

export type AssistantIntent = 'READ' | 'DRAFT' | 'CONFIRM' | 'FORBIDDEN' | 'UNKNOWN';
export type { AssistantTurn };

export interface AssistantReply {
  requestId: string;
  conversationId: string;
  intent: AssistantIntent;
  permissionMode: AssistantIntent;
  response: string;
  structured?: {
    intent: string;
    feedback: string;
    analysis?: string;
    suggestions?: string[];
    riskScore?: number;
  };
  provider?: string;
  model?: string;
  consultedFinancialData?: boolean;
  cacheHit?: 'none' | 'query' | 'prompt';
  grounding?: {
    sources: Array<{ kind: 'database' | 'rag' | 'calculator'; id: string; label: string; score?: number }>;
    verified: boolean;
    warnings: string[];
  };
  telemetry?: {
    traceId: string;
    latencyMs: number;
    steps: number;
    toolsCalled: string[];
    cacheHit: 'none' | 'query' | 'prompt';
    costEstimateUsd: number;
    tokens: { promptTokens: number; completionTokens: number; cachedTokens: number; totalTokens: number };
  };
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
    const cleanTurns = normalizeAssistantTurns(input.turns).slice(-10);
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

/**
 * Streams Flux responses over Server-Sent Events (SSE) when supported,
 * falling back transparently to `askMasterAssistant` otherwise.
 */
export async function askMasterAssistantStream(
  input: {
    message: string;
    conversationId: string;
    requestId: string;
    turns?: AssistantTurn[];
    fresh?: boolean;
    structured?: boolean;
  },
  callbacks: {
    onStatus?: (status: string) => void;
    onDelta?: (delta: string, accumulated: string) => void;
  } = {},
): Promise<AssistantReply> {
  try {
    const env = (import.meta as { env?: Record<string, string | undefined> }).env;
    const supabaseUrl = env?.VITE_SUPABASE_URL;
    const supabaseAnonKey = env?.VITE_SUPABASE_ANON_KEY;
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;

    if (!supabaseUrl || !supabaseAnonKey || !accessToken || typeof fetch === 'undefined') {
      return askMasterAssistant(input);
    }

    const cleanTurns = normalizeAssistantTurns(input.turns).slice(-10);
    const res = await fetch(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/ai-assistant`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'apikey': supabaseAnonKey,
        'authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        message: input.message,
        conversationId: input.conversationId,
        requestId: input.requestId,
        turns: cleanTurns,
        fresh: input.fresh === true,
        structured: input.structured === true,
        stream: true,
      }),
    });

    const contentType = res.headers.get('content-type') || '';
    if (!res.ok) {
      let serverError: unknown = null;
      try {
        const body = await res.json();
        serverError = body?.error;
      } catch { /* ignore */ }
      const failure = describeFluxTransportFailure(res.status, serverError);
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

    if (!contentType.includes('text/event-stream') || !res.body) {
      const jsonReply = (await res.json()) as AssistantReply;
      return jsonReply;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let accumulated = '';
    let donePayload: AssistantReply | null = null;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const rawEvent = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf('\n\n');

        let eventName = 'message';
        let dataLine = '';
        for (const line of rawEvent.split('\n')) {
          if (line.startsWith('event:')) eventName = line.slice(6).trim();
          else if (line.startsWith('data:')) dataLine += line.slice(5).trim();
        }
        if (!dataLine) continue;
        try {
          const parsed = JSON.parse(dataLine) as Record<string, unknown>;
          if (eventName === 'status' && typeof parsed.text === 'string') {
            callbacks.onStatus?.(parsed.text);
          } else if (eventName === 'delta' && typeof parsed.text === 'string') {
            accumulated += parsed.text;
            callbacks.onDelta?.(parsed.text, accumulated);
          } else if (eventName === 'done') {
            donePayload = parsed as unknown as AssistantReply;
          }
        } catch { /* ignore malformed SSE event */ }
      }
    }

    if (donePayload && typeof donePayload.response === 'string') {
      return donePayload;
    }
  } catch {
    /* Fallback transparently to standard invoke */
  }
  return askMasterAssistant(input);
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
