import React from 'react';
import { formatMoney } from '../../utils/formatters';
import type { CardInvoiceSummary } from '../../utils/cardInvoiceSummary';

/** Read-only extraction preview. No item here is booked as a payment or expense. */
export const CardInvoiceSummaryPreview: React.FC<{
  summary: CardInvoiceSummary;
}> = ({ summary }) => {
  const cells: Array<[string, number | null]> = [
    ['Valor da fatura', summary.invoiceTotal],
    ['Pagamento mínimo', summary.minimumPayment],
    ['Limite total', summary.creditLimit],
    ['Limite utilizado', summary.usedLimit],
    ['Disponível informado', summary.availableLimit],
    ['Parcelas futuras', summary.futureInstallments],
  ];
  return (
    <section aria-label="Resumo reconhecido da fatura" className="space-y-2 rounded-xl border border-slate-700 bg-slate-950/70 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong className="text-xs text-slate-100">Resumo da fatura — conferência</strong>
        <span className="text-[11px] text-slate-400">{summary.institution || 'Banco não identificado'}
          {summary.cardLastFour ? ' · •••• ' + summary.cardLastFour : ''}
          {summary.dueDate ? ' · Vence ' + summary.dueDate.split('-').reverse().join('/') : ''}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {cells.map(([label, value]) => (
          <div key={label} className="rounded-lg bg-slate-900 px-2.5 py-2">
            <dt className="text-[10px] text-slate-400">{label}</dt>
            <dd className="mt-1 text-xs font-semibold tabular-nums text-white">{value === null ? 'Não identificado' : formatMoney(value)}</dd>
          </div>
        ))}
      </dl>
      {summary.warnings.map((message, index) =>
        <p role="status" className="text-xs text-amber-200" key={index}>{message}</p>)}
      <p className="text-[11px] leading-relaxed text-slate-400">
        Valores extraídos do documento, sujeitos à data de emissão. Não registramos o
        pagamento mínimo como pagamento realizado, nem lançamos o total da fatura
        como compra. Corrija os dados reais na situação inicial/valor da fatura.
      </p>
    </section>
  );
};
