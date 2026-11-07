import React, { useRef, useState } from 'react';
import { parseWalletMoney, parseWalletRate, parseWalletSignedMoney } from '../../features/wallet/utils/parseWalletMoney';

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
          value={editing ? draft : String(value ?? '')}
          onChange={e => { setDraft(e.target.value); setError(''); e.currentTarget.setCustomValidity(''); }}
          onFocus={e => {
            setDraft(String(value ?? ''));
            setEditing(true);
            onFocus?.(e);
          }}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
            onKeyDown?.(e);
          }}
          aria-invalid={!!error}
          className={className + ' pr-12'}
        />
        <button type="button" disabled={disabled} aria-label="Operadores de cálculo"
          onPointerDown={e => e.preventDefault()}
          onClick={() => { if (!editing) { setDraft(String(value ?? '')); setEditing(true); } setOperatorsOpen(v => !v); ref.current?.focus(); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-slate-800 px-2 py-1 text-xs font-semibold text-blue-300"
        >ƒx</button>
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
