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
    const { data, error } = await supabase.functions.invoke<AssistantReply>('ai-assistant', {
      body: {
        message: input.message,
        conversationId: input.conversationId,
        requestId: input.requestId,
        turns: (input.turns || []).slice(-10),
        fresh: input.fresh === true,
      },
    });
    if (!error && data && typeof data.response === 'string' && data.response.trim()) return data;
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
