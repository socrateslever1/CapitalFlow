
import React, { useState, useEffect } from 'react';
import { Loan, LoanStatus } from "../../../types";
import { Modal } from "../../../components/ui/Modal";
import { Calculator, CheckCircle2, AlertTriangle, Hash, DollarSign, Percent, TrendingUp } from "lucide-react";
import { simulateAgreement, CalculationMode, InterestApplicationMode, InterestBaseMode } from "../logic/calculations";
import { formatMoney } from "../../../utils/formatters";
import { agreementService } from "../services/agreementService";
import { legalService } from "../../legal/services/legalService";
import { safeUUID } from "../../../utils/uuid";
import { supabase } from "../../../lib/supabase";

interface RenegotiationModalProps {
    loans: Loan[];
    activeUser: any;
    onClose: () => void;
    onSuccess: () => void;
}

const buildContractBaseFromLoan = (loan: Loan, activeUser: any) => {
    const ownerId = safeUUID(activeUser?.supervisor_id) || safeUUID(activeUser?.id) || safeUUID((loan as any).owner_id) || safeUUID((loan as any).profile_id);
    if (!ownerId) throw new Error("Perfil responsavel pelo contrato invalido.");

    return {
        id: safeUUID(loan.id),
        owner_id: ownerId,
        profile_id: ownerId,
        client_id: safeUUID(loan.clientId) || null,
        source_id: safeUUID(loan.sourceId) || null,
        operador_responsavel_id: safeUUID((loan as any).operador_responsavel_id) || null,
        debtor_name: loan.debtorName || null,
        debtor_phone: loan.debtorPhone || null,
        debtor_document: loan.debtorDocument || null,
        debtor_address: loan.debtorAddress || null,
        principal: Number(loan.principal) || 0,
        interest_rate: Number(loan.interestRate) || 0,
        fine_percent: Number(loan.finePercent) || 0,
        daily_interest_percent: Number(loan.dailyInterestPercent) || 0,
        start_date: loan.startDate || null,
        total_to_receive: Number(loan.totalToReceive) || 0,
        is_archived: Boolean(loan.isArchived),
        guarantee_description: loan.guaranteeDescription || null,
        preferred_payment_method: loan.preferredPaymentMethod || null,
        pix_key: loan.pixKey || null,
        notes: loan.notes || null,
        billing_cycle: loan.billingCycle || null,
        amortization_type: loan.amortizationType || null,
        payment_signals: loan.paymentSignals || null,
        custom_documents: loan.customDocuments || null,
        policies_snapshot: loan.policiesSnapshot || null,
        funding_total_payable: loan.fundingTotalPayable || null,
        funding_cost: loan.fundingCost || null,
        funding_provider: loan.fundingProvider || null,
        funding_fee_percent: loan.fundingFeePercent || null,
        portal_token: safeUUID(loan.portalToken) || null,
        portal_shortcode: loan.portalShortcode || null,
        status: loan.status || LoanStatus.ATIVO,
        last_billed_at: loan.last_billed_at || null,
        billing_count: loan.billing_count || 0
    };
};

