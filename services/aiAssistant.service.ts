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

async function loadFrontendDiagnosticData() {
  const [walletResult, authResult] = await Promise.allSettled([
    personalWalletService.load(),
    supabase.auth.getUser(),
  ]);
  const wallet = walletResult.status === 'fulfilled' ? walletResult.value : null;
  const userId = authResult.status === 'fulfilled' ? authResult.value.data?.user?.id : null;

  let sources: Array<{ name?: string; balance?: number }> = [];
  let loans: Array<{
    id?: string;
    principal?: number;
    total_to_receive?: number;
    status?: string;
    is_archived?: boolean;
    parcelas?: Array<{
      status?: string;
      amount?: number;
      paid_total?: number;
      data_vencimento?: string;
      due_date?: string;
      principal_remaining?: number;
      interest_remaining?: number;
    }>;
  }> = [];
  let clientsCount = 0;

  if (userId) {
    const [srcRes, loanRes, cliRes] = await Promise.all([
      supabase.from('fontes').select('name,balance').eq('profile_id', userId).is('archived_at', null).order('name').limit(30),
      supabase.from('contratos').select('id,principal,total_to_receive,status,is_archived,parcelas(status,amount,paid_total,data_vencimento,due_date,principal_remaining,interest_remaining)').eq('owner_id', userId).limit(100),
      supabase.from('clientes').select('id', { count: 'exact', head: true }).eq('owner_id', userId),
    ]);
    if (!srcRes.error && srcRes.data) sources = srcRes.data;
    if (!loanRes.error && loanRes.data) loans = loanRes.data;
    if (!cliRes.error && typeof cliRes.count === 'number') clientsCount = cliRes.count;
  }

  const today = new Date().toISOString().slice(0, 10);
  const sourcesTotal = sources.reduce((sum, s) => sum + Number(s.balance || 0), 0);
  const accounts = wallet?.accounts || [];
  const cards = wallet?.cards || [];
  const payables = (wallet?.payables || []).filter(p => !['PAID', 'CANCELED'].includes(p.status));

  const walletTotal = accounts.reduce((sum, a) => sum + Number(a.balance || 0), 0);
  const cardsTotal = cards.reduce((sum, c) => sum + Number(c.current_bill || 0), 0);
  const payablesTotal = payables.reduce((sum, p) => sum + Number(p.outstanding_balance || 0), 0);

  const activeLoans = loans.filter(l => !l.is_archived && String(l.status || '').toUpperCase() !== 'PAID');
  let principalTotal = 0;
  let totalReceivable = 0;
  let overdueInstallments = 0;
  let overdueAmount = 0;
  let pendingInstallments = 0;

  for (const loan of activeLoans) {
    principalTotal += Number(loan.principal || 0);
    const parcelas = Array.isArray(loan.parcelas) ? loan.parcelas : [];
    if (parcelas.length === 0) {
      totalReceivable += Number(loan.total_to_receive || 0);
      continue;
    }
    for (const p of parcelas) {
      const st = String(p.status || '').toUpperCase();
      if (st === 'PAID') continue;
      pendingInstallments += 1;
      const remP = Number(p.principal_remaining ?? 0);
      const remI = Number(p.interest_remaining ?? 0);
      const fallback = Math.max(0, Number(p.amount || 0) - Number(p.paid_total || 0));
      const openVal = remP + remI > 0 ? remP + remI : fallback;
      totalReceivable += openVal;
      const dueRaw = String(p.data_vencimento || p.due_date || '').slice(0, 10);
      if (st === 'LATE' || (dueRaw && dueRaw < today)) {
        overdueInstallments += 1;
        overdueAmount += openVal;
      }
    }
  }

  return {
    sources,
    sourcesTotal,
    accounts,
    walletTotal,
    cards,
    cardsTotal,
    payables,
    payablesTotal,
    activeLoansCount: activeLoans.length,
    totalLoansCount: loans.length,
    principalTotal,
    totalReceivable,
    overdueInstallments,
    overdueAmount,
    pendingInstallments,
    clientsCount,
  };
}

function formatFullDiagnosticSummary(d: Awaited<ReturnType<typeof loadFrontendDiagnosticData>>): string {
  const healthStatus = d.overdueInstallments === 0
    ? 'Saudável (sem parcelas em atraso)'
    : d.overdueInstallments <= 2
      ? `Atenção (${d.overdueInstallments} parcela(s) em atraso: ${formatMoney(d.overdueAmount)})`
      : `Alerta de inadimplência (${d.overdueInstallments} parcelas em atraso somando ${formatMoney(d.overdueAmount)})`;

  const lines: string[] = [
    `Diagnóstico completo da sua conta e do CapitalFlow:`,
    `• Status da operação: ${healthStatus}`,
    `• Fontes de Capital (${d.sources.length}): ${formatMoney(d.sourcesTotal)} disponíveis`,
    `• Contratos ativos: ${d.activeLoansCount} (Capital alocado: ${formatMoney(d.principalTotal)} | A receber: ${formatMoney(d.totalReceivable)})`,
    `• Clientes cadastrados: ${d.clientsCount}`,
    `• Minha Carteira (${d.accounts.length} conta(s)): ${formatMoney(d.walletTotal)}`,
  ];
  if (d.cards.length > 0 || d.cardsTotal > 0) {
    lines.push(`• Faturas de cartões (${d.cards.length}): ${formatMoney(d.cardsTotal)}`);
  }
  if (d.payables.length > 0 || d.payablesTotal > 0) {
    lines.push(`• Compromissos a pagar (${d.payables.length}): ${formatMoney(d.payablesTotal)}`);
  }
  return lines.join('\n');
}

