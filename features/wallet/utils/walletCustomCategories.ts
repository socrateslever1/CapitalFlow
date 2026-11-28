export const DEFAULT_EXPENSE_CATEGORIES = [
  'Alimentação',
  'Transporte',
  'Moradia',
  'Saúde',
  'Lazer',
  'Serviços',
  'Compras',
  'Educação',
  'Assinaturas',
  'Empréstimos',
  'Outros',
];

const STORAGE_PREFIX = 'capitalflow:wallet:custom-categories:v2:';

const storageKeyFor = (profileId: string | null | undefined): string | null =>
  profileId?.trim() ? `${STORAGE_PREFIX}${profileId}` : null;

export const normalizeCategoryName = (raw: string): string =>
  raw.trim().replace(/\s+/g, ' ').slice(0, 48);

export const mergeCategories = (base: string[], extras: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of [...base, ...extras]) {
    const clean = normalizeCategoryName(raw);
    if (!clean) continue;
    const key = clean.toLocaleLowerCase('pt-BR');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
  }
  return result;
};

export const loadCustomExpenseCategories = (profileId: string | null | undefined): string[] => {
  const storageKey = storageKeyFor(profileId);
  if (!storageKey || typeof window === 'undefined' || typeof window.localStorage === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) || '[]');
    if (!Array.isArray(parsed)) return [];
    return mergeCategories([], parsed.filter((item): item is string => typeof item === 'string'));
  } catch {
    return [];
  }
};

export const saveCustomExpenseCategory = (name: string, profileId: string | null | undefined): string[] => {
  const clean = normalizeCategoryName(name);
  const current = loadCustomExpenseCategories(profileId);
  if (!clean) return current;
  const next = mergeCategories(current, [clean]);
  const storageKey = storageKeyFor(profileId);
  if (storageKey && typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // Ignore storage quota errors in private mode.
    }
  }
  return next;
};
