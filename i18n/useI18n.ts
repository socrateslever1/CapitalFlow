import { useCallback, useSyncExternalStore } from 'react';
import { getLanguage, navLabel, setLanguage, subscribeLanguage, translate, translateServerMessage,
  type Language, type MessageKey } from './index';

/** Hook React: re-renderiza o componente quando o idioma muda. */
export const useI18n = () => {
  const language = useSyncExternalStore(subscribeLanguage, getLanguage, getLanguage);
  const t = useCallback((key: MessageKey, vars?: Record<string, string | number>) => translate(key, vars, language), [language]);
  const tab = useCallback((code: string, short = false) => navLabel(code, { short, lang: language }), [language]);
  const serverMessage = useCallback((message: unknown) => translateServerMessage(message, language), [language]);
  return { language, setLanguage: (lang: Language) => setLanguage(lang), t, tab, serverMessage };
};
