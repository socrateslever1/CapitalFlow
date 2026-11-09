import React from 'react';
import { Globe } from 'lucide-react';
import { LANGUAGES, isLanguage } from '../../i18n';
import { useI18n } from '../../i18n/useI18n';

const SHORT: Record<string, string> = { 'pt-BR': 'PT', en: 'EN', es: 'ES' };

/**
 * Botão compacto de idioma para a tela de login (antes de entrar no sistema).
 * Usa <select> nativo: no celular abre a lista do próprio aparelho e funciona com leitor de tela.
 */
export const LoginLanguageSwitcher: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { language, setLanguage, t } = useI18n();
  return (
    <label
      className={'relative flex h-10 items-center gap-1.5 rounded-full bg-slate-800/60 pl-3 pr-2 text-slate-300 transition-colors hover:text-white focus-within:outline focus-within:outline-2 focus-within:outline-blue-500 ' + className}
      title={t('language.choose')}
    >
      <Globe size={16} aria-hidden="true" />
      <span className="text-[11px] font-black" aria-hidden="true">{SHORT[language] ?? language}</span>
      <select
        aria-label={t('language.choose')}
        value={language}
        onChange={event => { if (isLanguage(event.target.value)) setLanguage(event.target.value); }}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      >
        {LANGUAGES.map(option => (
          <option key={option.code} value={option.code} lang={option.code}>{option.name}</option>
        ))}
      </select>
    </label>
  );
};
