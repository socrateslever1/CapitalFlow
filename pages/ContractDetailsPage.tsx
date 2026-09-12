/**
 * Componente de Página ContractDetailsPage.
 * Exibe os detalhes de um empréstimo/contrato ativo no CapitalFlow.
 */

import React from 'react';
import { resolveAuthenticatedStorageUrl } from '../utils/storageUrl';
import {
    TrendingUp, AlertTriangle, MessageSquare, ShieldCheck,
    FileText, Download, RefreshCcw, Loader2, User, FileEdit, History, ArrowLeft
} from 'lucide-react';
import { Loan, LedgerEntry, UserProfile, CapitalSource } from '../types';
import { formatMoney } from '../utils/formatters';
import { formatBRDate } from '../utils/dateHelpers';
import { ForgivenessMode, InterestHandling } from '../components/modals/payment/hooks/usePaymentManagerState';
import { AgreementView } from '../features/agreements/components/AgreementView';
import { ScopedCollectionAutomation } from '../features/collections/components/ScopedCollectionAutomation';
import { supabase } from '../lib/supabase';
import { safeUUID } from '../utils/uuid';

import { useContractDetailsState } from './ContractDetails/useContractDetailsState';
import { LedgerTimeline } from './ContractDetails/LedgerTimeline';
import { PaymentRegistrationForm } from './ContractDetails/PaymentRegistrationForm';

interface ContractDetailsPageProps {
    loanId: string;
    loans: Loan[];
    sources: CapitalSource[];
    activeUser: UserProfile | null;
    showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
    onBack: () => void;
    onNavigate?: (path: string) => void;
    onPayment: (
        forgivePenalty: ForgivenessMode,
        manualDate?: Date | null,
        amountPaid?: number,
        realDate?: Date | null,
        interestHandling?: InterestHandling,
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
    loanId, loans, sources, activeUser, showToast, onBack, onPayment, isProcessing,
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

    if (!loan) return null;

    const handleReverseNormalUnification = async (entry: LedgerEntry) => {
        onReverseTransaction(entry, loan);
    };

    return (
        <div className="animate-in fade-in duration-300 pb-24">
            <div className="flex items-center gap-3 mb-4">
                <button onClick={onBack} className="p-2 rounded-lg border border-slate-800 bg-slate-900 text-slate-400"><ArrowLeft size={18}/></button>
                <div className="min-w-0">
                    <h1 className="text-lg font-black text-white truncate">{loan.debtorName}</h1>
                    <p className="text-[10px] uppercase font-black tracking-widest text-slate-500">Contrato #{String(loan.id).slice(-6).toUpperCase()} · {nextDueDateDisplay}</p>
                </div>
                <span className={`ml-auto px-2 py-1 rounded-full text-[9px] font-black uppercase text-white ${statusColor}`}>{status}</span>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[1.25fr_0.75fr] gap-6">
                <div className="space-y-6 min-w-0">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="rounded-lg border border-slate-800 bg-slate-900 p-3"><p className="text-[9px] uppercase font-black text-slate-500">Saldo</p><p className="mt-1 font-black text-white">{formatMoney(debtBreakdown.total, isStealthMode)}</p></div>
                        <div className="rounded-lg border border-slate-800 bg-slate-900 p-3"><p className="text-[9px] uppercase font-black text-slate-500">Principal</p><p className="mt-1 font-black text-white">{formatMoney(debtBreakdown.principal, isStealthMode)}</p></div>
                        <div className="rounded-lg border border-slate-800 bg-slate-900 p-3"><p className="text-[9px] uppercase font-black text-slate-500">Juros</p><p className="mt-1 font-black text-blue-400">{formatMoney(debtBreakdown.interest, isStealthMode)}</p></div>
                        <div className="rounded-lg border border-slate-800 bg-slate-900 p-3"><p className="text-[9px] uppercase font-black text-slate-500">Atraso</p><p className="mt-1 font-black text-rose-400">{formatMoney((debtBreakdown.fine || 0) + (debtBreakdown.dailyMora || 0), isStealthMode)}</p></div>
                    </div>

                    {delayDetails && (
                        <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-4">
                            <div className="flex items-center gap-2 text-rose-400 mb-3"><AlertTriangle size={16}/><span className="text-xs font-black uppercase">Atrasos</span></div>
                            <div className="space-y-2">{delayDetails.items.map((item: any) => <div key={`${item.number}-${item.dueDate}`} className="flex justify-between text-xs"><span className="text-slate-400">Parcela {item.number} · {formatBRDate(item.dueDate)}</span><span className="font-bold text-white">{formatMoney(item.total, isStealthMode)}</span></div>)}</div>
                        </div>
                    )}

                    {loan.activeAgreement && <AgreementView loan={loan} agreement={loan.activeAgreement} onPayment={onAgreementPayment} onReversePayment={onReverseAgreementPayment} onRefresh={onRefresh} />}

                    <ScopedCollectionAutomation loan={loan} profileId={safeUUID((loan as any).profile_id) || safeUUID(activeUser?.id)} />

                    <LedgerTimeline
                        loan={loan}
                        groupedLedger={groupedLedger}
                        isStealthMode={isStealthMode}
                        onOpenReceipt={onOpenReceipt}
                        onReverseTransaction={onReverseTransaction}
                        onReverseNormalUnification={handleReverseNormalUnification}
                    />
                </div>

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

                    <div className="md:hidden grid grid-cols-1 gap-4">
                        <button onClick={() => onOpenMessage(loan)} className="flex items-center justify-center gap-2 p-4 bg-slate-900 border border-slate-800 rounded-lg text-[10px] font-black uppercase text-slate-400"><MessageSquare size={16}/> Cobrar</button>
                    </div>
                </div>
            </div>
        </div>
    );
};
