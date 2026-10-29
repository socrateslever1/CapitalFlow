/**
 * Componente LedgerTimeline.
 * Responsável por renderizar a linha do tempo do extrato de transações de um empréstimo,
 * agrupando os eventos por data e oferecendo ações de impressão de comprovante e estorno.
 */

import React from 'react';
import { Clock, FileText, Receipt, RefreshCcw } from 'lucide-react';
import { Loan, LedgerEntry } from '../../types';
import { formatMoney } from '../../utils/formatters';
import { translateTransactionType } from '../../utils/translationHelpers';
import { canReverseLedgerEntry, formatLedgerTime, getLedgerReversalIndex, isLedgerReversal } from '../../utils/ledgerPresentation';


interface LedgerTimelineProps {
    loan: Loan;
    groupedLedger: Record<string, LedgerEntry[]>;
    isStealthMode: boolean;
    onOpenReceipt?: (transaction: LedgerEntry, loan: Loan) => void;
    onReverseTransaction: (transaction: LedgerEntry, loan: Loan) => void;
    onReverseNormalUnification?: (transaction: LedgerEntry, loan: Loan) => void;
}

export const LedgerTimeline: React.FC<LedgerTimelineProps> = ({
    loan,
    groupedLedger,
    isStealthMode,
    onOpenReceipt,
    onReverseTransaction,
    onReverseNormalUnification
}) => {
    const reversalIndex = React.useMemo(() => getLedgerReversalIndex(loan.ledger || []), [loan.ledger]);
    const getTransactionIcon = (type: string) => {
        switch (type) {
            case 'PAYMENT':
            case 'PAYMENT_FULL':
            case 'PAYMENT_PARTIAL':
                return 'R$';
            case 'AGREEMENT_PAYMENT':
                return 'AC';
            case 'AGREEMENT_PAYMENT_REVERSED':
                return 'ES';
            case 'ESTORNO':
                return 'ES';
            case 'RENEGOTIATION_CREATED':
            case 'NORMAL_UNIFICATION_CREATED':
            case 'CAPITAL_ONLY_RECOVERY_ENABLED':
            case 'CAPITAL_ONLY_RECOVERY_DISABLED':
            case 'AGREEMENT_SCHEDULE_UPDATED':
                return 'DOC';
            case 'RENEGOTIATION_BROKEN':
                return '!';
            case 'LEND_MORE':
            case 'NOVO_APORTE':
            case 'LOAN_INITIAL':
                return 'CAP';
            case 'CHARGE':
            case 'PAYMENT_INTEREST':
            case 'PAYMENT_LATE_FEE':
                return '%';
            case 'ADJUSTMENT':
            case 'SYSTEM':
                return 'AJ';
            default:
                return 'R$';
        }
    };

    return (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-[10px] font-black uppercase text-slate-500 tracking-widest flex items-center gap-2">
                    <Clock size={14} className="text-amber-500" /> Extrato de Transações
                </h3>
                <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">
                    {loan.ledger?.length || 0} eventos
                </span>
            </div>

            <div className="max-h-[260px] overflow-y-auto pr-2 custom-scrollbar space-y-4">
                {Object.keys(groupedLedger).length > 0 ? (
                    Object.entries(groupedLedger).map(([date, entries]) => (
                        <div key={date} className="space-y-2">
                            <div className="flex items-center gap-2 sticky top-0 bg-slate-900 py-1 z-10">
                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest bg-slate-950 px-2 py-0.5 rounded border border-slate-800/50">
                                    {date}
                                </span>
                                <div className="h-[1px] flex-1 bg-slate-800/30"></div>
                            </div>
                            <div className="space-y-1">
                                {entries.map((entry) => (
                                    <div
                                        key={entry.id}
                                        className="flex items-center justify-between p-2 rounded-lg bg-slate-950/30 border border-transparent hover:border-slate-800 hover:bg-slate-950/50 transition-all group"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-[9px] font-black border border-slate-800 group-hover:border-slate-700 transition-colors">
                                                {getTransactionIcon(entry.type) === 'DOC' ? <FileText size={13} /> : getTransactionIcon(entry.type)}
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-[10px] font-black text-white uppercase tracking-tight leading-none mb-1">
                                                    {isLedgerReversal(entry) ? 'Estorno de recebimento' : entry.type === 'AGREEMENT_PAYMENT' ? 'Recebimento do acordo' : translateTransactionType(entry.type)}
                                                </span>
                                                <span className="text-[8px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-1">
                                                    ref: {entry.id.split('-')[0]} •{' '}
                                                    {formatLedgerTime(entry) || 'data contábil'}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3">
                                            <div className="text-right">
                                                <p
                                                    className={`text-[11px] font-black tabular-nums ${
                                                        isLedgerReversal(entry) || entry.amount < 0 ? 'text-rose-400' : 'text-emerald-400'
                                                    }`}
                                                >
                                                    {isLedgerReversal(entry) ? '− ' : entry.amount >= 0 ? '+ ' : ''}
                                                    {formatMoney(isLedgerReversal(entry) ? Math.abs(entry.amount) : entry.amount, isStealthMode)}
                                                </p>
                                                {entry.type === 'NORMAL_UNIFICATION_CREATED' && entry.meta && (
                                                    <p className="text-[8px] font-bold text-slate-500 uppercase">
                                                        P {formatMoney(Number(entry.meta.principal || 0), isStealthMode)} | J {formatMoney(Number(entry.meta.interest || 0), isStealthMode)} | M {formatMoney(Number(entry.meta.late_fee || 0), isStealthMode)}
                                                    </p>
                                                )}
                                            </div>

                                            {entry.type?.includes('PAYMENT') && Number(entry.amount || 0) > 0 && onOpenReceipt && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onOpenReceipt(entry, loan);
                                                    }}
                                                    className="min-h-8 min-w-8 rounded-md border border-emerald-500/20 bg-emerald-500/10 p-2 text-emerald-400 hover:bg-emerald-500/20" aria-label="Ver comprovante"
                                                    title="Reimprimir Comprovante"
                                                >
                                                    <Receipt size={12} />
                                                </button>
                                            )}

                                            {/* Reversão somente para operações com identificadores auditáveis. */}
                                            {canReverseLedgerEntry(entry, reversalIndex.reversedIds, reversalIndex.reversedKeys) && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onReverseTransaction(entry, loan);
                                                        }}
                                                        className="min-h-8 min-w-8 rounded-md border border-rose-500/20 bg-rose-500/10 p-2 text-rose-400 hover:bg-rose-500/20" aria-label="Estornar lançamento auditável"
                                                        title="Estornar Transação"
                                                    >
                                                        <RefreshCcw size={12} />
                                                    </button>
                                                )}

                                            {entry.type === 'NORMAL_UNIFICATION_CREATED' && onReverseNormalUnification && !entry.meta?.reversed_at && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onReverseNormalUnification(entry, loan);
                                                    }}
                                                    className="opacity-0 group-hover:opacity-100 transition-all p-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 rounded-lg border border-amber-500/20"
                                                    title="Desfazer unificacao normal"
                                                >
                                                    <RefreshCcw size={12} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="text-center py-10 bg-slate-950/30 rounded-lg border border-dashed border-slate-800">
                        <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">
                            Nenhuma transação registrada
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};
