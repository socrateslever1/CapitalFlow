
import React from 'react';
import { Agreement, AgreementInstallment, Loan } from "../../../types";
import { formatMoney } from "../../../utils/formatters";
import { Calendar, CheckCircle2, AlertTriangle, XCircle, DollarSign, History, Scale, ArrowLeft, RefreshCcw, Pencil, Save } from "lucide-react";
import { calculateAgreementInstallmentLateFee } from "../../../domain/finance/calculations";
import { useAgreementView } from "../hooks/useAgreementView";

interface AgreementViewProps {
    agreement: Agreement;
    loan: Loan;
    activeUser: any;
    onUpdate: () => void;
    onPayment: (inst: AgreementInstallment, amount?: number, forgiveLateFee?: boolean) => void;
    onReversePayment?: (inst: AgreementInstallment) => void;
    isStealthMode?: boolean;
    onNavigate?: (path: string) => void;
}

export const AgreementView: React.FC<AgreementViewProps> = ({ agreement, loan, activeUser, onUpdate, onPayment, onReversePayment, isStealthMode, onNavigate }) => {
    const {
        isProcessing,
        confirmAction,
        setConfirmAction,
        selectedInst,
        setSelectedInst,
        forgiveLateFee,
        setForgiveLateFee,
        paymentAmount,
        setPaymentAmount,
        showCustomAmount,
        setShowCustomAmount,
        isEditingSchedule,
        setIsEditingSchedule,
        scheduleFrequency,
        setScheduleFrequency,
        firstOpenDueDate,
        setFirstOpenDueDate,
        openInstallments,
        handleBreak,
        handleActivate,
        handleScheduleUpdate
    } = useAgreementView({ agreement, onUpdate });

    if (!agreement) return null;

    if (agreement?.status === 'BROKEN' || agreement?.status === 'QUEBRADO') {
        return (
            <div className="bg-rose-950/20 border border-rose-500/30 p-4 rounded-lg text-center">
                <p className="text-rose-500 font-black uppercase text-xs mb-1">Acordo Quebrado</p>
                <p className="text-slate-400 text-[10px]">Este acordo foi cancelado. O contrato original está vigente.</p>

                {confirmAction === 'ACTIVATE' ? (
                    <div className="mt-3 flex items-center justify-center gap-2">
                        <button
                            onClick={handleActivate}
                            disabled={isProcessing}
                            className="bg-rose-500 text-white text-[9px] font-black uppercase px-3 py-1.5 rounded-lg hover:bg-rose-600 transition-all"
                        >
                            {isProcessing ? 'Processando...' : 'Confirmar Reativação'}
                        </button>
                        <button
                            onClick={() => setConfirmAction(null)}
                            className="text-slate-500 text-[9px] font-black uppercase px-3 py-1.5 hover:text-white transition-all"
                        >
                            Cancelar
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={() => setConfirmAction('ACTIVATE')}
                        className="mt-2 text-[9px] font-black uppercase text-rose-400 hover:text-white transition-colors"
                    >
                        Reativar Acordo
                    </button>
                )}
            </div>
        );
    }

    if (agreement?.status === 'PAID' || agreement?.status === 'PAGO' || agreement?.status === 'FINALIZADO') {
        return (
            <div className="bg-emerald-950/20 border border-emerald-500/30 p-4 rounded-lg text-center">
                <div className="flex justify-center mb-2"><CheckCircle2 className="text-emerald-500" size={24}/></div>
                <p className="text-emerald-500 font-black uppercase text-xs mb-1">Acordo Quitado</p>
                <p className="text-slate-400 text-[10px] mb-2">Todos os débitos foram regularizados.</p>

                {confirmAction === 'ACTIVATE' ? (
                    <div className="mt-2 flex items-center justify-center gap-2">
                        <button
                            onClick={handleActivate}
                            disabled={isProcessing}
                            className="bg-emerald-600 text-white text-[9px] font-black uppercase px-3 py-1.5 rounded-lg hover:bg-emerald-500 transition-all"
                        >
                            {isProcessing ? 'Processando...' : 'Confirmar Reabertura'}
                        </button>
                        <button
                            onClick={() => setConfirmAction(null)}
                            className="text-slate-500 text-[9px] font-black uppercase px-3 py-1.5 hover:text-white transition-all"
                        >
                            Cancelar
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={() => setConfirmAction('ACTIVATE')}
                        className="text-[9px] font-black uppercase text-emerald-400 hover:text-white transition-colors"
                    >
                        Ativar Acordo (Reabrir)
                    </button>
                )}
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-4 mb-2">
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent"></div>
                <span className="text-[9px] font-black uppercase text-indigo-400 tracking-[0.25em] whitespace-nowrap">
                    {agreement.type?.replace(/_/g, ' ')}
                </span>
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent"></div>
            </div>

            <div className="flex justify-end gap-2 mb-4">
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        setIsEditingSchedule(prev => !prev);
                    }}
                    className="p-2 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg border border-slate-700 transition-all"
                    title="Editar acordo"
                >
                    <Pencil size={14}/>
                </button>
                <button onClick={(e) => {
                    e.stopPropagation();
                    if (onNavigate) {
                        onNavigate(`/legal/editor/${loan.id}`);
                    }
                }} className="p-2 text-indigo-300 hover:text-white hover:bg-indigo-600 rounded-lg border border-indigo-500/30 transition-all" title="Jurídico">
                    <Scale size={14}/>
                </button>

                {confirmAction === 'BREAK' ? (
                    <div className="flex items-center gap-1">
                        <button
                            onClick={(e) => { e.stopPropagation(); handleBreak(); }}
                            disabled={isProcessing}
                            className="bg-rose-600 text-white text-[8px] font-black uppercase px-2 py-1.5 rounded-lg hover:bg-rose-500 transition-all"
                        >
                            {isProcessing ? '...' : 'Confirmar'}
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); setConfirmAction(null); }}
                            className="text-slate-500 text-[8px] font-black uppercase px-1 py-1.5 hover:text-white transition-all"
                        >
                            <XCircle size={14} />
                        </button>
                    </div>
                ) : (
                    <button onClick={(e) => { e.stopPropagation(); setConfirmAction('BREAK'); }} className="text-[9px] font-black uppercase text-rose-500 hover:text-white hover:bg-rose-500 px-3 py-1.5 rounded-lg border border-rose-500/30 transition-all">
                        Quebrar
                    </button>
                )}
            </div>

            {isEditingSchedule && (
                <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3 space-y-3 mb-4" onClick={(e) => e.stopPropagation()}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <label className="flex flex-col gap-1">
                            <span className="text-[8px] font-black uppercase tracking-widest text-slate-500">Frequencia</span>
                            <select
                                value={scheduleFrequency}
                                onChange={(e) => setScheduleFrequency(e.target.value as any)}
                                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-[11px] font-bold text-white outline-none"
                            >
                                <option value="WEEKLY">Semanal</option>
                                <option value="BIWEEKLY">Quinzenal</option>
                                <option value="MONTHLY">Mensal</option>
                            </select>
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="text-[8px] font-black uppercase tracking-widest text-slate-500">Primeira aberta</span>
                            <input
                                type="date"
                                value={firstOpenDueDate}
                                onChange={(e) => setFirstOpenDueDate(e.target.value)}
                                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-[11px] font-bold text-white outline-none"
                            />
                        </label>
                    </div>
                    <div className="flex justify-end gap-2">
                        <button
                            onClick={() => setIsEditingSchedule(false)}
                            className="text-[9px] font-black uppercase text-slate-500 hover:text-white px-3 py-1.5 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleScheduleUpdate}
                            disabled={isProcessing || !firstOpenDueDate}
                            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-[9px] font-black uppercase px-3 py-1.5 rounded-lg transition-all flex items-center gap-1"
                        >
                            <Save size={12}/> Salvar
                        </button>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-slate-900/50 p-2.5 rounded-lg border border-slate-800/50 flex flex-col items-center justify-center">
                    <p className="text-[8px] font-black text-slate-500 uppercase tracking-tighter">Dívida Base</p>
                    <p className="text-[11px] font-bold text-slate-300">{formatMoney(agreement.totalDebtAtNegotiation, isStealthMode)}</p>
                </div>
                <div className="bg-indigo-500/10 p-2 rounded-lg border border-indigo-500/20">
                    <p className="text-[8px] font-black text-indigo-400 uppercase tracking-tighter">Total Negociado</p>
                    <p className="text-[11px] font-bold text-white">{formatMoney(agreement.negotiatedTotal, isStealthMode)}</p>
                </div>
            </div>

            <div className="space-y-1 max-h-[250px] overflow-y-auto custom-scrollbar pr-1">
                {(agreement.installments || []).filter(inst => inst != null).sort((a,b) => {
                    const isAPaid = a?.status === 'PAID' || a?.status === 'PAGO';
                    const isBPaid = b?.status === 'PAID' || b?.status === 'PAGO';
                    if (isAPaid && !isBPaid) return 1;
                    if (!isAPaid && isBPaid) return -1;
                    return (a?.number || 0) - (b?.number || 0);
                }).map(inst => {
                    const paidAmount = Number((inst as any)?.paidAmount ?? (inst as any)?.paid_amount ?? 0) || 0;
                    const remainingPrincipal = Math.max(0, Number(inst.amount || 0) - paidAmount);
                    const isPaid = inst?.status === 'PAID' || inst?.status === 'PAGO' || remainingPrincipal <= 0.05;
                    const lateFee = isPaid ? 0 : calculateAgreementInstallmentLateFee(inst);
                    const remainingAmountTotal = remainingPrincipal + lateFee;
                    return (
                    <div id={inst.id} key={inst.id} className={`flex justify-between items-center px-3 py-2.5 rounded-lg border transition-all ${isPaid ? 'bg-emerald-500/5 border-emerald-500/10 opacity-60' : 'bg-slate-900/40 border-slate-800/50 hover:bg-slate-900/60'}`}>
                        <div className="flex items-center gap-3">
                            <span className="text-[10px] font-black text-slate-500 w-4">{inst.number}</span>
                            <div>
                                <p className={`text-[12px] font-bold ${isPaid ? 'text-emerald-400' : 'text-slate-200'}`}>
                                    {formatMoney(remainingAmountTotal, isStealthMode)}
                                </p>
                                {paidAmount > 0 && !isPaid && <p className="text-[8px] text-amber-400 font-black uppercase">Parcial: {formatMoney(paidAmount, isStealthMode)}</p>}
                                {lateFee > 0 && <p className="text-[8px] text-rose-400 font-black uppercase">Atraso (+1%/dia): +{formatMoney(lateFee, isStealthMode)}</p>}
                                <p className="text-[9px] text-slate-500 font-medium">
                                    {new Date(inst.dueDate).toLocaleDateString('pt-BR')}
                                </p>
                            </div>
                        </div>
                        <div className="text-right flex items-center gap-2">
                            {!isPaid ? (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedInst(inst);
                                        setPaymentAmount(String(remainingAmountTotal));
                                        setShowCustomAmount(false);
                                        setForgiveLateFee(false);
                                        setConfirmAction('PAY');
                                    }}
                                    className="text-[9px] font-black uppercase bg-blue-600/20 text-blue-400 border border-blue-500/30 px-3 py-1 rounded-md hover:bg-blue-600 hover:text-white transition-all"
                                >
                                    Receber
                                </button>
                            ) : (
                                <div className="flex flex-col items-end">
                                    <span className="text-[9px] font-black text-emerald-500 uppercase flex items-center gap-1">
                                        <CheckCircle2 size={10}/> Pago
                                    </span>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedInst(inst);
                                            setConfirmAction('REVERSE');
                                        }}
                                        className="text-[8px] font-black uppercase text-rose-500/40 hover:text-rose-500 transition-colors mt-0.5"
                                    >
                                        Estornar
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                );}) }
            </div>

            {/* MODAL DE CONFIRMAÇÃO INTERNO */}
            {confirmAction && (confirmAction === 'PAY' || confirmAction === 'REVERSE') && selectedInst && (
                <div className="absolute inset-0 z-50 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-slate-900 border border-slate-800 p-6 rounded-lg w-full max-w-[280px] shadow-2xl space-y-4">
                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center mx-auto ${confirmAction === 'PAY' ? 'bg-blue-500/20 text-blue-500' : 'bg-rose-500/20 text-rose-500'}`}>
                            {confirmAction === 'PAY' ? <DollarSign size={24}/> : <RefreshCcw size={24}/>}
                        </div>

                        <div className="text-center">
                            <h5 className="text-white font-black uppercase text-xs tracking-tight">
                                {confirmAction === 'PAY' ? 'Confirmar Recebimento?' : 'Confirmar Estorno?'}
                            </h5>
                            <p className="text-slate-400 text-[10px] mt-1">
                                {confirmAction === 'PAY'
                                    ? `Informe se recebeu o total da parcela ${selectedInst.number} ou outro valor.`
                                    : `Deseja estornar o pagamento da parcela ${selectedInst.number}? A parcela voltará a ficar pendente.`
                                }
                            </p>
                        </div>

                        {confirmAction === 'PAY' && (() => {
                            const alreadyPaid = Number((selectedInst as any).paidAmount ?? (selectedInst as any).paid_amount ?? 0) || 0;
                            const principalRemaining = Math.max(0, Number(selectedInst.amount || 0) - alreadyPaid);
                            const lf = calculateAgreementInstallmentLateFee(selectedInst);

                            return (
                                <div className="space-y-3">
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setPaymentAmount(String(forgiveLateFee ? principalRemaining : (principalRemaining + lf)));
                                                setShowCustomAmount(false);
                                            }}
                                            className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase border transition-all ${
                                                !showCustomAmount
                                                    ? 'bg-emerald-600/20 text-emerald-400 border-emerald-500'
                                                    : 'bg-slate-950 text-slate-500 border-slate-800 hover:text-white'
                                            }`}
                                        >
                                            Recebeu tudo
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setShowCustomAmount(true);
                                            }}
                                            className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase border transition-all ${
                                                showCustomAmount
                                                    ? 'bg-blue-600/20 text-blue-400 border-blue-500'
                                                    : 'bg-slate-950 text-slate-500 border-slate-800 hover:text-white'
                                            }`}
                                        >
                                            Outro valor
                                        </button>
                                    </div>

                                    {/* Checkbox para perdão de juros se houver atraso */}
                                    {lf > 0 && (
                                        <label className="flex items-center gap-2 p-2.5 bg-slate-950/60 rounded-lg border border-slate-800 cursor-pointer select-none animate-in fade-in slide-in-from-top-1 duration-200">
                                            <input
                                                type="checkbox"
                                                checked={forgiveLateFee}
                                                onChange={(e) => {
                                                    const checked = e.target.checked;
                                                    setForgiveLateFee(checked);
                                                    if (!showCustomAmount) {
                                                        setPaymentAmount(String(checked ? principalRemaining : (principalRemaining + lf)));
                                                    }
                                                }}
                                                className="rounded border-slate-700 bg-slate-900 text-blue-500 focus:ring-0 focus:ring-offset-0 w-3.5 h-3.5 cursor-pointer"
                                            />
                                            <span className="text-[9px] text-slate-300 font-bold uppercase tracking-tight">
                                                Receber sem juros (Perdoar {formatMoney(lf, isStealthMode)})
                                            </span>
                                        </label>
                                    )}

                                    {/* Detalhe do Valor a Receber */}
                                    {!showCustomAmount ? (
                                        <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800/80 text-center animate-in fade-in duration-200">
                                            <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-0.5">Valor a Receber</p>
                                            <p className="text-sm font-black text-emerald-400">
                                                {formatMoney(Number(paymentAmount) || 0, isStealthMode)}
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="space-y-2 animate-in fade-in duration-200">
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={paymentAmount}
                                                onChange={e => setPaymentAmount(e.target.value)}
                                                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-white font-bold text-center text-sm outline-none focus:border-blue-500 transition-colors"
                                                placeholder="Digite o valor..."
                                                autoFocus
                                            />
                                        </div>
                                    )}
                                </div>
                            );
                        })()}

                        <div className="flex flex-col gap-2">
                            <button
                                onClick={() => {
                                    if (confirmAction === 'PAY') onPayment(selectedInst, Number(paymentAmount) || selectedInst.amount, forgiveLateFee);
                                    else onReversePayment?.(selectedInst);
                                    setConfirmAction(null);
                                    setSelectedInst(null);
                                    setForgiveLateFee(false);
                                }}
                                className={`w-full py-2.5 rounded-lg text-[10px] font-black uppercase transition-all ${confirmAction === 'PAY' ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-rose-600 hover:bg-rose-500 text-white'}`}
                            >
                                Confirmar
                            </button>
                            <button
                                onClick={() => {
                                    setConfirmAction(null);
                                    setSelectedInst(null);
                                }}
                                className="w-full py-2.5 rounded-lg text-[10px] font-black uppercase text-slate-500 hover:text-white transition-all"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}


            {/* Legal Modal Removed */}
        </div>
    );
};
