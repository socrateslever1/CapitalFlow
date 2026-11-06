import { supabase } from '../lib/supabase';
import type { AssistantTurn } from '../supabase/functions/ai-assistant/core';

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
    if (error || !data || typeof data.response !== 'string' || !data.response.trim())
      throw new Error('FLUX_UNAVAILABLE');
    return data;
  } catch {
    return {
      requestId: input.requestId,
      conversationId: input.conversationId,
      intent: 'UNKNOWN',
      permissionMode: 'READ',
      response: 'O Flux está temporariamente indisponível. Nenhuma consulta financeira adicional foi iniciada.',
      provider: 'flux-safe',
      model: 'transport-fallback',
    };
  }
}

/** Historical database reads happen only when the user explicitly asks for them. */
export async function loadMasterAssistantHistory(conversationId: string): Promise<AssistantHistoryItem[]> {
  const { data, error } = await supabase.functions.invoke<{ history?: AssistantHistoryItem[]; error?: string }>('ai-assistant', {
    body: { action: 'history', conversationId },
  });
  if (error) throw new Error((data as { error?: string } | null)?.error || 'Não foi possível carregar o histórico do Flux.');
  return data?.history || [];
}

/** Alerts are a manual, limited read and never start while the mascot is closed. */
export async function loadMasterAssistantBriefing(): Promise<AssistantBriefingAlert[]> {
  const { data, error } = await supabase.functions.invoke<{ alerts?: AssistantBriefingAlert[]; error?: string }>('ai-assistant', {
    body: { action: 'briefing', fresh: true },
  });
  if (error) throw new Error((data as { error?: string } | null)?.error || 'Não foi possível consultar os alertas do Flux.');
  return data?.alerts || [];
}
