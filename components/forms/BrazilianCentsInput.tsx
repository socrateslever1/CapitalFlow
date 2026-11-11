import React from 'react';
import {
  backspaceLiveBrazilianCents,
  formatPastedBrazilianMoney,
  resolveLiveBrazilianCentsChange,
} from '../../features/wallet/utils/liveBrazilianMoneyInput';
import { parseWalletMoney } from '../../features/wallet/utils/parseWalletMoney';

type Props = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type' | 'inputMode' | 'value' | 'onChange' | 'onPaste'
> & {
  /** Valor canônico com ponto decimal, compatível com os cálculos de parcelas. */
  value: string;
  onValueChange: (value: string) => void;
};

/** Apenas a apresentação é brasileira; o estado do contrato continua decimal canônico. */
export function displayBrazilianCents(value: string): string {
  if (!value.trim()) return '';
  return parseWalletMoney(value, 'valor').toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function toCanonical(formatted: string): string {
  return formatted ? parseWalletMoney(formatted, 'valor').toFixed(2) : '';
}

export function resolveBrazilianCentsEdit(
  raw: string, previousCanonical: string, inputType?: string | null,
): Readonly<{ value: string; caret: number }> | null {
  const result = resolveLiveBrazilianCentsChange(
    raw, displayBrazilianCents(previousCanonical), inputType,
  );
  if (!result) return null;
  return { value: toCanonical(result.value), caret: result.caret };
}

export function resolveBrazilianCentsPaste(raw: string): string {
  return toCanonical(formatPastedBrazilianMoney(raw));
}

/** Teclado móvel: 8 → 0,08; 88 → 0,88; 880 → 8,80. Colagem mantém reais. */
export const BrazilianCentsInput: React.FC<Props> = ({
  value, onValueChange, onFocus, onKeyDown, disabled, ...rest
}) => {
  const moveCaret = (input: HTMLInputElement, pos: number) => {
    requestAnimationFrame(() => {
      if (document.activeElement === input) input.setSelectionRange(pos, pos);
    });
  };

  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      spellCheck={false}
      disabled={disabled}
      value={displayBrazilianCents(value)}
      onChange={event => {
        const input = event.currentTarget;
        const result = resolveBrazilianCentsEdit(
          input.value, value, (event.nativeEvent as InputEvent).inputType,
        );
        if (!result) return;
        input.setCustomValidity('');
        onValueChange(result.value);
        moveCaret(input, result.caret);
      }}
      onPaste={event => {
        event.preventDefault();
        const input = event.currentTarget;
        try {
          const next = resolveBrazilianCentsPaste(event.clipboardData.getData('text'));
          input.setCustomValidity('');
          onValueChange(next);
          moveCaret(input, displayBrazilianCents(next).length);
        } catch {
          input.setCustomValidity('Valor colado inválido. Confira reais e centavos.');
          input.reportValidity();
        }
      }}
      onFocus={event => {
        const input = event.currentTarget;
        requestAnimationFrame(() => {
          if (document.activeElement === input) input.select();
        });
        onFocus?.(event);
      }}
      onKeyDown={event => {
        const input = event.currentTarget;
        if (event.key === 'Backspace' && value &&
            input.selectionStart === input.value.length &&
            input.selectionEnd === input.value.length) {
          event.preventDefault();
          const next = backspaceLiveBrazilianCents(displayBrazilianCents(value));
          input.setCustomValidity('');
          onValueChange(toCanonical(next.value));
          moveCaret(input, next.caret);
        }
        onKeyDown?.(event);
      }}
    />
  );
};
