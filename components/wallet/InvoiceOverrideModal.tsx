import React, { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, Loader2, PencilLine, Scale, X } from 'lucide-react';
import { CardInvoiceSummaryPreview } from './CardInvoiceSummaryPreview';
import type { PersonalWalletCard } from '../../services/personalWallet.service';
import type { WalletIssuerInvoiceCommit } from '../../services/personalWallet.service';
import type { CardInvoiceSummary } from '../../utils/cardInvoiceSummary';
import { formatMoney } from '../../utils/formatters';
import { generateUUID } from '../../utils/generators';
import { getInvoiceCycleDates } from './invoiceStatementDomain';
import { formatWalletMoneyInput, parseWalletMoney } from '../../features/wallet/utils/parseWalletMoney';
import { resolveLiveBrazilianCentsChange } from '../../features/wallet/utils/liveBrazilianMoneyInput';
import { calculateBalanceAdjustment } from '../../features/wallet/utils/minhasFinancasWalletTools';

type Props = {
  card: PersonalWalletCard;
  initialDueMonth: string;
  initialDueDate?: string | null;
  initialAmount: number;
  hasExistingConsolidation: boolean;
  invoiceFactsSummaryForMonth: (month: string) => CardInvoiceSummary;
  onSaveInvoiceFacts: (month: string, summary: CardInvoiceSummary) => Promise<WalletIssuerInvoiceCommit>;
  isNew?: boolean;
  existingDueMonths?: readonly string[];
  onClose: () => void;
  onSave: (dueMonth: string, amount: number, dueDate: string, requestId: string) => Promise<void>;
  onRecordAdjustmentExpense?: (dueMonth: string, deltaAmount: number, notes: string) => Promise<void>;
  onRecordAdjustmentCredit?: (dueMonth: string, deltaAmount: number, notes: string) => Promise<void>;
};