async function generateFrontendAssistantFallback(message: string): Promise<string> {
  const normalized = message.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[?!.,]+/g, '').trim();

  // 1. Saudações curtas isoladas (sem entrar em loop em perguntas)
  if (normalized.length <= 28 && /^(oi|ola|e ai|e aew|eai|opa|fala|bom dia|boa tarde|boa noite|tudo bem|como vai|ola tudo bem|oi tudo bem|flux|quem e voce|o que voce faz)$/i.test(normalized)) {
    return 'Olá! Sou o Flux, assistente master do CapitalFlow. Posso te dar um diagnóstico completo do CapitalFlow, consultar fontes de capital, contratos, saldos de contas, cartões e compromissos. O que você gostaria de analisar?';
  }

  // 2. Proteção contra credenciais
  if (/(senha|pin|cvv|cvc|numero completo|token|chave secreta|api key)/i.test(normalized)) {
    return 'Não posso processar nem revelar dados sensíveis, senhas, PIN ou credenciais por segurança.';
  }

  // 3. Mutação financeira
  if (/(pague|pagar|baixe|dar baixa|estorne|cancele|altere meu saldo|crie uma compra|grave o gasto|registre o gasto)/i.test(normalized)) {
    return 'Por segurança, qualquer pagamento, baixa, estorno ou gravação financeira deve ser realizada diretamente nas telas protegidas do CapitalFlow.';
  }

  try {
    const d = await loadFrontendDiagnosticData();

    // 4. Diagnóstico geral, saúde do CapitalFlow ou perguntas sobre se está bom
    if (/(diagnostico|capitalflow|capital flow|estabom|esta bom|ta bom|como esta|saude|resumo|visao geral|panorama|analise|avaliacao|relatorio|situacao)/i.test(normalized)) {
      return formatFullDiagnosticSummary(d);
    }

    // 5. Empréstimos, contratos, parcelas, inadimplência ou clientes
    if (/(contrato|contratos|emprestimo|emprestimos|parcela|parcelas|inadimplen|atraso|atrasad|receber|clientes|carteira de credito|lucro|juros)/i.test(normalized)) {
      return [
        `Resumo da operação de crédito no CapitalFlow:`,
        `• Contratos ativos: ${d.activeLoansCount} (de ${d.totalLoansCount} registrados)`,
        `• Capital principal ativo: ${formatMoney(d.principalTotal)}`,
        `• Total em aberto a receber: ${formatMoney(d.totalReceivable)} (${d.pendingInstallments} parcela(s) em aberto)`,
        `• Parcelas em atraso: ${d.overdueInstallments} (${formatMoney(d.overdueAmount)})`,
        `• Clientes cadastrados: ${d.clientsCount}`,
      ].join('\n');
    }

    // 6. Fontes de capital
    if (/(fonte|fontes|caixa livre|capital disponivel)/i.test(normalized)) {
      if (!d.sources.length) return 'Não há fontes de capital ativas cadastradas no momento.';
      const list = d.sources.slice(0, 10).map(s => `• ${s.name || 'Fonte'}: ${formatMoney(Number(s.balance || 0))}`);
      return `Fontes de Capital no CapitalFlow (Total: ${formatMoney(d.sourcesTotal)}):\n${list.join('\n')}`;
    }

    // 7. Saldo e contas
    if (/(saldo|conta|contas|dinheiro|extrato|banco)/i.test(normalized)) {
      const parts: string[] = [];
      if (d.accounts.length) {
        const list = d.accounts.map(acc => `• ${acc.nickname || acc.bank_name || 'Conta'}: ${formatMoney(Number(acc.balance || 0))}`);
        parts.push(`Contas da Minha Carteira (Total: ${formatMoney(d.walletTotal)}):\n${list.join('\n')}`);
      } else {
        parts.push('Minha Carteira: nenhuma conta bancária cadastrada no momento.');
      }
      if (d.sources.length) {
        const srcList = d.sources.slice(0, 6).map(s => `• ${s.name || 'Fonte'}: ${formatMoney(Number(s.balance || 0))}`);
        parts.push(`Fontes de Capital do CapitalFlow (Total: ${formatMoney(d.sourcesTotal)}):\n${srcList.join('\n')}`);
      }
      return parts.join('\n\n');
    }

    // 8. Cartões e faturas
    if (/(fatura|cartao|cartoes|limite)/i.test(normalized)) {
      if (!d.cards.length) return 'Não há cartões de crédito cadastrados na sua carteira.';
      const list = d.cards.map(c => `• ${c.nickname || c.issuer || 'Cartão'}: Fatura atual ${formatMoney(Number(c.current_bill || 0))} (Disponível: ${formatMoney(Number(c.available_limit || 0))})`);
      return `Resumo dos seus cartões de crédito:\n${list.join('\n')}`;
    }

    // 9. Compromissos e contas a pagar
    if (/(vence|vencimento|compromisso|divida|contas a pagar|boleto)/i.test(normalized)) {
      if (!d.payables.length) return 'Não constam compromissos ou contas a pagar pendentes no momento.';
      const list = d.payables.slice(0, 5).map(p => {
        const due = p.due_date ? p.due_date.slice(0, 10).split('-').reverse().join('/') : 'sem data';
        return `• ${p.description || p.creditor_name}: ${formatMoney(Number(p.outstanding_balance || 0))} (vencimento: ${due})`;
      });
      return `Próximos compromissos pendentes:\n${list.join('\n')}`;
    }

    // 10. Qualquer outra pergunta recebe o diagnóstico consolidado em vez de repetir saudação em loop
    return formatFullDiagnosticSummary(d);
  } catch {
    return 'Não foi possível consolidar os dados do CapitalFlow neste instante. Tente atualizar a página.';
  }
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
