import React, { useState } from 'react';
import {
    AlertCircle,
    Archive,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    Clock,
    Copy,
    Link as LinkIcon,
    Layers,
    MessageSquare,
    RefreshCcw,
    ShieldAlert,
    User,
    Wallet,
} from 'lucide-react';
import { ClientGroup } from '../../domain/dashboard/loanGrouping';
import { formatMoney, formatShortName } from '../../utils/formatters';
import { parseDateOnlyUTC, todayDateOnlyUTC } from '../../utils/dateHelpers';
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
    const [billFilter, setBillFilter] = useState<'ALL' | 'OVERDUE' | 'DUE_SOON' | null>(null);
    const [showUnifyChoices, setShowUnifyChoices] = useState(false);
    const [showPortalChoices, setShowPortalChoices] = useState(false);

    const cardRef = React.useRef<HTMLDivElement>(null);

    const getNextOpenDueDate = (loan: any) => {
        const next = loan.installments?.find((inst: any) => inst.status !== 'PAID');
        return next?.dueDate ? parseDateOnlyUTC(next.dueDate) : null;
    };

    const today = todayDateOnlyUTC();

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

    const handleBillLoan = (e: React.MouseEvent, loan: any) => {
        e.stopPropagation();
        if (!loan) return;
        passThroughProps.onMarkAsBilled?.(loan);
        passThroughProps.onMessage?.(loan);
    };

    const handleArchiveSelection = (e: React.MouseEvent, loans: any[]) => {
        e.stopPropagation();
        loans.filter(Boolean).forEach((loan) => passThroughProps.onArchive?.(loan));
        setShowArchiveChoices(false);
    };

    const handlePortalSelection = (e: React.MouseEvent, loan: any) => {
        e.stopPropagation();
        if (!loan) return;
        passThroughProps.onPortalLink?.(loan);
        setShowPortalChoices(false);
    };

    const closeActionPanels = () => {
        setBillFilter(null);
        setShowArchiveChoices(false);
        setShowUnifyChoices(false);
        setShowPortalChoices(false);
    };

    const billChoices = billFilter === 'OVERDUE'
        ? overdueLoans
        : billFilter === 'DUE_SOON'
            ? dueSoonLoans
            : group.loans;

    const billFilterLabel = billFilter === 'OVERDUE'
        ? 'Contratos vencidos'
        : billFilter === 'DUE_SOON'
            ? 'Contratos vencendo'
            : 'Todos os contratos';

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
        <div ref={cardRef} className={`responsive-card relative overflow-hidden transition-all duration-300 rounded-lg border border-slate-800 bg-slate-900 hover:border-slate-700 hover:shadow-xl hover:shadow-slate-900/50 group cursor-pointer border-l-4 ${borderLeftColor} ${isExpanded ? 'ring-2 ring-blue-500/20' : ''}`}>
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
                                <img src={group.avatarUrl} className="w-11 h-11 rounded-lg object-cover border border-slate-700/50" alt={group.clientName} />
                            ) : (
                                <div className="w-11 h-11 rounded-lg bg-slate-800 flex items-center justify-center border border-slate-700/50 shadow-sm">
                                    {icon}
                                </div>
                            )}
                            <button
                                onClick={handleToggleGroup}
                                className="absolute -bottom-1 -right-1 bg-slate-900 rounded-md p-1 border border-slate-700 hover:bg-slate-800 transition-colors"
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
                        <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenClient(e);
                                    closeActionPanels();
                                }}
                                className="px-2 py-2 bg-slate-900 text-slate-400 border border-slate-800 rounded-lg hover:bg-slate-800 hover:text-white transition-all flex flex-col items-center justify-center gap-1"
                            >
                                <User size={13} />
                                <span className="text-[7px] font-black uppercase text-center">Cliente</span>
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowPortalChoices((current) => !current);
                                    setBillFilter(null);
                                    setShowArchiveChoices(false);
                                    setShowUnifyChoices(false);
                                }}
                                className="px-2 py-2 bg-blue-600/10 text-blue-400 border border-blue-500/20 rounded-lg hover:bg-blue-600 hover:text-white transition-all flex flex-col items-center justify-center gap-1"
                            >
                                <LinkIcon size={13} />
                                <span className="text-[7px] font-black uppercase text-center">Portal</span>
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setBillFilter((current) => current === 'ALL' ? null : 'ALL');
                                    setShowArchiveChoices(false);
                                    setShowUnifyChoices(false);
                                    setShowPortalChoices(false);
                                }}
                                className="px-2 py-2 bg-emerald-600/10 text-emerald-400 border border-emerald-500/20 rounded-lg hover:bg-emerald-600 hover:text-white transition-all flex flex-col items-center justify-center gap-1"
                            >
                                <MessageSquare size={13} />
                                <span className="text-[7px] font-black uppercase text-center">Cobrar</span>
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setBillFilter((current) => current === 'OVERDUE' ? null : 'OVERDUE');
                                    setShowArchiveChoices(false);
                                    setShowUnifyChoices(false);
                                    setShowPortalChoices(false);
                                }}
                                disabled={overdueLoans.length === 0}
                                className="px-2 py-2 bg-rose-600/10 text-rose-400 border border-rose-500/20 rounded-lg hover:bg-rose-600 hover:text-white transition-all flex flex-col items-center justify-center gap-1 disabled:opacity-40 disabled:hover:bg-rose-600/10 disabled:hover:text-rose-400"
                            >
                                <AlertCircle size={13} />
                                <span className="text-[7px] font-black uppercase text-center">Venc.</span>
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setBillFilter((current) => current === 'DUE_SOON' ? null : 'DUE_SOON');
                                    setShowArchiveChoices(false);
                                    setShowUnifyChoices(false);
                                    setShowPortalChoices(false);
                                }}
                                disabled={dueSoonLoans.length === 0}
                                className="px-2 py-2 bg-amber-600/10 text-amber-400 border border-amber-500/20 rounded-lg hover:bg-amber-600 hover:text-white transition-all flex flex-col items-center justify-center gap-1 disabled:opacity-40 disabled:hover:bg-amber-600/10 disabled:hover:text-amber-400"
                            >
                                <Clock size={13} />
                                <span className="text-[7px] font-black uppercase text-center">Prazo</span>
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowUnifyChoices((current) => !current);
                                    setBillFilter(null);
                                    setShowArchiveChoices(false);
                                    setShowPortalChoices(false);
                                }}
                                className="px-2 py-2 bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 rounded-lg hover:bg-indigo-600 hover:text-white transition-all flex flex-col items-center justify-center gap-1"
                            >
                                <RefreshCcw size={13} />
                                <span className="text-[7px] font-black uppercase text-center">Unir</span>
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowArchiveChoices((current) => !current);
                                    setBillFilter(null);
                                    setShowUnifyChoices(false);
                                    setShowPortalChoices(false);
                                }}
                                className="px-2 py-2 bg-slate-900 text-slate-400 border border-slate-800 rounded-lg hover:bg-slate-800 hover:text-amber-400 transition-all flex flex-col items-center justify-center gap-1"
                            >
                                <Archive size={13} />
                                <span className="text-[7px] font-black uppercase text-center">Arq.</span>
                            </button>
                        </div>

                        {showPortalChoices && (
                            <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2 space-y-2">
                                <p className="px-1 text-[8px] font-black uppercase text-slate-500 tracking-widest">Copiar link do portal</p>
                                <button
                                    onClick={(e) => handlePortalSelection(e, group.loans[0])}
                                    className="w-full px-3 py-2 rounded-md bg-blue-600/10 text-blue-400 border border-blue-500/20 text-[8px] font-black uppercase hover:bg-blue-600 hover:text-white flex items-center justify-center gap-2"
                                >
                                    <Copy size={12} /> Copiar link principal
                                </button>
                                <div className="grid gap-2">
                                    {group.loans.map((loan) => (
                                        <button
                                            key={loan.id}
                                            onClick={(e) => handlePortalSelection(e, loan)}
                                            className="w-full px-3 py-2 rounded-md bg-slate-950 text-slate-300 border border-slate-800 text-left text-[9px] font-black uppercase truncate hover:text-blue-400"
                                        >
                                            Portal {formatShortName(loan.debtorName)} · #{loan.id.substring(0, 6)}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {billFilter && (
                            <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2 space-y-2">
                                <p className="px-1 text-[8px] font-black uppercase text-slate-500 tracking-widest">{billFilterLabel}</p>
                                {billChoices.length === 0 ? (
                                    <p className="px-3 py-2 text-[9px] font-bold text-slate-500">Nenhum contrato neste filtro.</p>
                                ) : (
                                    <div className="grid gap-2">
                                        {billChoices.map((loan) => (
                                            <button
                                                key={loan.id}
                                                onClick={(e) => handleBillLoan(e, loan)}
                                                className="w-full px-3 py-2 rounded-md bg-slate-950 text-slate-300 border border-slate-800 text-left text-[9px] font-black uppercase truncate hover:text-emerald-400"
                                            >
                                                Cobrar {formatShortName(loan.debtorName)} · #{loan.id.substring(0, 6)}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {showUnifyChoices && (
                            <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2 space-y-2">
                                <button
                                    onClick={handleRenegotiateAll}
                                    className="w-full px-3 py-2 rounded-md bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 text-[8px] font-black uppercase hover:bg-indigo-600 hover:text-white"
                                >
                                    Unificar todos os contratos
                                </button>
                                <div className="grid gap-2">
                                    {group.loans.map((loan) => (
                                        <button
                                            key={loan.id}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                passThroughProps.onRenegotiate?.(loan);
                                            }}
                                            className="w-full px-3 py-2 rounded-md bg-slate-950 text-slate-300 border border-slate-800 text-left text-[9px] font-black uppercase truncate hover:text-indigo-400"
                                        >
                                            Renegociar {formatShortName(loan.debtorName)} · #{loan.id.substring(0, 6)}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                        {showArchiveChoices && (
                            <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2 space-y-2">
                                <button
                                    onClick={(e) => handleArchiveSelection(e, activeLoans)}
                                    disabled={activeLoans.length === 0}
                                    className="w-full px-3 py-2 rounded-md bg-amber-600/10 text-amber-400 border border-amber-500/20 text-[8px] font-black uppercase disabled:opacity-40"
                                >
                                    Arquivar todos
                                </button>
                                <div className="grid gap-2">
                                    {activeLoans.map((loan) => (
                                        <button
                                            key={loan.id}
                                            onClick={(e) => handleArchiveSelection(e, [loan])}
                                            className="w-full px-3 py-2 rounded-md bg-slate-950 text-slate-300 border border-slate-800 text-left text-[9px] font-black uppercase truncate hover:text-amber-400"
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
