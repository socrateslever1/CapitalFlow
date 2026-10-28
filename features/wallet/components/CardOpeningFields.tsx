import React from 'react';
import { formatMoney } from '../../../utils/formatters';

export type CardOpeningFormValues = {
  used: string;
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

export const freshCardOpening = (): CardOpeningFormValues => {
  const date = new Date();
  return {
    used: '0',
    invoice: '0',
    future: '0',
    futureCount: '0',
    invoiceMonth: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
  };
};

const cents = (raw: string, field: string): number => {
  const value = String(raw || '0')
    .trim()
    .replace(',', '.');
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value)) {
    throw new Error(
      `Informe um valor válido em ${field}, com até duas casas decimais.`,
    );
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric > 9999999999) {
    throw new Error(`Valor fora do limite em ${field}.`);
  }
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
  // Se o usuário informou os demais gastos (ex: Fatura 1000 + Demais gastos 8500 = 9500 usados), sincroniza o total:
  const used =
    explicitFuture !== null && rawUsed === 0 && invoice + explicitFuture > 0
      ? invoice + explicitFuture
      : rawUsed;
  const future = used - invoice;

  if (
    !Number.isFinite(creditLimit) ||
    creditLimit < 0 ||
    Math.abs(creditLimit * 100 - Math.round(creditLimit * 100)) > 0.000001
  ) {
    throw new Error('Informe um limite de crédito válido.');
  }
  const limit = Math.round(creditLimit * 100);
  if (used > limit)
    throw new Error('O limite utilizado não pode superar o limite contratado.');
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
};

export const CardOpeningFields: React.FC<Props> = ({
  value,
  onChange,
  creditLimit,
}) => {
  const used = Number(value.used || 0),
    invoice = Number(value.invoice || 0);
  const available = Math.round((creditLimit - used) * 100) / 100;
  const field =
    'mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-white';
  const changeUsed = (raw: string) =>
    onChange({
      ...value,
      used: raw,
      future: String(
        Math.max(0, Math.round((Number(raw) - invoice) * 100) / 100),
      ),
      futureCount: '0',
    });
  return (
    <fieldset className="space-y-3 rounded-2xl border border-slate-800 p-4">
      <legend className="px-2 text-sm font-semibold text-slate-200">
        Situação inicial (opcional)
      </legend>
      <p className="text-xs text-slate-400">
        Informe os totais do banco ou deixe zerado para cadastrar os gastos um a
        um ou importar o PDF.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-slate-300">
          Fatura atual (R$)
          <input
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={value.invoice}
            onChange={(e) =>
              onChange({
                ...value,
                invoice: e.target.value,
                future: String(
                  Math.max(
                    0,
                    Math.round((used - Number(e.target.value)) * 100) / 100,
                  ),
                ),
              })
            }
            className={field}
          />
        </label>
        <label className="text-xs text-slate-300">
          Limite usado, incluindo a fatura (R$)
          <input
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={value.used}
            onChange={(e) => changeUsed(e.target.value)}
            className={field}
          />
        </label>
        <label className="text-xs text-slate-300">
          Disponível para gastar (R$)
          <input
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            disabled={creditLimit <= 0}
            value={available}
            onChange={(e) =>
              changeUsed(
                String(
                  Math.round((creditLimit - Number(e.target.value)) * 100) /
                    100,
                ),
              )
            }
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
          Mês da fatura
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
        Limite total: {formatMoney(creditLimit)} · Disponível:{' '}
        {formatMoney(available)}
      </p>
      {(used > creditLimit || invoice > used || available < 0) && (
        <p role="alert" className="text-xs text-rose-300">
          O limite usado deve incluir a fatura e não pode superar o limite
          total.
        </p>
      )}
    </fieldset>
  );
};
