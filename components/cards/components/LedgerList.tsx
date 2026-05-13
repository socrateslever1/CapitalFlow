import React from 'react';
import { Settings, HandCoins, CheckCircle2, Undo2 } from 'lucide-react';
import { LedgerEntry, Loan } from '../../../types';
import { humanizeAuditLog } from '../../../utils/auditHelpers';
import { formatMoney } from '../../../utils/formatters';
import { translateTransactionType } from '../../../utils/translationHelpers';

interface LedgerListProps {
  ledger: LedgerEntry[];
  loan: Loan;
  onReverseTransaction: (t: LedgerEntry, l: Loan) => void;
  isStealthMode?: boolean;
}

const LedgerItem: React.FC<{
  t: LedgerEntry;
  loan: Loan;
  onReverse: (t: LedgerEntry, l: Loan) => void;
  isStealth: boolean;
}> = ({ t, loan, onReverse, isStealth }) => {
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
      ? 'Pagamento de Acordo'
      : isAudit
      ? 'Sistema / Auditoria'
      : (t.type === 'LOAN_INITIAL' ? 'Contrato Inicial' : (t.notes && t.notes.length < 30 ? t.notes : translateTransactionType(t.type)));

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
              {new Date(t.date).toLocaleDateString()} às{' '}
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
          {isReversible && !isAgreementPayment && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onReverse(t, loan);
              }}
              className="p-1.5 bg-slate-800 text-rose-400 rounded-lg hover:bg-rose-500 hover:text-white transition-all opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
              title="Estornar (Desfazer) Lançamento"
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

export const LedgerList: React.FC<LedgerListProps> = ({ ledger = [], loan, onReverseTransaction, isStealthMode }) => {
  return (
    <div className="space-y-2 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
      {ledger && ledger.length > 0 ? (
        ledger.map((t) => (
          <LedgerItem
            key={t.id}
            t={t}
            loan={loan}
            onReverse={onReverseTransaction}
            isStealth={!!isStealthMode}
          />
        ))
      ) : (
        <p className="text-[10px] text-slate-500 text-center italic py-4">Nenhuma transação registrada.</p>
      )}
    </div>
  );
};