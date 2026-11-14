import React from 'react';
import { Languages } from 'lucide-react';
import { LANGUAGES, isLanguage } from '../../i18n';
import { useI18n } from '../../i18n/useI18n';

/** Seletor de idioma da interface. A escolha vale para este aparelho/navegador. */
export const LanguageSelector: React.FC<{ onChanged?: (message: string) => void }> = ({ onChanged }) => {
  const { language, setLanguage, t } = useI18n();
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-2.5">
      <label htmlFor="capitalflow-language" className="flex items-center gap-2 text-sm font-bold text-white">
        <Languages size={17} className="text-blue-400" aria-hidden="true" /> {t('language.label')}
      </label>
      <p className="text-xs text-slate-400">{t('language.description')}</p>
      <select
        id="capitalflow-language"
        value={language}
        onChange={event => {
          const next = event.target.value;
          if (!isLanguage(next)) return;
          setLanguage(next);
          onChanged?.(t('language.saved'));
        }}
        className="w-full h-10 rounded-lg border border-slate-800 bg-slate-900 px-3 text-sm text-white font-medium outline-none focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/40 transition-colors"
      >
        {LANGUAGES.map(option => <option key={option.code} value={option.code} lang={option.code}>{option.name}</option>)}
      </select>
      {language !== 'pt-BR' && <p className="text-xs text-amber-300">{t('language.partial')}</p>}
    </section>
  );
};
