import React, { useState } from 'react';
import { ChevronDown, ChevronUp, User, ShieldAlert, AlertCircle, CheckCircle2, Wallet, Layers, RefreshCcw } from 'lucide-react';
import { ClientGroup } from '../../domain/dashboard/loanGrouping';
import { formatMoney, formatShortName } from '../../utils/formatters';
import { LoanCard } from './LoanCard';

interface ClientGroupCardProps {
    group: ClientGroup;
    // Props passadas para o LoanCard (drill-down)
    passThroughProps: any;
    isStealthMode: boolean;
}

export const ClientGroupCard: React.FC<ClientGroupCardProps> = ({ group, passThroughProps, isStealthMode }) => {
    const { selectedLoanId, setSelectedLoanId } = passThroughProps;
    const hasSelectedLoan = selectedLoanId && group.loans.some(l => l.id === selectedLoanId);
    const isGroupSelected = selectedLoanId === 'GROUP_' + group.id;
    const isExpanded = hasSelectedLoan || isGroupSelected;

    const cardRef = React.useRef<HTMLDivElement>(null);
    const isInitialMount = React.useRef(true);
    
    React.useEffect(() => {
        if (isExpanded && isInitialMount.current && cardRef.current) {
            setTimeout(() => {
                cardRef.current?.scrollIntoView({ behavior: 'auto', block: 'center' });
            }, 100);
        }
        isInitialMount.current = false;
    }, [isExpanded]);

    const handleRenegotiateAll = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (passThroughProps.onRenegotiate) {
            passThroughProps.onRenegotiate(group.loans);
        }
    };

    // REGRA: Se for apenas um contrato, não agrupa visualmente. Renderiza o LoanCard direto.
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

    // Definição de Cores do Header baseada no Status do Grupo (Para múltiplos contratos)
    let borderLeftColor = 'border-l-blue-500';
    let icon = <User className="text-slate-400" size={20} />;
    let statusText = 'Regular';
    let statusTextColor = 'text-slate-400';

    if (group.status === 'CRITICAL') {
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

    return (
        <div ref={cardRef} className={`responsive-card relative overflow-hidden transition-all duration-300 rounded-xl sm:rounded-2xl border border-slate-800 bg-slate-900 hover:border-slate-700 hover:shadow-xl hover:shadow-slate-900/50 group cursor-pointer border-l-4 ${borderLeftColor} ${isExpanded ? 'ring-2 ring-blue-500/20' : ''}`}>
            <div 
                className="flex flex-col min-h-[6rem] justify-between relative"
                onClick={handleCardClick}
            >
                <div className="flex justify-between items-start gap-3 flex-wrap sm:flex-nowrap">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
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
                                {isExpanded ? <ChevronUp size={14} className="text-white"/> : <ChevronDown size={14} className="text-white"/>}
                            </button>
                        </div>
                        
                        <div className="min-w-0 flex flex-col">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="client-name font-black text-white uppercase leading-tight tracking-tight truncate max-w-[140px] sm:max-w-[220px]">
                                    {formatShortName(group.clientName)}
                                </h3>
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                                <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded border bg-slate-950/50 ${statusTextColor} border-current opacity-80 whitespace-nowrap`}>
                                    {statusText}
                                </span>
                                <span className="text-[8px] text-slate-500 font-bold uppercase flex items-center gap-1 whitespace-nowrap">
                                    <Layers size={10}/> {group.contractCount}
                                </span>
                            </div>
                        </div>
                    </div>

                    {(group.status === 'LATE' || group.status === 'CRITICAL') && group.loans.length > 1 && (
                        <button 
                            onClick={handleRenegotiateAll}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-1 rounded-md text-[8px] font-black uppercase shadow-lg flex items-center gap-1 transition-all z-10 shrink-0"
                        >
                            <RefreshCcw size={10} /> Unificar
                        </button>
                    )}
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
                </div>
            )}
        </div>
    );
};