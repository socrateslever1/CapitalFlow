import React from 'react';
import { FileText, Undo2, AlertTriangle, History, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import type { LedgerEntry, Loan } from '../../../types';
import { humanizeAuditLog } from '../../../utils/auditHelpers';
import { formatMoney } from '../../../utils/formatters';
import { formatBRDate } from '../../../utils/dateHelpers';
import { translateTransactionType } from '../../../utils/translationHelpers';
import {
  canReverseLedgerEntry, formatLedgerTime, getLedgerDisplayEvents,
  getLedgerReversalIndex, isLedgerAudit, isLedgerReversal
} from '../../../utils/ledgerPresentation';
import { getPaymentGroupKey } from '../../../utils/paymentGroups';

interface LedgerListProps {
  ledger: LedgerEntry[];
  loan: Loan;
  onReverseTransaction: (t: LedgerEntry, l: Loan) => void;
  onOpenReceipt?: (t: LedgerEntry, l: Loan) => void;
  isStealthMode?: boolean;
}

export const LedgerList: React.FC<LedgerListProps> = ({
  ledger = [], loan, onReverseTransaction, onOpenReceipt, isStealthMode
}) => {
  const entries = React.useMemo(() => getLedgerDisplayEvents(ledger || []), [ledger]);
  const reversalIndex = React.useMemo(() => getLedgerReversalIndex(ledger || []), [ledger]);

  if (entries.length === 0) {
    return <p className="py-5 text-center text-xs text-slate-500">Nenhuma movimentação registrada.</p>;
  }

  return (
    <div className="max-h-[380px] space-y-1 overflow-y-auto overscroll-contain pr-1 custom-scrollbar" aria-label="Extrato do contrato em ordem cronológica decrescente">
      {entries.map((entry) => {
        const reversal = isLedgerReversal(entry);
        const audit = isLedgerAudit(entry) && !reversal;
        const reversed = reversalIndex.reversedIds.has(entry.id)
          || reversalIndex.reversedKeys.has(getPaymentGroupKey(entry));
        const reversible = canReverseLedgerEntry(entry, reversalIndex.reversedIds, reversalIndex.reversedKeys);
        const agreement = entry.type === 'AGREEMENT_PAYMENT';
        const payment = String(entry.type || '').includes('PAYMENT') && !reversal;
        const canReceipt = payment && Number(entry.amount) > 0 && !!onOpenReceipt;
        const amount = Number(entry.amount || 0);
        const outflow = reversal || ['LEND_MORE', 'NOVO_APORTE', 'LOAN_INITIAL'].includes(String(entry.type));
        const clock = formatLedgerTime(entry);
        const label = reversal ? 'Estorno de recebimento'
          : agreement ? 'Recebimento do acordo'
          : audit ? 'Sistema / Auditoria'
          : translateTransactionType(entry.type);
        const details = audit ? humanizeAuditLog(entry.notes || '') : null;
        const legacy = payment && amount > 0 && !reversible && !reversed
          && !(reversalIndex.reversedKeys.has(getPaymentGroupKey(entry)));

        return (
          <article key={entry.id} className="rounded-md border-b border-slate-800/70 px-1.5 py-3 last:border-b-0">
            <div className="flex min-w-0 items-start gap-2.5">
              <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${reversal ? 'bg-rose-500/10 text-rose-400' : audit ? 'bg-slate-700/50 text-slate-400' : outflow ? 'bg-blue-500/10 text-blue-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                {reversal ? <Undo2 size={14}/> : audit ? <History size={14}/> : outflow ? <ArrowUpRight size={14}/> : <ArrowDownLeft size={14}/>}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <strong className="text-[11px] leading-4 text-slate-100">{label}</strong>
                  {reversed && <span className="rounded bg-rose-500/10 px-1.5 py-0.5 text-[9px] text-rose-300">Estornado</span>}
                </div>
                <p className="mt-0.5 text-[10px] text-slate-400">
                  {formatBRDate(entry.date)}{clock ? ` · ${clock}` : ''} · Ref. {entry.id.slice(0, 8)}
                </p>
              </div>
              {!audit && (
                <span className={`shrink-0 text-right text-[11px] font-bold tabular-nums ${outflow ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {outflow ? '−' : '+'} {formatMoney(Math.abs(amount), !!isStealthMode)}
                </span>
              )}
            </div>

            {payment && !audit && (
              <p className="ml-9 mt-1 text-[10px] leading-4 text-slate-500">
                Capital {formatMoney(Number(entry.principalDelta || 0), !!isStealthMode)}
                {' · '}Juros {formatMoney(Number(entry.interestDelta || 0), !!isStealthMode)}
                {' · '}Mora/multa {formatMoney(Number(entry.lateFeeDelta || 0), !!isStealthMode)}
              </p>
            )}

            {details && details.length > 0 && (
              <div className="ml-9 mt-1 space-y-0.5 border-l border-slate-800 pl-2">
                {details.map((line, index) =>
                  <p key={index} className="break-words text-[10px] leading-4 text-slate-400">{line}</p>
                )}
              </div>
            )}

            {legacy && (
              <p className="ml-9 mt-1 flex items-center gap-1 text-[10px] text-amber-400/90">
                <AlertTriangle size={11} className="shrink-0"/>
                Estorno indisponível: verificar vínculo financeiro do lançamento
              </p>
            )}

            {(canReceipt || reversible) && (
              <div className="ml-9 mt-2 flex flex-wrap justify-end gap-2">
                {canReceipt && (
                  <button
                    type="button"
                    onClick={(event) => { event.stopPropagation(); onOpenReceipt?.(entry, loan); }}
                    className="inline-flex min-h-8 items-center gap-1 rounded-md border border-emerald-500/25 px-2 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-500/10"
                    aria-label={`Comprovante do lançamento ${entry.id.slice(0, 8)}`}
                    title="Ver comprovante"
                  >
                    <FileText size={12}/> Comprovante
                  </button>
                )}
                {reversible && (
                  <button
                    type="button"
                    onClick={(event) => { event.stopPropagation(); onReverseTransaction(entry, loan); }}
                    className="inline-flex min-h-8 items-center gap-1 rounded-md border border-rose-500/35 px-2 text-[10px] font-semibold text-rose-300 hover:bg-rose-500/10"
                    aria-label={`Estornar lançamento ${entry.id.slice(0, 8)}`}
                    title="Estornar este recebimento pela rotina auditável"
                  >
                    <Undo2 size={12}/> Estornar
                  </button>
                )}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
};
