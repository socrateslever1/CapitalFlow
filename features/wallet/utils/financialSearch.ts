/**
 * Busca local sobre entradas financeiras previamente carregadas sob a autorização do usuário.
 * Suporta texto sem acentos, data e valores positivos/negativos em centavos.
 */
export type FinancialSearchRecord = {
  texts?: readonly (string | null | undefined)[];
  amounts?: readonly (number | null | undefined)[];
  dates?: readonly (string | null | undefined)[];
};

const normalize = (value: string): string => value
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('pt-BR').trim().replace(/\s+/g, ' ');

type MoneyTerm = { integer: string; fraction: string | null; sign: 1 | -1 | null };

const parseMoneyTerm = (raw: string): MoneyTerm | null => {
  const match = /^(?:(\+|-|−)\s*)?(?:r\$\s*)?([\d.,]+)$/.exec(raw.trim());
  if (!match) return null;
  const sign: 1 | -1 | null = match[1] ? (match[1] === '+' ? 1 : -1) : null;
  const content = match[2];
  let integer = content;
  let fraction: string | null = null;
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d{0,2})?$/.test(content)) {
    const index = content.indexOf(',');
    integer = (index < 0 ? content : content.slice(0, index)).replace(/\./g, '');
    fraction = index < 0 ? null : content.slice(index + 1);
  } else if (/^\d+(?:[,.]\d{0,2})?$/.test(content)) {
    const sepIndex = Math.max(content.indexOf(','), content.indexOf('.'));
    if (sepIndex >= 0) {
      integer = content.slice(0, sepIndex);
      fraction = content.slice(sepIndex + 1);
    }
  } else return null;
  return { integer: integer.replace(/^0+(?=\d)/, ''), fraction, sign };
};

const amountMatches = (amount: number | null | undefined, term: MoneyTerm): boolean => {
  if (amount == null || !Number.isFinite(amount)) return false;
  if ((term.sign === 1 && amount < 0) || (term.sign === -1 && amount >= 0)) return false;
  const cents = Math.round(Math.abs(amount) * 100);
  if (!Number.isSafeInteger(cents)) return false;
  const integer = String(Math.trunc(cents / 100));
  if (!integer.startsWith(term.integer)) return false;
  return term.fraction === null
    || String(cents % 100).padStart(2, '0').startsWith(term.fraction);
};

const searchableDates = (dates: FinancialSearchRecord['dates']): string => {
  if (!dates?.length) return '';
  return dates.filter((date): date is string => Boolean(date)).map((date) => {
    const clean = date.slice(0, 10);
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean);
    return iso
      ? date + ' ' + iso[3] + '/' + iso[2] + '/' + iso[1] + ' ' + iso[2] + '/' + iso[1] + ' ' + iso[3] + '/' + iso[2]
      : date;
  }).join(' ');
};

export const createFinancialSearchMatcher = (query: string) => {
  const normalized = normalize(query);
  if (!normalized) return (_record: FinancialSearchRecord): boolean => true;
  const terms = parseMoneyTerm(normalized)
    ? [normalized]
    : normalized.replace(/\br\$\s+(?=[+-]?\d)/g, '').split(' ').filter(Boolean);
  const parsedTerms = terms.map(term => ({ term, money: parseMoneyTerm(term) }));
  return (record: FinancialSearchRecord): boolean => {
    const searchableText = normalize([
      ...(record.texts || []),
      searchableDates(record.dates),
    ].filter(Boolean).join(' '));
    return parsedTerms.every(({ term, money }) =>
      searchableText.includes(term)
      || Boolean(money && record.amounts?.some(amount => amountMatches(amount, money))),
    );
  };
};
