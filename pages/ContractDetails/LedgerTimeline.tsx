/**
 * Componente LedgerTimeline.
 * Responsável por renderizar a linha do tempo do extrato de transações de um empréstimo,
 * agrupando os eventos por data e oferecendo ações de impressão de comprovante e estorno.
 */

import React from 'react';
import { Clock, Receipt, RefreshCcw } from 'lucide-react';
import { Loan, LedgerEntry } from '../../types';
import { formatMoney } from '../../utils/formatters';
import { translateTransactionType } from '../../utils/translationHelpers';

interface LedgerTimelineProps {
    loan: Loan;
    groupedLedger: Record<string, LedgerEntry[]>;
    isStealthMode: boolean;
    onOpenReceipt?: (transaction: LedgerEntry, loan: Loan) => void;
    onReverseTransaction: (transaction: LedgerEntry, loan: Loan) => void;
}

export const LedgerTimeline: React.FC<LedgerTimelineProps> = ({
    loan,
    groupedLedger,
    isStealthMode,
    onOpenReceipt,
    onReverseTransaction
}) => {
    const getTransactionIcon = (type: string) => {
        switch (type) {
            case 'PAYMENT':
            case 'PAYMENT_FULL':
            case 'PAYMENT_PARTIAL':
                return '💰';
            case 'AGREEMENT_PAYMENT':
                return '🪙';
            case 'AGREEMENT_PAYMENT_REVERSED':
                return '🔄';
            case 'ESTORNO':
                return '🔁';
            case 'RENEGOTIATION_CREATED':
            case 'NORMAL_UNIFICATION_CREATED':
            case 'CAPITAL_ONLY_RECOVERY_ENABLED':
            case 'CAPITAL_ONLY_RECOVERY_DISABLED':
            case 'AGREEMENT_SCHEDULE_UPDATED':
                return '📄';
            case 'RENEGOTIATION_BROKEN':
                return '⚠';
            case 'LEND_MORE':
            case 'NOVO_APORTE':
            case 'LOAN_INITIAL':
                return '🏦';
            case 'CHARGE':
            case 'PAYMENT_INTEREST':
            case 'PAYMENT_LATE_FEE':
                return '📈';
            case 'ADJUSTMENT':
            case 'SYSTEM':
                return '✍';
            default:
                return '💰';
        }
    };

    return (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
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
                                        className="flex items-center justify-between p-2 rounded-xl bg-slate-950/30 border border-transparent hover:border-slate-800 hover:bg-slate-950/50 transition-all group"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-sm border border-slate-800 group-hover:border-slate-700 transition-colors">
                                                {getTransactionIcon(entry.type)}
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-[10px] font-black text-white uppercase tracking-tight leading-none mb-1">
                                                    {translateTransactionType(entry.type)}
                                                </span>
                                                <span className="text-[8px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-1">
                                                    ref: {entry.id.split('-')[0]} •{' '}
                                                    {new Date(entry.date).toLocaleTimeString('pt-BR', {
                                                        hour: '2-digit',
                                                        minute: '2-digit',
                                                    })}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3">
                                            <div className="text-right">
                                                <p
                                                    className={`text-[11px] font-black tabular-nums ${
                                                        entry.amount >= 0 ? 'text-emerald-400' : 'text-rose-400'
                                                    }`}
                                                >
                                                    {entry.amount >= 0 ? '+' : ''}
                                                    {formatMoney(entry.amount, isStealthMode)}
                                                </p>
                                            </div>

                                            {entry.type?.includes('PAYMENT') && Number(entry.amount || 0) > 0 && onOpenReceipt && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onOpenReceipt(entry, loan);
                                                    }}
                                                    className="opacity-0 group-hover:opacity-100 transition-all p-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 rounded-lg border border-emerald-500/20"
                                                    title="Reimprimir Comprovante"
                                                >
                                                    <Receipt size={12} />
                                                </button>
                                            )}

                                            {/* Apenas transações reversíveis (não auditoria/sistema/acordo) */}
                                            {entry.type !== 'ESTORNO' &&
                                                entry.type !== 'SYSTEM' &&
                                                entry.category !== 'AUDIT' &&
                                                !entry.type?.includes('AGREEMENT') && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onReverseTransaction(entry, loan);
                                                        }}
                                                        className="opacity-0 group-hover:opacity-100 transition-all p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 rounded-lg border border-rose-500/20"
                                                        title="Estornar Transação"
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
                    <div className="text-center py-10 bg-slate-950/30 rounded-2xl border border-dashed border-slate-800">
                        <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">
                            Nenhuma transação registrada
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};
