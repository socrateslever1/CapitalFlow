import React, { useRef, useState } from 'react';
import { parseWalletMoney, parseWalletRate, parseWalletSignedMoney } from '../../features/wallet/utils/parseWalletMoney';
import { formatLiveBrazilianMoney } from '../../features/wallet/utils/liveBrazilianMoneyInput';

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onBlur' | 'type'> & {
  value: string | number | null | undefined;
  type?: 'text' | 'number';
  onCommit?: (value: string) => void;
  onChange?: (event: { target: { value: string } }) => void;
  onBlur?: () => void;
  rate?: boolean;
  signed?: boolean;
  fieldLabel?: string;
};

/** Mantém a expressão local enquanto o usuário digita, sem alimentar fórmulas com texto parcial. */
export const FinancialCalculatorInput: React.FC<Props> = ({
  value, onCommit, onChange, onBlur, type: _type, rate = false, signed = false, fieldLabel = 'valor', className = '',
  onFocus, onKeyDown, disabled, ...rest
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [operatorsOpen, setOperatorsOpen] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const displayValue = () => {
    const raw = String(value ?? '');
    if (!raw || rate || signed) return raw;
    // Zero is the empty initial state for optional financial fields.
    if (Number(raw.replace(',', '.')) === 0) return '';
    try { return parseWalletMoney(raw, fieldLabel).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
    catch { return raw; }
  };

  const commit = () => {
    const raw = draft.trim();
    if (!raw) {
      ref.current?.setCustomValidity('');
      setEditing(false);
      setOperatorsOpen(false);
      setError('');
      onCommit?.('');
      onChange?.({ target: { value: '' } });
      onBlur?.();
      return;
    }
    try {
      const result = rate ? parseWalletRate(raw, fieldLabel) : signed ? parseWalletSignedMoney(raw, fieldLabel) : parseWalletMoney(raw, fieldLabel);
      ref.current?.setCustomValidity('');
      const normalized = rate ? String(result) : result.toFixed(2);
      onCommit?.(normalized);
      onChange?.({ target: { value: normalized } });
      onBlur?.();
      setError('');
      setEditing(false);
      setOperatorsOpen(false);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Confira o cálculo.';
      setError(message);
      ref.current?.setCustomValidity(message);
      // Não fecha nem registra um valor inválido.
    }
  };
  const insert = (operator: string) => {
    const input = ref.current;
    const start = input?.selectionStart ?? draft.length;
    const end = input?.selectionEnd ?? start;
    const next = draft.slice(0, start) + operator + draft.slice(end);
    setDraft(next);
    setError('');
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + operator.length, start + operator.length);
    });
  };
  return (
    <div className="relative min-w-0 w-full">
      <div className="relative">
        <input
          {...rest}
          ref={ref}
          type="text"
          inputMode="decimal"
          disabled={disabled}
          value={editing ? draft : displayValue()}
          onChange={e => {
            const input = e.currentTarget;
            const raw = input.value;
            if (!rate && !signed && /^[\d.,]*$/.test(raw)) {
              const next = formatLiveBrazilianMoney(raw, input.selectionStart ?? raw.length);
              if (!next) return;
              setDraft(next.value);
              requestAnimationFrame(() => {
                if (document.activeElement === input) input.setSelectionRange(next.caret, next.caret);
              });
            } else {
              setDraft(raw);
            }
            setError('');
            input.setCustomValidity('');
          }}
          onFocus={e => {
            const focusedInput = e.currentTarget;
            const current = displayValue();
            setDraft(current);
            setEditing(true);
            // Android and desktop: replacing an existing amount must not require
            // deleting separators or navigating through the fixed decimal part.
            requestAnimationFrame(() => {
              if (document.activeElement === focusedInput) focusedInput.select();
            });
            onFocus?.(e);
          }}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
            if (!rate && !signed && (e.key === 'Backspace' || e.key === 'Delete')) {
              const input = e.currentTarget;
              const start = input.selectionStart ?? 0;
              const end = input.selectionEnd ?? start;
              const separator = input.value.indexOf(',');
              // Never trap the cursor at the decimal separator. Delete the preceding
              // integer digit and reapply grouping, or allow the entire field to clear.
              if (start === end && separator >= 0 &&
                  ((e.key === 'Backspace' && start === separator + 1) ||
                   (e.key === 'Delete' && start === separator))) {
                e.preventDefault();
                const integerDigits = input.value.slice(0, separator).replace(/\D/g, '');
                const remaining = integerDigits.slice(0, -1);
                const next = remaining
                  ? formatLiveBrazilianMoney(remaining + input.value.slice(separator), remaining.length)
                  : { value: '', caret: 0 };
                if (next) {
                  setDraft(next.value);
                  setError('');
                  input.setCustomValidity('');
                  requestAnimationFrame(() => {
                    if (document.activeElement === input) input.setSelectionRange(next.caret, next.caret);
                  });
                }
              }
            }
            onKeyDown?.(e);
          }}
          aria-invalid={!!error}
          className={className + ' pr-12'}
        />
        <button type="button" disabled={disabled} aria-label="Operadores de cálculo"
          onPointerDown={e => e.preventDefault()}
          onClick={() => { if (!editing) { setDraft(displayValue()); setEditing(true); } setOperatorsOpen(v => !v); ref.current?.focus(); }}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1.5 text-xs font-semibold text-slate-500 hover:text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
        ><span aria-hidden="true">±</span></button>
      </div>
      {editing && operatorsOpen && (
        <div className="mt-1 flex flex-wrap gap-1" aria-label="Operadores matemáticos">
          {['+', '−', '×', '÷', '%', '(', ')'].map(op => (
            <button key={op} type="button" aria-label={'Inserir ' + op}
              onPointerDown={e => e.preventDefault()}
              onClick={() => insert(op === '−' ? '-' : op)}
              className="min-h-9 min-w-9 rounded-md border border-slate-700 bg-slate-800 px-2 text-sm text-white"
            >{op}</button>
          ))}
        </div>
      )}
      {error && <p role="alert" className="mt-1 text-xs text-rose-300">{error}</p>}
    </div>
  );
};
