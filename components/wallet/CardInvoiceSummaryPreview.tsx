import React, { useEffect, useState } from 'react';
import {
  withStatementEstimatedPosition,
  type CardInvoiceSummary,
  type StatementInstallmentLike,
} from '../../utils/cardInvoiceSummary';
import type { WalletIssuerInvoiceCommit } from '../../services/personalWallet.service';
import { formatWalletMoneyInput, parseWalletMoney } from '../../features/wallet/utils/parseWalletMoney';
import { resolveLiveBrazilianCentsChange } from '../../features/wallet/utils/liveBrazilianMoneyInput';
import { formatMoney } from '../../utils/formatters';

type NumericKey = 'invoiceTotal' | 'minimumPayment' | 'creditLimit' |
  'usedLimit' | 'availableLimit' | 'futureInstallments';
const fields: ReadonlyArray<{ key: NumericKey; label: string }> = [
  { key: 'invoiceTotal', label: 'Valor da fatura' },
  { key: 'minimumPayment', label: 'Pagamento mínimo' },
  { key: 'creditLimit', label: 'Limite total' },
  { key: 'usedLimit', label: 'Limite utilizado' },
  { key: 'availableLimit', label: 'Disponível informado' },
  { key: 'futureInstallments', label: 'Parcelas futuras' },
];
type Form = Record<NumericKey, string> & { dueDate: string };
const positionKeys: NumericKey[] = ['invoiceTotal', 'creditLimit', 'usedLimit'];
const referenceKeys: NumericKey[] = ['minimumPayment', 'availableLimit', 'futureInstallments'];
const monthLabel = (value: string) => new Intl.DateTimeFormat('pt-BR', {
  month: 'long', year: 'numeric', timeZone: 'UTC',
}).format(new Date(value.slice(0, 7) + '-01T12:00:00Z'));
const fmtField = (val: number | null | undefined): string => {
  if (val === null || val === undefined || !Number.isFinite(val)) return '';
  try {
    return formatWalletMoneyInput((Math.round(val * 100) / 100).toFixed(2));
  } catch {
    return String(val).replace('.', ',');
  }
};
const toForm = (summary: CardInvoiceSummary): Form => ({
  invoiceTotal: fmtField(summary.invoiceTotal),
  minimumPayment: fmtField(summary.minimumPayment),
  creditLimit: fmtField(summary.creditLimit),
  usedLimit: fmtField(summary.usedLimit),
  availableLimit: fmtField(summary.availableLimit),
  futureInstallments: fmtField(summary.futureInstallments),
  dueDate: summary.dueDate || '',
});

