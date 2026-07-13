export const parseMoney = (value: string) => {
  if (!value) return 0;

  const clean = String(value).replace(/[R$\s]/g, '');
  if (clean.includes('.') && clean.includes(',')) {
    return parseFloat(clean.replace(/\./g, '').replace(',', '.')) || 0;
  }
  if (clean.includes(',')) return parseFloat(clean.replace(',', '.')) || 0;
  return parseFloat(clean) || 0;
};

export const normalizeText = (value: string) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

export const roundMoney = (value: number) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
