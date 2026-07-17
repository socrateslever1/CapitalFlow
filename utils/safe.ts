
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

export const safeDateOnlyString = (v: any, fieldName?: string): string => {
  try {
    if (!v) return '';

    if (v instanceof Date && !isNaN(v.getTime())) {
      const y = v.getFullYear();
      const m = String(v.getMonth() + 1).padStart(2, '0');
      const d = String(v.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }

    if (typeof v === 'string' && v.trim().length > 0) {
      const raw = v.trim();
      const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (dateOnly) return `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`;

      const brDate = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
      if (brDate) return `${brDate[3]}-${brDate[2]}-${brDate[1]}`;

      const d = new Date(raw);
      if (!isNaN(d.getTime())) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      }
    }

    return '';
  } catch (e) {
    return '';
  }
};
