import type { ButtonHTMLAttributes } from 'react';
import { ArrowLeft } from 'lucide-react';

type SystemBackButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  label?: string;
};

export function SystemBackButton({
  label = 'Voltar',
  className = '',
  title,
  ...buttonProps
}: SystemBackButtonProps) {
  return (
    <button
      {...buttonProps}
      type="button"
      title={title || label}
      aria-label={buttonProps['aria-label'] || label}
      className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-slate-800 px-3 text-[10px] font-black uppercase text-white shadow-md transition-all hover:bg-slate-700 hover:shadow-lg active:scale-95 ${className}`.trim()}
    >
      <ArrowLeft size={14} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}
