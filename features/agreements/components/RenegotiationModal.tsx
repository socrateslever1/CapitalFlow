
import React, { useState, useEffect } from 'react';
import { Loan, LoanStatus } from "../../../types";
import { Modal } from "../../../components/ui/Modal";
import { Calculator, CheckCircle2, AlertTriangle } from "lucide-react";
import { simulateAgreement, CalculationMode, InterestApplicationMode, InterestBaseMode } from "../logic/calculations";
import { buildAgreementBreakdown, parseAgreementInteger, parseAgreementMoney, parseAgreementRate } from "../logic/agreementInputs";
import { formatMoney } from "../../../utils/formatters";
import { agreementService } from "../services/agreementService";
import { legalService } from "../../legal/services/legalService";
import { safeUUID } from "../../../utils/uuid";
import { supabase } from "../../../lib/supabase";
import { addCapitalOnlyRecoveryMarker } from "../../../utils/capitalOnlyRecovery";
import { computeLoanRemainingBalance } from "../../../domain/finance/calculations";
import { generateUUID } from "../../../utils/generators";

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

const buildRenegotiationDebtSnapshot = (loans: Loan[]) => {
    return (loans || []).reduce(
        (acc, loan) => {
            const balance = computeLoanRemainingBalance(loan);
            return {
                totalDebt: acc.totalDebt + balance.totalRemaining,
                principalDebt: acc.principalDebt + balance.principalRemaining,
                interestDebt: acc.interestDebt + balance.interestRemaining,
                lateFeeDebt: acc.lateFeeDebt + balance.lateFeeRemaining,
            };
        },
        { totalDebt: 0, principalDebt: 0, interestDebt: 0, lateFeeDebt: 0 }
    );
};

