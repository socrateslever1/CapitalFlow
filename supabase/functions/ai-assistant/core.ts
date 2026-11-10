export type AssistantTurn = { role: 'user' | 'assistant'; content: string };
export type FinancialArea = 'geral' | 'contas' | 'cartoes' | 'compromissos' | 'fontes' | 'contratos' | 'alertas';

const AREAS: readonly FinancialArea[] = ['geral', 'contas', 'cartoes', 'compromissos', 'fontes', 'contratos', 'alertas'];

export function allowedFinancialArea(value: unknown): FinancialArea | null {
  return typeof value === 'string' && AREAS.includes(value as FinancialArea) ? value as FinancialArea : null;
}

/** Untrusted client turns are context only; never identity, permissions or financial truth. */
export function normalizeAssistantTurns(raw: unknown): AssistantTurn[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(-12).flatMap((value): AssistantTurn[] => {
    if (!value || typeof value !== 'object') return [];
    const item = value as Record<string, unknown>;
    if ((item.role !== 'user' && item.role !== 'assistant') || typeof item.content !== 'string') return [];
    const content = item.content.trim().slice(0, 1500);
    return content ? [{ role: item.role, content }] : [];
  });
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
