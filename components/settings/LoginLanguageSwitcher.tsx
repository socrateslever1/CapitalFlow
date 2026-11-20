import React from 'react';
import { Globe } from 'lucide-react';
import { LANGUAGES } from '../../i18n';
import { useI18n } from '../../i18n/useI18n';

/** Identifica o idioma disponível na tela de login. */
export const LoginLanguageSwitcher: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { t } = useI18n();
  return (
    <span
      role="status"
      aria-label={t('language.description')}
      className={'flex h-10 w-auto max-w-max shrink-0 items-center gap-1.5 self-start rounded-full bg-slate-800/60 px-3 text-slate-300 ' + className}
    >
      <Globe size={16} aria-hidden="true" />
      <span className="text-[11px] font-black">{LANGUAGES[0].name}</span>
    </span>
  );
};
