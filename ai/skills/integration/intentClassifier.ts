export const SKILL_INTENT_IDS = [
  'consultar_cliente',
  'consultar_divida',
  'consultar_parcelas',
  'consultar_contrato',
  'consultar_vencimentos',
  'consultar_acordo',
  'registrar_pagamento',
  'estornar_pagamento',
  'renovar_pagamento',
  'capitalizar_saldo',
  'quitar_por_acordo',
  'novo_aporte',
  'registrar_pagamento_acordo',
  'aplicar_desconto',
  'alterar_vencimento',
] as const;

export type SkillIntentId = typeof SKILL_INTENT_IDS[number];
export type RoutedIntent = SkillIntentId | 'human_handoff' | 'loan_interest' | 'unknown';
export type IntentRoute =
  | 'READ_ONLY_SKILL'
  | 'FINANCIAL_BLOCKED'
  | 'HUMAN_HANDOFF'
  | 'LOAN_INTEREST'
  | 'UNKNOWN';

export type IntentClassification = Readonly<{
  intent: RoutedIntent;
  route: IntentRoute;
  confidence: number;
  matchedBy: 'RULE';
}>;

type Rule = {
  intent: RoutedIntent;
  route: IntentRoute;
  confidence: number;
  patterns: RegExp[];
};

const normalize = (value: unknown) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .trim();