export const InvoiceOverrideModal: React.FC<Props> = ({
  card, initialDueMonth, initialDueDate, initialAmount,
  hasExistingConsolidation, invoiceFactsSummaryForMonth, onSaveInvoiceFacts,
  isNew = false, existingDueMonths = [], onClose, onSave, onRecordAdjustmentExpense, onRecordAdjustmentCredit,
}) => {
  const originalMonth=initialDueMonth.slice(0,7);
  const [mode, setMode] = useState<'CONSOLIDATE' | 'DIFFERENCE'>(isNew ? 'CONSOLIDATE' : 'DIFFERENCE');
  const [month,setMonth]=useState(originalMonth);
  const [dueDate,setDueDate]=useState(initialDueDate || getInvoiceCycleDates(
    initialDueMonth,card.closing_day,card.due_day,
  ).dueDate);
  const initialBankTotal=invoiceFactsSummaryForMonth(originalMonth).invoiceTotal;
  const [amount,setAmount]=useState((initialBankTotal ?? initialAmount)>0?(initialBankTotal ?? initialAmount).toFixed(2).replace('.',','):'');
  const [adjustmentNotes, setAdjustmentNotes] = useState('');
  const [saving,setSaving]=useState(false);
  const [savingFacts,setSavingFacts]=useState(false);
  const [error,setError]=useState('');
  const request=useRef<{key:string;id:string}>({key:'',id:generateUUID()});
  const visualMonth=/^\d{4}-(0[1-9]|1[0-2])$/.test(month)?month:originalMonth;
  const validMonth=/^\d{4}-(0[1-9]|1[0-2])$/.test(month);
  const dates=getInvoiceCycleDates(visualMonth+'-01',card.closing_day,card.due_day,dueDate);
  const shortDate=(date:string)=>new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',timeZone:'UTC'})
    .format(new Date(date+'T12:00:00Z'));

  const parsedPreviewAmount = useMemo(() => {
    try { return parseWalletMoney(amount || '0'); } catch { return 0; }
  }, [amount]);

  const adjustmentPreview = useMemo(
    () => calculateBalanceAdjustment(initialAmount, parsedPreviewAmount),
    [initialAmount, parsedPreviewAmount],
  );

  const submit=async(event:React.FormEvent)=>{
    event.preventDefault();
    if(saving||savingFacts)return;
    setError('');
    try {
      const parsed=parseWalletMoney(amount,'valor consolidado');
      if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
        throw new Error('Informe o mês em que esta fatura será paga.');
      if(!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || dueDate.slice(0,7)!==month ||
         Number.isNaN(Date.parse(dueDate+'T00:00:00Z')) ||
         new Date(dueDate+'T00:00:00Z').toISOString().slice(0,10)!==dueDate)
        throw new Error('Informe a data exata de vencimento dentro do mês escolhido.');
      if(parsed<=0)throw new Error('Informe um valor positivo.');

      if (mode === 'DIFFERENCE' && adjustmentPreview.kind === 'INCREASE' && onRecordAdjustmentExpense && month === originalMonth) {
        setSaving(true);
        await onRecordAdjustmentExpense(
          month + '-01',
          adjustmentPreview.absDelta,
          adjustmentNotes.trim() || `Reajuste de fatura para ${formatMoney(parsed)}`,
        );
        onClose();
        return;
      }

      if (mode === 'DIFFERENCE' && adjustmentPreview.kind === 'DECREASE' && onRecordAdjustmentCredit && month === originalMonth) {
        setSaving(true);
        await onRecordAdjustmentCredit(
          month + '-01',
          adjustmentPreview.absDelta,
          adjustmentNotes.trim() || `Crédito de ajuste de fatura para ${formatMoney(parsed)}`,
        );
        onClose();
        return;
      }

      if(!hasExistingConsolidation && !isNew && month!==originalMonth)
        throw new Error('Este ciclo contém lançamentos individuais. Corrija primeiro o vencimento de cada lançamento para não duplicar a cobrança.');
      if (isNew && existingDueMonths.some(existing => existing.slice(0, 7) === month))
        throw new Error('Esta fatura já está registrada. Selecione-a na lista para editar.');
      const signature=[month,dueDate,parsed.toFixed(2)].join('|');
      if(request.current.key!==signature)request.current={key:signature,id:generateUUID()};
      setSaving(true);
      await onSave(month+'-01',parsed,dueDate,request.current.id);
      onClose();
    }catch(cause){setError(cause instanceof Error?cause.message:'Falha ao corrigir a fatura.');}
    finally{setSaving(false);}
  };
  const field='mt-1.5 w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20';
  const dialog = <div role="dialog" aria-modal="true" aria-labelledby="invoice-override-title"
    className="fixed inset-0 z-[2300] flex items-center justify-center overflow-y-auto bg-slate-950/80 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm sm:p-4">
    <button type="button" aria-label="Fechar ajuste da fatura" className="absolute inset-0 cursor-default" onClick={()=>!saving&&!savingFacts&&onClose()}/>
    <div className="relative max-h-[min(90dvh,850px)] w-full overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl sm:max-w-2xl">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 id="invoice-override-title" className="flex items-center gap-2 text-lg font-black text-white"><PencilLine size={18}/>{isNew ? 'Adicionar fatura' : 'Corrigir fatura'}</h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-300">{isNew ? 'Informe o mês de pagamento, o vencimento e o valor da fatura.' : card.nickname + ' · ajuste valor, mês e vencimento.'}</p>
        </div>
        <button type="button" aria-label="Fechar" disabled={saving||savingFacts} onClick={onClose}
          className="rounded-full bg-slate-800 p-2 text-slate-300 hover:text-white"><X size={17}/></button>
      </div>

      <div className={isNew ? 'hidden' : 'mb-3 grid grid-cols-2 gap-1.5 rounded-xl border border-slate-800 bg-slate-950 p-1'}>
        <button
          type="button"
          disabled={saving||savingFacts}
          onClick={() => setMode('DIFFERENCE')}
          className={`flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-bold transition ${
            mode === 'DIFFERENCE'
              ? 'bg-blue-600 text-white'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Scale size={14} />
          Reajustar por diferença
        </button>
        <button
          type="button"
          disabled={saving||savingFacts}
          onClick={() => setMode('CONSOLIDATE')}
          className={`flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-bold transition ${
            mode === 'CONSOLIDATE'
              ? 'bg-blue-600 text-white'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <PencilLine size={14} />
          Consolidar / Vencimento
        </button>
      </div>

      <div className="rounded-xl border border-blue-500/25 bg-blue-500/5 p-3 text-xs leading-relaxed text-slate-200">
        <span className="font-semibold">Fecha {shortDate(dates.closingDate)}</span>
        <span className="mt-1 block">Vence {shortDate(dates.dueDate)}</span>
      </div>
      <form id="invoice-override-adjustment-form" onSubmit={submit}>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-slate-200">Mês de pagamento
          <span className="relative block"><CalendarDays className="pointer-events-none absolute left-3 top-4 text-slate-400" size={15}/>
            <input name="wallet-invoice-payment-month" type="month" required value={month} disabled={saving||savingFacts}
              onChange={event=>{
                const next=event.target.value;setMonth(next);
                if(/^\d{4}-\d{2}$/.test(next)){
                  const summary=invoiceFactsSummaryForMonth(next);
                  setDueDate(summary.dueDate || getInvoiceCycleDates(next+'-01',card.closing_day,card.due_day).dueDate);
                  setAmount(summary.invoiceTotal===null?'':summary.invoiceTotal.toFixed(2).replace('.',','));
                }
              }}
              className={field+' pl-9'}/>
          </span>
        </label>
        <label className="text-xs font-semibold text-slate-200">Data exata de vencimento
          <input name="wallet-invoice-due-date" type="date" required value={dueDate} disabled={saving||savingFacts}
            onChange={event=>setDueDate(event.target.value)} className={field}/>
        </label>
        <label className="text-xs font-semibold text-slate-200 sm:col-span-2">
          Valor da fatura no banco (R$)
          <input name="wallet-invoice-amount" type="text" inputMode="decimal" autoComplete="off"
            required value={amount} disabled={saving||savingFacts} onChange={event => {
              const input = event.currentTarget;
              const next = resolveLiveBrazilianCentsChange(input.value, amount, (event.nativeEvent as InputEvent).inputType);
              if (!next) return;
              setAmount(next.value);
              requestAnimationFrame(() => {
                if (document.activeElement === input) input.setSelectionRange(next.caret, next.caret);
              });
            }} onBlur={event=>{try{setAmount(formatWalletMoneyInput(event.target.value));}catch{}}}
            placeholder="0,00" className={field}/>
        </label>
        {mode === 'DIFFERENCE' && (
          <div className="sm:col-span-2 rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs space-y-1.5">
            <div className="flex items-center justify-between text-slate-400">
              <span>Fatura calculada no app:</span>
              <strong className="text-slate-200 tabular-nums">{formatMoney(initialAmount)}</strong>
            </div>
            <div className="flex items-center justify-between border-t border-slate-800/80 pt-1.5">
              <span className="text-slate-300 font-semibold">{adjustmentPreview.invoiceEntryLabel}:</span>
              <strong className={`tabular-nums ${
                adjustmentPreview.kind === 'INCREASE'
                  ? 'text-rose-300'
                  : adjustmentPreview.kind === 'DECREASE'
                    ? 'text-emerald-300'
                    : 'text-slate-400'
              }`}>
                {adjustmentPreview.kind === 'INCREASE'
                  ? `+ ${formatMoney(adjustmentPreview.absDelta)}`
                  : adjustmentPreview.kind === 'DECREASE'
                    ? `- ${formatMoney(adjustmentPreview.absDelta)}`
                    : formatMoney(0)}
              </strong>
            </div>
            {((adjustmentPreview.kind === 'INCREASE' && onRecordAdjustmentExpense) || (adjustmentPreview.kind === 'DECREASE' && onRecordAdjustmentCredit)) && (
              <label className="block pt-1 text-[11px] text-slate-300">
                Observação do ajuste (opcional)
                <input
                  type="text"
                  maxLength={160}
                  value={adjustmentNotes}
                  disabled={saving||savingFacts}
                  onChange={e => setAdjustmentNotes(e.target.value)}
                  placeholder={adjustmentPreview.kind === 'DECREASE' ? 'Ex.: Estorno, cashback, pagamento antecipado' : 'Ex.: IOF, tarifa ou diferença de centavos'}
                  className={field}
                />
              </label>
            )}
          </div>
        )}
      </div>
      <p className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-100">
        {mode === 'DIFFERENCE' && adjustmentPreview.kind === 'INCREASE' && onRecordAdjustmentExpense
          ? `Será criado um lançamento "Despesa de ajuste" de ${formatMoney(adjustmentPreview.absDelta)} nesta fatura, preservando todas as compras individuais.`
          : mode === 'DIFFERENCE' && adjustmentPreview.kind === 'DECREASE' && onRecordAdjustmentCredit
            ? `Será criado um crédito de ajuste de − ${formatMoney(adjustmentPreview.absDelta)} nesta fatura, abatendo o saldo sem travar compras futuras.`
            : hasExistingConsolidation
              ? 'Corrigir o mês desloca a consolidação existente com histórico auditável. Se houver outra cobrança igual no destino, o banco só a reúne após verificar valores e pagamentos.'
              : 'Uma fatura formada por compras individuais deve ser corrigida pelos lançamentos, sem gerar uma nova consolidação de outro mês.'}
      </p>
      {error&&<p role="alert" className="mt-3 rounded-lg bg-rose-950/50 px-3 py-2 text-xs text-rose-200">{error}</p>}
    </form>
      <div className="mt-4">
        <CardInvoiceSummaryPreview
          key={card.id+':'+visualMonth+':invoice-override-facts'}
          summary={invoiceFactsSummaryForMonth(visualMonth)}
          onSave={summary=>onSaveInvoiceFacts(month+'-01',summary)}
          formId="wallet-invoice-override-facts-form"
          dueMonth={month+'-01'}
          onSavingChange={setSavingFacts}
          disabled={saving||!validMonth}
          saveLabel="Salvar valores do banco"
          footerNote="O total informado acima também será salvo como valor da fatura no banco. Salva a referência do emissor; sem histórico, valores compatíveis podem registrar a posição inicial do cartão. Não cria compra nem pagamento. O botão abaixo corrige a fatura na lista."
          hideInvoiceTotal
          hideDueDate
          invoiceTotalOverride={amount}
          dueDateOverride={dueDate}
        />
      </div>
      <button type="submit" form="invoice-override-adjustment-form" disabled={saving||savingFacts} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-60">
        {saving?<Loader2 className="animate-spin" size={17}/>:<PencilLine size={17}/>}
        {saving
          ? 'Salvando…'
          : mode === 'DIFFERENCE' && adjustmentPreview.kind === 'INCREASE' && onRecordAdjustmentExpense
            ? `Lançar Despesa de Ajuste (+ ${formatMoney(adjustmentPreview.absDelta)})`
            : mode === 'DIFFERENCE' && adjustmentPreview.kind === 'DECREASE' && onRecordAdjustmentCredit
              ? `Lançar Crédito de Ajuste (− ${formatMoney(adjustmentPreview.absDelta)})`
              : isNew ? 'Adicionar fatura' : 'Salvar correção sem duplicar'}
      </button>
    </div>
  </div>;
  return typeof document === 'undefined' ? dialog : createPortal(dialog, document.body);
};