export const RenegotiationModal: React.FC<RenegotiationModalProps> = ({ loans, activeUser, onClose, onSuccess }) => {
    const [step, setStep] = useState(1);
    const [type, setType] = useState<'PARCELADO_COM_JUROS' | 'PARCELADO_SEM_JUROS'>('PARCELADO_COM_JUROS');
    const [calculationMode, setCalculationMode] = useState<CalculationMode>('BY_INSTALLMENTS');

    const [installmentValue, setInstallmentValue] = useState<number | string>(0);
    const [installmentsCount, setInstallmentsCount] = useState<number | string>(1);
    const [interestRate, setInterestRate] = useState<number | string>(5);
    const [gracePeriod, setGracePeriod] = useState<number | string>(0);
    const [discount, setDiscount] = useState<number | string>(0);
    const [downPayment, setDownPayment] = useState<number | string>(0);

    const [firstDueDate, setFirstDueDate] = useState('');
    const [totalDebt, setTotalDebt] = useState(0);
    const [principalDebt, setPrincipalDebt] = useState(0);
    const [interestApplicationMode, setInterestApplicationMode] = useState<InterestApplicationMode>('TOTAL_ONCE');
    const [interestBaseMode, setInterestBaseMode] = useState<InterestBaseMode>('TOTAL_DEBT');

    const [simulation, setSimulation] = useState<any>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [frequency, setFrequency] = useState<'WEEKLY' | 'BIWEEKLY' | 'MONTHLY'>('MONTHLY');

    useEffect(() => {
        if (!loans || loans.length === 0) return;
        const debt = loans.reduce((total, loan) => total + (loan.installments || []).reduce((acc, i) => acc + (i.principalRemaining + i.interestRemaining + (i.lateFeeAccrued || 0)), 0), 0);
        const principal = loans.reduce((total, loan) => total + (loan.installments || []).reduce((acc, i) => acc + (Number(i.principalRemaining) || 0), 0), 0);
        setTotalDebt(debt);
        setPrincipalDebt(principal);
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        try {
            setFirstDueDate(tomorrow.toISOString().split('T')[0]);
        } catch (e) {
            setFirstDueDate(new Date().toISOString().split('T')[0]);
        }
    }, [loans]);

    const handleSimulate = () => {
        const finalType = calculationMode === 'BY_VALUE_AND_COUNT' ? 'PARCELADO_SEM_JUROS' : type;
        const baseDebtForAgreement = interestBaseMode === 'CAPITAL_ONLY' ? principalDebt : totalDebt;
        const result = simulateAgreement({
            totalDebt, type: finalType, installmentsCount: installmentsCount as number, installmentValue: installmentValue as number, calculationMode,
            interestRate: interestRate as number, firstDueDate, frequency, gracePeriod: gracePeriod as number, discount: discount as number, downPayment: downPayment as number,
            baseDebtForAgreement,
            interestApplicationMode,
            interestBaseMode
        });
        setSimulation(result);
        setStep(2);
    };

    const handleConfirm = async () => {
        if (!simulation || !loans.length) return;
        setIsSaving(true);
        const finalType = calculationMode === 'BY_VALUE_AND_COUNT' ? 'PARCELADO_SEM_JUROS' : type;

        try {
            const oldInstallmentIds = loans.flatMap(l => (l.installments || []).map(i => i.id));
            if (oldInstallmentIds.length > 0) {
                const { error: updateError } = await supabase
                    .from('parcelas')
                    .update({ status: LoanStatus.RENEGOCIADO })
                    .in('id', oldInstallmentIds);
                if (updateError) throw new Error(`Falha ao marcar parcelas antigas como renegociadas: ${updateError.message}`);
            }

            const commonAgreementData = {
                type: finalType,
                totalDebtAtNegotiation: totalDebt,
                negotiatedTotal: simulation.negotiatedTotal,
                interestRate: finalType === 'PARCELADO_COM_JUROS' ? (Number(interestRate) || 0) : 0,
                principal_base: principalDebt,
                installmentsCount: simulation.installments.length,
                frequency,
                startDate: new Date().toISOString(),
                gracePeriod: Number(gracePeriod) || 0,
                discount: Number(discount) || 0,
                downPayment: Number(downPayment) || 0,
                calculation_mode: calculationMode,
                interest_application_mode: interestApplicationMode,
                interest_base_mode: interestBaseMode,
                installment_value: calculationMode !== 'BY_INSTALLMENTS' ? (Number(installmentValue) || 0) : (simulation.installments[0]?.amount || 0),
                calculation_result: simulation.calculationResult,
                notes: `Acordo (${calculationMode}) com entrada de ${formatMoney(Number(downPayment) || 0)}, desconto de ${formatMoney(Number(discount) || 0)}.`
            };

            {
                const mainLoan = loans[0];
                const mainLoanId = mainLoan.id;
                const mainLoanShortId = mainLoanId.slice(0, 8);

                // --- SAFEGUARD: Garante que o contrato existe no Supabase antes de criar o acordo ---
                try {
                    const { data: existingLoan, error: checkErr } = await supabase
                        .from('contratos')
                        .select('id')
                        .eq('id', mainLoanId)
                        .maybeSingle();

                    if (checkErr) throw checkErr;

                    if (!existingLoan) {
                        console.warn(`[Renegotiation] Contrato ${mainLoanId} não encontrado no Supabase. Tentando recuperar do cache local (Dexie)...`);
                        const { db } = await import('../../../services/offline/adminOfflineStore');
                        const localLoan = await db.contratos.get(mainLoanId);
                        if (localLoan) {
                            // Limpa campos aninhados que não vão pra tabela base
                            const { parcelas, transacoes, acordos_inadimplencia, ...loanBase } = localLoan as any;
                            const { error: insertLoanError } = await supabase.from('contratos').insert(loanBase);
                            if (insertLoanError) throw insertLoanError;
                            console.log(`[Renegotiation] Contrato ${mainLoanId} sincronizado do Dexie para o Supabase com sucesso.`);
                        } else {
                            const loanBase = buildContractBaseFromLoan(mainLoan, activeUser);
                            const { error: insertLoanError } = await supabase.from('contratos').insert(loanBase);
                            if (insertLoanError) throw insertLoanError;
                            console.log(`[Renegotiation] Contrato ${mainLoanId} reconstruido do estado atual para o Supabase com sucesso.`);
                        }
                    }
                } catch (syncErr: any) {
                    throw new Error("Erro ao preparar contrato para acordo: " + (syncErr.message || "contrato ausente no banco"));
                }
                // --------------------------------------------------------------------------------------

                const agreementId = await agreementService.createAgreement(
                    mainLoanId,
                    { ...commonAgreementData, loanId: mainLoanId } as any,
                    simulation.installments,
                    activeUser.id
                );

                for (const loan of loans.slice(1)) {
                    const previousStatus = String(loan.status || LoanStatus.ATIVO);
                    const legacyNote =
                        `\n[LEGADO_PARCELAMENTO:${mainLoanShortId};STATUS_ANTERIOR:${previousStatus}] ` +
                        `Contrato unificado no parcelamento ${mainLoanShortId}.`;
                    const updatedNotes = (loan.notes || '') + legacyNote;
                    await supabase.from('contratos').update({ status: LoanStatus.RENEGOCIADO, notes: updatedNotes }).eq('id', loan.id);
                }

                try {
                    const agreementData = { ...commonAgreementData, id: agreementId, createdAt: new Date().toISOString(), status: 'ATIVO', installments: simulation.installments };
                    const params = legalService.prepareDocumentParams(mainLoan, activeUser, agreementData as any);
                    const ownerId = safeUUID((activeUser as any).supervisor_id) || safeUUID(activeUser.id);
                    if (!ownerId) throw new Error("ID do usuario invalido.");
                    const doc = await legalService.generateAndRegisterDocument(agreementId, params, ownerId);
                    await supabase.from('acordos_inadimplencia').update({ legal_document_id: doc.id }).eq('id', agreementId);
                } catch (docError) {
                    console.error("Erro ao gerar documento juridico:", docError);
                }

                onSuccess();
                return;
            }

        } catch (e: any) {
            console.error("Erro detalhado na renegociação:", e);
            alert("Erro ao criar acordo/unificação: " + (e.message || "Erro desconhecido"));
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal onClose={onClose} title={loans.length > 1 ? `Unificar ${loans.length} Contratos` : "Acordo de Inadimplência"}>
            <div className="space-y-6">
                {step === 1 && (
                    <div className="space-y-4 animate-in slide-in-from-right">
                         <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-center">
                            <p className="text-[10px] uppercase font-black text-slate-500">Dívida Total Calculada</p>
                            <p className="text-3xl font-black text-rose-500">{formatMoney(totalDebt)}</p>
                            {loans.length > 1 && <p className="text-[10px] text-slate-400 mt-2">Somando {loans.length} contratos selecionados</p>}
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                            <button onClick={() => setCalculationMode('BY_INSTALLMENTS')} className={`p-3 rounded-xl border text-center transition-all ${calculationMode === 'BY_INSTALLMENTS' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-900 border-slate-800 text-slate-400'}`}><Hash size={16} className="mx-auto mb-1"/><p className="text-[9px] font-bold uppercase">Por Parcelas</p></button>
                            <button onClick={() => setCalculationMode('BY_INSTALLMENT_VALUE')} className={`p-3 rounded-xl border text-center transition-all ${calculationMode === 'BY_INSTALLMENT_VALUE' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-900 border-slate-800 text-slate-400'}`}><DollarSign size={16} className="mx-auto mb-1"/><p className="text-[9px] font-bold uppercase">Por Valor</p></button>
                            <button onClick={() => setCalculationMode('BY_VALUE_AND_COUNT')} className={`p-3 rounded-xl border text-center transition-all ${calculationMode === 'BY_VALUE_AND_COUNT' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-900 border-slate-800 text-slate-400'}`}><Percent size={16} className="mx-auto mb-1"/><p className="text-[9px] font-bold uppercase">Valor + Qtd</p></button>
                        </div>

                        {calculationMode !== 'BY_VALUE_AND_COUNT' && (
                            <div className="grid grid-cols-2 gap-4">
                                <button onClick={() => setType('PARCELADO_COM_JUROS')} className={`p-4 rounded-2xl border transition-all ${type === 'PARCELADO_COM_JUROS' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-900 border-slate-800 text-slate-400'}`}><p className="font-bold text-xs uppercase mb-1">Parcelado c/ Juros</p><p className="text-[9px] opacity-70">Recalcula dívida com nova taxa</p></button>
                                <button onClick={() => setType('PARCELADO_SEM_JUROS')} className={`p-4 rounded-2xl border transition-all ${type === 'PARCELADO_SEM_JUROS' ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-slate-900 border-slate-800 text-slate-400'}`}><p className="font-bold text-xs uppercase mb-1">Sem Juros (Fixar)</p><p className="text-[9px] opacity-70">Congela o valor atual</p></button>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                            {calculationMode === 'BY_INSTALLMENTS' && <div><label className="text-[10px] uppercase font-bold text-slate-500">Nº Parcelas</label><input type="number" min="1" max="60" value={installmentsCount} onChange={e => setInstallmentsCount(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-white font-bold outline-none" /></div>}
                            {calculationMode === 'BY_INSTALLMENT_VALUE' && <div><label className="text-[10px] uppercase font-bold text-slate-500">Valor da Parcela (R$)</label><input type="number" step="0.01" value={installmentValue} onChange={e => setInstallmentValue(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-white font-bold outline-none" /></div>}
                            {calculationMode === 'BY_VALUE_AND_COUNT' && <><div key="val"><label className="text-[10px] uppercase font-bold text-slate-500">Valor da Parcela (R$)</label><input type="number" step="0.01" value={installmentValue} onChange={e => setInstallmentValue(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-white font-bold outline-none" /></div><div key="qtd"><label className="text-[10px] uppercase font-bold text-slate-500">Nº Parcelas</label><input type="number" min="1" max="60" value={installmentsCount} onChange={e => setInstallmentsCount(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-white font-bold outline-none" /></div></>}
                            <div><label className="text-[10px] uppercase font-bold text-slate-500">Periodicidade</label><select value={frequency} onChange={e => setFrequency(e.target.value as any)} className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-white font-bold outline-none"><option value="MONTHLY">Mensal</option><option value="BIWEEKLY">Quinzenal</option><option value="WEEKLY">Semanal</option></select></div>
                        </div>

                        {calculationMode !== 'BY_VALUE_AND_COUNT' && type === 'PARCELADO_COM_JUROS' && <div className="space-y-3">
                            <div><label className="text-[10px] uppercase font-bold text-slate-500">Taxa de Juros (%)</label><input type="number" step="0.1" value={interestRate} onChange={e => setInterestRate(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-white font-bold outline-none" /></div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="text-[10px] uppercase font-bold text-slate-500">Aplicar Juros</label><select value={interestApplicationMode} onChange={e => setInterestApplicationMode(e.target.value as InterestApplicationMode)} className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-white font-bold outline-none"><option value="TOTAL_ONCE">Total do acordo</option><option value="MONTHLY_SIMPLE">Ao mês pelo prazo</option></select></div>
                                <div><label className="text-[10px] uppercase font-bold text-slate-500">Base do Cálculo</label><select value={interestBaseMode} onChange={e => setInterestBaseMode(e.target.value as InterestBaseMode)} className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-white font-bold outline-none"><option value="TOTAL_DEBT">Dívida atual</option><option value="CAPITAL_ONLY">Somente capital</option></select></div>
                            </div>
                        </div>}

                        <div className="grid grid-cols-3 gap-4">
                            <div><label className="text-[10px] uppercase font-bold text-slate-500">Desconto (R$)</label><input type="number" value={discount} onChange={e => setDiscount(e.target.value)} disabled={calculationMode === 'BY_VALUE_AND_COUNT'} className={`w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-white font-bold outline-none ${calculationMode === 'BY_VALUE_AND_COUNT' ? 'opacity-50' : ''}`} /></div>
                            <div><label className="text-[10px] uppercase font-bold text-slate-500">Entrada (R$)</label><input type="number" value={downPayment} onChange={e => setDownPayment(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-white font-bold outline-none" /></div>
                            <div><label className="text-[10px] uppercase font-bold text-slate-500">Carência (Dias)</label><input type="number" value={gracePeriod} onChange={e => setGracePeriod(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-white font-bold outline-none" /></div>
                        </div>

                        <div><label className="text-[10px] uppercase font-bold text-slate-500">1º Vencimento</label><input type="date" value={firstDueDate || ''} onChange={e => setFirstDueDate(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-white font-bold outline-none" /></div>

                        <button onClick={handleSimulate} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs shadow-lg hover:bg-blue-500 transition-all flex items-center justify-center gap-2"><Calculator size={16}/> Simular Acordo</button>
                    </div>
                )}

                {step === 2 && simulation && (
                    <div className="space-y-4 animate-in slide-in-from-right">
                        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                            <div className="flex justify-between items-end mb-4">
                                <div>
                                    <p className="text-[10px] uppercase font-bold text-slate-500">Novo Total</p>
                                    <p className="text-2xl font-black text-white">{formatMoney(simulation.negotiatedTotal)}</p>

                                    {/* Exibição de Ganhos/Perdas */}
                                    {simulation.calculationResult && (
                                        <div className={`mt-2 p-2 rounded-lg border flex items-center gap-2 animate-in fade-in slide-in-from-left duration-300 ${
                                            simulation.calculationResult === 'DISCOUNT'
                                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                                : simulation.calculationResult === 'INCREASE'
                                                ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                                                : 'bg-slate-800 border-slate-700 text-slate-400'
                                        }`}>
                                            {simulation.calculationResult === 'DISCOUNT' ? (
                                                <>
                                                    <CheckCircle2 size={12} />
                                                    <span className="text-[10px] font-black uppercase tracking-wider">
                                                        Economia de {formatMoney(simulation.diffAmount)}
                                                    </span>
                                                </>
                                            ) : simulation.calculationResult === 'INCREASE' ? (
                                                <>
                                                    <TrendingUp size={12} />
                                                    <span className="text-[10px] font-black uppercase tracking-wider">
                                                        Acréscimo de {formatMoney(simulation.diffAmount)}
                                                    </span>
                                                </>
                                            ) : (
                                                <span className="text-[10px] font-black uppercase tracking-wider">
                                                    Valor mantido
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] uppercase font-bold text-slate-500">Parcelas</p>
                                    <p className="text-xl font-bold text-blue-400">{simulation.installments.length}x {formatMoney(simulation.installments[0]?.amount || 0)}</p>
                                </div>
                            </div>

                            <div className="max-h-[200px] overflow-y-auto custom-scrollbar space-y-2">
                                {simulation.installments.map((inst: any) => (
                                    <div key={inst.number} className="flex justify-between items-center bg-slate-900 p-2 rounded-lg text-xs">
                                        <span className="text-slate-400 font-bold">{inst.number}ª</span>
                                        <span className="text-slate-500">{new Date(inst.dueDate).toLocaleDateString()}</span>
                                        <span className="text-white font-bold">{formatMoney(inst.amount)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="bg-amber-900/20 border border-amber-500/30 p-3 rounded-xl flex items-start gap-3">
                            <AlertTriangle size={20} className="text-amber-500 flex-shrink-0 mt-1"/>
                            <p className="text-[10px] text-amber-200 leading-relaxed"><b>Atenção:</b> {loans.length > 1 ? `Ao confirmar, o contrato principal será transformado em um único parcelamento ativo e os demais ficarão apenas como legado histórico.` : "Ao confirmar, este contrato será transformado em um contrato parcelado, sem criar outro contrato para o mesmo cliente."}</p>
                        </div>

                        <div className="flex gap-3">
                            <button onClick={() => setStep(1)} className="flex-1 py-4 bg-slate-800 text-white rounded-2xl font-bold uppercase text-xs">Voltar</button>
                            <button onClick={handleConfirm} disabled={isSaving} className="flex-[2] py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase text-xs shadow-lg hover:bg-emerald-500 transition-all flex items-center justify-center gap-2">{isSaving ? 'Processando...' : <><CheckCircle2 size={16}/> Confirmar Acordo</>}</button>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
};
