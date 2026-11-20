import React from 'react';
import { Languages } from 'lucide-react';
import { LANGUAGES } from '../../i18n';
import { useI18n } from '../../i18n/useI18n';

/** Exibe o idioma disponível na interface. */
export const LanguageSelector: React.FC = () => {
  const { t } = useI18n();
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-2.5">
      <div className="flex items-center gap-2 text-sm font-bold text-white">
        <Languages size={17} className="text-blue-400" aria-hidden="true" /> {t('language.label')}
      </div>
      <p className="text-xs text-slate-400">{t('language.description')}</p>
      <div lang={LANGUAGES[0].code} className="flex h-10 items-center rounded-lg border border-slate-800 bg-slate-900 px-3 text-sm font-medium text-white">
        {LANGUAGES[0].name}
      </div>
    </section>
  );
};
