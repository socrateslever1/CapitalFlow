/**
 * Sistema de idiomas do CapitalFlow.
 * - Português do Brasil é o padrão e a fonte de todas as chaves.
 * - A escolha fica salva neste aparelho (por navegador/APK) e atualiza `<html lang>`.
 * - Formatação de moeda e datas NÃO muda com o idioma: continua no padrão brasileiro (R$, dd/mm/aaaa).
 */
import { ptBR, type MessageKey } from './locales/pt-BR';
import { en } from './locales/en';
import { es } from './locales/es';

export type { MessageKey };
export type Language = 'pt-BR' | 'en' | 'es';

export const DEFAULT_LANGUAGE: Language = 'pt-BR';
export const LANGUAGES: ReadonlyArray<{ code: Language; name: string }> = [
  { code: 'pt-BR', name: 'Português (Brasil)' },
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
];

const DICTIONARIES: Record<Language, Record<MessageKey, string>> = { 'pt-BR': ptBR, en, es };
const STORAGE_KEY = 'capitalflow:language';

export const isLanguage = (value: unknown): value is Language =>
  value === 'pt-BR' || value === 'en' || value === 'es';

const readStored = (): Language => {
  try {
    const value = globalThis.localStorage?.getItem(STORAGE_KEY);
    return isLanguage(value) ? value : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
};

let current: Language = readStored();
const listeners = new Set<() => void>();

const applyDocumentLanguage = (lang: Language) => {
  if (typeof document !== 'undefined') document.documentElement.lang = lang === 'pt-BR' ? 'pt-BR' : lang;
};
applyDocumentLanguage(current);

export const getLanguage = (): Language => current;

export const setLanguage = (lang: Language): void => {
  if (!isLanguage(lang) || lang === current) return;
  current = lang;
  try { globalThis.localStorage?.setItem(STORAGE_KEY, lang); } catch { /* armazenamento indisponível: vale só nesta sessão */ }
  applyDocumentLanguage(lang);
  listeners.forEach(listener => listener());
};

export const subscribeLanguage = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

/** Traduz uma chave; aceita variáveis no formato {nome}. Sem tradução, cai no português. */
export const translate = (key: MessageKey, vars?: Record<string, string | number>, lang: Language = current): string => {
  const template = DICTIONARIES[lang]?.[key] ?? ptBR[key] ?? key;
  return vars ? template.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? `{${name}}`)) : template;
};

/** Nome de uma tela/aba do menu. Nunca devolve o código interno (ex.: "SUPPORT"). */
export const navLabel = (tab: string, options: { short?: boolean; lang?: Language } = {}): string => {
  const lang = options.lang ?? current;
  if (options.short && `navShort.${tab}` in ptBR) return translate(`navShort.${tab}` as MessageKey, undefined, lang);
  if (`nav.${tab}` in ptBR) return translate(`nav.${tab}` as MessageKey, undefined, lang);
  return translate('nav.HUB', undefined, lang);
};

const SERVER_MESSAGE_RULES: ReadonlyArray<[RegExp, MessageKey]> = [
  [/failed to fetch|networkerror|network request failed|load failed|err_internet|err_network|net::/i, 'errors.network'],
  [/invalid login credentials/i, 'errors.invalidLogin'],
  [/email not confirmed/i, 'errors.emailNotConfirmed'],
  [/jwt expired|invalid jwt|refresh token|session (?:expired|not found)|auth session missing/i, 'errors.sessionExpired'],
  [/row-level security|permission denied|not authori[sz]ed|unauthori[sz]ed|forbidden/i, 'errors.permission'],
  [/duplicate key|already exists|already registered/i, 'errors.duplicate'],
  [/timed? ?out|timeout|aborterror|the operation was aborted/i, 'errors.timeout'],
  [/violates foreign key/i, 'errors.linkedRecord'],
  [/violates (?:check|not-null) constraint|invalid input syntax|invalid input value/i, 'errors.invalidData'],
  [/rate limit|too many requests/i, 'errors.rateLimit'],
  [/edge function|internal server error|bad gateway|service unavailable|gateway timeout/i, 'errors.server'],
];

const PORTUGUESE_MARKERS = /[áàâãéêíóôõúç]|\b(não|nao|para|com|sem|uma?|dos?|das?|que|erro|falha|conta|valor|tente)\b/i;
const ENGLISH_MARKERS = /\b(the|failed|failure|error|invalid|cannot|can't|unable|could not|not found|is not|does not|unexpected|missing|required|must|exception|undefined|null)\b/i;

/**
 * Converte mensagens técnicas (geralmente em inglês, vindas do Supabase, da rede ou do navegador)
 * em texto compreensível no idioma escolhido. Mensagens já em português passam sem alteração.
 */
export const translateServerMessage = (message: unknown, lang: Language = current): string => {
  const raw = message instanceof Error ? message.message : typeof message === 'string' ? message : '';
  const text = raw.trim();
  if (!text) return translate('errors.generic', undefined, lang);
  for (const [pattern, key] of SERVER_MESSAGE_RULES) if (pattern.test(text)) return translate(key, undefined, lang);
  if (lang === 'pt-BR' && !PORTUGUESE_MARKERS.test(text) && ENGLISH_MARKERS.test(text)) return translate('errors.generic', undefined, lang);
  return text;
};
