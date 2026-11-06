import { supabase } from '../lib/supabase';
import { formatMoney } from '../utils/formatters';
import { personalWalletService } from './personalWallet.service';

export type AssistantIntent = 'READ' | 'DRAFT' | 'CONFIRM' | 'FORBIDDEN' | 'UNKNOWN';

export interface AssistantReply {
  requestId: string;
  conversationId: string;
  intent: AssistantIntent;
  permissionMode: AssistantIntent;
  response: string;
  provider?: string;
  model?: string;
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

async function generateFrontendAssistantFallback(message: string): Promise<string> {
  const normalized = message.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

  // 1. Saudações
  if (/^(oi|ola|e ai|e aew|eai|opa|fala|bom dia|boa tarde|boa noite|tudo bem|como vai|ola tudo bem|oi tudo bem|flux|quem e voce|o que voce faz)/i.test(normalized)) {
    return 'Olá! Sou o Flux, assistente master do CapitalFlow. Estou pronto para ajudar você a consultar saldos de contas, faturas de cartões e próximos compromissos da sua carteira. O que você gostaria de consultar?';
  }

  // 2. Proteção contra credenciais
  if (/(senha|pin|cvv|cvc|numero completo|token|chave secreta|api key)/i.test(normalized)) {
    return 'Não posso processar nem revelar dados sensíveis, senhas, PIN ou credenciais por segurança.';
  }

  // 3. Saldo e contas
  if (/(saldo|conta|contas|dinheiro|extrato|banco)/i.test(normalized)) {
    try {
      const snap = await personalWalletService.load();
      if (!snap.accounts?.length) return 'Não há contas bancárias ou carteiras cadastradas no momento.';
      const list = snap.accounts.map(acc => `• ${acc.nickname || acc.bank_name || 'Conta'}: ${formatMoney(Number(acc.balance || 0))}`);
      const total = snap.accounts.reduce((sum, a) => sum + Number(a.balance || 0), 0);
      return `Saldo das suas contas no CapitalFlow (Total: ${formatMoney(total)}):\n${list.join('\n')}`;
    } catch {
      return 'Não foi possível carregar as contas no momento. Tente atualizar a página da Carteira.';
    }
  }

  // 4. Cartões e faturas
  if (/(fatura|cartao|cartoes|limite)/i.test(normalized)) {
    try {
      const snap = await personalWalletService.load();
      if (!snap.cards?.length) return 'Não há cartões de crédito cadastrados na sua carteira.';
      const list = snap.cards.map(c => `• ${c.nickname || c.issuer || 'Cartão'}: Fatura atual ${formatMoney(Number(c.current_bill || 0))} (Disponível: ${formatMoney(Number(c.available_limit || 0))})`);
      return `Resumo dos seus cartões de crédito:\n${list.join('\n')}`;
    } catch {
      return 'Não foi possível carregar os cartões no momento.';
    }
  }

  // 5. Compromissos e contas a pagar
  if (/(vence|vencimento|compromisso|divida|pagar|contas a pagar|boleto)/i.test(normalized)) {
    try {
      const snap = await personalWalletService.load();
      const pend = (snap.payables || []).filter(p => !['PAID', 'CANCELED'].includes(p.status));
      if (!pend.length) return 'Não constam compromissos ou contas a pagar pendentes no momento.';
      const list = pend.slice(0, 5).map(p => {
        const due = p.due_date ? p.due_date.slice(0, 10).split('-').reverse().join('/') : 'sem data';
        return `• ${p.description || p.creditor_name}: ${formatMoney(Number(p.outstanding_balance || 0))} (vencimento: ${due})`;
      });
      return `Próximos compromissos pendentes:\n${list.join('\n')}`;
    } catch {
      return 'Não foi possível consultar os compromissos pendentes no momento.';
    }
  }

  // 6. Mutação financeira
  if (/(pague|pagar|baixe|dar baixa|estorne|cancele|altere meu saldo|crie uma compra|grave o gasto|registre o gasto)/i.test(normalized)) {
    return 'Por segurança, qualquer pagamento, baixa, estorno ou gravação financeira deve ser realizada diretamente nas telas protegidas da Carteira.';
  }

  return 'Olá! Sou o Flux, assistente master do CapitalFlow. Posso te informar sobre saldos de contas, faturas de cartões e próximos compromissos da sua carteira. O que você gostaria de consultar?';
}

export async function askMasterAssistant(input: {
  message: string;
  conversationId: string;
  requestId: string;
}): Promise<AssistantReply> {
  try {
    const { data, error } = await supabase.functions.invoke<AssistantReply>('ai-assistant', { body: input });
    if (!error && data?.response) {
      return data;
    }
  } catch (err) {
    console.warn('[ai-assistant] Falha de invocação da Edge Function, aplicando resposta segura:', err);
  }

  const localAnswer = await generateFrontendAssistantFallback(input.message);
  return {
    requestId: input.requestId,
    conversationId: input.conversationId,
    intent: 'READ',
    permissionMode: 'READ',
    response: localAnswer,
    provider: 'flux-assistant',
    model: 'smart-fallback-v1',
  };
}

export async function loadMasterAssistantHistory(conversationId: string): Promise<AssistantHistoryItem[]> {
  const { data, error } = await supabase.functions.invoke<{ history?: AssistantHistoryItem[]; error?: string }>('ai-assistant', {
    body: { action: 'history', conversationId },
  });
  if (error) throw new Error((data as { error?: string } | null)?.error || 'Não foi possível carregar o histórico do Flux.');
  return data?.history || [];
}

export async function loadMasterAssistantBriefing(): Promise<AssistantBriefingAlert[]> {
  const { data, error } = await supabase.functions.invoke<{ alerts?: AssistantBriefingAlert[]; error?: string }>('ai-assistant', {
    body: { action: 'briefing' },
  });
  if (error) throw new Error((data as { error?: string } | null)?.error || 'Não foi possível carregar os alertas do Flux.');
  return data?.alerts || [];
}
