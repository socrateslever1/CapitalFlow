import React, { useState } from 'react';
import {
    AlertCircle,
    Archive,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    Clock,
    Layers,
    MessageSquare,
    RefreshCcw,
    ShieldAlert,
    User,
    Wallet,
} from 'lucide-react';
import { ClientGroup } from '../../domain/dashboard/loanGrouping';
import { formatMoney, formatShortName } from '../../utils/formatters';
import { LoanCard } from './LoanCard';

interface ClientGroupCardProps {
    group: ClientGroup;
    passThroughProps: any;
    isStealthMode: boolean;
    onOpenClient?: (clientId: string | null | undefined, clientName: string) => void;
}

export const ClientGroupCard: React.FC<ClientGroupCardProps> = ({ group, passThroughProps, isStealthMode, onOpenClient }) => {
    const { selectedLoanId, setSelectedLoanId } = passThroughProps;
    const hasSelectedLoan = selectedLoanId && group.loans.some(l => l.id === selectedLoanId);
    const isGroupSelected = selectedLoanId === 'GROUP_' + group.id;
    const isExpanded = hasSelectedLoan || isGroupSelected;
    const [showArchiveChoices, setShowArchiveChoices] = useState(false);

    const cardRef = React.useRef<HTMLDivElement>(null);

    const getNextOpenDueDate = (loan: any) => {
        const next = loan.installments?.find((inst: any) => inst.status !== 'PAID');
        return next?.dueDate ? new Date(next.dueDate) : null;
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const overdueLoans = group.loans.filter((loan) => {
        const due = getNextOpenDueDate(loan);
        return !!due && due.getTime() < today.getTime();
    });

    const dueSoonLoans = group.loans.filter((loan) => {
        const due = getNextOpenDueDate(loan);
        if (!due) return false;
        const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return diffDays >= 0 && diffDays <= 3;
    });

    const activeLoans = group.loans.filter((loan) => !loan.isArchived);

    const handleRenegotiateAll = (e: React.MouseEvent) => {
        e.stopPropagation();
        passThroughProps.onRenegotiate?.(group.loans);
    };

    const handleBillSelection = (e: React.MouseEvent, loans: any[]) => {
        e.stopPropagation();
        const billableLoans = loans.filter(Boolean);
        if (billableLoans.length === 0) return;
        billableLoans.forEach((loan) => passThroughProps.onMarkAsBilled?.(loan));
        passThroughProps.onMessage?.(billableLoans[0]);
    };

    const handleArchiveSelection = (e: React.MouseEvent, loans: any[]) => {
        e.stopPropagation();
        loans.filter(Boolean).forEach((loan) => passThroughProps.onArchive?.(loan));
        setShowArchiveChoices(false);
    };

    if (group.isStandalone && group.loans.length === 1) {
        const loan = group.loans[0];
        return (
            <LoanCard
                loan={loan}
                {...passThroughProps}
                onNavigate={passThroughProps.onNavigate}
            />
        );
    }

    let borderLeftColor = 'border-l-blue-500';
    let icon = <User className="text-slate-400" size={20} />;
    let statusText = 'Regular';
    let statusTextColor = 'text-slate-400';

    if (group.hasCapitalOnlyRecovery) {
        borderLeftColor = 'border-l-rose-600';
        icon = <ShieldAlert className="text-rose-500" size={20} />;
        statusText = 'Somente Capital';
        statusTextColor = 'text-rose-500';
    } else if (group.status === 'CRITICAL') {
        borderLeftColor = 'border-l-rose-500';
        icon = <ShieldAlert className="text-rose-500" size={20} />;
        statusText = 'Risco Crítico';
        statusTextColor = 'text-rose-500';
    } else if (group.status === 'LATE') {
        borderLeftColor = 'border-l-amber-500';
        icon = <AlertCircle className="text-amber-500" size={20} />;
        statusText = 'Em Atraso';
        statusTextColor = 'text-amber-500';
    } else if (group.status === 'PAID') {
        borderLeftColor = 'border-l-emerald-500';
        icon = <CheckCircle2 className="text-emerald-500" size={20} />;
        statusText = 'Sem Pendências';
        statusTextColor = 'text-emerald-500';
    }

    const handleCardClick = () => {
        if (!isExpanded && setSelectedLoanId) {
            setSelectedLoanId('GROUP_' + group.id);
        }
    };

    const handleToggleGroup = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (setSelectedLoanId) {
            setSelectedLoanId(isExpanded ? null : 'GROUP_' + group.id);
        }
    };

    const handleOpenClient = (e: React.MouseEvent) => {
        if (!onOpenClient) return;
        e.stopPropagation();
        onOpenClient(group.clientId, group.clientName);
    };

    return (
        <div ref={cardRef} className={`responsive-card relative overflow-hidden transition-all duration-300 rounded-xl sm:rounded-2xl border border-slate-800 bg-slate-900 hover:border-slate-700 hover:shadow-xl hover:shadow-slate-900/50 group cursor-pointer border-l-4 ${borderLeftColor} ${isExpanded ? 'ring-2 ring-blue-500/20' : ''}`}>
            <div
                className="flex flex-col min-h-[6rem] justify-between relative"
                onClick={handleCardClick}
            >
                <div className="flex justify-between items-start gap-3">
                    <div
                        className="flex items-center gap-3 min-w-0 flex-1"
                        onClick={handleOpenClient}
                        role={onOpenClient ? 'button' : undefined}
                        title={onOpenClient ? 'Abrir cliente' : undefined}
                    >
                        <div className="relative shrink-0">
                            {group.avatarUrl ? (
                                <img src={group.avatarUrl} className="w-11 h-11 rounded-xl object-cover border border-slate-700/50" alt={group.clientName} />
                            ) : (
                                <div className="w-11 h-11 rounded-xl bg-slate-800 flex items-center justify-center border border-slate-700/50 shadow-sm">
                                    {icon}
                                </div>
                            )}
                            <button
                                onClick={handleToggleGroup}
                                className="absolute -bottom-1 -right-1 bg-slate-900 rounded-lg p-1 border border-slate-700 hover:bg-slate-800 transition-colors"
                            >
                                {isExpanded ? <ChevronUp size={14} className="text-white" /> : <ChevronDown size={14} className="text-white" />}
                            </button>
                        </div>

                        <div className="min-w-0 flex flex-col flex-1">
                            <h3 className="client-name font-black text-white uppercase leading-tight tracking-tight truncate">
                                {formatShortName(group.clientName)}
                            </h3>
                            <div className="flex items-center gap-1.5 flex-wrap mt-1">
                                <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded border bg-slate-950/50 ${statusTextColor} border-current opacity-80 whitespace-nowrap`}>
                                    {statusText}
                                </span>
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-[8px] text-slate-500 font-bold uppercase flex items-center gap-1 whitespace-nowrap">
                                    <Layers size={10} /> {group.contractCount}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex items-end justify-between pt-2 border-t border-slate-800/30 mt-1">
                    <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5 text-slate-500">
                            <Wallet size={10} className="opacity-50" />
                            <span className="text-[8px] font-black uppercase tracking-[0.15em]">Dívida Total</span>
                        </div>
                    </div>
                    <div className="flex flex-col items-end">
                        <span className={`text-lg sm:text-xl font-black tracking-tighter transition-all ${group.totalDebt < 0.1 ? 'text-emerald-400' : 'text-white'}`}>
                            {formatMoney(group.totalDebt, isStealthMode)}
                        </span>
                    </div>
                </div>
            </div>

            {isExpanded && (
                <div className="bg-slate-950/50 p-3 sm:p-4 space-y-4 border-t border-slate-800 animate-in slide-in-from-top-2 duration-300">
                    <p className="text-[10px] text-slate-500 font-bold uppercase text-center tracking-[0.3em] mb-2">Detalhamento dos Contratos</p>
                    {group.loans.map(loan => (
                        <LoanCard
                            key={loan.id}
                            loan={loan}
                            {...passThroughProps}
                            onNavigate={passThroughProps.onNavigate}
                        />
                    ))}

                    <div className="pt-3 border-t border-slate-800/60 space-y-3">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <button
                                onClick={(e) => handleBillSelection(e, group.loans)}
                                className="px-3 py-3 bg-emerald-600/10 text-emerald-400 border border-emerald-500/20 rounded-xl hover:bg-emerald-600 hover:text-white transition-all flex flex-col items-center justify-center gap-1.5"
                            >
                                <MessageSquare size={14} />
                                <span className="text-[8px] font-black uppercase text-center">Cobrar Todos</span>
                            </button>
                            <button
                                onClick={(e) => handleBillSelection(e, overdueLoans)}
                                disabled={overdueLoans.length === 0}
                                className="px-3 py-3 bg-rose-600/10 text-rose-400 border border-rose-500/20 rounded-xl hover:bg-rose-600 hover:text-white transition-all flex flex-col items-center justify-center gap-1.5 disabled:opacity-40 disabled:hover:bg-rose-600/10 disabled:hover:text-rose-400"
                            >
                                <AlertCircle size={14} />
                                <span className="text-[8px] font-black uppercase text-center">Vencidos</span>
                            </button>
                            <button
                                onClick={(e) => handleBillSelection(e, dueSoonLoans)}
                                disabled={dueSoonLoans.length === 0}
                                className="px-3 py-3 bg-amber-600/10 text-amber-400 border border-amber-500/20 rounded-xl hover:bg-amber-600 hover:text-white transition-all flex flex-col items-center justify-center gap-1.5 disabled:opacity-40 disabled:hover:bg-amber-600/10 disabled:hover:text-amber-400"
                            >
                                <Clock size={14} />
                                <span className="text-[8px] font-black uppercase text-center">Vencendo</span>
                            </button>
                            <button
                                onClick={handleRenegotiateAll}
                                className="px-3 py-3 bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 rounded-xl hover:bg-indigo-600 hover:text-white transition-all flex flex-col items-center justify-center gap-1.5"
                            >
                                <RefreshCcw size={14} />
                                <span className="text-[8px] font-black uppercase text-center">Unificar</span>
                            </button>
                        </div>

                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowArchiveChoices((current) => !current);
                            }}
                            className="w-full px-3 py-3 bg-slate-900 text-slate-400 border border-slate-800 rounded-xl hover:bg-slate-800 hover:text-amber-400 transition-all flex items-center justify-center gap-2"
                        >
                            <Archive size={14} />
                            <span className="text-[8px] font-black uppercase">Arquivar</span>
                        </button>

                        {showArchiveChoices && (
                            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-2 space-y-2">
                                <button
                                    onClick={(e) => handleArchiveSelection(e, activeLoans)}
                                    disabled={activeLoans.length === 0}
                                    className="w-full px-3 py-2 rounded-lg bg-amber-600/10 text-amber-400 border border-amber-500/20 text-[8px] font-black uppercase disabled:opacity-40"
                                >
                                    Arquivar todos
                                </button>
                                <div className="grid gap-2">
                                    {activeLoans.map((loan) => (
                                        <button
                                            key={loan.id}
                                            onClick={(e) => handleArchiveSelection(e, [loan])}
                                            className="w-full px-3 py-2 rounded-lg bg-slate-950 text-slate-300 border border-slate-800 text-left text-[9px] font-black uppercase truncate hover:text-amber-400"
                                        >
                                            {formatShortName(loan.debtorName)} · #{loan.id.substring(0, 6)}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
