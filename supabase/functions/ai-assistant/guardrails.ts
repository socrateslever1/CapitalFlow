export type GuardrailInputResult =
  | { allowed: true }
  | {
      allowed: false;
      code: 'FORBIDDEN_SECRET' | 'PROMPT_INJECTION';
      message: string;
    };

export type GroundingSummaryContext = {
  accountsCount: number;
  cardsCount: number;
  payablesCount: number;
  sourcesCount: number;
  loansCount: number;
  walletAccountsTotal: number;
  cardsBillTotal: number;
  sourcesTotal: number;
};

export type GuardrailOutputResult = {
  text: string;
  redacted: boolean;
  mutationBlocked: boolean;
  groundingVerified: boolean;
  groundingWarnings: string[];
};

function passesLuhnCheck(digits: string): boolean {
  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = Number(digits[i]);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

function containsFullCardNumber(text: string): boolean {
  const candidates = text.match(/(?:\d[ -]?){13,19}/g);
  if (!candidates) return false;
  for (const raw of candidates) {
    const digits = raw.replace(/\D/g, '');
    if (digits.length >= 13 && digits.length <= 19 && passesLuhnCheck(digits)) {
      return true;
    }
  }
  return false;
}

const PROMPT_INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|rules|policies)/i,
  /desconsidere\s+(todas\s+as\s+)?(instrucoes|regras)\s+anteriores/i,
  /reveal\s+(your\s+)?(system\s+prompt|api\s+key|secret)/i,
  /mostre\s+(o\s+)?(seu\s+)?(system\s+prompt|prompt\s+de\s+sistema)/i,
  /\b(jailbreak|dan\s+mode|developer\s+mode)\b/i,
];

export function validateInputGuardrail(text: string): GuardrailInputResult {
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  if (
    /(senha|pin|cvv|cvc|numero completo de cartao|token secreto|chave secreta|api key)/.test(normalized) ||
    containsFullCardNumber(text)
  ) {
    return {
      allowed: false,
      code: 'FORBIDDEN_SECRET',
      message: 'Não processe nem envie senhas, PIN, CVV, número completo de cartão ou chaves de acesso para o assistente.',
    };
  }

  if (PROMPT_INJECTION_PATTERNS.some(pattern => pattern.test(normalized))) {
    return {
      allowed: false,
      code: 'PROMPT_INJECTION',
      message: 'Solicitação bloqueada pela política de segurança do Flux. Faça uma pergunta financeira ou operacional válida.',
    };
  }

  return { allowed: true };
}

const SECRET_LEAK_PATTERNS: RegExp[] = [
  /\bAIza[0-9A-Za-z\-_]{20,}\b/g,
  /\bsk-[0-9A-Za-z]{20,}\b/g,
  /\bgsk_[0-9A-Za-z]{20,}\b/g,
  /\beyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\b/g,
];

const FALSE_MUTATION_CLAIM_PATTERN =
  /\b(paguei|efetuei o pagamento|alterei seu saldo|estornei|cancelei a fatura|apaguei o contrato|transferi o valor)\b/i;

export function verifyGroundingConsistency(
  text: string,
  summary: GroundingSummaryContext | null,
): { verified: boolean; warnings: string[] } {
  if (!summary) return { verified: true, warnings: [] };
  const warnings: string[] = [];
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  if (summary.cardsCount === 0 && /fatura atual de r\$\s*[1-9]/.test(normalized)) {
    warnings.push('Resposta mencionou valor de fatura mesmo sem cartões cadastrados.');
  }
  if (summary.accountsCount === 0 && /saldo em conta de r\$\s*[1-9]/.test(normalized)) {
    warnings.push('Resposta mencionou saldo bancário positivo mesmo sem contas cadastradas.');
  }
  if (summary.loansCount === 0 && /\b\d+\s+contratos?\s+ativos?\b/.test(normalized) && !/\b0\s+contratos?\b/.test(normalized)) {
    warnings.push('Resposta mencionou contratos ativos quando não há contratos no contexto.');
  }

  return {
    verified: warnings.length === 0,
    warnings,
  };
}

export function validateOutputGuardrail(
  rawText: string,
  summary: GroundingSummaryContext | null = null,
): GuardrailOutputResult {
  let text = rawText.trim();
  let redacted = false;

  for (const pattern of SECRET_LEAK_PATTERNS) {
    if (pattern.test(text)) {
      text = text.replace(pattern, '[CREDENCIAL_REMOVIDA]');
      redacted = true;
    }
  }

  let mutationBlocked = false;
  if (FALSE_MUTATION_CLAIM_PATTERN.test(text.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))) {
    mutationBlocked = true;
    text +=
      '\n\nNota de segurança: o Flux atua exclusivamente em modo leitura (READ_ONLY) e não executa alterações, pagamentos ou estornos reais.';
  }

  const grounding = verifyGroundingConsistency(text, summary);

  return {
    text,
    redacted,
    mutationBlocked,
    groundingVerified: grounding.verified,
    groundingWarnings: grounding.warnings,
  };
}

