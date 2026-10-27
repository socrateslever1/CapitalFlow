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
    used: '0', invoice: '0', future: '0', futureCount: '0',
    invoiceMonth: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
  };
};

const cents = (raw: string, field: string): number => {
  const value = String(raw || '0').trim().replace(',', '.');
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
  const invoice = cents(values.invoice, 'Fatura inicial');
  const explicitFuture = values.future !== undefined && String(values.future).trim() !== ''
    ? cents(values.future, 'Demais gastos no cartão')
    : null;
  const rawUsed = cents(values.used, 'Limite já utilizado');
  // Se o usuário informou os demais gastos (ex: Fatura 1000 + Demais gastos 8500 = 9500 usados), sincroniza o total:
  const used = explicitFuture !== null && rawUsed === 0 && (invoice + explicitFuture) > 0
    ? invoice + explicitFuture
    : rawUsed;
  const future = used - invoice;

  if (!Number.isFinite(creditLimit) || creditLimit < 0 ||
    Math.abs(creditLimit * 100 - Math.round(creditLimit * 100)) > 0.000001) {
    throw new Error('Informe um limite de crédito válido.');
  }
  const limit = Math.round(creditLimit * 100);
  if (used > limit) throw new Error('O limite utilizado não pode superar o limite contratado.');
  if (future < 0) throw new Error('A fatura inicial não pode superar o limite já utilizado.');
  if (invoice + future > used) {
    throw new Error('A soma da fatura atual com as parcelas futuras supera o limite utilizado.');
  }
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(values.invoiceMonth)) {
    throw new Error('Informe o mês de vencimento da fatura inicial.');
  }
  const year = Number(values.invoiceMonth.slice(0, 4));
  if (year < 2000 || year > 2100) throw new Error('Mês da fatura inicial fora do intervalo permitido.');
  const rawMonths = Number(values.futureCount || 0);
  const futureMonths = future > 0 && Number.isInteger(rawMonths) && rawMonths >= 1 && rawMonths <= 120
    ? rawMonths
    : 0;
  return {
    used_limit: used / 100,
    invoice_amount: invoice / 100,
    future_amount: future / 100,
    future_months: futureMonths,
    invoice_month: values.invoiceMonth + '-01',
  };
}

type Props = {
  value: CardOpeningFormValues;
  onChange: (value: CardOpeningFormValues) => void;
  creditLimit: number;
};

const round2 = (n: number) => Math.max(0, Math.round(n * 100) / 100);

