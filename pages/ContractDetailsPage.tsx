/**
 * Componente de Página ContractDetailsPage.
 * Exibe os detalhes de um empréstimo/contrato ativo no CapitalFlow.
 * Esta página permite visualizar o saldo restante, detalhamento de atrasos,
 * gerenciar acordos de renegociação ativos, executar ações rápidas (editar,
 * arquivar, WhatsApp, gerar documento, extrato) e registrar novos recebimentos/pagamentos
 * de forma automatizada com base na modalidade financeira selecionada.
 *
 * Refatorado para melhor legibilidade através da modularização do estado (useContractDetailsState)
 * e subcomponentes dedicados (LedgerTimeline e PaymentRegistrationForm).
 */

import React from 'react';
import {
    TrendingUp, AlertTriangle, MessageSquare, ShieldCheck,
    FileText, Download, RefreshCcw, Loader2, User, FileEdit, History, ArrowLeft
} from 'lucide-react';
import { Loan, LedgerEntry, UserProfile, CapitalSource } from '../types';
import { formatMoney } from '../utils/formatters';
import { formatBRDate } from '../utils/dateHelpers';
import { ForgivenessMode } from '../components/modals/payment/hooks/usePaymentManagerState';
import { AgreementView } from '../features/agreements/components/AgreementView';

// Subcomponentes e Hooks Refatorados
import { useContractDetailsState } from './ContractDetails/useContractDetailsState';
import { LedgerTimeline } from './ContractDetails/LedgerTimeline';
import { PaymentRegistrationForm } from './ContractDetails/PaymentRegistrationForm';

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
        contextOverride?: { loan: Loan; inst: any; calculations: any }
    ) => Promise<void>;
    isProcessing: boolean;
    onOpenMessage: (loan: Loan) => void;
    onRenegotiate: (loan: Loan) => void;
    onOpenLegalDocument: (loan: Loan) => void;
    onExportExtrato: (loan: Loan) => void;
    onEdit: (loan: Loan) => void;
    onArchive: (loan: Loan) => void;
    onRestore: (loan: Loan) => void;
    onDelete: (loan: Loan) => void;
    onActivate: (loan: Loan) => void;
    onReverseTransaction: (transaction: LedgerEntry, loan: Loan) => void;
    onOpenReceipt?: (transaction: LedgerEntry, loan: Loan) => void;
    onAgreementPayment?: (loan: Loan, agreement: any, inst: any, amount?: number, forgiveLateFee?: boolean) => void;
    onReverseAgreementPayment?: (loan: Loan, agreement: any, inst: any) => void;
    onRefresh?: () => void;
    isStealthMode: boolean;
}

