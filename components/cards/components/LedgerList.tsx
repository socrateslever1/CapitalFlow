import React from 'react';
import { FileText, Settings, HandCoins, CheckCircle2, Undo2 } from 'lucide-react';
import { LedgerEntry, Loan } from '../../../types';
import { humanizeAuditLog } from '../../../utils/auditHelpers';
import { formatMoney } from '../../../utils/formatters';
import { translateTransactionType } from '../../../utils/translationHelpers';


const mergeSplitReceipts = (ledger: LedgerEntry[]): LedgerEntry[] => {
  const items = [...(ledger || [])];
  const consumed = new Set<string>();

  return items.reduce<LedgerEntry[]>((acc, entry) => {
    if (consumed.has(entry.id)) return acc;

    const notes = String(entry.notes || '').toLowerCase();
    const isPrincipalReceipt =
      String(entry.type || '').includes('PAYMENT') &&
      Number(entry.amount || 0) > 0 &&
      Number(entry.principalDelta || 0) > 0 &&
      notes.includes('retorno de capital');

    if (!isPrincipalReceipt) {
      acc.push(entry);
      return acc;
    }

    const sameDay = String(entry.date || '').slice(0, 10);
    const profit = items.find((candidate) => {
      if (candidate.id === entry.id || consumed.has(candidate.id)) return false;
      const candidateNotes = String(candidate.notes || '').toLowerCase();
      return (
        String(candidate.type || '').includes('PAYMENT') &&
        String(candidate.date || '').slice(0, 10) === sameDay &&
        Number(candidate.amount || 0) > 0 &&
        Number(candidate.principalDelta || 0) === 0 &&
        (Number(candidate.interestDelta || 0) > 0 || Number(candidate.lateFeeDelta || 0) > 0) &&
        (candidate.category === 'LUCRO' || candidateNotes.includes('lucro recebido'))
      );
    });

    if (!profit) {
      acc.push(entry);
      return acc;
    }

    consumed.add(profit.id);
    acc.push({
      ...entry,
      amount: Number(entry.amount || 0) + Number(profit.amount || 0),
      interestDelta: Number(entry.interestDelta || 0) + Number(profit.interestDelta || 0),
      lateFeeDelta: Number(entry.lateFeeDelta || 0) + Number(profit.lateFeeDelta || 0),
      notes: 'Recebimento registrado (capital + lucro).',
      category: 'RECEBIMENTO',
    });
    return acc;
  }, []);
};
interface LedgerListProps {
  ledger: LedgerEntry[];
  loan: Loan;
  onReverseTransaction: (t: LedgerEntry, l: Loan) => void;
  onOpenReceipt?: (t: LedgerEntry, l: Loan) => void;
  isStealthMode?: boolean;
}

const LedgerItem: React.FC<{
  t: LedgerEntry;
  loan: Loan;
  onReverse: (t: LedgerEntry, l: Loan) => void;
  onOpenReceipt?: (t: LedgerEntry, l: Loan) => void;
  isStealth: boolean;
}> = ({ t, loan, onReverse, onOpenReceipt, isStealth }) => {
  // Auditoria / edição manual
  const isAudit = t.category === 'AUDIT' || t.notes?.startsWith('{') || t.type === 'ESTORNO' || t.category === 'SISTEMA';
  const auditLines = isAudit ? humanizeAuditLog(t.notes || '') : null;

  // ✅ Reversível: pagamentos, empréstimos e novo aporte
  const isReversible =
    !isAudit &&
    (String(t.type || '').includes('PAYMENT') ||
      t.type === 'LEND_MORE' ||
      t.type === 'NOVO_APORTE');

  const isAgreementPayment = t.type === 'AGREEMENT_PAYMENT';
  const canReceipt = String(t.type || '').includes('PAYMENT') && Number(t.amount || 0) > 0;

  // Ícone/Cor por tipo
  const badgeClass =
    t.type === 'ADJUSTMENT'
      ? 'bg-indigo-500/10 text-indigo-400'
      : (t.type === 'LEND_MORE' || t.type === 'NOVO_APORTE')
      ? 'bg-rose-500/10 text-rose-500'
      : 'bg-emerald-500/10 text-emerald-500';

  const badgeIcon =
    t.type === 'ADJUSTMENT'
      ? <Settings size={12} />
      : (t.type === 'LEND_MORE' || t.type === 'NOVO_APORTE')
      ? <HandCoins size={12} />
      : <CheckCircle2 size={12} />;

  // Sinal +/- no valor
  const isOutflow = t.type === 'LEND_MORE' || t.type === 'NOVO_APORTE' || t.type === 'LOAN_INITIAL';

  const titleText =
    isAgreementPayment
      ? 'Recebimento de Acordo'
      : isAudit
      ? 'Sistema / Auditoria'
      : translateTransactionType(t.type);

  return (
    <div className="flex flex-col border-b border-slate-800/50 pb-2 mb-2 last:border-0 last:pb-0 last:mb-0 group">
      <div className="table-row text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`p-1.5 rounded-lg shrink-0 ${badgeClass}`}>
            {badgeIcon}
          </div>
          <div className="min-w-0">
            <p className="text-white font-bold truncate">{titleText}</p>
            <p className="text-[9px] text-slate-500 truncate">
              {new Date(t.date).toLocaleDateString('pt-BR')} às{' '}
              {new Date(t.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>

        <div className="text-right">
          {!isAudit && (
            <span className={`font-black whitespace-nowrap ${isOutflow ? 'text-rose-500' : 'text-emerald-500'}`}>
              {isOutflow ? '-' : '+'} {formatMoney(t.amount, isStealth)}
            </span>
          )}
        </div>

        <div className="flex justify-end">
          {canReceipt && onOpenReceipt && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpenReceipt(t, loan);
              }}
              className="p-1.5 bg-slate-800 text-emerald-400 rounded-lg hover:bg-emerald-600 hover:text-white transition-all mr-1"
              title="Reimprimir comprovante"
            >
              <FileText size={12} />
            </button>
          )}
          {isReversible && !isAgreementPayment && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onReverse(t, loan);
              }}
              className="p-1.5 bg-slate-800 text-rose-400 rounded-lg hover:bg-rose-500 hover:text-white transition-all opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
              title="Estornar lançamento"
            >
              <Undo2 size={12} />
            </button>
          )}
        </div>
      </div>

      {auditLines && (
        <div className="mt-2 ml-7 pl-2 border-l border-slate-800 space-y-1">
          {auditLines.map((line, idx) => (
            <p key={idx} className="text-[9px] text-slate-400 leading-tight italic">
              • {line}
            </p>
          ))}
        </div>
      )}
    </div>
  );
};

export const LedgerList: React.FC<LedgerListProps> = ({ ledger = [], loan, onReverseTransaction, onOpenReceipt, isStealthMode }) => {
  return (
    <div className="space-y-2 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
      {ledger && ledger.length > 0 ? (
        mergeSplitReceipts(ledger).map((t) => (
          <LedgerItem
            key={t.id}
            t={t}
            loan={loan}
            onReverse={onReverseTransaction}
            onOpenReceipt={onOpenReceipt}
            isStealth={!!isStealthMode}
          />
        ))
      ) : (
        <p className="text-[10px] text-slate-500 text-center italic py-4">Nenhuma transação registrada.</p>
      )}
    </div>
  );
};
