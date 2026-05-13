
import React, { useMemo } from 'react';
import { Wallet, MessageCircle } from 'lucide-react';
import { resolveDebtSummary, resolveInstallmentDebt, getPortalDueLabel, isPortalInstallmentPaid } from '../../../features/portal/mappers/portalDebtRules';
import { formatMoney } from '../../../utils/formatters';
import { PortalInstallmentItem } from './PortalInstallmentItem';

interface PortalContractItemProps {
    loan: any;
    onPay: () => void;
    onChat: () => void;
}

export const PortalContractItem: React.FC<PortalContractItemProps> = ({ loan, onPay, onChat }) => {
    const summary = useMemo(() => resolveDebtSummary(loan, loan.installments), [loan]);
    const { hasLateInstallments, totalDue, pendingCount, nextDueDate } = summary;

    const nextInst = loan.installments.find((i: any) => !isPortalInstallmentPaid(i));
    const statusInfo = nextInst ? getPortalDueLabel(resolveInstallmentDebt(loan, nextInst).daysLate, nextInst.dueDate) : { label: 'Quitado', variant: 'OK' };

    const isPaidOff = pendingCount === 0;

    return (
        <div className={`border rounded-2xl p-4 transition-all ${hasLateInstallments ? 'bg-rose-950/10 border-rose-500/30' : isPaidOff ? 'bg-emerald-950/10 border-emerald-500/20' : 'bg-slate-900 border-slate-800'}`}>
            <div className="flex justify-between items-start mb-3">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Contrato</span>
                        <span className="text-[10px] font-mono text-slate-500">#{loan.id.substring(0,6).toUpperCase()}</span>
                    </div>
                    <h4 className="text-white font-bold text-sm mt-0.5">{loan.billingCycle === 'DAILY_FREE' ? 'Modalidade Diária' : 'Crédito Mensal'}</h4>
                </div>
                <div className={`px-2 py-1 rounded text-[9px] font-black uppercase border ${
                    statusInfo.variant === 'OVERDUE' ? 'bg-rose-500 text-white border-rose-600' :
                    statusInfo.variant === 'DUE_TODAY' ? 'bg-amber-500 text-black border-amber-600' :
                    isPaidOff ? 'bg-emerald-500 text-white border-emerald-600' :
                    'bg-slate-800 text-slate-400 border-slate-700'
                }`}>
                    {isPaidOff ? 'Finalizado' : statusInfo.label}
                </div>
            </div>

            {/* Conteúdo Principal do Card */}
            {!isPaidOff && (
                <div className="flex justify-between items-end mb-4">
                    <div className="flex gap-4">
                        <div>
                            <p className="text-[10px] text-slate-500 uppercase font-bold">Total Aberto</p>
                            <p className={`text-xl font-black ${hasLateInstallments ? 'text-rose-400' : 'text-white'}`}>
                                {formatMoney(totalDue)}
                            </p>
                        </div>
                        {loan.installments && loan.installments.length > 0 && (
                            <div className="border-l border-slate-800 pl-4">
                                <p className="text-[10px] text-slate-500 uppercase font-bold">Valor Parcela</p>
                                <p className="text-sm text-slate-300 font-black mt-1">
                                    {loan.installments.length}x {formatMoney(loan.installments[0].amount || 0)}
                                </p>
                            </div>
                        )}
                    </div>
                    {nextDueDate && (
                        <div className="text-right">
                            <p className="text-[9px] text-slate-500 uppercase font-bold">Próx. Vencimento</p>
                            <p className="text-xs text-white font-bold">{new Date(nextDueDate).toLocaleDateString('pt-BR')}</p>
                        </div>
                    )}
                </div>
            )}

            {/* Lista de Parcelas (Apenas as próximas 2 para economizar espaço) */}
            {!isPaidOff && (
                <div className="space-y-2 mb-4 bg-slate-950/50 p-2 rounded-xl border border-slate-800/50">
                    {loan.installments.filter((i:any) => !isPortalInstallmentPaid(i)).slice(0, 2).map((inst: any) => (
                         <PortalInstallmentItem key={inst.id} loan={loan} installment={inst} />
                    ))}
                    {pendingCount > 2 && (
                        <p className="text-[9px] text-center text-slate-500 italic py-1">...e mais {pendingCount - 2} parcelas</p>
                    )}
                </div>
            )}

            {/* Ações */}
            <div className="grid grid-cols-2 gap-2 mt-2">
                <button 
                    onClick={onPay}
                    disabled={isPaidOff}
                    className={`py-2.5 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-2 transition-all ${
                        isPaidOff ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 
                        hasLateInstallments ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-900/20' : 
                        'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20'
                    }`}
                >
                    <Wallet size={14}/> {isPaidOff ? 'Quitado' : 'Pagar Agora'}
                </button>
                <button 
                    onClick={onChat}
                    className="py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-2 transition-all"
                >
                    <MessageCircle size={14}/> Ajuda
                </button>
            </div>
        </div>
    );
};