export const CardInvoiceSummaryPreview: React.FC<{
  summary: CardInvoiceSummary;
  onSave?: (summary: CardInvoiceSummary) => Promise<WalletIssuerInvoiceCommit>;
  formId?: string;
  inlineSave?: boolean;
  dueMonth?: string | null;
  onSavingChange?: (saving: boolean) => void;
  suggestedCreditLimit?: number | null;
  statementRows?: ReadonlyArray<StatementInstallmentLike>;
  suggestedDueDate?: string | null;
  estimatedUsedLimit?: number | null;
  estimatedFutureCommitments?: number | null;
  estimatedAvailableLimit?: number | null;
  estimatedDueMonth?: string | null;
  disabled?: boolean;
  saveLabel?: string;
  hideInvoiceTotal?: boolean;
  hideDueDate?: boolean;
  invoiceTotalOverride?: string;
  dueDateOverride?: string;
  footerNote?: string;
}> = ({ summary, onSave, formId, inlineSave = true, dueMonth, onSavingChange, suggestedCreditLimit, statementRows, suggestedDueDate, estimatedUsedLimit, estimatedFutureCommitments, estimatedAvailableLimit, estimatedDueMonth, disabled = false, saveLabel = 'Salvar conferência', hideInvoiceTotal = false, hideDueDate = false, invoiceTotalOverride, dueDateOverride, footerNote }) => {
  const { summary: resolvedSummary, estimatedFields } = withStatementEstimatedPosition(summary, {
    registeredCreditLimit: suggestedCreditLimit,
    statementRows,
    suggestedDueDate,
  });
  const [form, setForm] = useState<Form>(() => toForm(resolvedSummary));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<WalletIssuerInvoiceCommit | null>(null);
  const calculatedAvailableCents = (() => {
    try {
      if (!form.creditLimit.trim() || !form.usedLimit.trim()) return null;
      return Math.round(parseWalletMoney(form.creditLimit) * 100) - Math.round(parseWalletMoney(form.usedLimit) * 100);
    } catch { return null; }
  })();
  const profileLimitCents = Number.isFinite(suggestedCreditLimit) && Number(suggestedCreditLimit) >= 0
    ? Math.round(Number(suggestedCreditLimit) * 100) : null;
  const usedLimitCents = Number.isFinite(estimatedUsedLimit) && Number(estimatedUsedLimit) >= 0
    ? Math.round(Number(estimatedUsedLimit) * 100) : null;
  const futureCommitmentsCents = Number.isFinite(estimatedFutureCommitments) && Number(estimatedFutureCommitments) >= 0
    ? Math.round(Number(estimatedFutureCommitments) * 100) : null;
  const availableLimitCents = Number.isFinite(estimatedAvailableLimit) && Number(estimatedAvailableLimit) >= 0
    ? Math.round(Number(estimatedAvailableLimit) * 100) : null;
  const estimateIsConsistent = Boolean(
    profileLimitCents !== null && profileLimitCents > 0 && usedLimitCents !== null &&
    futureCommitmentsCents !== null && availableLimitCents !== null &&
    availableLimitCents === Math.max(0, profileLimitCents - usedLimitCents),
  );
  const estimatedAvailableCents = estimateIsConsistent ? availableLimitCents : null;
  const estimatedPositionMonth = estimatedDueMonth?.slice(0, 7) || null;
  // Parents rebuild this object on refreshes and unrelated state changes. Use
  // the financial content as the dependency so a parent rerender never erases
  // values the user is still reviewing in the form.
  const summaryIdentity = JSON.stringify({
    institution: resolvedSummary.institution,
    cardLastFour: resolvedSummary.cardLastFour,
    multipleCards: resolvedSummary.multipleCards,
    invoiceTotal: resolvedSummary.invoiceTotal,
    minimumPayment: resolvedSummary.minimumPayment,
    creditLimit: resolvedSummary.creditLimit,
    usedLimit: resolvedSummary.usedLimit,
    availableLimit: resolvedSummary.availableLimit,
    futureInstallments: resolvedSummary.futureInstallments,
    dueDate: resolvedSummary.dueDate,
    warnings: resolvedSummary.warnings,
  });
  useEffect(() => { setForm(toForm(resolvedSummary)); setSaved(null); setError(''); }, [summaryIdentity]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!onSave || saving || disabled) return;
    setError(''); setSaved(null);
    try {
      const submittedForm = {
        ...form,
        invoiceTotal: invoiceTotalOverride ?? form.invoiceTotal,
        dueDate: dueDateOverride ?? form.dueDate,
      };
      const parsed = Object.fromEntries(fields.map(({ key, label }) => [
        key, submittedForm[key].trim() === '' ? null : parseWalletMoney(submittedForm[key], label),
      ])) as Record<NumericKey, number | null>;
      if (parsed.invoiceTotal !== null && parsed.minimumPayment !== null &&
        parsed.minimumPayment > parsed.invoiceTotal)
        throw new Error('O pagamento mínimo não pode superar o total da fatura.');
      if (submittedForm.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(submittedForm.dueDate))
        throw new Error('Data de vencimento inválida.');
      if (submittedForm.dueDate && dueMonth && submittedForm.dueDate.slice(0, 7) !== dueMonth.slice(0, 7)) {
        throw new Error(`O vencimento é de ${monthLabel(submittedForm.dueDate)}, mas o mês de pagamento selecionado é ${monthLabel(dueMonth)}. Confira a fatura do banco e ajuste o mês ou a data.`);
      }
      setSaving(true);
      onSavingChange?.(true);
      const confirmed = await onSave({ ...resolvedSummary, ...parsed, dueDate: submittedForm.dueDate || null });
      setSaved(confirmed);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível salvar os valores.');
    } finally { setSaving(false); onSavingChange?.(false); }
  };
  const renderAmountField = ({ key, label }: { key: NumericKey; label: string }) => (
    <label className="rounded-lg bg-slate-900 px-2.5 py-2 text-[11px] text-slate-400" key={key}>
      {label} (R$)
      <input type="text" inputMode="decimal" autoComplete="off" disabled={saving || disabled}
        value={form[key]}
        onChange={event => {
          const input = event.currentTarget;
          const next = resolveLiveBrazilianCentsChange(input.value, form[key], (event.nativeEvent as InputEvent).inputType);
          if (!next) return;
          setSaved(null);
          setForm(v => ({ ...v, [key]: next.value }));
          requestAnimationFrame(() => {
            if (document.activeElement === input) input.setSelectionRange(next.caret, next.caret);
          });
        }}
        onBlur={event => { try { setForm(v => ({ ...v, [key]: formatWalletMoneyInput(event.target.value) })); } catch { } }}
        placeholder="Não informado" aria-label={label}
        className="mt-1 w-full min-w-0 rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs font-semibold text-white" />
      {key === 'creditLimit' && estimatedFields.creditLimit && (
        <span className="mt-1 block text-[10px] leading-snug text-cyan-300/90">
          Do cadastro do cartão; confirme com o banco.
        </span>
      )}
      {((key === 'futureInstallments' && estimatedFields.futureInstallments) ||
        (key === 'usedLimit' && estimatedFields.usedLimit) ||
        (key === 'availableLimit' && estimatedFields.availableLimit)) && (
        <span className="mt-1 block text-[10px] leading-snug text-cyan-300/90">
          Calculado pelas parcelas deste PDF; confirme com o banco.
        </span>
      )}
    </label>
  );
  return (
    <section aria-label="Conferência dos dados da fatura" className="space-y-3 rounded-xl border border-slate-700 bg-slate-950/70 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong className="text-xs text-slate-100">Confira os dados com o emissor</strong>
        <span className="text-[11px] text-slate-400">{summary.institution || 'Banco não identificado'}
          {summary.cardLastFour ? ' · •••• ' + summary.cardLastFour : ''}
        </span>
      </div>
      <p className="text-[11px] leading-relaxed text-slate-400">
        Salve aqui os valores que aparecem no app ou na fatura do banco. Revise os campos preenchidos antes de confirmar; eles podem ter sido lidos do arquivo ou sugeridos pela Carteira.
      </p>
      <form id={formId} onSubmit={event => { void submit(event); }} className="space-y-3">
        <div>
          <h4 className="text-[11px] font-bold text-slate-200">Fatura e posição do cartão</h4>
          <p className="mb-2 mt-0.5 text-[10px] leading-relaxed text-slate-400">Fatura, limite total e limite utilizado são necessários para registrar uma posição inicial.</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {fields.filter(({ key }) => positionKeys.includes(key) && !(hideInvoiceTotal && key === 'invoiceTotal')).map(renderAmountField)}
          </div>
        </div>
        <div>
          <h4 className="mb-2 text-[11px] font-bold text-slate-200">Outros dados da fatura (opcionais)</h4>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {fields.filter(({ key }) => referenceKeys.includes(key)).map(renderAmountField)}
          </div>
        </div>
        {calculatedAvailableCents !== null && <div role="status" className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2.5">
          <p className="text-[11px] font-semibold text-slate-200">Disponível calculado</p>
          <strong className="text-sm tabular-nums text-emerald-300">{formatMoney(calculatedAvailableCents / 100)}</strong>
          <p className="mt-0.5 text-[10px] leading-relaxed text-slate-400">Limite total menos limite utilizado. O campo “Disponível informado” continua sendo o valor confirmado no banco.</p>
        </div>}
        {!hideDueDate && <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <label className="rounded-lg bg-slate-900 px-2.5 py-2 text-[11px] text-slate-400">
            Data exata de vencimento
            <input type="date" value={form.dueDate} disabled={saving || disabled}
              onChange={event => { setSaved(null); setForm(v => ({ ...v, dueDate: event.target.value })); }}
              className="mt-1 w-full min-w-0 rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-white" />
            {estimatedFields.dueDate && (
              <span className="mt-1 block text-[10px] leading-snug text-cyan-300/90">
                Sugerido pelo dia de vencimento do cartão.
              </span>
            )}
          </label>
        </div>}
        {estimateIsConsistent && estimatedAvailableCents !== null && profileLimitCents !== null && usedLimitCents !== null && futureCommitmentsCents !== null && (
          <div role="status" className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2.5">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="text-[11px] font-semibold text-slate-200">Posição calculada pela Carteira</span>
              {estimatedPositionMonth && <span className="text-[10px] text-slate-400">Ciclo {estimatedPositionMonth.slice(5, 7)}/{estimatedPositionMonth.slice(0, 4)}</span>}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div><span className="block text-[10px] text-slate-400">Limite utilizado estimado</span><strong className="text-xs tabular-nums text-white">{formatMoney(usedLimitCents / 100)}</strong></div>
              <div><span className="block text-[10px] text-slate-400">Parcelas futuras registradas</span><strong className="text-xs tabular-nums text-white">{formatMoney(futureCommitmentsCents / 100)}</strong></div>
              <div><span className="block text-[10px] text-slate-400">Disponível estimado</span><strong className="text-xs tabular-nums text-emerald-300">{formatMoney(estimatedAvailableCents / 100)}</strong></div>
            </div>
            <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">
              {formatMoney(profileLimitCents / 100)} − {formatMoney(usedLimitCents / 100)}. Usa compras e parcelas registradas; itens deste PDF ainda não importados ficam fora.
            </p>
          </div>
        )}
        {summary.warnings.map((warning, index) => <p className="text-xs text-amber-200" key={index}>{warning}</p>)}
        <p className="text-[11px] leading-relaxed text-slate-400">
          {footerNote || 'Salvar guarda uma referência do emissor, não um pagamento. Em cartões com histórico, isso não altera o total da lista; use Ajustar fatura para corrigir o mês. Sem compras ou pagamentos anteriores, valores compatíveis também podem registrar a posição inicial. Nenhuma compra é criada nem dinheiro é movimentado.'}
        </p>
        {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
        {saved && <div role="status" className={`rounded-lg border p-3 text-xs ${saved.financial_applied ? 'border-emerald-600/50 bg-emerald-950/20 text-emerald-200' : 'border-amber-600/50 bg-amber-950/20 text-amber-200'}`}>
          <strong>{saved.financial_applied ? 'Fatura e posição inicial do cartão registradas.' : 'Referência salva em Valores do banco; total da lista mantido.'}</strong>
          <p className="mt-1">{saved.note}</p>
          <p className="mt-1">Ciclo confirmado: {saved.due_month.slice(5, 7)}/{saved.due_month.slice(0, 4)}</p>
        </div>}
        {onSave && inlineSave && <button type="submit" disabled={saving || disabled}
          className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">
          {saving ? 'Salvando…' : saveLabel}
        </button>}
      </form>
    </section>
  );
};
