import { findBankBrand, normalizeBankName } from '../../utils/bankLogoRegistry';

const visuals: Record<string, { accent: string; secondary: string; monogram: string }> = {
  nubank: { accent: '#820ad1', secondary: '#b44cff', monogram: 'NU' },
  itau: { accent: '#ec7000', secondary: '#ffb000', monogram: 'IT' },
  inter: { accent: '#ff7a00', secondary: '#ffad4d', monogram: 'IN' },
  mercadopago: { accent: '#009ee3', secondary: '#63c7ed', monogram: 'MP' },
  picpay: { accent: '#21c25e', secondary: '#087c36', monogram: 'P' },
  bradesco: { accent: '#cc092f', secondary: '#f0526f', monogram: 'BR' },
  santander: { accent: '#ec0000', secondary: '#ff5a5a', monogram: 'ST' },
  bb: { accent: '#f9dd16', secondary: '#2754c5', monogram: 'BB' },
  caixa: { accent: '#1479bd', secondary: '#f5a623', monogram: 'CX' },
  c6: { accent: '#242424', secondary: '#777777', monogram: 'C6' },
};

function hashColor(value: string) {
  let hash = 0;
  for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `hsl(${hash % 360} 62% 42%)`;
}

export function getBankVisual(name?: string | null) {
  const brand = findBankBrand(name);
  const key = brand?.id || normalizeBankName(name).replace(/\s/g, '-') || 'carteira';
  const title = brand?.name || String(name || 'Carteira').trim();
  const monogram = title.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  return { key, name: title, ...(visuals[key] || { accent: hashColor(key), secondary: '#334155', monogram: monogram || 'CF' }) };
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

export function buildChargeLink(baseUrl: string, input: { pixKey: string; recipient: string; amount?: number }) {
  const url = new URL(baseUrl);
  url.searchParams.set('pix', input.pixKey);
  url.searchParams.set('recebedor', input.recipient);
  if (input.amount != null) url.searchParams.set('valor', input.amount.toFixed(2));
  return url.toString();
}
