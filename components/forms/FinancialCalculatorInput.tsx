import React, { useEffect, useRef, useState } from 'react';
import { parseWalletMoney, parseWalletRate, parseWalletSignedMoney } from '../../features/wallet/utils/parseWalletMoney';
import { formatLiveBrazilianMoney, formatLiveBrazilianCents, backspaceLiveBrazilianCents, formatPastedBrazilianMoney, formatLiveBrazilianSignedCents, backspaceLiveBrazilianSignedCents, formatMoneyExpressionOperand, insertMoneyExpressionOperator, backspaceMoneyExpressionOperand, normalizePastedMoneyExpression, isAllowedFinancialInputDraft } from '../../features/wallet/utils/liveBrazilianMoneyInput';

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onBlur' | 'type'> & {
  value: string | number | null | undefined;
  type?: 'text' | 'number';
  onCommit?: (value: string) => void;
  /** Emite o rascunho normalizado para prévias, sem alterar o valor confirmado. */
  onDraftChange?: (draft: string) => void;
  onChange?: (event: { target: { value: string } }) => void;
  onBlur?: () => void;
  rate?: boolean;
  signed?: boolean;
  /** Digitação monetária por centavos, padrão dos campos financeiros. */
  centsEntry?: boolean;
  fieldLabel?: string;
};

/** Mantém a expressão local enquanto o usuário digita, sem alimentar fórmulas com texto parcial. */
export const FinancialCalculatorInput: React.FC<Props> = ({
  value, onCommit, onDraftChange, onChange, onBlur, type: _type, rate = false, signed = false, centsEntry = true, fieldLabel = 'valor', className = '',
  onFocus, onKeyDown, onPaste, disabled, ...rest
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [operatorsOpen, setOperatorsOpen] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) onDraftChange?.(draft);
  }, [draft, editing, onDraftChange]);
  const displayValue = () => {
    const raw = String(value ?? '');
    if (!raw) return raw;
    if (signed) {
      if (!centsEntry) return raw;
      try { return parseWalletSignedMoney(raw, fieldLabel).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
      catch { return raw; }
    }
    if (rate) {
      if (!centsEntry) return raw;
      try { return parseWalletRate(raw, fieldLabel).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 6 }); }
      catch { return raw; }
    }
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
    const inserted = /[+\-×÷*/]/.test(operator) ? insertMoneyExpressionOperator(draft, operator, start, end) : null;
    if (/[+\-×÷*/]/.test(operator) && !inserted) return;
    const next = inserted?.value ?? draft.slice(0, start) + operator + draft.slice(end);
    const caret = inserted?.caret ?? start + operator.length;
    setDraft(next);
    setError('');
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(caret, caret);
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
            // O Android dispara input sem keydown. Trate Backspace antes de
            // distinguir número simples de expressão para preservar centavos.
            const inputType = (e.nativeEvent as InputEvent).inputType;
            if (!isAllowedFinancialInputDraft(raw)) {
              return;
            }
            const caret = input.selectionStart ?? raw.length;
            const operator = raw[caret - 1];
            if (!signed && !rate && raw.length === draft.length + 1 && /[+\-×÷*/]/.test(operator ?? '')
              && raw === draft.slice(0, caret - 1) + operator + draft.slice(caret - 1)) {
              const next = insertMoneyExpressionOperator(draft, operator, caret - 1);
              if (!next) return;
              setDraft(next.value);
              setError('');
              input.setCustomValidity('');
              requestAnimationFrame(() => {
                if (document.activeElement === input) input.setSelectionRange(next.caret, next.caret);
              });
              return;
            }
            if (centsEntry && inputType === 'deleteContentBackward' && raw.length < draft.length
              && input.selectionStart === raw.length && input.selectionEnd === raw.length) {
              const next = raw === '' ? { value: '', caret: 0 } : signed ? backspaceLiveBrazilianSignedCents(draft)
                : /[+\-×÷*/()%]/.test(draft) ? backspaceMoneyExpressionOperand(draft) : backspaceLiveBrazilianCents(draft);
              setDraft(next.value);
              setError('');
              input.setCustomValidity('');
              requestAnimationFrame(() => {
                if (document.activeElement === input) input.setSelectionRange(next.caret, next.caret);
              });
              return;
            }
            if ((centsEntry || (!signed && !rate)) &&
                (signed ? /^-?[\d.,]*$/.test(raw) : /^[\d.,]*$/.test(raw))) {
              const next = centsEntry
                ? signed ? formatLiveBrazilianSignedCents(raw) : formatLiveBrazilianCents(raw)
                : formatLiveBrazilianMoney(raw, input.selectionStart ?? raw.length);
              if (!next) return;
              setDraft(next.value);
              requestAnimationFrame(() => {
                if (document.activeElement === input) input.setSelectionRange(next.caret, next.caret);
              });
            } else if (!signed && !rate) {
              const next = formatMoneyExpressionOperand(raw, input.selectionStart ?? raw.length, centsEntry);
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
          onPaste={e => {
            const pasted = e.clipboardData.getData('text');
            const strippedCurrency = pasted.trim().replace(/^R\$\s*/i, '').trim();
            if (!strippedCurrency || !/\d/.test(strippedCurrency) || !isAllowedFinancialInputDraft(strippedCurrency)) {
              e.preventDefault();
              setError('Valor colado inválido. Confira a quantia antes de continuar.');
              e.currentTarget.setCustomValidity('Valor colado inválido.');
              return;
            }
            if (!centsEntry) { onPaste?.(e); return; }
            e.preventDefault();
            try {
              const normalized = !rate && !signed && /[+×÷*/()%]/.test(pasted)
                ? normalizePastedMoneyExpression(pasted)
                : formatPastedBrazilianMoney(pasted, rate, signed);
              setDraft(normalized);
              setError('');
              e.currentTarget.setCustomValidity('');
              const input = e.currentTarget;
              requestAnimationFrame(() => {
                if (document.activeElement === input) input.setSelectionRange(normalized.length, normalized.length);
              });
            } catch {
              // Colagem inválida não apaga o valor que já estava preenchido.
              setError('Valor colado inválido. Confira a quantia antes de continuar.');
              e.currentTarget.setCustomValidity('Valor colado inválido.');
            }
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
            if (centsEntry && e.key === 'Backspace') {
              const input = e.currentTarget;
              const start = input.selectionStart ?? 0;
              const end = input.selectionEnd ?? 0;
              // Apagar no fim remove o último centavo digitado. Ao chegar a zero,
              // limpa o campo para permitir um novo lançamento sem travar em ,00.
              if (start === end && end === input.value.length && input.value) {
                e.preventDefault();
                const next = signed ? backspaceLiveBrazilianSignedCents(input.value)
                  : /[+\-×÷*/()%]/.test(input.value) ? backspaceMoneyExpressionOperand(input.value) : backspaceLiveBrazilianCents(input.value);
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
            if (!rate && !signed && !centsEntry && (e.key === 'Backspace' || e.key === 'Delete')) {
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
          className={className + (rate ? ' pr-20' : ' pr-12')}
        />
        {rate && <span aria-hidden="true" className="pointer-events-none absolute right-11 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">%</span>}
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