export const RenegotiationModal: React.FC<RenegotiationModalProps> = ({ loans, activeUser, onClose, onSuccess }) => {
    const [step, setStep] = useState(1);
    const [flowMode, setFlowMode] = useState<'INSTALLMENT_AGREEMENT' | 'NORMAL_UNIFICATION' | 'CAPITAL_ONLY_OPEN'>('INSTALLMENT_AGREEMENT');
    const [type, setType] = useState<'PARCELADO_COM_JUROS' | 'PARCELADO_SEM_JUROS'>('PARCELADO_SEM_JUROS');
    const [calculationMode, setCalculationMode] = useState<CalculationMode>('BY_VALUE_AND_COUNT');

    const [installmentValue, setInstallmentValue] = useState('');
    const [installmentsCount, setInstallmentsCount] = useState('');
    const [interestRate, setInterestRate] = useState('');
    const [gracePeriod, setGracePeriod] = useState('');
    const [discount, setDiscount] = useState('');
    const [downPayment, setDownPayment] = useState('');
    const [formError, setFormError] = useState<string | null>(null);

    const [firstDueDate, setFirstDueDate] = useState('');
    const [totalDebt, setTotalDebt] = useState(0);
    const [principalDebt, setPrincipalDebt] = useState(0);
    const [interestDebt, setInterestDebt] = useState(0);
    const [lateFeeDebt, setLateFeeDebt] = useState(0);
    const [interestApplicationMode, setInterestApplicationMode] = useState<InterestApplicationMode>('TOTAL_ONCE');
    const [interestBaseMode, setInterestBaseMode] = useState<InterestBaseMode>('TOTAL_DEBT');

    const [simulation, setSimulation] = useState<any>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [frequency, setFrequency] = useState<'WEEKLY' | 'BIWEEKLY' | 'MONTHLY'>('MONTHLY');
    const mainLoan = loans[0];
    const mainLoanLabel = mainLoan ? `${mainLoan.debtorName} #${mainLoan.id.slice(0, 6).toUpperCase()}` : 'contrato principal';
    const loansWithActiveAgreement = loans.filter((loan) => {
        const agreementStatus = String(loan.activeAgreement?.status || '').toUpperCase();
        return !!loan.activeAgreement && ['ACTIVE', 'ATIVO'].includes(agreementStatus);
    });
    const normalUnificationBlocked = loans.length < 2 || loansWithActiveAgreement.length > 0;

    useEffect(() => {
        if (!loans || loans.length === 0) return;
        const snapshot = buildRenegotiationDebtSnapshot(loans);
        setTotalDebt(Number(snapshot.totalDebt.toFixed(2)));
        setPrincipalDebt(Number(snapshot.principalDebt.toFixed(2)));
        setInterestDebt(Number(snapshot.interestDebt.toFixed(2)));
        setLateFeeDebt(Number(snapshot.lateFeeDebt.toFixed(2)));
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        try {
            setFirstDueDate(`${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`);
        } catch (e) {
            setFirstDueDate(new Date().toISOString().split('T')[0]);
        }
    }, [loans]);

    const handleSimulate = () => {
        setFormError(null);
        if (flowMode !== 'INSTALLMENT_AGREEMENT') {
            setStep(2);
            return;
        }

        const finalType = calculationMode === 'BY_VALUE_AND_COUNT' ? 'PARCELADO_SEM_JUROS' : type;
        const baseDebtForAgreement = finalType === 'PARCELADO_SEM_JUROS' || interestBaseMode === 'CAPITAL_ONLY' ? principalDebt : totalDebt;
        const count = parseAgreementInteger(installmentsCount, 60);
        const amount = parseAgreementMoney(installmentValue);
        const rate = interestRate.trim() ? parseAgreementRate(interestRate) : 0;
        const grace = gracePeriod.trim() ? parseAgreementInteger(gracePeriod, 365) : 0;
        const entry = downPayment.trim() ? parseAgreementMoney(downPayment) : 0;
        const reduction = discount.trim() ? parseAgreementMoney(discount) : 0;
        const needsCount = calculationMode !== 'BY_INSTALLMENT_VALUE';
        const needsValue = calculationMode !== 'BY_INSTALLMENTS';
        const rateApplicable = finalType === 'PARCELADO_COM_JUROS';
        const validDate = /^\d{4}-\d{2}-\d{2}$/.test(firstDueDate)
            && !Number.isNaN(Date.parse(firstDueDate + 'T00:00:00Z'))
            && new Date(firstDueDate + 'T00:00:00Z').toISOString().slice(0, 10) === firstDueDate;

        if (baseDebtForAgreement <= 0 || !Number.isFinite(baseDebtForAgreement)) {
            setFormError('Este contrato não possui saldo disponível para a modalidade escolhida.');
            return;
        }
        if (needsCount && (count === null || count < 1)) {
            setFormError('Informe de 1 a 60 parcelas.');
            return;
        }
        if (needsValue && (amount === null || amount <= 0)) {
            setFormError('Informe um valor válido para cada parcela, por exemplo 200,00.');
            return;
        }
        if (rateApplicable && (rate === null || rate <= 0)) {
            setFormError('Informe uma taxa de juros válida, maior que zero, ou escolha Sem juros.');
            return;
        }
        if (grace === null || entry === null || reduction === null) {
            setFormError('Revise os valores da entrada, desconto ou carência. Use, por exemplo, 1.000,00.');
            return;
        }
        if (entry + (calculationMode === 'BY_VALUE_AND_COUNT' ? 0 : reduction) > baseDebtForAgreement + 0.001) {
            setFormError('A entrada e o desconto não podem superar o valor usado como base do acordo.');
            return;
        }
        if (!validDate) {
            setFormError('Informe uma data válida para o primeiro vencimento.');
            return;
        }

        const result = simulateAgreement({
            totalDebt,
            type: finalType,
            installmentsCount: count ?? 0,
            installmentValue: amount ?? 0,
            calculationMode,
            interestRate: rateApplicable ? (rate ?? 0) : 0,
            firstDueDate,
            frequency,
            gracePeriod: grace,
            discount: calculationMode === 'BY_VALUE_AND_COUNT' ? 0 : reduction,
            downPayment: entry,
            baseDebtForAgreement,
            interestApplicationMode,
            interestBaseMode: finalType === 'PARCELADO_SEM_JUROS' ? 'CAPITAL_ONLY' : interestBaseMode,
        });
        if (!result.installments.length || result.installments.length > 60 || result.installments.some(item => !(item.amount > 0))) {
            setFormError('Essas condições não produzem um parcelamento válido de até 60 parcelas. Revise o valor e a quantidade.');
            return;
        }
        const proposedTotal = result.negotiatedTotal + entry;
        if (finalType === 'PARCELADO_SEM_JUROS' && proposedTotal > principalDebt + 0.009) {
            setFormError('O total proposto ultrapassa o principal restante. Reduza o valor ou escolha uma modalidade com juros.');
            return;
        }
        if (!Number.isFinite(proposedTotal) || proposedTotal <= 0) {
            setFormError('O acordo deve possuir um valor total maior que zero.');
            return;
        }
        setSimulation({ ...result, debtSnapshot: { totalDebt, principalDebt } });
        setStep(2);
    };

    const handleConfirm = async () => {
        if ((!simulation && flowMode === 'INSTALLMENT_AGREEMENT') || !loans.length) return;
        setIsSaving(true);
        const finalType = calculationMode === 'BY_VALUE_AND_COUNT' ? 'PARCELADO_SEM_JUROS' : type;
        const currentDebtSnapshot = buildRenegotiationDebtSnapshot(loans);
        if (flowMode === 'INSTALLMENT_AGREEMENT' && simulation?.debtSnapshot && (
            Math.abs(currentDebtSnapshot.totalDebt - simulation.debtSnapshot.totalDebt) > 0.009 ||
            Math.abs(currentDebtSnapshot.principalDebt - simulation.debtSnapshot.principalDebt) > 0.009
        )) {
            setIsSaving(false);
            setFormError('O saldo do contrato mudou. Revise as condições e simule novamente.');
            setStep(1);
            return;
        }
        const financialBreakdown = simulation && flowMode === 'INSTALLMENT_AGREEMENT'
            ? buildAgreementBreakdown(currentDebtSnapshot.totalDebt, currentDebtSnapshot.principalDebt, simulation.negotiatedTotal, parseAgreementMoney(downPayment) ?? 0)
            : null;
        const implicitPrincipalDiscount = finalType === 'PARCELADO_SEM_JUROS' && calculationMode === 'BY_VALUE_AND_COUNT'
            ? (financialBreakdown?.reducedPrincipal ?? 0) : 0;

        try {
            if (flowMode === 'CAPITAL_ONLY_OPEN') {
                const { syncService } = await import('../../../services/sync.service');

                for (const loan of loans) {
                    const loanId = safeUUID(loan.id);
                    if (!loanId) continue;

                    // 1. Cancelar acordos ativos anteriores
                    const { data: activeAgreements } = await supabase
                        .from('acordos_inadimplencia')
                        .select('id')
                        .eq('loan_id', loanId)
                        .in('status', ['ATIVO', 'ACTIVE']);

                    if (activeAgreements && activeAgreements.length > 0) {
                        for (const agg of activeAgreements) {
                            await syncService.enqueueOperation({
                                table: 'acordos_inadimplencia',
                                operation: 'UPDATE',
                                data: { id: agg.id, status: 'CANCELADO' },
                                id: agg.id
                            });
                        }
                    }

                    // 2. Atualizar contrato para Somente Capital e limpar acordo ativo
                    await syncService.enqueueOperation({
                        table: 'contratos',
                        operation: 'UPDATE',
                        data: {
                            id: loanId,
                            notes: addCapitalOnlyRecoveryMarker(loan.notes),
                            interest_rate: 0,
                            fine_percent: 0,
                            daily_interest_percent: 0,
                            status: LoanStatus.ATIVO,
                            acordo_ativo_id: null
                        },
                        id: loanId
                    });

                    // 3. Reativar parcelas pendentes e limpar juros/multas
                    for (const inst of (loan.installments || [])) {
                        const instId = safeUUID(inst.id);
                        if (!instId) continue;

                        const principalRemaining = Number(inst.principalRemaining ?? (inst as any).principal_remaining ?? 0);
                        const nextStatus = principalRemaining > 0.05 ? 'PENDENTE' : (inst.status || 'PAID');

                        await syncService.enqueueOperation({
                            table: 'parcelas',
                            operation: 'UPDATE',
                            data: {
                                id: instId,
                                interest_remaining: 0,
                                late_fee_accrued: 0,
                                scheduled_interest: 0,
                                status: nextStatus
                            },
                            id: instId
                        });
                    }

                    // 4. Registrar transação no extrato
                    const txId = generateUUID();
                    await syncService.enqueueOperation({
                        table: 'transacoes',
                        operation: 'INSERT',
                        data: {
                            id: txId,
                            loan_id: loanId,
                            profile_id: safeUUID((activeUser as any).supervisor_id) || safeUUID(activeUser.id),
                            date: new Date().toISOString(),
                            type: 'CAPITAL_ONLY_RECOVERY_ENABLED',
                            amount: 0,
                            notes: 'Renegociacao aberta sem parcelamento: recuperar somente o capital.'
                        },
                        id: txId
                    });
                }

                onSuccess();
                return;
            }

            if (flowMode === 'NORMAL_UNIFICATION') {
                const mainLoan = loans[0];
                const mainLoanId = safeUUID(mainLoan.id);
                if (!mainLoanId) throw new Error("Contrato principal invalido.");

                if (normalUnificationBlocked) {
                    throw new Error(
                        "A unificacao normal nao aceita contratos com acordo ativo. Quebre/cancele o acordo antes, ou use o parcelamento de acordo."
                    );
                }

                const clientIds = new Set(loans.map((loan) => String(loan.clientId || '').trim()).filter(Boolean));
                if (clientIds.size !== 1) {
                    throw new Error("A unificacao exige contratos vinculados ao mesmo cliente.");
                }

                const firstOpenInstallment = (mainLoan.installments || []).find((inst) => {
                    const status = String(inst.status || '').toUpperCase();
                    const open = (Number(inst.principalRemaining) || 0) + (Number(inst.interestRemaining) || 0) + (Number(inst.lateFeeAccrued) || 0);
                    return !['RENEGOCIADO', 'CANCELADO'].includes(status) && open > 0.05;
                }) || mainLoan.installments?.[0];

                const mainInstallmentId = safeUUID(firstOpenInstallment?.id);
                if (!mainInstallmentId) {
                    throw new Error("O contrato principal nao possui parcela valida para consolidacao.");
                }

                const snapshot = buildRenegotiationDebtSnapshot(loans);
                const totalUnified = Number(snapshot.totalDebt.toFixed(2));
                const profileId = safeUUID((activeUser as any).supervisor_id) || safeUUID(activeUser.id);
                const loanIds = loans.map((loan) => safeUUID(loan.id));
                if (!profileId || loanIds.some((id) => !id)) {
                    throw new Error("Perfil ou contratos invalidos para unificacao.");
                }

                const componentTotal = Number((snapshot.principalDebt + snapshot.interestDebt + snapshot.lateFeeDebt).toFixed(2));
                if (Math.abs(componentTotal - totalUnified) > 0.01) {
                    throw new Error("Os componentes financeiros nao fecham com o total da unificacao.");
                }

                const { error: unificationError } = await supabase.rpc('normal_unify_contracts', {
                    p_main_loan_id: mainLoanId,
                    p_loan_ids: loanIds as string[],
                    p_main_installment_id: mainInstallmentId,
                    p_principal: Number(snapshot.principalDebt.toFixed(2)),
                    p_interest: Number(snapshot.interestDebt.toFixed(2)),
                    p_late_fee: Number(snapshot.lateFeeDebt.toFixed(2)),
                    p_profile_id: profileId
                });
                if (unificationError) {
                    throw new Error(`A unificacao foi cancelada sem alterar os contratos: ${unificationError.message}`);
                }

                onSuccess();
                return;
            }

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
                totalDebtAtNegotiation: Number(currentDebtSnapshot.totalDebt.toFixed(2)),
                negotiatedTotal: simulation.negotiatedTotal,
                interestRate: finalType === 'PARCELADO_COM_JUROS' ? (parseAgreementRate(interestRate) ?? 0) : 0,
                principal_base: Number(currentDebtSnapshot.principalDebt.toFixed(2)),
                interest_base: Number(currentDebtSnapshot.interestDebt.toFixed(2)),
                late_fee_base: Number(currentDebtSnapshot.lateFeeDebt.toFixed(2)),
                installmentsCount: simulation.installments.length,
                frequency,
                startDate: new Date().toISOString(),
                gracePeriod: Number(gracePeriod) || 0,
                discount: calculationMode === 'BY_VALUE_AND_COUNT' ? implicitPrincipalDiscount : (parseAgreementMoney(discount) ?? 0),
                downPayment: parseAgreementMoney(downPayment) ?? 0,
                calculation_mode: calculationMode,
                interest_application_mode: interestApplicationMode,
                interest_base_mode: finalType === 'PARCELADO_SEM_JUROS' ? 'CAPITAL_ONLY' : interestBaseMode,
                installment_value: calculationMode !== 'BY_INSTALLMENTS' ? (parseAgreementMoney(installmentValue) ?? 0) : (simulation.installments[0]?.amount || 0),
                calculation_result: simulation.calculationResult,
                notes: `Acordo (${calculationMode}) com entrada de ${formatMoney(parseAgreementMoney(downPayment) ?? 0)}, desconto no principal de ${formatMoney(calculationMode === 'BY_VALUE_AND_COUNT' ? implicitPrincipalDiscount : (parseAgreementMoney(discount) ?? 0))} e encargos dispensados de ${formatMoney(finalType === 'PARCELADO_SEM_JUROS' ? (financialBreakdown?.waivedCharges ?? 0) : 0)}.`
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
            alert("Não foi possível salvar o acordo. Nenhuma nova condição foi confirmada. Confira sua conexão e tente novamente.");
        } finally {
            setIsSaving(false);
        }
    };
    const operationWarning = (() => {

        if (flowMode === 'NORMAL_UNIFICATION') {
            return `Ao confirmar, ${mainLoanLabel} será o contrato principal. O saldo atual será a nova base e a cobrança normal continuará.`;
        }
        if (flowMode === 'CAPITAL_ONLY_OPEN') {
            return loans.length > 1
                ? 'Ao confirmar, os contratos selecionados continuarão abertos, cobrando apenas o principal restante, sem juros ou mora.'
                : 'Ao confirmar, este contrato continuará aberto, cobrando apenas o principal restante, sem juros ou mora.';
        }
        return loans.length > 1
            ? `Ao confirmar, ${mainLoanLabel} será o contrato principal do acordo parcelado e os demais ficarão como legado histórico.`
            : 'Ao confirmar, este contrato será transformado em um acordo parcelado, sem criar outro contrato para o mesmo cliente.';
    })();

    const flowHelp = (() => {
        if (flowMode === 'NORMAL_UNIFICATION') {
            if (loansWithActiveAgreement.length > 0) {
                return 'Bloqueado: existe contrato com acordo ativo na selecao. A unificacao normal so aceita contratos sem acordo.';
            }
            return 'Agrupa os contratos e mantém a cobrança normal dos juros e encargos previstos.';
        }
        if (flowMode === 'CAPITAL_ONLY_OPEN') {
            return 'Mantém o contrato aberto, sem criar parcelas novas, cobrando apenas o principal restante.';
        }
        return 'Cria parcelas conforme o valor negociado.';
    })();

    const displayedDebtTotal = flowMode === 'CAPITAL_ONLY_OPEN' ? principalDebt : totalDebt;
    const displayedDebtLabel = flowMode === 'CAPITAL_ONLY_OPEN' ? 'Capital a Recuperar' : 'Divida Total Calculada';

    const fieldClass = 'mt-1 h-11 w-full min-w-0 rounded-lg border border-slate-700/70 bg-slate-950/60 px-3 text-sm font-semibold text-slate-100 outline-none transition-colors duration-150 focus:border-blue-400 focus:ring-1 focus:ring-blue-400/30';
    const labelClass = 'block text-xs font-medium text-slate-300';
    const choiceClass = 'min-h-10 rounded-lg border px-2.5 py-2 text-xs font-semibold transition-colors duration-150 motion-reduce:transition-none';
    const activeChoice = 'border-blue-400/60 bg-blue-500/15 text-blue-100';
    const passiveChoice = 'border-slate-700 bg-slate-900/40 text-slate-300 hover:border-slate-500';
    const previewValue = parseAgreementMoney(installmentValue);
    const previewCount = parseAgreementInteger(installmentsCount, 60);
    const previewEntry = downPayment.trim() ? parseAgreementMoney(downPayment) : 0;
    const previewTotal = calculationMode === 'BY_VALUE_AND_COUNT' && previewValue !== null
        && previewValue > 0 && previewCount !== null && previewCount > 0 && previewEntry !== null
        ? Math.round((previewValue * previewCount + previewEntry) * 100) / 100 : null;
    const draftBreakdown = previewTotal !== null
        ? buildAgreementBreakdown(totalDebt, principalDebt, previewTotal - (previewEntry ?? 0), previewEntry ?? 0)
        : null;
    const simulatedBreakdown = simulation && flowMode === 'INSTALLMENT_AGREEMENT'
        ? buildAgreementBreakdown(totalDebt, principalDebt, simulation.negotiatedTotal, parseAgreementMoney(downPayment) ?? 0)
        : null;

    return (
        <Modal
            onClose={onClose}
            title={loans.length > 1 ? `Unificar ${loans.length} contratos` : 'Renegociar dívida'}
            size="lg"
            busy={isSaving}
            onBack={step === 2 ? () => setStep(1) : onClose}
            footerMode="custom"
            footer={
                <div className="flex w-full items-center gap-2">
                    {step === 1 ? (
                        <button type="button" disabled={isSaving || (flowMode === 'NORMAL_UNIFICATION' && normalUnificationBlocked)} onClick={handleSimulate}
                            className="flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors duration-150 hover:bg-blue-500 disabled:opacity-50">
                            <Calculator size={16} aria-hidden="true" /> {flowMode === 'INSTALLMENT_AGREEMENT' ? 'Revisar acordo' : 'Continuar'}
                        </button>
                    ) : (
                        <>
                            <button type="button" onClick={() => setStep(1)} disabled={isSaving}
                                className="min-h-11 rounded-lg border border-slate-700 px-3 text-xs font-semibold text-slate-200">Editar</button>
                            <button type="button" onClick={handleConfirm} disabled={isSaving}
                                className="flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition-colors duration-150 hover:bg-blue-500 disabled:opacity-50">
                                <CheckCircle2 size={16} aria-hidden="true" /> {isSaving ? 'Salvando...' : 'Confirmar acordo'}
                            </button>
                        </>
                    )}
                    <button type="button" onClick={onClose} disabled={isSaving}
                        className="min-h-11 rounded-lg px-2.5 text-xs font-medium text-slate-400 hover:text-slate-100 disabled:opacity-50">Fechar</button>
                </div>
            }
        >
            <div className="space-y-4 pb-2">
                {step === 1 && (
                    <>
                        <section aria-label="Saldo atual" className="rounded-xl border border-slate-700/60 bg-slate-950/50 p-3.5">
                            <div className="flex items-baseline justify-between gap-3">
                                <span className="text-xs font-medium text-slate-400">{displayedDebtLabel}</span>
                                <strong className="text-xl font-semibold tabular-nums text-slate-100">{formatMoney(displayedDebtTotal)}</strong>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-800 pt-2 text-xs text-slate-400">
                                <span>Principal: <b className="text-slate-200">{formatMoney(principalDebt)}</b></span>
                                <span>Juros e encargos: <b className="text-slate-200">{formatMoney(interestDebt + lateFeeDebt)}</b></span>
                            </div>
                            {loans.length > 1 && <p className="mt-2 text-xs text-slate-400">{loans.length} contratos · Principal: {mainLoanLabel}</p>}
                        </section>

                        {loansWithActiveAgreement.length > 0 && (
                            <p role="alert" className="rounded-lg border border-amber-600/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                                Há acordo ativo em {loansWithActiveAgreement.length} contrato(s). A unificação normal fica indisponível.
                            </p>
                        )}

                        <section className="space-y-2" aria-label="Tipo de negociação">
                            <p className="text-xs font-semibold text-slate-200">O que deseja fazer?</p>
                            <div className="grid grid-cols-2 gap-2">
                                <button type="button" aria-pressed={flowMode === 'INSTALLMENT_AGREEMENT'} onClick={() => { setFlowMode('INSTALLMENT_AGREEMENT'); setFormError(null); }}
                                    className={choiceClass + ' ' + (flowMode === 'INSTALLMENT_AGREEMENT' ? activeChoice : passiveChoice)}>Criar parcelas</button>
                                <button type="button" aria-pressed={flowMode === 'CAPITAL_ONLY_OPEN'} onClick={() => { setFlowMode('CAPITAL_ONLY_OPEN'); setFormError(null); }}
                                    className={choiceClass + ' ' + (flowMode === 'CAPITAL_ONLY_OPEN' ? activeChoice : passiveChoice)}>Só capital, sem parcelas</button>
                            </div>
                            {loans.length > 1 && (
                                <button type="button" disabled={normalUnificationBlocked} aria-pressed={flowMode === 'NORMAL_UNIFICATION'}
                                    onClick={() => { setFlowMode('NORMAL_UNIFICATION'); setFormError(null); }}
                                    className={choiceClass + ' w-full disabled:cursor-not-allowed disabled:opacity-40 ' + (flowMode === 'NORMAL_UNIFICATION' ? activeChoice : passiveChoice)}>
                                    Unificar contratos sem novo parcelamento
                                </button>
                            )}
                            {flowMode !== 'INSTALLMENT_AGREEMENT' && <p className="text-xs leading-relaxed text-slate-400">{flowHelp}</p>}
                        </section>

                        {flowMode === 'INSTALLMENT_AGREEMENT' && (
                            <>
                                <section className="space-y-2" aria-label="Condições do parcelamento">
                                    <p className="text-xs font-semibold text-slate-200">Como definir as parcelas?</p>
                                    <div className="grid grid-cols-3 gap-1.5">
                                        <button type="button" aria-pressed={calculationMode === 'BY_VALUE_AND_COUNT'}
                                            onClick={() => { setCalculationMode('BY_VALUE_AND_COUNT'); setType('PARCELADO_SEM_JUROS'); setFormError(null); }}
                                            className={choiceClass + ' ' + (calculationMode === 'BY_VALUE_AND_COUNT' ? activeChoice : passiveChoice)}>Valor + quantidade</button>
                                        <button type="button" aria-pressed={calculationMode === 'BY_INSTALLMENTS'}
                                            onClick={() => { setCalculationMode('BY_INSTALLMENTS'); setFormError(null); }}
                                            className={choiceClass + ' ' + (calculationMode === 'BY_INSTALLMENTS' ? activeChoice : passiveChoice)}>Só quantidade</button>
                                        <button type="button" aria-pressed={calculationMode === 'BY_INSTALLMENT_VALUE'}
                                            onClick={() => { setCalculationMode('BY_INSTALLMENT_VALUE'); setFormError(null); }}
                                            className={choiceClass + ' ' + (calculationMode === 'BY_INSTALLMENT_VALUE' ? activeChoice : passiveChoice)}>Só valor</button>
                                    </div>
                                    <p className="text-xs leading-relaxed text-slate-400">
                                        {calculationMode === 'BY_VALUE_AND_COUNT'
                                            ? 'Defina o valor e o número de parcelas. A soma será o novo valor negociado, sem juros adicionais.'
                                            : calculationMode === 'BY_INSTALLMENTS'
                                            ? 'Informe quantas parcelas deseja. O sistema calcula o valor de cada uma.'
                                            : 'Informe quanto deseja receber por parcela. O sistema calcula a quantidade necessária.'}
                                    </p>
                                </section>

                                {calculationMode !== 'BY_VALUE_AND_COUNT' && (
                                    <div className="grid grid-cols-2 gap-2" aria-label="Cobrança de juros">
                                        <button type="button" aria-pressed={type === 'PARCELADO_SEM_JUROS'} onClick={() => { setType('PARCELADO_SEM_JUROS'); setFormError(null); }}
                                            className={choiceClass + ' ' + (type === 'PARCELADO_SEM_JUROS' ? activeChoice : passiveChoice)}>Sem juros novos</button>
                                        <button type="button" aria-pressed={type === 'PARCELADO_COM_JUROS'} onClick={() => { setType('PARCELADO_COM_JUROS'); setFormError(null); }}
                                            className={choiceClass + ' ' + (type === 'PARCELADO_COM_JUROS' ? activeChoice : passiveChoice)}>Adicionar juros</button>
                                    </div>
                                )}

                                <div className="grid grid-cols-2 gap-3">
                                    {calculationMode !== 'BY_INSTALLMENTS' && (
                                        <label className={labelClass}>Valor de cada parcela (R$)
                                            <input type="text" inputMode="decimal" autoComplete="off" placeholder="Ex.: 200,00" value={installmentValue}
                                                onChange={event => { setInstallmentValue(event.target.value); setFormError(null); }}
                                                className={fieldClass} />
                                        </label>
                                    )}
                                    {calculationMode !== 'BY_INSTALLMENT_VALUE' && (
                                        <label className={labelClass}>Quantidade de parcelas
                                            <input type="text" inputMode="numeric" autoComplete="off" placeholder="Ex.: 5" value={installmentsCount}
                                                onChange={event => { setInstallmentsCount(event.target.value); setFormError(null); }}
                                                className={fieldClass} />
                                        </label>
                                    )}
                                    <label className={labelClass}>Periodicidade
                                        <select value={frequency} onChange={event => setFrequency(event.target.value as typeof frequency)} className={fieldClass}>
                                            <option value="MONTHLY">Mensal</option>
                                            <option value="BIWEEKLY">Quinzenal</option>
                                            <option value="WEEKLY">Semanal</option>
                                        </select>
                                    </label>
                                    <label className={labelClass}>Primeiro vencimento
                                        <input type="date" value={firstDueDate} onChange={event => { setFirstDueDate(event.target.value); setFormError(null); }}
                                            className={fieldClass} />
                                    </label>
                                </div>

                                {calculationMode !== 'BY_VALUE_AND_COUNT' && type === 'PARCELADO_COM_JUROS' && (
                                    <section className="space-y-3 rounded-lg border border-slate-700/60 p-3" aria-label="Juros negociados">
                                        <label className={labelClass}>Taxa de juros (%)
                                            <input type="text" inputMode="decimal" placeholder="Ex.: 2,5" value={interestRate}
                                                onChange={event => { setInterestRate(event.target.value); setFormError(null); }} className={fieldClass} />
                                        </label>
                                        <div className="grid grid-cols-2 gap-3">
                                            <label className={labelClass}>Aplicação dos juros
                                                <select value={interestApplicationMode} onChange={event => setInterestApplicationMode(event.target.value as InterestApplicationMode)} className={fieldClass}>
                                                    <option value="TOTAL_ONCE">Uma vez</option><option value="MONTHLY_SIMPLE">Mensal, simples</option>
                                                </select>
                                            </label>
                                            <label className={labelClass}>Base de cálculo
                                                <select value={interestBaseMode} onChange={event => setInterestBaseMode(event.target.value as InterestBaseMode)} className={fieldClass}>
                                                    <option value="TOTAL_DEBT">Dívida atual</option><option value="CAPITAL_ONLY">Só capital</option>
                                                </select>
                                            </label>
                                        </div>
                                    </section>
                                )}

                                <details className="group rounded-lg border border-slate-700/60 px-3 py-2.5">
                                    <summary className="cursor-pointer select-none text-xs font-semibold text-slate-300">
                                        Outras condições: entrada, {calculationMode === 'BY_VALUE_AND_COUNT' ? '' : 'desconto, '}carência
                                    </summary>
                                    <div className="mt-3 grid grid-cols-2 gap-3">
                                        <label className={labelClass}>Entrada (R$)
                                            <input type="text" inputMode="decimal" placeholder="Opcional" value={downPayment}
                                                onChange={event => { setDownPayment(event.target.value); setFormError(null); }} className={fieldClass} />
                                        </label>
                                        {calculationMode !== 'BY_VALUE_AND_COUNT' && (
                                            <label className={labelClass}>Desconto (R$)
                                                <input type="text" inputMode="decimal" placeholder="Opcional" value={discount}
                                                    onChange={event => { setDiscount(event.target.value); setFormError(null); }} className={fieldClass} />
                                            </label>
                                        )}
                                        <label className={labelClass}>Carência (dias)
                                            <input type="text" inputMode="numeric" placeholder="Opcional" value={gracePeriod}
                                                onChange={event => { setGracePeriod(event.target.value); setFormError(null); }} className={fieldClass} />
                                        </label>
                                    </div>
                                </details>

                                {previewTotal !== null && calculationMode === 'BY_VALUE_AND_COUNT' && draftBreakdown && (
                                    <section aria-live="polite" className="rounded-xl border border-blue-500/25 bg-blue-500/10 p-3">
                                        <div className="flex items-baseline justify-between gap-2">
                                            <span className="text-xs text-slate-300">Total proposto para receber</span>
                                            <strong className="text-lg font-semibold tabular-nums text-white">{formatMoney(previewTotal)}</strong>
                                        </div>
                                        <p className="mt-1 text-xs text-slate-300">{previewCount} parcelas de {formatMoney(previewValue ?? 0)}{(previewEntry ?? 0) > 0 ? ' + entrada de ' + formatMoney(previewEntry ?? 0) : ''}</p>
                                        {draftBreakdown.exceedsPrincipal
                                            ? <p className="mt-2 text-xs text-amber-200">O total supera o principal. Esta proposta não é compatível com cobrança somente do capital.</p>
                                            : <p className="mt-2 text-xs text-slate-300">Encargos dispensados: {formatMoney(draftBreakdown.waivedCharges)}{draftBreakdown.reducedPrincipal > 0 ? ' · Abatimento adicional do principal: ' + formatMoney(draftBreakdown.reducedPrincipal) : ''}</p>}
                                    </section>
                                )}
                            </>
                        )}
                        {formError && <p role="alert" className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs leading-relaxed text-rose-200">{formError}</p>}
                    </>
                )}

                {step === 2 && (simulation || flowMode !== 'INSTALLMENT_AGREEMENT') && (
                    <div className="space-y-3">
                        {flowMode === 'INSTALLMENT_AGREEMENT' && simulation ? (
                            <>
                                <div className="rounded-xl border border-slate-700/60 bg-slate-950/50 p-4">
                                    <p className="text-xs text-slate-400">Novo valor negociado</p>
                                    <strong className="mt-1 block text-2xl font-semibold tabular-nums text-white">
                                        {formatMoney(simulatedBreakdown?.agreedTotal ?? simulation.negotiatedTotal)}
                                    </strong>
                                    <p className="mt-1 text-xs text-slate-300">
                                        {simulation.installments.length} parcela(s) · {frequency === 'MONTHLY' ? 'Mensal' : frequency === 'WEEKLY' ? 'Semanal' : 'Quinzenal'}
                                    </p>
                                    {type === 'PARCELADO_SEM_JUROS' || calculationMode === 'BY_VALUE_AND_COUNT' ? (
                                        <p className="mt-2 text-xs leading-relaxed text-slate-300">
                                            Juros e encargos dispensados: {formatMoney(simulatedBreakdown?.waivedCharges ?? 0)}.
                                            {(simulatedBreakdown?.reducedPrincipal ?? 0) > 0 && ' Abatimento adicional do principal: ' + formatMoney(simulatedBreakdown.reducedPrincipal) + '.'}
                                        </p>
                                    ) : (
                                        <p className="mt-2 text-xs text-slate-300">
                                            Diferença em relação à dívida atual: {formatMoney(Math.abs(totalDebt - (simulatedBreakdown?.agreedTotal ?? 0)))}
                                            {totalDebt >= (simulatedBreakdown?.agreedTotal ?? 0) ? ' a menos' : ' a mais'}.
                                        </p>
                                    )}
                                    <p className="mt-1 text-xs text-slate-400">Acordo sujeito à confirmação. Nenhuma parcela foi alterada nesta simulação.</p>
                                </div>
                                <div className="max-h-64 space-y-1.5 overflow-y-auto rounded-lg border border-slate-700/60 p-2">
                                    {simulation.installments.map((installment: { number: number; dueDate: string; amount: number }) => (
                                        <div key={installment.number} className="flex items-center justify-between gap-2 rounded-md bg-slate-950/40 px-2.5 py-2 text-xs">
                                            <span className="text-slate-400">{installment.number}ª parcela · {new Date(installment.dueDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</span>
                                            <strong className="tabular-nums text-slate-100">{formatMoney(installment.amount)}</strong>
                                        </div>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <div className="rounded-xl border border-slate-700/60 p-4">
                                <p className="text-sm font-semibold text-slate-100">{flowMode === 'NORMAL_UNIFICATION' ? 'Unificar sem parcelamento' : 'Recuperar somente capital sem criar parcelas'}</p>
                                <p className="mt-2 text-xs leading-relaxed text-slate-300">{flowHelp}</p>
                            </div>
                        )}
                        <div className="flex gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2.5">
                            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-300" aria-hidden="true" />
                            <p className="text-xs leading-relaxed text-amber-100">{operationWarning}</p>
                        </div>
                        {formError && <p role="alert" className="text-xs text-rose-300">{formError}</p>}
                    </div>
                )}
            </div>
        </Modal>
    );
};


