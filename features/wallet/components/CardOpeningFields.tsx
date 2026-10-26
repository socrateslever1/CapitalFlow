import React from 'react';
import { formatMoney } from '../../../utils/formatters';

export type CardOpeningFormValues = {
  used: string;
  invoice: string;
  future: string;
  futureCount: string;
  invoiceMonth: string;
};

export type CardOpeningPayload = {
  used_limit: number;
  invoice_amount: number;
  future_amount: number;
  future_months: number;
  invoice_month: string;
};

export const freshCardOpening = (): CardOpeningFormValues => {
  const date = new Date();
  return {
    used: '0', invoice: '0', future: '0', futureCount: '1',
    invoiceMonth: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
  };
};

const cents = (raw: string, field: string): number => {
  const value = String(raw).trim().replace(',', '.');
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value)) {
    throw new Error(`Informe um valor válido em ${field}, com até duas casas decimais.`);
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric > 9999999999) {
    throw new Error(`Valor fora do limite em ${field}.`);
  }
  return Math.round(numeric * 100);
};

/** All comparisons happen in integer cents; no floating-point accounting. */
export function validateCardOpening(values: CardOpeningFormValues, creditLimit: number): CardOpeningPayload {
  const used = cents(values.used, 'Limite já utilizado');
  const invoice = cents(values.invoice, 'Fatura inicial');
  const future = cents(values.future, 'Parcelas futuras');
  if (!Number.isFinite(creditLimit) || creditLimit < 0 ||
    Math.abs(creditLimit * 100 - Math.round(creditLimit * 100)) > 0.000001) {
    throw new Error('Informe um limite de crédito válido.');
  }
  const limit = Math.round(creditLimit * 100);
  if (used > limit) throw new Error('O limite utilizado não pode superar o limite contratado.');
  if (invoice + future > used) {
    throw new Error('A soma da fatura atual com as parcelas futuras supera o limite utilizado.');
  }
  const count = future > 0 ? Number(values.futureCount) : 0;
  if (future > 0 && (!Number.isInteger(count) || count < 1 || count > 120 || future < count)) {
    throw new Error('Informe de 1 a 120 faturas futuras, com pelo menos R$ 0,01 por parcela.');
  }
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(values.invoiceMonth)) {
    throw new Error('Informe o mês de vencimento da fatura inicial.');
  }
  const year = Number(values.invoiceMonth.slice(0, 4));
  if (year < 2000 || year > 2100) throw new Error('Mês da fatura inicial fora do intervalo permitido.');
  return {
    used_limit: used / 100, invoice_amount: invoice / 100,
    future_amount: future / 100, future_months: count,
    invoice_month: values.invoiceMonth + '-01',
  };
}

type Props = {
  value: CardOpeningFormValues;
  onChange: (value: CardOpeningFormValues) => void;
  creditLimit: number;
};

export const CardOpeningFields: React.FC<Props> = ({ value, onChange, creditLimit }) => {
  const update = (name: keyof CardOpeningFormValues, next: string) =>
    onChange({ ...value, [name]: next });
  const used = Number(value.used || 0);
  const invoice = Number(value.invoice || 0);
  const future = Number(value.future || 0);
  const unbilled = Math.max(0, Math.round((used - invoice - future) * 100) / 100);
  const available = Math.max(0, Math.round((creditLimit - used) * 100) / 100);
  const invalid = used < 0 || invoice < 0 || future < 0 ||
    used > creditLimit || invoice + future > used;
  const field = 'mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-white outline-none focus:border-blue-500';
  return <fieldset className="space-y-3 rounded-2xl border border-emerald-600/25 bg-emerald-950/10 p-4">
    <legend className="px-2 text-sm font-bold text-emerald-300">Situação inicial do cartão</legend>
    <p className="text-xs text-slate-400">
      Informe o que já devia ao cadastrar. Esses valores não são compras novas.
    </p>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-xs text-slate-300">Limite já utilizado (R$)
        <input className={field} type="number" min="0" step="0.01" inputMode="decimal"
          required value={value.used} onChange={event => update('used', event.target.value)}/>
      </label>
      <label className="text-xs text-slate-300">Fatura inicial (R$)
        <input className={field} type="number" min="0" step="0.01" inputMode="decimal"
          required value={value.invoice} onChange={event => update('invoice', event.target.value)}/>
      </label>
      <label className="text-xs text-slate-300">Parcelas futuras — total (R$)
        <input className={field} type="number" min="0" step="0.01" inputMode="decimal"
          required value={value.future} onChange={event => update('future', event.target.value)}/>
      </label>
      <label className="text-xs text-slate-300">Quantidade de faturas futuras
        <input className={field} type="number" min="1" max="120" step="1"
          disabled={!future || future <= 0} required={future > 0}
          value={value.futureCount} onChange={event => update('futureCount', event.target.value)}/>
      </label>
      <label className="text-xs text-slate-300">Mês de vencimento da fatura inicial
        <input className={field} type="month" min="2000-01" max="2100-12" required
          value={value.invoiceMonth} onChange={event => update('invoiceMonth', event.target.value)}/>
      </label>
    </div>
    {invalid && <p role="alert" className="text-xs font-semibold text-rose-300">
      Confira os valores: a dívida não pode ultrapassar o limite nem ser menor que fatura + parcelas.
    </p>}
    <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
      <div className="rounded-xl bg-slate-900 p-3">
        <span className="block text-slate-400">Limite disponível</span>
        <strong className="text-emerald-300">{formatMoney(available)}</strong>
      </div>
      <div className="rounded-xl bg-slate-900 p-3">
        <span className="block text-slate-400">Ainda não faturado</span>
        <strong className="text-white">{formatMoney(unbilled)}</strong>
      </div>
      <div className="col-span-2 rounded-xl bg-slate-900 p-3 sm:col-span-1">
        <span className="block text-slate-400">Dívida inicial</span>
        <strong className="text-white">{formatMoney(Number.isFinite(used) ? used : 0)}</strong>
      </div>
    </div>
    <p className="text-[11px] text-slate-400">
      A diferença ainda não faturada entra no próximo mês. Não registre novamente
      compras já incluídas no saldo inicial.
    </p>
  </fieldset>;
};
