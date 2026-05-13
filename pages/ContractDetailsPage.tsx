
import React, { useState, useMemo, useEffect } from 'react';
import { 
    ChevronLeft, DollarSign, Calendar, Clock, TrendingUp, AlertTriangle, 
    CheckCircle2, Receipt, MessageSquare, ShieldCheck, Banknote, 
    FileText, Download, RefreshCcw, Loader2, ChevronRight, User, FileEdit, History, X, ArrowLeft
} from 'lucide-react';
import { Loan, Installment, LedgerEntry, UserProfile, CapitalSource, Agreement, AgreementInstallment } from '../types';
import { formatMoney } from '../utils/formatters';
import { translateTransactionType } from '../utils/translationHelpers';
import { parseDateOnlyUTC, todayDateOnlyUTC } from '../utils/dateHelpers';
import { loanEngine } from '../domain/loanEngine';
import { usePaymentManagerState, ForgivenessMode } from '../components/modals/payment/hooks/usePaymentManagerState';
import { FlexibleDailyScreen } from '../components/modals/payment/FlexibleDailyScreen';
import { AgreementView } from '../features/agreements/components/AgreementView';

interface ContractDetailsPageProps {
    loanId: string;
    loans: Loan[];
    sources: CapitalSource[];
    activeUser: UserProfile | null;
    onBack: () => void;
    onNavigate?: (path: string) => void;
    onPayment: (
        forgivePenalty: ForgivenessMode, 
        manualDate?: Date | null, 
        amountPaid?: number,
        realDate?: Date | null,
        interestHandling?: 'CAPITALIZE' | 'KEEP_PENDING',
        contextOverride?: { loan: Loan, inst: Installment, calculations: any }
    ) => Promise<void>;
    isProcessing: boolean;
    onOpenMessage: (loan: Loan) => void;
    onRenegotiate: (loan: Loan) => void;
    onGenerateContract: (loan: Loan) => void;
    onExportExtrato: (loan: Loan) => void;
    onEdit: (loan: Loan) => void;
    onArchive: (loan: Loan) => void;
    onRestore: (loan: Loan) => void;
    onDelete: (loan: Loan) => void;
    onActivate: (loan: Loan) => void;
    onReverseTransaction: (transaction: LedgerEntry, loan: Loan) => void;
    onAgreementPayment?: (loan: Loan, agreement: any, inst: any) => void;
    onReverseAgreementPayment?: (loan: Loan, agreement: any, inst: any) => void;
    onRefresh?: () => void;
    isStealthMode: boolean;
}