export const ContractDetailsPage: React.FC<ContractDetailsPageProps> = ({
    loanId, loans, sources, activeUser, onBack, onPayment, isProcessing,
    onOpenMessage, onRenegotiate, onOpenLegalDocument, onExportExtrato,
    onEdit, onArchive, onRestore, onDelete, onActivate, onReverseTransaction, onOpenReceipt,
    onAgreementPayment, onReverseAgreementPayment, onRefresh, isStealthMode, onNavigate
}) => {
    const {
        loan,
        avAmount,
        setAvAmount,
        paymentType,
        setPaymentType,
        delayDetails,
        groupedLedger,
        manualDateStr,
        setManualDateStr,
        realPaymentDateStr,
        setRealPaymentDateStr,
        forgivenessMode,
        setForgivenessMode,
        interestHandling,
        setInterestHandling,
        debtBreakdown,
        resolvedBillingCycle,
        subMode,
        setSubMode,
        safeParse,
        totalInterestDue,
        showInterestDecision,
        handleConfirm,
        status,
        statusColor,
        nextDueDateDisplay
    } = useContractDetailsState({ loanId, loans, onPayment });

    if (!loan) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-16 h-16 bg-slate-900 rounded-lg flex items-center justify-center mb-4 border border-slate-800">
                    <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                </div>
                <h3 className="text-white font-black uppercase tracking-tight">Carregando contrato...</h3>
            </div>
        );
    }

    const portalFiles = Array.isArray((loan as any).portalFiles) ? (loan as any).portalFiles : [];
    const clientPortalFiles = portalFiles.filter((file: any) => file.direction === 'CLIENT_TO_OPERATOR');
    const clientVisibleFiles = [
        ...portalFiles.filter((file: any) => file.direction === 'OPERATOR_TO_CLIENT' && ['VISIBLE', 'APPROVED'].includes(String(file.status || '').toUpperCase())),
        ...(loan.customDocuments || []).filter((doc: any) => doc.visibleToClient).map((doc: any) => ({
            id: doc.id,
            file_name: doc.name,
            file_url: doc.url,
            status: 'VISIBLE',
        })),
    ];
    const openPortalFile = (url?: string | null) => {
        if (!url) return;
        window.open(url, '_blank', 'noopener,noreferrer');
    };

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
                                onPayment={(inst, amount, forgiveLateFee) => onAgreementPayment?.(loan, loan.activeAgreement!, inst, amount, forgiveLateFee)}
                                onReversePayment={(inst) => onReverseAgreementPayment?.(loan, loan.activeAgreement!, inst)}
                                isStealthMode={isStealthMode}
                                onNavigate={onNavigate}
                            />
                        </div>
                    ) : (
                        <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 space-y-6">
                            <h3 className="text-xs font-black uppercase text-slate-500 tracking-widest flex items-center gap-2">
                                <TrendingUp size={16} className="text-blue-500"/> Resumo Financeiro
                            </h3>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-slate-950 border border-slate-800 p-4 rounded-lg">
                                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Principal Restante</p>
                                    <p className="text-xl font-black text-white">{formatMoney(debtBreakdown.principal, isStealthMode)}</p>
                                </div>
                                <div className="bg-slate-950 border border-slate-800 p-4 rounded-lg">
                                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Juros Acumulados</p>
                                    <p className="text-xl font-black text-blue-400">{formatMoney(debtBreakdown.interest, isStealthMode)}</p>
                                </div>
                                <div className="bg-slate-950 border border-slate-800 p-4 rounded-lg">
                                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Multa/Mora</p>
                                    <p className="text-xl font-black text-rose-400">{formatMoney(debtBreakdown.fine + debtBreakdown.dailyMora, isStealthMode)}</p>
                                </div>
                                <div className="bg-slate-950 border border-slate-800 p-4 rounded-lg ring-2 ring-emerald-500/20">
                                    <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest mb-1">Total Atual</p>
                                    <p className="text-xl font-black text-emerald-400">{formatMoney(debtBreakdown.total, isStealthMode)}</p>
                                </div>
                            </div>

                            {/* DETALHAMENTO DE ATRASO */}
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
                                            <div key={idx} className="flex items-center justify-between p-3 bg-slate-950/50 border border-slate-800 rounded-lg group hover:border-rose-500/30 transition-all">
                                                <div className="flex flex-col">
                                                    <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Parcela {item.number} • {formatBRDate(item.dueDate)}</span>
                                                    <span className="text-[11px] font-black text-white uppercase leading-none italic">Vencimento {formatBRDate(item.dueDate)}</span>
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
                    <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 space-y-4">
                        <h3 className="text-xs font-black uppercase text-slate-500 tracking-widest flex items-center gap-2">
                            <ShieldCheck size={16} className="text-purple-500"/> Ações do Contrato
                        </h3>
                        <div className="grid grid-cols-2 gap-2">
                            <button onClick={() => onOpenMessage(loan)} className="flex items-center justify-center gap-1.5 p-3 bg-emerald-950/30 border border-emerald-500/30 rounded-lg text-[9px] font-black uppercase text-emerald-400 hover:text-emerald-300 hover:bg-emerald-900/50 transition-all">
                                <MessageSquare size={14}/> WhatsApp
                            </button>
                            <button onClick={() => onEdit(loan)} className="flex items-center justify-center gap-1.5 p-3 bg-blue-950/30 border border-blue-500/30 rounded-lg text-[9px] font-black uppercase text-blue-400 hover:text-blue-300 hover:bg-blue-900/50 transition-all">
                                <FileEdit size={14}/> Editar
                            </button>
                            <button onClick={() => onRenegotiate(loan)} className="flex items-center justify-center gap-1.5 p-3 bg-indigo-950/30 border border-indigo-500/30 rounded-lg text-[9px] font-black uppercase text-indigo-400 hover:text-indigo-300 hover:bg-indigo-900/50 transition-all">
                                <RefreshCcw size={14}/> Renegociar
                            </button>
                            <button onClick={() => onOpenLegalDocument(loan)} className="flex items-center justify-center gap-1.5 p-3 bg-purple-950/30 border border-purple-500/30 rounded-lg text-[9px] font-black uppercase text-purple-400 hover:text-purple-300 hover:bg-purple-900/50 transition-all">
                                <FileText size={14}/> Jurídico
                            </button>
                            <button onClick={() => onExportExtrato(loan)} className="flex items-center justify-center gap-1.5 p-3 bg-amber-950/30 border border-amber-500/30 rounded-lg text-[9px] font-black uppercase text-amber-400 hover:text-amber-300 hover:bg-amber-900/50 transition-all">
                                <Download size={14}/> Extrato
                            </button>
                            {!loan.isArchived ? (
                                <button onClick={() => onArchive(loan)} className="flex items-center justify-center gap-1.5 p-3 bg-orange-950/30 border border-orange-500/30 rounded-lg text-[9px] font-black uppercase text-orange-400 hover:text-orange-300 hover:bg-orange-900/50 transition-all">
                                    <ShieldCheck size={14}/> Arquivar
                                </button>
                            ) : (
                                <button onClick={() => onRestore(loan)} className="flex items-center justify-center gap-1.5 p-3 bg-emerald-950/30 border border-emerald-500/30 rounded-lg text-[9px] font-black uppercase text-emerald-400 hover:text-emerald-300 hover:bg-emerald-900/50 transition-all">
                                    <ShieldCheck size={14}/> Restaurar
                                </button>
                            )}
                            <button onClick={() => onDelete(loan)} className="col-span-2 flex items-center justify-center gap-1.5 p-3 bg-rose-950/30 border border-rose-500/30 rounded-lg text-[9px] font-black uppercase text-rose-400 hover:text-rose-300 hover:bg-rose-900/50 transition-all">
                                <AlertTriangle size={14}/> Excluir
                            </button>
                        </div>
                    </div>

                    <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 space-y-4">
                        <h3 className="text-xs font-black uppercase text-slate-500 tracking-widest flex items-center gap-2">
                            <FileText size={16} className="text-cyan-400"/> Arquivos do Portal
                        </h3>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 min-h-[120px]">
                                <div className="flex items-center justify-between mb-3">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Cliente enviou para mim</p>
                                    <span className="text-[10px] font-black text-cyan-400">{clientPortalFiles.length}</span>
                                </div>
                                <div className="space-y-2">
                                    {clientPortalFiles.length === 0 ? (
                                        <p className="text-[10px] text-slate-500 font-bold">Nenhum arquivo enviado pelo cliente neste contrato.</p>
                                    ) : clientPortalFiles.map((file: any) => (
                                        <button
                                            key={file.id}
                                            onClick={() => openPortalFile(file.file_url)}
                                            className="w-full flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-left hover:border-cyan-500/40 transition-colors"
                                        >
                                            <span className="text-[10px] font-bold text-white truncate">{file.file_name || 'Arquivo do cliente'}</span>
                                            <span className="text-[8px] font-black uppercase text-slate-500">{file.status || 'PENDING'}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 min-h-[120px]">
                                <div className="flex items-center justify-between mb-3">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Visivel para o cliente</p>
                                    <span className="text-[10px] font-black text-emerald-400">{clientVisibleFiles.length}</span>
                                </div>
                                <div className="space-y-2">
                                    {clientVisibleFiles.length === 0 ? (
                                        <p className="text-[10px] text-slate-500 font-bold">Nenhum arquivo liberado para o cliente neste contrato.</p>
                                    ) : clientVisibleFiles.map((file: any) => (
                                        <button
                                            key={file.id}
                                            onClick={() => openPortalFile(file.file_url)}
                                            className="w-full flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-left hover:border-emerald-500/40 transition-colors"
                                        >
                                            <span className="text-[10px] font-bold text-white truncate">{file.file_name || 'Documento'}</span>
                                            <Download size={12} className="shrink-0 text-slate-500" />
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    <LedgerTimeline
                        loan={loan}
                        groupedLedger={groupedLedger}
                        isStealthMode={isStealthMode}
                        onOpenReceipt={onOpenReceipt}
                        onReverseTransaction={onReverseTransaction}
                    />
                </div>

                {/* COLUNA DIREITA: PAGAMENTO */}
                <div className="space-y-6">
                    <PaymentRegistrationForm
                        loan={loan}
                        resolvedBillingCycle={resolvedBillingCycle}
                        avAmount={avAmount}
                        setAvAmount={setAvAmount}
                        manualDateStr={manualDateStr}
                        setManualDateStr={setManualDateStr}
                        realPaymentDateStr={realPaymentDateStr}
                        setRealPaymentDateStr={setRealPaymentDateStr}
                        forgivenessMode={forgivenessMode}
                        setForgivenessMode={setForgivenessMode}
                        interestHandling={interestHandling}
                        setInterestHandling={setInterestHandling}
                        debtBreakdown={debtBreakdown}
                        subMode={subMode}
                        setSubMode={setSubMode}
                        paymentType={paymentType}
                        setPaymentType={setPaymentType}
                        isProcessing={isProcessing}
                        isStealthMode={isStealthMode}
                        showInterestDecision={showInterestDecision}
                        totalInterestDue={totalInterestDue}
                        safeParse={safeParse}
                        handleConfirm={handleConfirm}
                    />

                    {/* ATALHOS RÁPIDOS MOBILE */}
                    <div className="md:hidden grid grid-cols-1 gap-4">
                        <button onClick={() => onOpenMessage(loan)} className="flex items-center justify-center gap-2 p-4 bg-slate-900 border border-slate-800 rounded-lg text-[10px] font-black uppercase text-slate-400">
                            <MessageSquare size={16}/> WhatsApp
                        </button>
                    </div>
                </div>
            </div>

        </div>
    );
};
