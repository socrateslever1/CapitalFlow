import { bankLogoAssetsA } from '../assets/bankLogoAssetsA';
import { bankLogoAssetsB } from '../assets/bankLogoAssetsB';

/**
 * Logos estão incorporados ao bundle, sem CDNs ou solicitações externas.
 * Arquivos SVG auditados em rzmt/logos-bancos-br (MIT); correspondência ISPB.
 * Chave/identidade bancária NÃO é determinada a partir deste logotipo.
 */
export type BankBrand = { id: string; name: string; ispb: string; aliases: string[] };
export const BANK_CATALOG: BankBrand[] = [
  {
    "id": "nubank",
    "name": "Nubank",
    "ispb": "18236120",
    "aliases": [
      "nu pagamentos",
      "roxinho",
      "nubank"
    ]
  },
  {
    "id": "bb",
    "name": "Banco do Brasil",
    "ispb": "00000000",
    "aliases": [
      "banco do brasil",
      "bb"
    ]
  },
  {
    "id": "caixa",
    "name": "Caixa",
    "ispb": "00360305",
    "aliases": [
      "caixa economica federal",
      "caixa"
    ]
  },
  {
    "id": "bradesco",
    "name": "Bradesco",
    "ispb": "60746948",
    "aliases": [
      "banco bradesco",
      "bradesco"
    ]
  },
  {
    "id": "itau",
    "name": "Itaú",
    "ispb": "60701190",
    "aliases": [
      "itau unibanco",
      "itau"
    ]
  },
  {
    "id": "santander",
    "name": "Santander",
    "ispb": "90400888",
    "aliases": [
      "banco santander",
      "santander"
    ]
  },
  {
    "id": "inter",
    "name": "Inter",
    "ispb": "00416968",
    "aliases": [
      "banco inter",
      "inter"
    ]
  },
  {
    "id": "c6",
    "name": "C6 Bank",
    "ispb": "31872495",
    "aliases": [
      "c6 bank",
      "banco c6",
      "c6"
    ]
  },
  {
    "id": "picpay",
    "name": "PicPay",
    "ispb": "22896431",
    "aliases": [
      "picpay",
      "pic pay"
    ]
  },
  {
    "id": "recargapay",
    "name": "RecargaPay",
    "ispb": "11275560",
    "aliases": [
      "recargapay",
      "recarga pay"
    ]
  },
  {
    "id": "mercadopago",
    "name": "Mercado Pago",
    "ispb": "10573521",
    "aliases": [
      "mercado pago",
      "mercadopago"
    ]
  },
  {
    "id": "pagbank",
    "name": "PagBank",
    "ispb": "08561701",
    "aliases": [
      "pagbank",
      "pagseguro"
    ]
  },
  {
    "id": "neon",
    "name": "Neon",
    "ispb": "20855875",
    "aliases": [
      "neon pagamentos",
      "neon"
    ]
  },
  {
    "id": "pan",
    "name": "Banco Pan",
    "ispb": "59285411",
    "aliases": [
      "banco pan",
      "pan"
    ]
  },
  {
    "id": "btg",
    "name": "BTG Pactual",
    "ispb": "30306294",
    "aliases": [
      "btg pactual",
      "btg"
    ]
  },
  {
    "id": "sicredi",
    "name": "Sicredi",
    "ispb": "01181521",
    "aliases": [
      "sicredi"
    ]
  },
  {
    "id": "sicoob",
    "name": "Sicoob",
    "ispb": "02038232",
    "aliases": [
      "sicoob"
    ]
  },
  {
    "id": "stone",
    "name": "Stone",
    "ispb": "16501555",
    "aliases": [
      "stone pagamentos",
      "stone"
    ]
  },
  {
    "id": "infinitepay",
    "name": "InfinitePay",
    "ispb": "18189547",
    "aliases": [
      "infinitepay",
      "cloudwalk"
    ]
  },
  {
    "id": "original",
    "name": "Banco Original",
    "ispb": "92894922",
    "aliases": [
      "banco original",
      "original"
    ]
  },
  {
    "id": "amazonia",
    "name": "Banco da Amazônia",
    "ispb": "04902979",
    "aliases": [
      "banco da amazonia",
      "basA"
    ]
  }
];
const svgs: Record<string,string> = { ...bankLogoAssetsA, ...bankLogoAssetsB };
const cache = new Map<string,string>();
export function normalizeBankName(value: string | null | undefined): string {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
}
export function findBankBrand(value: string | null | undefined): BankBrand | null {
  const normalized = normalizeBankName(value);
  if (!normalized) return null;
  // Exact names/explicit aliases only: don't mistake "Internet" for Banco Inter.
  return BANK_CATALOG.find(bank => bank.aliases.some(alias =>
    normalized === normalizeBankName(alias) ||
    normalized === 'banco ' + normalizeBankName(alias) ||
    normalized === normalizeBankName(alias) + ' sa'
  )) || null;
}
export function resolveBankLogo(...names: (string | null | undefined)[]): string | null {
  for (const name of names) {
    const brand = findBankBrand(name);
    if (!brand || !svgs[brand.id]) continue;
    if (!cache.has(brand.id)) cache.set(brand.id,'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgs[brand.id]));
    return cache.get(brand.id)!;
  }
  return null;
}
export function getBankLogo(...names: (string | null | undefined)[]): string | null {
  return resolveBankLogo(...names);
}