export const CardOpeningFields: React.FC<Props> = ({ value, onChange, creditLimit }) => {
  const used = Number(value.used || 0);
  const invoice = Number(value.invoice || 0);
  const future = round2(used - invoice);
  const available = round2(creditLimit - used);

  const handleInvoiceChange = (raw: string) => {
    const nextInvoice = Math.max(0, Number(raw || 0));
    const currentFuture = Number(value.future || 0);
    // Mantém os demais gastos e atualiza o limite total comprometido (Fatura + Demais Gastos)
    const nextUsed = round2(nextInvoice + currentFuture);
    onChange({
      ...value,
      invoice: raw,
      used: String(nextUsed),
      future: String(round2(currentFuture)),
    });
  };

  const handleFutureChange = (raw: string) => {
    const nextFuture = Math.max(0, Number(raw || 0));
    const nextUsed = round2(invoice + nextFuture);
    onChange({
      ...value,
      future: raw,
      used: String(nextUsed),
    });
  };

  const handleAvailableChange = (raw: string) => {
    const nextAvailable = Math.max(0, Number(raw || 0));
    const nextUsed = round2(Math.max(0, creditLimit - nextAvailable));
    const nextFuture = round2(Math.max(0, nextUsed - invoice));
    onChange({
      ...value,
      used: String(nextUsed),
      future: String(nextFuture),
    });
  };

  const handleUsedChange = (raw: string) => {
    const nextUsed = Math.max(0, Number(raw || 0));
    const nextFuture = round2(Math.max(0, nextUsed - invoice));
    onChange({
      ...value,
      used: raw,
      future: String(nextFuture),
    });
  };

  const invalid = used < 0 || invoice < 0 || future < 0 ||
    (creditLimit > 0 && used > creditLimit) || invoice + future > used + 0.001;

  const invoicePct = creditLimit > 0 ? Math.min(100, (invoice / creditLimit) * 100) : 0;
  const futurePct = creditLimit > 0 ? Math.min(100 - invoicePct, (future / creditLimit) * 100) : 0;

  const field = 'mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-white outline-none focus:border-emerald-500 transition-colors';

  return <fieldset className="space-y-3.5 rounded-2xl border border-emerald-600/30 bg-emerald-950/10 p-4">
    <legend className="px-2 text-sm font-bold text-emerald-300">Situação inicial do cartão (Cartão já em uso)</legend>
    <p className="text-xs text-slate-300 leading-relaxed">
      Se o cartão já está em uso, preencha a <strong>Fatura atual</strong> e os <strong>Demais gastos</strong> (ou digite direto o <strong>Crédito livre para gastar</strong>). O sistema calcula o restante automaticamente.
    </p>

    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-xs font-semibold text-amber-200">
        1. Valor da Fatura Atual (R$)
        <input className={field} type="number" min="0" step="0.01" inputMode="decimal"
          placeholder="Ex.: 1000"
          required value={value.invoice} onChange={event => handleInvoiceChange(event.target.value)}/>
        <span className="mt-1 block text-[10px] font-normal text-slate-400">O que vence na fatura deste mês</span>
      </label>

      <label className="text-xs font-semibold text-blue-200">
        2. Demais gastos / parcelados no limite (R$)
        <input className={field} type="number" min="0" step="0.01" inputMode="decimal"
          placeholder="Ex.: 8500"
          value={value.future !== undefined ? value.future : String(future)}
          onChange={event => handleFutureChange(event.target.value)}
          aria-describedby="card-opening-future-help"/>
        <span className="mt-1 block text-[10px] font-normal text-slate-400">Gastos no cartão além da fatura atual</span>
      </label>

      <label className="text-xs font-semibold text-emerald-300">
        3. Crédito livre para gastar hoje (R$)
        <input className={`${field} border-emerald-500/40 bg-emerald-950/20 font-bold text-emerald-200`}
          type="number" min="0" step="0.01" inputMode="decimal"
          placeholder="Ex.: 500"
          disabled={creditLimit <= 0}
          value={creditLimit > 0 ? String(available) : '0'}
          onChange={event => handleAvailableChange(event.target.value)}/>
        <span className="mt-1 block text-[10px] font-normal text-slate-400">
          {creditLimit > 0 ? `De ${formatMoney(creditLimit)}, quanto ainda está livre hoje` : 'Informe o limite total do cartão acima primeiro'}
        </span>
      </label>

      <label className="text-xs font-semibold text-slate-300">
        Total comprometido no cartão (Fatura + Demais gastos)
        <input className={field} type="number" min="0" step="0.01" inputMode="decimal"
          required value={value.used} onChange={event => handleUsedChange(event.target.value)}/>
        <span className="mt-1 block text-[10px] font-normal text-slate-400">Soma da fatura atual + demais gastos</span>
      </label>

      <label className="text-xs text-slate-300">
        Mês de vencimento da fatura atual
        <input className={field} type="month" min="2000-01" max="2100-12" required
          value={value.invoiceMonth} onChange={event => onChange({ ...value, invoiceMonth: event.target.value })}/>
      </label>

      <label className="text-xs text-slate-300">
        Como tratar os demais gastos ({formatMoney(future)})?
        <select className={field} value={value.futureCount || '0'}
          onChange={event => onChange({ ...value, futureCount: event.target.value })}
          aria-describedby="card-opening-future-help">
          <option value="0">Manter retido no limite (sem gerar parcelas fictícias)</option>
          {[1, 2, 3, 4, 5, 6, 8, 10, 12, 18, 24].map(m => (
            <option key={m} value={String(m)}>
              Dividir em {m}x de {formatMoney(future / m)} nas próximas faturas
            </option>
          ))}
        </select>
      </label>
    </div>

    {creditLimit > 0 && (
      <div className="space-y-1.5 pt-1">
        <div className="flex justify-between text-[11px] text-slate-400">
          <span>Distribuicão do Limite Total ({formatMoney(creditLimit)})</span>
          <span className="font-bold text-emerald-300">{formatMoney(available)} livre</span>
        </div>
        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
          <div style={{ width: `${invoicePct}%` }} className="bg-amber-400 transition-all" title={`Fatura atual: ${formatMoney(invoice)}`} />
          <div style={{ width: `${futurePct}%` }} className="bg-blue-500 transition-all" title={`Demais gastos: ${formatMoney(future)}`} />
        </div>
        <div className="flex flex-wrap gap-3 text-[10px] text-slate-400">
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" /> Fatura atual: <strong className="text-amber-200">{formatMoney(invoice)}</strong></span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500" /> Demais gastos: <strong className="text-blue-200">{formatMoney(future)}</strong></span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-400" /> Crédito livre: <strong className="text-emerald-300">{formatMoney(available)}</strong></span>
        </div>
      </div>
    )}

    {invalid && <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-950/30 p-2.5 text-xs font-semibold text-rose-300">
      Confira os valores: o total comprometido ({formatMoney(used)}) não pode ultrapassar o limite total ({formatMoney(creditLimit)}).
    </p>}

    <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
      <div className="rounded-xl bg-slate-900/90 border border-slate-800 p-3">
        <span className="block text-[10px] uppercase text-slate-400">Limite Total</span>
        <strong className="text-sm text-white">{formatMoney(creditLimit)}</strong>
      </div>
      <div className="rounded-xl bg-slate-900/90 border border-amber-500/20 p-3">
        <span className="block text-[10px] uppercase text-amber-300/80">Fatura Atual</span>
        <strong className="text-sm text-amber-200">{formatMoney(invoice)}</strong>
      </div>
      <div className="rounded-xl bg-slate-900/90 border border-blue-500/20 p-3">
        <span className="block text-[10px] uppercase text-blue-300/80">Demais Gastos</span>
        <strong className="text-sm text-blue-200">{formatMoney(future)}</strong>
      </div>
      <div className="rounded-xl bg-emerald-950/30 border border-emerald-500/30 p-3">
        <span className="block text-[10px] uppercase text-emerald-300">Crédito Livre</span>
        <strong className="text-sm font-black text-emerald-300">{formatMoney(available)}</strong>
      </div>
    </div>
    <p id="card-opening-future-help" className="text-[11px] text-slate-400">
      Exemplo: Limite de R$ 10.000,00 com Fatura de R$ 1.000,00 e R$ 8.500,00 de demais gastos resulta em R$ 9.500,00 comprometidos e R$ 500,00 de crédito livre para gastar.
    </p>
  </fieldset>;
};

