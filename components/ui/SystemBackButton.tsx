import React, { useEffect, useRef, type ButtonHTMLAttributes } from 'react';
import { ArrowLeft } from 'lucide-react';
import { isAppleMobile } from '../../utils/appleMobile';
import { usePageBack } from '../../contexts/PageBackContext';

type SystemBackButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  label?: string;
  appleOnly?: boolean;
  local?: boolean;
};

export function SystemBackButton({
  label = 'Voltar',
  className = '',
  title,
  appleOnly = false,
  local = false,
  ...buttonProps
}: SystemBackButtonProps) {
  const apple = isAppleMobile();
  const pageBack = usePageBack();
  const onClickRef = useRef(buttonProps.onClick);
  onClickRef.current = buttonProps.onClick;
  const register = pageBack?.register;
  const usePageHeader = apple && !local && !!register;
  useEffect(() => {
    if (!usePageHeader) return;
    return register!({
      onClick: event => onClickRef.current?.(event),
      disabled: buttonProps.disabled,
    });
  }, [usePageHeader, register, buttonProps.disabled]);

  if ((appleOnly && !apple) || usePageHeader) return null;
  return (
    <button
      {...buttonProps}
      type="button"
      title={title || (apple ? 'Voltar' : label)}
      aria-label={buttonProps['aria-label'] || (apple ? 'Voltar' : label)}
      className={apple
        ? 'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs font-bold text-slate-300 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-blue-400 disabled:opacity-50'
        : `inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-slate-800 px-3 text-[10px] font-black uppercase text-white shadow-md transition-all hover:bg-slate-700 hover:shadow-lg active:scale-95 ${className}`.trim()}
    >
      <ArrowLeft size={apple ? 18 : 14} aria-hidden="true" />
      <span>{apple ? 'Voltar' : label}</span>
    </button>
  );
}
