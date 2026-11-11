import React from 'react';
import { formatMoney } from '../../../utils/formatters';
import { calculateUsedFromAvailable } from '../../../components/wallet/cardOpeningSummary';
import { formatWalletMoneyInput, parseWalletMoney } from '../utils/parseWalletMoney';
import { resolveLiveBrazilianCentsChange } from '../utils/liveBrazilianMoneyInput';
import { businessDateInManaus } from '../../../utils/businessDate';

export type CardOpeningFormValues = {
  used: string;
  available?: string;
  invoice: string;
  future: string;
  futureCount: string;
  invoiceMonth: string;
  invoiceState?: 'OPEN' | 'CLOSED';
};

export type CardOpeningPayload = {
  used_limit: number;
  invoice_amount: number;
  future_amount: number;
  future_months: number;
  invoice_month: string;
  invoice_state?: 'OPEN' | 'CLOSED';
};

export const freshCardOpening = (): CardOpeningFormValues => ({
  used: '',
  available: '',
  invoice: '',
  future: '',
  futureCount: '',
  invoiceMonth: businessDateInManaus().slice(0, 7),
});

const safeMoney = (raw: string): number => {
  try {
    if (String(raw ?? '').trim() === '') return 0;
    return parseWalletMoney(raw);
  } catch {
    return 0;
  }
};

const cents = (raw: string, field: string): number => {
  const clean = String(raw || '0').trim();
  const numeric = parseWalletMoney(clean, field);
  return Math.round(numeric * 100);
};

/** All comparisons happen in integer cents; no floating-point accounting. */
export function validateCardOpening(
  values: CardOpeningFormValues,
  creditLimit: number,
): CardOpeningPayload {
  const invoice = cents(values.invoice, 'Fatura inicial');
  const explicitFuture =
    values.future !== undefined && String(values.future).trim() !== ''
      ? cents(values.future, 'Demais gastos no cartão')
      : null;
  const rawUsed = cents(values.used, 'Limite já utilizado');
  // O limite disponível declarado pelo banco tem precedência sobre estimativas da fatura.
  const availableEntered = String(values.available ?? '').trim() !== '';
  const bankUsed = availableEntered
    ? Math.round(calculateUsedFromAvailable(
      creditLimit, parseWalletMoney(values.available!, 'limite disponível'),
    ) * 100)
    : null;
  const used = bankUsed !== null ? bankUsed
    : rawUsed === 0 && invoice + (explicitFuture ?? 0) > 0
      ? invoice + (explicitFuture ?? 0) : rawUsed;
  const future = used - invoice;

  if (
    !Number.isFinite(creditLimit) ||
    creditLimit < 0 ||
    Math.abs(creditLimit * 100 - Math.round(creditLimit * 100)) > 0.000001
  ) {
    throw new Error('Informe um limite de crédito válido.');
  }
  // O excesso é permitido como fotografia do banco, não para novas compras.
  if (future < 0)
    throw new Error('A fatura inicial não pode superar o limite já utilizado.');
  if (invoice + future > used) {
    throw new Error(
      'A soma da fatura atual com as parcelas futuras supera o limite utilizado.',
    );
  }
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(values.invoiceMonth)) {
    throw new Error('Informe o mês de vencimento da fatura inicial.');
  }
  const year = Number(values.invoiceMonth.slice(0, 4));
  if (year < 2000 || year > 2100)
    throw new Error('Mês da fatura inicial fora do intervalo permitido.');
  const rawMonths = Number(values.futureCount || 0);
  const futureMonths =
    future > 0 &&
      Number.isInteger(rawMonths) &&
      rawMonths >= 1 &&
      rawMonths <= 120
      ? rawMonths
      : 0;
  return {
    used_limit: used / 100,
    invoice_amount: invoice / 100,
    future_amount: future / 100,
    future_months: futureMonths,
    invoice_month: values.invoiceMonth + '-01',
    invoice_state: values.invoiceState || 'OPEN',
  };
}

type Props = {
  value: CardOpeningFormValues;
  onChange: (value: CardOpeningFormValues) => void;
  creditLimit: number;
  collapsible?: boolean;
};