export const ContractDetailsPage: React.FC<ContractDetailsPageProps> = ({
    loanId, loans, sources, activeUser, onBack, onPayment, isProcessing,
    onOpenMessage, onRenegotiate, onGenerateContract, onExportExtrato,
    onEdit, onArchive, onRestore, onDelete, onActivate, onReverseTransaction, 
    onAgreementPayment, onReverseAgreementPayment, onRefresh, isStealthMode, onNavigate
}) => {
    const loan = useMemo(() => loans.find(l => l.id === loanId), [loans, loanId]);

    const [avAmount, setAvAmount] = useState('');
    const [paymentType, setPaymentType] = useState<any>('RENEW_AV');

    // Mock calculations for usePaymentManagerState hook
    const data = useMemo(() => {
        if (!loan) return null;
        const bal = loanEngine.computeRemainingBalance(loan);
        return {
            loan,
            inst: loan.installments.find(i => i.status !== 'PAID') || loan.installments[0] || {} as Installment,
            calculations: {
                total: bal.totalRemaining,
                principal: bal.principalRemaining,
                interest: bal.interestRemaining,
                lateFee: bal.lateFeeRemaining
            }
        };
    }, [loan]);

    const delayDetails = useMemo(() => {
        if (!loan) return null;
        const today = new Date();
        const installments = loan.installments || [];
        
        const lateInstallments = installments.filter(inst => {
            const due = new Date(inst.dueDate);
            const isOpen = inst.status !== 'PAID' && inst.status !== 'PAGO' && inst.status !== 'QUITADO' && inst.status !== 'RENEGOCIADO';
            return isOpen && due.getTime() < today.getTime();
        }).sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

        if (lateInstallments.length === 0) return null;

        return {
            totalMonths: lateInstallments.length,
            items: lateInstallments.map(inst => ({
                number: inst.number || 0,
                dueDate: inst.dueDate,
                total: (inst.principalRemaining || inst.amount || 0) + (inst.lateFeeAccrued || 0) + (inst.interestRemaining || 0),
                principal: inst.principalRemaining || inst.amount || 0,
                interest: (inst.lateFeeAccrued || 0) + (inst.interestRemaining || 0)
            }))
        };
    }, [loan]);

    const {
        manualDateStr, setManualDateStr,
        realPaymentDateStr, setRealPaymentDateStr,
        forgivenessMode, setForgivenessMode,
        interestHandling, setInterestHandling,
        debtBreakdown,
        resolvedBillingCycle,
        subMode, setSubMode
    } = usePaymentManagerState({ 
        data, 
        paymentType, 
        setPaymentType, 
        avAmount, 
        setAvAmount 
    });

    const groupedLedger: Record<string, LedgerEntry[]> = useMemo(() => {
        if (!loan.ledger) return {};
        const groups: Record<string, LedgerEntry[]> = {};
        const sorted = [...loan.ledger].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        
        sorted.forEach(entry => {
            const date = new Date(entry.date);
            const dateKey = date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
            if (!groups[dateKey]) groups[dateKey] = [];
            groups[dateKey].push(entry);
        });
        return groups;
    }, [loan.ledger]);

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

    if (!loan) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center mb-4 border border-slate-800">
                    <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                </div>
                <h3 className="text-white font-black uppercase tracking-tight">Carregando contrato...</h3>
            </div>
        );
    }

    const safeParse = (val: string) => {
        if (!val) return 0;
        const str = String(val).trim();
        if (str.includes('.') && str.includes(',')) return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
        if (str.includes(',')) return parseFloat(str.replace(',', '.')) || 0;
        return parseFloat(str) || 0;
    };

    const totalInterestDue = debtBreakdown.interest + debtBreakdown.fine + debtBreakdown.dailyMora;
    const amountEntering = safeParse(avAmount);
    const showInterestDecision = Math.max(0, totalInterestDue - amountEntering) > 0.05;

    const handleConfirm = () => {
        const val = safeParse(avAmount);
        if (val <= 0) return;
        const nextDueDate = manualDateStr ? parseDateOnlyUTC(manualDateStr) : null;
        const realPaymentDate = realPaymentDateStr ? parseDateOnlyUTC(realPaymentDateStr) : new Date();
        onPayment(forgivenessMode, nextDueDate, val, realPaymentDate, interestHandling, data || undefined);
    };

    const status = loanEngine.computeLoanStatus(loan);
    const statusColor = status === 'PAID' ? 'bg-emerald-500' : status === 'OVERDUE' ? 'bg-rose-500' : 'bg-blue-500';

    const nextDueDateDisplay = useMemo(() => {
        if (loan.activeAgreement && loan.activeAgreement.installments) {
            const nextAgreementInst = loan.activeAgreement.installments.find(i => i.status !== 'PAID' && i.status !== 'PAGO');
            if (nextAgreementInst) return new Date(nextAgreementInst.dueDate).toLocaleDateString('pt-BR');
        }
        const nextLoanInst = loan.installments.find(i => i.status !== 'PAID');
        if (nextLoanInst) return new Date(nextLoanInst.dueDate).toLocaleDateString('pt-BR');
        return 'N/A';
    }, [loan]);

    return (
        <div className="flex flex-col gap-3 animate-in fade-in duration-500 pb-24 md:pb-6">
            
            {/* BOTAO VOLTAR DESTAQUE */}
            <div className="flex items-center">
                <button 
                    onClick={onBack} 
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-[10px] font-black uppercase transition-all shadow-md hover:shadow-lg active:scale-95"
                >
                    <ArrowLeft size={14} /> Fechar
                </button>
            </div>

            {/* TOPO FIXO / HEADER */}
            <div className="bg-slate-950/90 backdrop-blur-md py-3 -mx-4 px-4 border-b border-slate-800/50 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full bg-gradient-to-br flex items-center justify-center text-white shrink-0 shadow-lg ${
                        status === 'PAID' ? 'from-emerald-500 to-emerald-600 shadow-emerald-900/20' : 
                        status === 'OVERDUE' ? 'from-rose-500 to-rose-600 shadow-rose-900/20' : 
                        'from-blue-500 to-blue-600 shadow-blue-900/20'
                    }`}>
                        <FileText size={16} />
                    </div>
                    <div>
                        <div className="flex items-center gap-2 mb-0.5">
                            <h1 className="text-base font-semibold text-white uppercase tracking-tight">{loan.debtorName}</h1>
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black text-white uppercase tracking-widest ${statusColor}`}>
                                {status === 'OVERDUE' ? 'Atrasado' : status === 'PAID' ? 'Quitado' : 'Ativo'}
                            </span>
                            {loan.last_billed_at && new Date(loan.last_billed_at).toDateString() === new Date().toDateString() && (
                                <span className="px-2 py-0.5 bg-emerald-500 rounded-full text-[9px] font-black text-white uppercase tracking-widest animate-in fade-in zoom-in duration-300">
                                    Cobrado Hoje
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-3">
                            <p className="text-[10px] text-slate-500 font-medium uppercase tracking-widest flex items-center gap-1">
                                <User size={10}/> {loan.debtorPhone}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 md:flex items-center gap-3 md:gap-6">
                    <div className="space-y-0.5">
                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Valor Principal</p>
                        <p className="text-sm font-black text-white">{formatMoney(loan.principal, isStealthMode)}</p>
                    </div>
                    <div className="space-y-0.5 text-right md:text-left">
                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Próximo Vencimento</p>
                        <p className="text-sm font-black text-blue-400">
                            {nextDueDateDisplay}
                        </p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* COLUNA ESQUERDA: RESUMO + AÇÕES */}
                <div className="space-y-6">
                    
                    {/* SEÇÃO 1 — RESUMO FINANCEIRO */}
                    {loan.activeAgreement ? (
                        <div className="space-y-4">
                            <h3 className="text-xs font-black uppercase text-indigo-400 tracking-widest flex items-center gap-2">
                                <History size={16} /> Acordo Ativo
                            </h3>
                            <AgreementView 
                                agreement={loan.activeAgreement}
                                loan={loan}
                                activeUser={activeUser}
                                onUpdate={onRefresh || (() => {})}
                                onPayment={(inst) => onAgreementPayment?.(loan, loan.activeAgreement!, inst)}
                                onReversePayment={(inst) => onReverseAgreementPayment?.(loan, loan.activeAgreement!, inst)}
                                isStealthMode={isStealthMode}
                                onNavigate={onNavigate}
                            />
                        </div>
                    ) : (
                        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
                            <h3 className="text-xs font-black uppercase text-slate-500 tracking-widest flex items-center gap-2">
                                <TrendingUp size={16} className="text-blue-500"/> Resumo Financeiro
                            </h3>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-slate-950 border border-slate-800 p-4 rounded-2xl">
                                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Principal Restante</p>
                                    <p className="text-xl font-black text-white">{formatMoney(debtBreakdown.principal, isStealthMode)}</p>
                                </div>
                                <div className="bg-slate-950 border border-slate-800 p-4 rounded-2xl">
                                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Juros Acumulados</p>
                                    <p className="text-xl font-black text-blue-400">{formatMoney(debtBreakdown.interest, isStealthMode)}</p>
                                </div>
                                <div className="bg-slate-950 border border-slate-800 p-4 rounded-2xl">
                                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Multa/Mora</p>
                                    <p className="text-xl font-black text-rose-400">{formatMoney(debtBreakdown.fine + debtBreakdown.dailyMora, isStealthMode)}</p>
                                </div>
                                <div className="bg-slate-950 border border-slate-800 p-4 rounded-2xl ring-2 ring-emerald-500/20">
                                    <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest mb-1">Total Atual</p>
                                    <p className="text-xl font-black text-emerald-400">{formatMoney(debtBreakdown.total, isStealthMode)}</p>
                                </div>
                            </div>

                            {/* DETALHAMENTO DE ATRASO (Novo) */}
                            {delayDetails && (
                                <div className="mt-6 pt-6 border-t border-slate-800 animate-in fade-in slide-in-from-top-2 duration-500">
                                    <div className="flex items-center justify-between mb-4">
                                        <h4 className="text-[10px] font-black uppercase text-rose-500 tracking-widest flex items-center gap-2">
                                            <AlertTriangle size={12} /> Detalhamento de Atraso
                                        </h4>
                                        <span className="px-2 py-0.5 bg-rose-500/10 text-rose-500 text-[9px] font-bold rounded-full border border-rose-500/20">
                                            {delayDetails.totalMonths} {delayDetails.totalMonths === 1 ? 'Mês' : 'Meses'} em atraso
                                        </span>
                                    </div>
                                    <div className="space-y-3">
                                        {delayDetails.items.map((item, idx) => (
                                            <div key={idx} className="flex items-center justify-between p-3 bg-slate-950/50 border border-slate-800 rounded-xl group hover:border-rose-500/30 transition-all">
                                                <div className="flex flex-col">
                                                    <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Parcela {item.number} • {new Date(item.dueDate).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</span>
                                                    <span className="text-[11px] font-black text-white uppercase leading-none italic">Vencimento {new Date(item.dueDate).toLocaleDateString('pt-BR')}</span>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-sm font-black text-rose-400">{formatMoney(item.total, isStealthMode)}</p>
                                                    <p className="text-[9px] font-bold text-slate-600 uppercase tracking-tighter">
                                                        Prin: {formatMoney(item.principal, isStealthMode)} + Enc: {formatMoney(item.interest, isStealthMode)}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* SEÇÃO 4 — AÇÕES RÁPIDAS */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
                        <h3 className="text-xs font-black uppercase text-slate-500 tracking-widest flex items-center gap-2">
                            <ShieldCheck size={16} className="text-purple-500"/> Ações do Contrato
                        </h3>
                        <div className="grid grid-cols-2 gap-2">
                            <button onClick={() => onOpenMessage(loan)} className="flex items-center justify-center gap-1.5 p-3 bg-emerald-950/30 border border-emerald-500/30 rounded-xl text-[9px] font-black uppercase text-emerald-400 hover:text-emerald-300 hover:bg-emerald-900/50 transition-all">
                                <MessageSquare size={14}/> WhatsApp
                            </button>
                            <button onClick={() => onEdit(loan)} className="flex items-center justify-center gap-1.5 p-3 bg-blue-950/30 border border-blue-500/30 rounded-xl text-[9px] font-black uppercase text-blue-400 hover:text-blue-300 hover:bg-blue-900/50 transition-all">
                                <FileEdit size={14}/> Editar
                            </button>
                            <button onClick={() => onRenegotiate(loan)} className="flex items-center justify-center gap-1.5 p-3 bg-indigo-950/30 border border-indigo-500/30 rounded-xl text-[9px] font-black uppercase text-indigo-400 hover:text-indigo-300 hover:bg-indigo-900/50 transition-all">
                                <RefreshCcw size={14}/> Renegociar
                            </button>
                            <button onClick={() => onGenerateContract(loan)} className="flex items-center justify-center gap-1.5 p-3 bg-purple-950/30 border border-purple-500/30 rounded-xl text-[9px] font-black uppercase text-purple-400 hover:text-purple-300 hover:bg-purple-900/50 transition-all">
                                <FileText size={14}/> Gerar
                            </button>
                            <button onClick={() => onExportExtrato(loan)} className="flex items-center justify-center gap-1.5 p-3 bg-amber-950/30 border border-amber-500/30 rounded-xl text-[9px] font-black uppercase text-amber-400 hover:text-amber-300 hover:bg-amber-900/50 transition-all">
                                <Download size={14}/> Extrato
                            </button>
                            {!loan.isArchived ? (
                                <button onClick={() => onArchive(loan)} className="flex items-center justify-center gap-1.5 p-3 bg-orange-950/30 border border-orange-500/30 rounded-xl text-[9px] font-black uppercase text-orange-400 hover:text-orange-300 hover:bg-orange-900/50 transition-all">
                                    <ShieldCheck size={14}/> Arquivar
                                </button>
                            ) : (
                                <button onClick={() => onRestore(loan)} className="flex items-center justify-center gap-1.5 p-3 bg-emerald-950/30 border border-emerald-500/30 rounded-xl text-[9px] font-black uppercase text-emerald-400 hover:text-emerald-300 hover:bg-emerald-900/50 transition-all">
                                    <ShieldCheck size={14}/> Restaurar
                                </button>
                            )}
                            <button onClick={() => onDelete(loan)} className="col-span-2 flex items-center justify-center gap-1.5 p-3 bg-rose-950/30 border border-rose-500/30 rounded-xl text-[9px] font-black uppercase text-rose-400 hover:text-rose-300 hover:bg-rose-900/50 transition-all">
                                <AlertTriangle size={14}/> Excluir
                            </button>
                        </div>
                    </div>

                    {/* SEÇÃO 2 — HISTÓRICO DE TRANSAÇÕES (EXTRATO PROFISSIONAL) */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-[10px] font-black uppercase text-slate-500 tracking-widest flex items-center gap-2">
                                <Clock size={14} className="text-amber-500"/> Extrato de Transações
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
                                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest bg-slate-950 px-2 py-0.5 rounded border border-slate-800/50">{date}</span>
                                            <div className="h-[1px] flex-1 bg-slate-800/30"></div>
                                        </div>
                                        <div className="space-y-1">
                                            {entries.map((entry) => (
                                                <div key={entry.id} className="flex items-center justify-between p-2 rounded-xl bg-slate-950/30 border border-transparent hover:border-slate-800 hover:bg-slate-950/50 transition-all group">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-sm border border-slate-800 group-hover:border-slate-700 transition-colors">
                                                            {getTransactionIcon(entry.type)}
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="text-[10px] font-black text-white uppercase tracking-tight leading-none mb-1">
                                                                {translateTransactionType(entry.type)}
                                                            </span>
                                                            <span className="text-[8px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-1">
                                                                ref: {entry.id.split('-')[0]} • {new Date(entry.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="flex items-center gap-3">
                                                        <div className="text-right">
                                                            <p className={`text-[11px] font-black tabular-nums ${entry.amount >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                                {entry.amount >= 0 ? '+' : ''}{formatMoney(entry.amount, isStealthMode)}
                                                            </p>
                                                        </div>
                                                        
                                                        {/* Apenas transações reversíveis (não auditoria/sistema/acordo) */}
                                                        {entry.type !== 'ESTORNO' && 
                                                         entry.type !== 'SYSTEM' && 
                                                         entry.category !== 'AUDIT' && 
                                                         !entry.type?.includes('AGREEMENT') && (
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); onReverseTransaction(entry, loan); }}
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
                                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Nenhuma transação registrada</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* COLUNA DIREITA: PAGAMENTO */}
                <div className="space-y-6">
                    
                    {/* SEÇÃO 3 — REGISTRAR PAGAMENTO (AUTOMÁTICO POR MODALIDADE) */}
                    {(resolvedBillingCycle === 'DAILY_FREE' || resolvedBillingCycle === 'DAILY_FIXED_TERM') ? (
                        <FlexibleDailyScreen 
                            amount={avAmount}
                            setAmount={setAvAmount}
                            manualDateStr={manualDateStr}
                            setManualDateStr={setManualDateStr}
                            debt={debtBreakdown}
                            loan={loan}
                            subMode={subMode}
                            setSetSubMode={setSubMode}
                            paymentType={paymentType}
                            setPaymentType={setPaymentType}
                            onConfirmFull={() => setAvAmount(debtBreakdown.total.toFixed(2))}
                        />
                    ) : (
                        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl relative overflow-hidden group focus-within:border-blue-500 transition-all">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/5 blur-[60px] rounded-full"></div>
                        
                        <div className="relative z-10">
                            <div className="flex items-center justify-between mb-8">
                                <h2 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500 flex items-center gap-2">
                                    <Banknote size={16} className="text-blue-500"/>
                                    Registrar Pagamento
                                </h2>
                                <div className="flex items-center gap-2 px-3 py-1 bg-slate-950 border border-slate-800 rounded-full">
                                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Detecção Automática</span>
                                </div>
                            </div>

                            <div className="flex items-baseline gap-4 mb-8">
                                <span className="text-4xl font-black text-blue-500">R$</span>
                                <input 
                                    type="text" 
                                    inputMode="decimal" 
                                    value={avAmount || ''} 
                                    onChange={e => setAvAmount(e.target.value.replace(/[^0-9.,]/g, ''))} 
                                    className="w-full bg-transparent text-6xl font-black text-white outline-none placeholder:text-slate-800 tracking-tighter" 
                                    placeholder="0,00" 
                                />
                            </div>

                            {/* PREVIEW DINÂMICO */}
                            {safeParse(avAmount) > 0 && (
                                <div className="bg-slate-950/50 border border-slate-800/50 p-6 rounded-2xl space-y-4 animate-in zoom-in-95 duration-300 mb-8">
                                    <div className="flex items-start gap-4">
                                        <div className="w-10 h-10 bg-blue-600/20 rounded-xl flex items-center justify-center text-blue-500 shrink-0">
                                            <TrendingUp size={20}/>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Impacto do Recebimento</p>
                                            <p className="text-sm text-slate-200 font-bold leading-relaxed">
                                                {(() => {
                                                    const val = safeParse(avAmount);
                                                    const totalDue = debtBreakdown.total;
                                                    const interestDue = totalInterestDue;
                                                    
                                                    if (val >= totalDue - 0.05) return "Quitação total: O contrato será encerrado e arquivado.";
                                                    if (val >= interestDue - 0.05) {
                                                        const amort = val - interestDue;
                                                        if (amort > 0.05) return `Encargos + Amortização: Quita os juros e abate ${formatMoney(amort, isStealthMode)} do capital principal.`;
                                                        return "Renovação: Quita os juros/multas do período e mantém o capital principal.";
                                                    }
                                                    return `Pagamento Parcial: Abate ${formatMoney(val, isStealthMode)} apenas dos juros/encargos acumulados.`;
                                                })()}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                                <div className="bg-transparent p-0 mb-8 space-y-4">
                                    <div className="flex items-center gap-2">
                                        <ShieldCheck size={14} className="text-rose-500"/>
                                        <label className="text-[9px] font-black uppercase text-slate-500 block tracking-widest">Gestão de Perdão</label>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button 
                                            onClick={() => setForgivenessMode(forgivenessMode === 'FINE_ONLY' ? 'NONE' : 'FINE_ONLY')}
                                            className={`p-3 rounded-xl border text-[9px] font-black uppercase transition-all ${forgivenessMode === 'FINE_ONLY' ? 'bg-rose-600 border-rose-500 text-white' : 'bg-slate-900 border-slate-800 text-slate-500'}`}
                                        >
                                            Perdoar Multa
                                        </button>
                                        <button 
                                            onClick={() => setForgivenessMode(forgivenessMode === 'INTEREST_ONLY' ? 'NONE' : 'INTEREST_ONLY')}
                                            className={`p-3 rounded-xl border text-[9px] font-black uppercase transition-all ${forgivenessMode === 'INTEREST_ONLY' ? 'bg-orange-600 border-orange-500 text-white' : 'bg-slate-900 border-slate-800 text-slate-500'}`}
                                        >
                                            Perdoar Mora
                                        </button>
                                        <button 
                                            onClick={() => setForgivenessMode(forgivenessMode === 'BOTH' ? 'NONE' : 'BOTH')}
                                            className={`col-span-2 p-3 rounded-xl border text-[9px] font-black uppercase transition-all ${forgivenessMode === 'BOTH' ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-slate-900 border-slate-800 text-slate-500'}`}
                                        >
                                            Perdoar Total (100% Encargos)
                                        </button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
                                    <label className="text-[9px] font-black uppercase text-slate-500 block tracking-widest">Data Recebimento</label>
                                    <input 
                                        type="date" 
                                        value={realPaymentDateStr}
                                        onChange={e => setRealPaymentDateStr(e.target.value)}
                                        className="bg-transparent text-white font-bold text-sm outline-none w-full appearance-none cursor-pointer"
                                    />
                                </div>
                                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
                                    <label className="text-[9px] font-black uppercase text-slate-500 block tracking-widest">Próximo Vencimento</label>
                                    <input 
                                        type="date" 
                                        value={manualDateStr || ''}
                                        onChange={e => setManualDateStr(e.target.value)}
                                        className="bg-transparent text-white font-bold text-sm outline-none w-full appearance-none cursor-pointer"
                                    />
                                </div>
                            </div>

                            {showInterestDecision && (
                                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 mb-8 space-y-3">
                                    <label className="text-[9px] font-black uppercase text-slate-500 block tracking-widest">Saldo de Juros Restante</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button 
                                            onClick={() => setInterestHandling('KEEP_PENDING')}
                                            className={`p-3 rounded-xl border text-[10px] font-black uppercase transition-all ${interestHandling === 'KEEP_PENDING' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-900 border-slate-800 text-slate-500'}`}
                                        >
                                            Manter Pendente
                                        </button>
                                        <button 
                                            onClick={() => setInterestHandling('CAPITALIZE')}
                                            className={`p-3 rounded-xl border text-[10px] font-black uppercase transition-all ${interestHandling === 'CAPITALIZE' ? 'bg-rose-600 border-rose-500 text-white' : 'bg-slate-900 border-slate-800 text-slate-500'}`}
                                        >
                                            Capitalizar
                                        </button>
                                    </div>
                                </div>
                            )}

                            <button 
                                onClick={handleConfirm} 
                                disabled={isProcessing || !avAmount || safeParse(avAmount) <= 0} 
                                className="w-full py-5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black uppercase text-sm shadow-xl shadow-emerald-900/20 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isProcessing ? <Loader2 className="animate-spin" size={20}/> : <><CheckCircle2 size={20}/> Confirmar Recebimento</>}
                            </button>
                        </div>
                    </div>
                )}

                    {/* ATALHOS RÁPIDOS MOBILE */}
                    <div className="md:hidden grid grid-cols-1 gap-4">
                        <button onClick={() => onOpenMessage(loan)} className="flex items-center justify-center gap-2 p-4 bg-slate-900 border border-slate-800 rounded-2xl text-[10px] font-black uppercase text-slate-400">
                            <MessageSquare size={16}/> WhatsApp
                        </button>
                    </div>
                </div>
            </div>

        </div>
    );
};
