export type AssistantTurn = { role: 'user' | 'assistant'; content: string };
export type FinancialArea = 'geral' | 'contas' | 'cartoes' | 'compromissos' | 'fontes' | 'contratos' | 'alertas';
export type AssistantResponseQuality = 'USEFUL' | 'TOO_SHORT' | 'GENERIC';

export function businessDateInManaus(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Manaus', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function calculateOpenInterest(loans: Array<Record<string, unknown>>): number {
  let total = 0;
  for (const loan of loans) {
    if (loan.is_archived || String(loan.status || '').toUpperCase() === 'PAID') continue;
    const installments = Array.isArray(loan.parcelas) ? loan.parcelas as Array<Record<string, unknown>> : [];
    if (!installments.length) {
      total += Math.max(0, Number(loan.total_to_receive || 0) - Number(loan.principal || 0));
      continue;
    }
    for (const installment of installments) {
      if (String(installment.status || '').toUpperCase() === 'PAID') continue;
      const interest = Number(installment.interest_remaining ?? 0);
      if (Number.isFinite(interest) && interest > 0) total += interest;
    }
  }
  return Math.round(total * 100) / 100;
}

export function assessAssistantResponse(text: string, consultedFinancialData: boolean): AssistantResponseQuality {
  const normalized = text.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (!normalized) return 'TOO_SHORT';
  if (!consultedFinancialData) return 'USEFUL';
  if (normalized.length < 24) return 'TOO_SHORT';
  if (/^(nao sei|nao consigo|nao foi possivel|tente novamente|ok|sim|nao)[.! ]*$/.test(normalized)) return 'GENERIC';
  return 'USEFUL';
}

const AREAS: readonly FinancialArea[] = ['geral', 'contas', 'cartoes', 'compromissos', 'fontes', 'contratos', 'alertas'];

export function allowedFinancialArea(value: unknown): FinancialArea | null {
  return typeof value === 'string' && AREAS.includes(value as FinancialArea) ? value as FinancialArea : null;
}

/** Untrusted client turns are context only; never identity, permissions or financial truth. */
export function normalizeAssistantTurns(raw: unknown): AssistantTurn[] {
  if (!Array.isArray(raw)) return [];
  const validTurns = raw.flatMap((value): AssistantTurn[] => {
    if (!value || typeof value !== 'object') return [];
    const item = value as Record<string, unknown>;
    if ((item.role !== 'user' && item.role !== 'assistant') || typeof item.content !== 'string') return [];
    const content = item.content.trim().slice(0, 1500);
    return content ? [{ role: item.role, content }] : [];
  });
  return validTurns.slice(-12);
}

export function inferFinancialArea(text: string, previous: AssistantTurn[] = []): FinancialArea | null {
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  let normalized = normalize(text);
  if (normalized.length < 55 && /^(e |e os |e as |quanto|qual|desses|dessas|agora|tambem|sobre isso|e o |e a )/.test(normalized)) {
    const lastUser = [...previous].reverse().find(item => item.role === 'user');
    if (lastUser) normalized = normalized + ' ' + normalize(lastUser.content);
  }
  if (/sem consultar (?:meus |minhas |os meus |as minhas )?dados/.test(normalized)) return null;
  if (/(o que (e|sao)|explique|conceito|diferenca|sem consultar|teoria)/.test(normalized) &&
      !/(meu|minha|meus|minhas|me|do capitalflow|da carteira)/.test(normalized)) return null;
  const mixedSignals = [
    /(minha carteira|saldo bancario|meu saldo|quanto tenho|saldo (das? )?(minhas? )?contas?|contas bancarias|conta corrente|conta poupanca|recarregapay)/.test(normalized),
    /(cartao|cartoes|fatura|limite de credito|nubank|c6|mercado pago|picpay)/.test(normalized),
    /(contrat|emprestim|parcela|inadimplen|atrasad|recebive|devedor|client)/.test(normalized),
    /(compromiss|contas a pagar|boleto|venciment|divida pessoal|pagamento pendente)/.test(normalized),
    /(fonte de capital|fontes de capital|capital disponivel|capital alocado|saldo das fontes|caixa livre)/.test(normalized),
  ].filter(Boolean).length;
  if (mixedSignals > 1) return 'geral';
  if (/(diagnostico|panorama|resumo|situacao|saude|relatorio|visao geral|como esta (o |meu )?(capitalflow|capital flow|caixa|sistema)|balanco|melhorar|otimizar|gargalo|pontos? de atencao|o que temos)/.test(normalized)) return 'geral';
  if (/(contrat|emprestim|parcela|inadimplen|atrasad|rentabilidad|juros|recebive|receber|devendo|devedor|client|credito concedido|lucro|quem deve)/.test(normalized)) return 'contratos';
  if (/(fonte de capital|fontes de capital|minhas fontes|capital disponivel|capital alocado|saldo das fontes|caixa livre)/.test(normalized)) return 'fontes';
  if (/(cartao|cartoes|fatura|limite de credito|nubank|c6|mercado pago|picpay)/.test(normalized)) return 'cartoes';
  if (/(compromiss|contas a pagar|boleto|venciment|divida pessoal|pagamento pendente)/.test(normalized)) return 'compromissos';
  if (/(minha carteira|saldo bancario|meu saldo|qual o saldo|quanto tenho|saldo (das? )?(minhas? )?contas?|contas bancarias|extrato bancario|saldo do banco|conta corrente|conta poupanca|recarregapay|recargapay)/.test(normalized)) return 'contas';
  if (/(alerta|alertas|avisos|pendencia|pendencias)/.test(normalized)) return 'alertas';
  return null;
}