export const CardOpeningFields: React.FC<Props> = ({
  value,
  onChange,
  creditLimit,
  collapsible = false,
}) => {
  const invoice = safeMoney(value.invoice);
  const rawUsed = safeMoney(value.used);
  const availableEntered = Boolean(value.available?.trim());
  let bankUsed: number | null = null;
  if (availableEntered) {
    try {
      bankUsed = calculateUsedFromAvailable(
        creditLimit, parseWalletMoney(value.available!, 'limite disponível'),
      );
    } catch { /* O campo parcial deve permanecer editável. */ }
  }
  const used = bankUsed ?? (rawUsed > 0 ? rawUsed : invoice);
  const usedInputValue = availableEntered
    ? bankUsed === null ? '' : formatWalletMoneyInput(bankUsed.toFixed(2))
    : value.used;
  const [usedManuallyEdited, setUsedManuallyEdited] = React.useState(
    () => rawUsed > invoice,
  );
  const [expanded, setExpanded] = React.useState(
    () => !collapsible || used > 0 || invoice > 0,
  );
  const differenceCents = Math.round(creditLimit * 100) - Math.round(used * 100);
  const available = availableEntered && bankUsed === null
    ? null : Math.max(0, differenceCents) / 100;
  const overLimit = Math.max(0, -differenceCents) / 100;
  const field =
    'mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-white';
  const readCents = (event: React.ChangeEvent<HTMLInputElement>, previous: string): string | null => {
    const input = event.currentTarget;
    const next = resolveLiveBrazilianCentsChange(input.value, previous, (event.nativeEvent as InputEvent).inputType);
    if (!next) return null;
    requestAnimationFrame(() => {
      if (document.activeElement === input) input.setSelectionRange(next.caret, next.caret);
    });
    return next.value;
  };
  const changeUsed = (raw: string) => {
    setUsedManuallyEdited(raw.trim() !== '');
    const nextUsed = safeMoney(raw);
    onChange({
      ...value,
      available: '',
      used: raw,
      future: String(
        Math.max(0, Math.round((nextUsed - invoice) * 100) / 100),
      ),
      futureCount: '0',
    });
  };
  return (
    <fieldset className="space-y-3 rounded-2xl border border-slate-800 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <legend className="px-1 text-sm font-semibold text-slate-200">
          Situação inicial (opcional)
        </legend>
        {collapsible && (
          <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-blue-300">
            <input
              type="checkbox"
              checked={expanded}
              onChange={(e) => {
                const next = e.target.checked;
                setExpanded(next);
                if (!next) {
                  setUsedManuallyEdited(false);
                  onChange({
                    ...value,
                    used: '',
                    available: '',
                    invoice: '',
                    future: '',
                    futureCount: '',
                  });
                }
              }}
              className="h-4 w-4 accent-blue-500"
            />
            Cartão já possui fatura ou limite usado
          </label>
        )}
      </div>
      {!expanded ? (
        <p className="text-xs text-slate-400">
          Cartão iniciará zerado (Disponível para gastar:{' '}
          <strong className="text-emerald-300">{available === null ? '—' : formatMoney(available)}</strong>
          ). Marque a opção acima se já houver fatura ou limite comprometido.
        </p>
      ) : (
        <>
          <p className="text-xs text-slate-400">
            Informe o limite disponível mostrado pelo banco para calcular o usado. A fatura atual é independente do limite comprometido.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-slate-300">
              Fatura atual (R$)
              <input
                type="text"
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder="0,00"
                value={value.invoice}
                onBlur={(e) => {
                  try {
                    const formatted = formatWalletMoneyInput(e.target.value);
                    onChange({
                      ...value,
                      invoice: formatted,
                      used: !usedManuallyEdited && !availableEntered ? formatted : value.used,
                    });
                  } catch { }
                }}
                onChange={(e) => {
                  const rawInvoice = readCents(e, value.invoice);
                  if (rawInvoice === null) return;
                  const nextInv = safeMoney(rawInvoice);
                  const nextUsedStr = !usedManuallyEdited && !availableEntered
                    ? rawInvoice : value.used;
                  const nextUsedVal = availableEntered ? (bankUsed ?? 0) : safeMoney(nextUsedStr);
                  onChange({
                    ...value,
                    invoice: rawInvoice,
                    used: nextUsedStr,
                    future: String(
                      Math.max(
                        0,
                        Math.round((nextUsedVal - nextInv) * 100) / 100,
                      ),
                    ),
                  });
                }}
                className={field}
              />
            </label>
            <label className="text-xs text-slate-300">
              Limite disponível no banco (R$)
              <input name="wallet-card-available-limit-new"
                type="text" inputMode="decimal" placeholder="Informe o valor disponível"
                value={value.available ?? ''}
                onChange={e => {
                  const rawAvailable = readCents(e, value.available ?? '');
                  if (rawAvailable === null) return;
                  setUsedManuallyEdited(false);
                  let nextUsed = rawAvailable.trim() ? '' : value.invoice;
                  if (rawAvailable.trim()) {
                    try {
                      nextUsed = formatWalletMoneyInput(calculateUsedFromAvailable(
                        creditLimit, parseWalletMoney(rawAvailable, 'limite disponível'),
                      ).toFixed(2));
                    } catch { /* A validação rejeita um valor incompatível. */ }
                  }
                  onChange({
                    ...value, available: rawAvailable, used: nextUsed,
                    future: String(Math.max(
                      0, Math.round((safeMoney(nextUsed) - invoice) * 100) / 100,
                    )),
                    futureCount: '0',
                  });
                }}
                onBlur={e => {
                  try { onChange({ ...value, available: formatWalletMoneyInput(e.target.value) }); }
                  catch { /* Preserve a entrada para correção. */ }
                }}
                className={field} />
              <span className="mt-1 block text-[11px] text-slate-400">
                Calculamos o limite usado pela diferença com o total do cartão.
              </span>
            </label>
            <label className="text-xs text-slate-300">
              Limite usado, incluindo a fatura (R$)
              <input
                type="text"
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder="0,00"
                value={usedInputValue}
                onChange={e => { const raw = readCents(e, usedInputValue); if (raw !== null) changeUsed(raw); }}
                onBlur={(e) => { try { onChange({ ...value, used: formatWalletMoneyInput(e.target.value) }); } catch { } }}
                className={field}
              />
            </label>
            <label className="text-xs text-slate-300">
              Situação da fatura
              <select
                value={value.invoiceState || 'OPEN'}
                onChange={(e) =>
                  onChange({
                    ...value,
                    invoiceState: e.target.value as 'OPEN' | 'CLOSED',
                  })
                }
                className={field}
              >
                <option value="OPEN">Aberta</option>
                <option value="CLOSED">Fechada</option>
              </select>
            </label>
            <label className="text-xs text-slate-300">
              Mês de pagamento (vencimento)
              <input
                required
                type="month"
                min="2000-01"
                max="2100-12"
                value={value.invoiceMonth}
                onChange={(e) =>
                  onChange({ ...value, invoiceMonth: e.target.value })
                }
                className={field}
              />
            </label>
          </div>
          <p className="text-xs text-slate-400">
            Limite total: {formatMoney(creditLimit)} · {availableEntered ? 'Disponível informado pelo banco:' : 'Disponível estimado para gastar:'}{' '}
            <strong className="text-emerald-300">{available === null ? '—' : formatMoney(available)}</strong>
          </p>
          {overLimit > 0 && (
            <p role="status" className="text-xs text-amber-300">
              Limite excedido em {formatMoney(overLimit)}. Confira os valores informados pelo banco.
            </p>
          )}
          {availableEntered && bankUsed === null && (
            <p role="alert" className="text-xs text-rose-300">
              O limite disponível precisa ser válido e não pode superar o limite total.
            </p>
          )}
          {invoice > used && (
            <p role="alert" className="text-xs text-rose-300">
              A fatura inicial não pode superar o limite usado informado.
            </p>
          )}
        </>
      )}
    </fieldset>
  );
};