const rules: Rule[] = [
  {
    intent: 'human_handoff',
    route: 'HUMAN_HANDOFF',
    confidence: 0.99,
    patterns: [
      /\b(falar|conversar)\s+com\s+(um\s+)?(atendente|humano|pessoa)\b/,
      /\b(atendimento humano|quero atendente|chamar atendente)\b/,
    ],
  },
  {
    intent: 'estornar_pagamento',
    route: 'FINANCIAL_BLOCKED',
    confidence: 0.99,
    patterns: [/\b(estorn\w*|desfaz\w*|revert\w*)\b.*\b(pagamento|recebimento|baixa)\b/],
  },
  {
    intent: 'registrar_pagamento_acordo',
    route: 'FINANCIAL_BLOCKED',
    confidence: 0.99,
    patterns: [/\b(registr\w*|dar baixa|baix\w*|lanc\w*)\b.*\b(pagamento|recebimento)\b.*\b(acordo|renegociacao)\b/],
  },
  {
    intent: 'registrar_pagamento',
    route: 'FINANCIAL_BLOCKED',
    confidence: 0.98,
    patterns: [
      /\b(registr\w*|dar baixa|baix\w*|lanc\w*)\b.*\b(pagamento|recebimento)\b/,
      /\b(recebi|recebemos)\b.*\b(r\$|reais|pagamento|parcela)?/,
      /\bexecute\b.*\bpagamento\b/,
    ],
  },
  {
    intent: 'alterar_vencimento',
    route: 'FINANCIAL_BLOCKED',
    confidence: 0.98,
    patterns: [/\b(alter\w*|mud\w*|troc\w*|adi\w*|prorrog\w*)\b.*\b(vencimento|data de vencimento)\b/],
  },
  {
    intent: 'novo_aporte',
    route: 'FINANCIAL_BLOCKED',
    confidence: 0.98,
    patterns: [/\b(novo aporte|fazer aporte|emprestar mais|liberar mais capital|aumentar o capital)\b/],
  },
  {
    intent: 'capitalizar_saldo',
    route: 'FINANCIAL_BLOCKED',
    confidence: 0.98,
    patterns: [/\b(capitaliz\w*|som\w*|incorpor\w*)\b.*\b(juros|multa|mora|saldo|restante)\b.*\b(capital|principal)?/],
  },
  {
    intent: 'quitar_por_acordo',
    route: 'FINANCIAL_BLOCKED',
    confidence: 0.98,
    patterns: [/\b(quit\w*|encerr\w*|liquid\w*)\b.*\b(acordo|renegociacao)\b/],
  },
  {
    intent: 'aplicar_desconto',
    route: 'FINANCIAL_BLOCKED',
    confidence: 0.98,
    patterns: [
      /\b(aplicar|dar|conceder|remover)\b.*\b(desconto|juros|multa|mora)\b/,
      /\b(zerar|zere|apagar|perdoar)\b.*\b(saldo|divida|juros|multa|mora)\b/,
    ],
  },
  {
    intent: 'renovar_pagamento',
    route: 'FINANCIAL_BLOCKED',
    confidence: 0.97,
    patterns: [/\b(renov\w*)\b.*\b(pagamento|parcela|contrato|vencimento)\b/],
  },
  {
    intent: 'loan_interest',
    route: 'LOAN_INTEREST',
    confidence: 0.96,
    patterns: [
      /\b(quero|preciso|gostaria de|tenho interesse em)\b.*\b(emprestimo|credito)\b/,
      /\b(simular|solicitar|pedir)\b.*\b(emprestimo|credito)\b/,
    ],
  },
  {
    intent: 'consultar_vencimentos',
    route: 'READ_ONLY_SKILL',
    confidence: 0.96,
    patterns: [
      /\b(quando|que dia|qual data)\b.*\b(vence|vencimento)\b/,
      /\b(vencimento|vencimentos)\b.*\b(quando|data|proximo|proxima|contrato|parcela)?/,
    ],
  },
  {
    intent: 'consultar_acordo',
    route: 'READ_ONLY_SKILL',
    confidence: 0.95,
    patterns: [/\b(acordo|renegociacao|renegociado)\b.*\b(ativo|aberto|tem|existe|situacao|status)?/],
  },
  {
    intent: 'consultar_parcelas',
    route: 'READ_ONLY_SKILL',
    confidence: 0.95,
    patterns: [
      /\b(parcelas?|prestacoes?)\b.*\b(abertas?|pendentes?|pagas?|atrasadas?|faltam?|listar|quais)?/,
      /\b(quais|listar|mostrar)\b.*\b(parcelas?|prestacoes?)\b/,
    ],
  },
  {
    intent: 'consultar_divida',
    route: 'READ_ONLY_SKILL',
    confidence: 0.95,
    patterns: [
      /\b(quanto|qual valor)\b.*\b(devo|deve|divida|saldo devedor|em aberto)\b/,
      /\b(divida|saldo devedor|total devido|valor devido)\b/,
    ],
  },
  {
    intent: 'consultar_contrato',
    route: 'READ_ONLY_SKILL',
    confidence: 0.93,
    patterns: [
      /\b(ver|mostr\w*|consult\w*|detalh\w*|status|situacao)\b.*\b(contrato)\b/,
      /\b(meu|o|do|da)\s+contrato\b/,
    ],
  },
  {
    intent: 'consultar_cliente',
    route: 'READ_ONLY_SKILL',
    confidence: 0.90,
    patterns: [
      /\b(cadastro|dados do cliente|dados cadastrais|cliente cadastrado)\b/,
      /\b(mostr\w*|busc\w*|consult\w*|encontr\w*)\b.*\b(cliente|clientes)\b/,
      /\b(clientes?)\b.*\b(outro operador|cadastro|nome|cpf|codigo)\b/,
    ],
  },
];

export function classifySkillIntent(prompt: unknown): IntentClassification {
  const text = normalize(prompt);
  if (!text) return { intent: 'unknown', route: 'UNKNOWN', confidence: 0, matchedBy: 'RULE' };

  for (const rule of rules) {
    if (rule.patterns.some((pattern) => pattern.test(text))) {
      return {
        intent: rule.intent,
        route: rule.route,
        confidence: rule.confidence,
        matchedBy: 'RULE',
      };
    }
  }

  return { intent: 'unknown', route: 'UNKNOWN', confidence: 0.2, matchedBy: 'RULE' };
}

export function isSkillIntent(intent: RoutedIntent): intent is SkillIntentId {
  return (SKILL_INTENT_IDS as readonly string[]).includes(intent);
}
