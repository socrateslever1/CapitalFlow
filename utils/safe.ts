
export const asArray = <T>(v: any): T[] => {
  return Array.isArray(v) ? v : [];
};

export const asString = (v: any, fallback = '', fieldName?: string): string => {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (v === null || v === undefined) return fallback;
  return String(v);
};

export const asNumber = (v: any, fallback = 0, fieldName?: string): number => {
  const n = Number(v);
  if (!isNaN(n) && isFinite(n)) return n;
  return fallback;
};

export const safeDateString = (v: any, fieldName?: string): string => {
  try {
    if (!v) return ''; // Retorna string vazia para valores nulos/indefinidos
    if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString();
    if (typeof v === 'string' && v.trim().length > 0) {
        const d = new Date(v);
        if (!isNaN(d.getTime())) return d.toISOString();
    }
    return ''; // Fallback para string vazia em vez de now()
  } catch (e) {
    return '';
  }
};