export function isFinancialWriteRequest(text: string): boolean {
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return /(pague|efetue (um )?pagamento|dar baixa|de baixa|estorne|cancele (o|a) (contrato|fatura|pagamento)|altere meu saldo|crie uma compra|grave o gasto|registre o gasto|apague (a|o) (fatura|contrato|lancamento))/.test(normalized);
}

export type MemoryEnvelope = {
  summary: string | null;
  activeTurns: AssistantTurn[];
};

const TOPIC_EXTRACTORS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'contas bancárias', pattern: /\b(conta|saldo|banco|carteira|pix)\b/i },
  { label: 'cartões e faturas', pattern: /\b(cartao|cartoes|fatura|limite|nubank|c6)\b/i },
  { label: 'contratos e parcelas', pattern: /\b(contrato|parcela|juros|atraso|inadimplen|cliente)\b/i },
  { label: 'fontes de capital', pattern: /\b(fonte|capital|caixa livre)\b/i },
  { label: 'compromissos', pattern: /\b(compromisso|boleto|venciment|pagar)\b/i },
];

/**
 * Compacts older turns into a structured episodic summary so long conversations
 * retain continuity without blowing the provider token budget.
 */
export function buildMemoryEnvelope(turns: AssistantTurn[], activeWindow = 6): MemoryEnvelope {
  if (turns.length <= activeWindow) {
    return { summary: null, activeTurns: turns };
  }
  const older = turns.slice(0, turns.length - activeWindow);
  const activeTurns = turns.slice(-activeWindow);
  const topics = new Set<string>();
  const userQuestions: string[] = [];

  for (const turn of older) {
    for (const extractor of TOPIC_EXTRACTORS) {
      if (extractor.pattern.test(turn.content)) topics.add(extractor.label);
    }
    if (turn.role === 'user') {
      const compact = turn.content.replace(/\s+/g, ' ').trim().slice(0, 90);
      if (compact) userQuestions.push(compact);
    }
  }

  const topicText = topics.size ? `Tópicos anteriores: ${Array.from(topics).join(', ')}.` : '';
  const questionsText = userQuestions.length
    ? `Perguntas anteriores: ${userQuestions.slice(-3).join(' | ')}.`
    : '';
  const summary = [topicText, questionsText].filter(Boolean).join(' ').slice(0, 500) || null;
  return { summary, activeTurns };
}

export type CalculationFocus = 'liquidez' | 'inadimplencia' | 'credito' | 'geral';

export function allowedCalculationFocus(value: unknown): CalculationFocus {
  if (value === 'liquidez' || value === 'inadimplencia' || value === 'credito') return value;
  return 'geral';
}
