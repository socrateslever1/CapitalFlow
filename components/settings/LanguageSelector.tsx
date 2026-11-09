import React from 'react';
import { Languages } from 'lucide-react';
import { LANGUAGES, isLanguage } from '../../i18n';
import { useI18n } from '../../i18n/useI18n';

/** Seletor de idioma da interface. A escolha vale para este aparelho/navegador. */
export const LanguageSelector: React.FC<{ onChanged?: (message: string) => void }> = ({ onChanged }) => {
  const { language, setLanguage, t } = useI18n();
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-950 p-4 space-y-3">
      <label htmlFor="capitalflow-language" className="flex items-center gap-2 text-sm font-bold text-white">
        <Languages size={18} className="text-blue-400" aria-hidden="true" /> {t('language.label')}
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
        className="w-full rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        {LANGUAGES.map(option => <option key={option.code} value={option.code} lang={option.code}>{option.name}</option>)}
      </select>
      {language !== 'pt-BR' && <p className="text-[11px] text-amber-300">{t('language.partial')}</p>}
    </section>
  );
};
