import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, RotateCcw } from 'lucide-react';
import { useFinancialPrivacy } from '../../contexts/FinancialPrivacyContext';

export interface SelectOptionItem {
  value: string;
  label: string;
  subtitle?: string;
  rightValue?: string;
  rightTone?: 'emerald' | 'slate';
  icon?: React.ReactNode;
}

interface SelectOptionListProps {
  ariaLabel: string;
  value: string;
  options: SelectOptionItem[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
  emptyHint?: string;
  triggerIcon?: React.ReactNode;
}

/**
 * Seletor padronizado do CapitalFlow para substituir <select> nativo no mobile/APK
 * sem criar rolagem aninhada presa dentro de modais.
 */
export const SelectOptionList: React.FC<SelectOptionListProps> = ({
  ariaLabel,
  value,
  options,
  onChange,
  placeholder = 'Selecione',
  disabled = false,
  clearable = false,
  emptyHint,
  triggerIcon,
}) => {
  const [open, setOpen] = useState(false);
  const privacyHidden = useFinancialPrivacy();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selectedOption = options.find((item) => item.value === value);
  const displayRightValue = (rightValue: string) => privacyHidden && /R\$/.test(rightValue) ? 'R$ ••••' : rightValue;

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);

  return (
    <div ref={rootRef} className="min-w-0 w-full space-y-1.5" onKeyDown={(event) => {
      if (open && event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }}>
      <div className="flex items-center gap-1.5">
        <button
          ref={triggerRef}
          type="button"
          disabled={disabled}
          aria-expanded={open}
          aria-label={`${ariaLabel}: ${selectedOption?.label || placeholder}`}
          onClick={() => setOpen((current) => !current)}
          className="flex min-h-12 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-left text-sm font-semibold text-slate-100 transition-colors hover:border-slate-600 focus-visible:outline-2 focus-visible:outline-blue-400 disabled:opacity-50"
        >
          <span className="flex min-w-0 items-center gap-2">
            {selectedOption?.icon ?? triggerIcon}
            <span className="truncate">{selectedOption?.label || placeholder}</span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {selectedOption?.rightValue && (
              <span
                className={`text-xs font-semibold tabular-nums ${
                  selectedOption.rightTone === 'slate' ? 'text-slate-300' : 'text-emerald-300'
                }`}
              >
                {displayRightValue(selectedOption.rightValue)}
              </span>
            )}
            <ChevronDown
              size={16}
              className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
            />
          </span>
        </button>

        {clearable && value && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              onChange('');
              setOpen(false);
            }}
            className="inline-flex min-h-12 shrink-0 items-center gap-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 text-xs font-semibold text-blue-300 hover:bg-blue-500/10 focus-visible:outline-2 focus-visible:outline-blue-400 disabled:opacity-50"
          >
            <RotateCcw size={13} /> Limpar
          </button>
        )}
      </div>

      {!value && emptyHint && (
        <p className="text-[11px] text-slate-400">{emptyHint}</p>
      )}

      {open && (
        <div
          role="radiogroup"
          aria-label={ariaLabel}
          className="grid gap-1.5 rounded-xl border border-slate-700 bg-slate-900 p-2"
        >
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={disabled}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={`flex min-h-11 w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-blue-400 disabled:opacity-50 ${
                  selected
                    ? 'border-blue-500/70 bg-blue-500/15 text-white'
                    : 'border-slate-800 bg-slate-950 text-slate-200 hover:border-slate-600'
                }`}
              >
                {option.icon && <span className="shrink-0">{option.icon}</span>}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold">{option.label}</span>
                  {option.subtitle && (
                    <span className="block text-[11px] text-slate-400">{option.subtitle}</span>
                  )}
                </span>
                {option.rightValue && (
                  <span
                    className={`shrink-0 text-right text-xs font-semibold tabular-nums ${
                      option.rightTone === 'slate' ? 'text-slate-300' : 'text-emerald-300'
                    }`}
                  >
                    {displayRightValue(option.rightValue)}
                  </span>
                )}
                {selected && <Check size={15} className="shrink-0 text-blue-300" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
