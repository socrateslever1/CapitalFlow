import { findBankBrand, normalizeBankName } from '../../utils/bankLogoRegistry';

const visuals: Record<string, { accent: string; secondary: string; monogram: string }> = {
  cash: { accent: '#b7791f', secondary: '#7c4a03', monogram: 'C' },
  nubank: { accent: '#820ad1', secondary: '#b44cff', monogram: 'NU' },
  itau: { accent: '#ec7000', secondary: '#ffb000', monogram: 'IT' },
  inter: { accent: '#ff7a00', secondary: '#ffad4d', monogram: 'IN' },
  mercadopago: { accent: '#00a9e0', secondary: '#006699', monogram: 'MP' },
  picpay: { accent: '#11C76F', secondary: '#07864B', monogram: 'P' },
  bradesco: { accent: '#cc092f', secondary: '#f0526f', monogram: 'BR' },
  santander: { accent: '#ec0000', secondary: '#ff5a5a', monogram: 'ST' },
  bb: { accent: '#f9dd16', secondary: '#2754c5', monogram: 'BB' },
  caixa: { accent: '#1479bd', secondary: '#f5a623', monogram: 'CX' },
  c6: { accent: '#e2e8f0', secondary: '#242424', monogram: 'C6' },
  recargapay: { accent: '#0ea5e9', secondary: '#0a192f', monogram: 'RP' },
  pagbank: { accent: '#55c552', secondary: '#167d4a', monogram: 'P' },
  pan: { accent: '#08a7e8', secondary: '#03619a', monogram: 'PAN' },
  neon: { accent: '#00e5ff', secondary: '#008fff', monogram: 'NE' },
  stone: { accent: '#00d700', secondary: '#005f27', monogram: 'ST' },
  btg: { accent: '#195ab4', secondary: '#0b2347', monogram: 'BTG' },
  xp: { accent: '#ffb800', secondary: '#000000', monogram: 'XP' },
  sicoob: { accent: '#00ae9d', secondary: '#7db61c', monogram: 'SC' },
};

const canonicalAliases: Record<string, string> = {
  nu: 'nubank',
  bradescard: 'bradesco',
  'nu pagamentos': 'nubank',
  'nu pagamentos sa': 'nubank',
  'mercado pago': 'mercadopago',
  'recarga pay': 'recargapay',
  recargapay: 'recargapay',
  'recargapay ip': 'recargapay',
  'recarga pay ip': 'recargapay',
  'carteira fisica': 'cash',
  'carteira manual': 'cash',
  'dinheiro fisico': 'cash',
  dinheiro: 'cash',
  'banco inter': 'inter',
  'itau unibanco': 'itau',
};

function hashColor(value: string) {
  let hash = 0;
  for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `hsl(${hash % 360} 62% 42%)`;
}

export function getBankVisual(name?: string | null) {
  const normalized = normalizeBankName(name);
  const aliasKey = canonicalAliases[normalized];
  const brand = findBankBrand(aliasKey || name);
  const key = aliasKey || brand?.id || normalized.replace(/\s/g, '-') || 'carteira';
  const title = key === 'cash' ? 'Carteira física' : brand?.name || String(name || 'Carteira').trim();
  const monogram = title.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  const base = visuals[key] || { accent: hashColor(key), secondary: '#334155', monogram: monogram || 'CF' };
  if (key === 'recargapay') {
    return {
      key,
      name: title,
      ...base,
      accent: '#0ea5e9',
      secondary: '#0a192f',
      cardBg: 'linear-gradient(135deg, #0a192f 0%, #0d2238 50%, #07131f 100%)',
      cardBorder: 'rgba(14, 165, 233, 0.3)',
      cardGlow: '0 0 20px rgba(14, 165, 233, 0.15)',
      logoBg: 'rgba(8, 47, 73, 0.6)',
      logoBorder: 'rgba(56, 189, 248, 0.3)',
      badgeDot: '#38bdf8',
      badgeDotGlow: '0 0 8px rgba(56, 189, 248, 0.8)',
      badgeText: '#7dd3fc',
      badgeBg: 'rgba(8, 47, 73, 0.4)',
      badgeBorder: 'rgba(14, 165, 233, 0.2)',
    };
  }
  return { key, name: title, ...base };
}

type AccountLike = { id: string; nickname: string; bank_name?: string | null; balance?: number };
type CardLike = { id: string; nickname: string; issuer?: string | null; account_id?: string | null };

export function groupWalletByBank<A extends AccountLike, C extends CardLike>(accounts: A[], cards: C[]) {
  const map = new Map<string, { key: string; visual: ReturnType<typeof getBankVisual>; accounts: A[]; cards: C[] }>();
  const ensure = (name?: string | null) => {
    const visual = getBankVisual(name);
    if (!map.has(visual.key)) map.set(visual.key, { key: visual.key, visual, accounts: [], cards: [] });
    return map.get(visual.key)!;
  };
  accounts.forEach(account => ensure(account.bank_name || account.nickname).accounts.push(account));
  cards.forEach(card => {
    const linked = accounts.find(account => account.id === card.account_id);
    ensure(linked?.bank_name || card.issuer || card.nickname).cards.push(card);
  });
  return [...map.values()];
}

export function buildChargeLink(baseUrl: string, input: { pixKey: string; recipient: string; amount?: number; description?: string }) {
  const url = new URL(baseUrl);
  url.searchParams.set('pix', input.pixKey);
  url.searchParams.set('recebedor', input.recipient);
  if (input.amount != null) url.searchParams.set('valor', input.amount.toFixed(2));
  if (typeof input.description === 'string') {
    const description = input.description.trim();
    if (description) url.searchParams.set('descricao', description);
  }
  return url.toString();
}

export function getCreditSummary(cards: Array<{ credit_limit: number; used_limit: number }>) {
  const total = cards.reduce((sum, card) => sum + Math.max(0, Number(card.credit_limit) || 0), 0);
  const used = cards.reduce((sum, card) => sum + Math.max(0, Number(card.used_limit) || 0), 0);
  return {
    total,
    used,
    available: Math.max(0, total - used),
    percentage: total > 0 ? Math.min(100, Math.max(0, (used / total) * 100)) : 0,
  };
}

/** Rótulos de contas apresentados exclusivamente em português do Brasil. */
export function walletAccountTypeLabel(value?: string | null): string {
  const labels: Record<string, string> = {
    CHECKING: 'Conta corrente', SAVINGS: 'Poupança', CASH: 'Carteira física',
    INVESTMENT: 'Investimento', PAYMENT: 'Conta de pagamento',
    PAYMENT_ACCOUNT: 'Conta de pagamento', CURRENT: 'Conta corrente',
  };
  const key = String(value || '').toUpperCase().trim();
  return labels[key] || (key ? 'Conta bancária' : 'Conta');
}

/** Rótulos de tipos técnicos de chave PIX apresentados em pt-BR. */
export function pixKeyTypeLabel(value?: string | null): string {
  const labels: Record<string, string> = {
    CPF: 'CPF', CNPJ: 'CNPJ', PHONE: 'Celular', EMAIL: 'E-mail', RANDOM: 'Aleatória',
  };
  return labels[String(value || '').toUpperCase().trim()] || 'Chave PIX';
}
