// /app/applet/features/agreements/services/agreementService.ts
import { supabase } from "../../../lib/supabase";
import { Agreement, AgreementInstallment, UserProfile } from "../../../types";
import { allocatePaymentFromBuckets, isAgreementInstallmentPaid, calculateAgreementInstallmentLateFee } from "../../../domain/finance/calculations";
import { generateUUID } from "../../../utils/generators";
import { safeUUID } from "../../../utils/uuid";

type JurosModoDB = "PRO_RATA" | "FIXO" | "ZERO";
type PeriodicidadeDB = "SEMANAL" | "QUINZENAL" | "MENSAL";
type TipoDB = "PARCELADO_COM_JUROS" | "PARCELADO_SEM_JUROS";

function safeNumber(v: any, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function toISODateOnly(d: any): string {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) {
    const t = new Date();
    t.setDate(t.getDate() + 1);
    return t.toISOString().slice(0, 10);
  }
  return dt.toISOString().slice(0, 10);
}

function normalizePeriodicidade(v: any): PeriodicidadeDB {
  const s = String(v ?? "").trim().toUpperCase();
  if (s === "SEMANAL" || s === "QUINZENAL" || s === "MENSAL") return s;
  if (s === "WEEKLY") return "SEMANAL";
  if (s === "BIWEEKLY") return "QUINZENAL";
  if (s === "MONTHLY") return "MENSAL";
  return "MENSAL";
}

function normalizeJurosModo(v: any, interestRate: number): JurosModoDB {
  const s = String(v ?? "").trim().toUpperCase();
  if (s === "PRO_RATA" || s === "FIXO" || s === "ZERO") return s;
  if (safeNumber(interestRate, 0) <= 0) return "ZERO";
  return "PRO_RATA";
}

function normalizeTipo(v: any, jurosModo: JurosModoDB, interestRate: number): TipoDB {
  const s = String(v ?? "").trim().toUpperCase();
  if (s === "PARCELADO_COM_JUROS" || s === "PARCELADO_SEM_JUROS") return s;
  if (jurosModo !== "ZERO" && safeNumber(interestRate, 0) > 0) return "PARCELADO_COM_JUROS";
  return "PARCELADO_SEM_JUROS";
}

function extractPreviousStatusFromLegacyNote(notes: any, fallback = "ATIVO") {
  const match = String(notes || "").match(/STATUS_ANTERIOR:([A-Z_]+)/i);
  return match?.[1] || fallback;
}

function extractPreviousContractStatus(notes: any, fallback = "ATIVO") {
  const match = String(notes || "").match(/CONTRATO_ANTES_ACORDO:STATUS:([A-Z_]+);COBRANCA:/i);
  return match?.[1] || extractPreviousStatusFromLegacyNote(notes, fallback);
}

function buildPreviousContractMarker(status: any, billingCycle: any) {
  const safeStatus = String(status || "ATIVO").replace(/[^A-Z_]/gi, "").toUpperCase() || "ATIVO";
  const safeBilling = String(billingCycle || "MONTHLY").replace(/[^A-Z_]/gi, "").toUpperCase() || "MONTHLY";
  return `[CONTRATO_ANTES_ACORDO:STATUS:${safeStatus};COBRANCA:${safeBilling}]`;
}

function extractPreviousBillingCycle(notes: any) {
  const match = String(notes || "").match(/CONTRATO_ANTES_ACORDO:STATUS:[A-Z_]+;COBRANCA:([A-Z_]+)/i);
  return match?.[1] || null;
}

function resolvePreviousContractStatus(agreement: any, fallback = "ATIVO") {
  return String(agreement?.previous_contract_status || "").trim() || extractPreviousContractStatus(agreement?.notes, fallback);
}

function resolvePreviousBillingCycle(agreement: any) {
  return String(agreement?.previous_billing_cycle || "").trim() || extractPreviousBillingCycle(agreement?.notes);
}

async function getAgreementPaidAmount(agreementId: string): Promise<number> {
  const { data: paymentRows, error: paymentsError } = await supabase
    .from("acordo_pagamentos")
    .select("amount")
    .eq("acordo_id", agreementId);

  if (paymentsError) console.warn("Falha ao somar acordo_pagamentos na quebra de acordo:", paymentsError);

  const paidFromPayments = (paymentRows || []).reduce((acc, curr: any) => {
    return acc + Math.max(0, safeNumber(curr?.amount, 0));
  }, 0);

  const { data: installments, error: installmentsError } = await supabase
    .from("acordo_parcelas")
    .select("paid_amount, valor_pago")
    .eq("acordo_id", agreementId);

  if (installmentsError) throw installmentsError;

  const paidFromInstallments = (installments || []).reduce((acc, curr: any) => {
    return acc + Math.max(safeNumber(curr?.paid_amount, 0), safeNumber(curr?.valor_pago, 0));
  }, 0);

  return Math.max(paidFromPayments, paidFromInstallments);
}

function getInstallmentBalance(inst: any): number {
  return (
    safeNumber(inst?.principal_remaining ?? inst?.principalRemaining, 0) +
    safeNumber(inst?.interest_remaining ?? inst?.interestRemaining, 0) +
    safeNumber(inst?.late_fee_accrued ?? inst?.lateFeeAccrued, 0)
  );
}

function isInstallmentOverdue(inst: any): boolean {
  const rawDueDate = inst?.data_vencimento ?? inst?.due_date ?? inst?.dueDate;
  if (!rawDueDate) return false;
  const dueDate = String(rawDueDate).slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  return dueDate < today;
}

function getRestoredInstallmentStatus(inst: any, principal: number, interest: number, lateFee: number): string {
  if ((principal + interest + lateFee) <= 0.05) return "PAID";
  return isInstallmentOverdue(inst) ? "ATRASADO" : "PENDENTE";
}

function getRestoredLoanStatus(installments: any[]): string {
  const rows = installments || [];
  if (rows.length === 0) return "ATIVO";
  const openRows = rows.filter((inst) => getInstallmentBalance(inst) > 0.05);
  if (openRows.length === 0) return "PAID";
  return openRows.some(isInstallmentOverdue) ? "ATRASADO" : "ATIVO";
}

export const agreementService = {
  async createAgreement(
    loanId: string,
    agreementData: Omit<Agreement, "id" | "createdAt" | "status" | "installments">,
    installments: AgreementInstallment[],
    profileId: string
  ) {
    const agreementId = generateUUID();
    const safeLoanId = safeUUID(loanId);
    if (!safeLoanId) throw new Error("Erro ao criar acordo: ID do contrato invalido.");

    const interestRate = safeNumber((agreementData as any).interestRate ?? (agreementData as any).interest_rate, 0);
    const negotiatedTotal = safeNumber((agreementData as any).negotiatedTotal ?? (agreementData as any).totalAmount ?? (agreementData as any).total_amount, 0);
    const totalBase = safeNumber((agreementData as any).totalDebtAtNegotiation ?? (agreementData as any).total_divida_base ?? (agreementData as any).total_base, 0);
    const periodicidade = normalizePeriodicidade((agreementData as any).frequency ?? (agreementData as any).periodicidade);
    const jurosModo = normalizeJurosModo((agreementData as any).juros_modo, interestRate);
    const tipo = normalizeTipo((agreementData as any).type ?? (agreementData as any).tipo, jurosModo, interestRate);
    const numParcelas = Math.max(1, safeNumber((agreementData as any).installmentsCount ?? (agreementData as any).num_parcelas ?? installments?.length, 1)) | 0;
    const firstDueDate = installments?.[0]?.dueDate ? toISODateOnly(installments[0].dueDate) : toISODateOnly(new Date(Date.now() + 86400000));
    const totalAmount = negotiatedTotal > 0 ? negotiatedTotal : Math.max(0, totalBase);
    const valorParcela = safeNumber((agreementData as any).valor_parcela ?? (agreementData as any).valorParcela ?? (agreementData as any).installmentValue ?? installments?.[0]?.amount ?? (numParcelas > 0 ? totalAmount / numParcelas : totalAmount), 0);
    const calculationMode = (agreementData as any).calculationMode ?? (agreementData as any).calculation_mode ?? "BY_INSTALLMENTS";
    const interestApplicationMode = (agreementData as any).interestApplicationMode ?? (agreementData as any).interest_application_mode ?? null;
    const interestBaseMode = (agreementData as any).interestBaseMode ?? (agreementData as any).interest_base_mode ?? null;
    const installmentValue = safeNumber((agreementData as any).installmentValue ?? (agreementData as any).installment_value, 0);
    const calculationResult = (agreementData as any).calculationResult ?? (agreementData as any).calculation_result ?? null;

    const { data: loanExists, error: loanCheckError } = await supabase.from("contratos").select("id, status, billing_cycle").eq("id", safeLoanId).maybeSingle();
    if (loanCheckError) throw new Error("Erro ao criar acordo: falha ao validar contrato vinculado: " + loanCheckError.message);
    if (!loanExists) throw new Error("Erro ao criar acordo: contrato vinculado nao existe no banco. Sincronize os dados e tente novamente.");

    const { error: previousAgreementError } = await supabase.from("acordos_inadimplencia").update({ status: "CANCELADO" }).eq("loan_id", safeLoanId).in("status", ["ATIVO", "ACTIVE"]);
    if (previousAgreementError) throw new Error("Erro ao criar acordo: falha ao inativar acordo anterior: " + previousAgreementError.message);

    const originalNotes = String((agreementData as any).notes ?? "");
    const notesWithPreviousContract = originalNotes.includes("[CONTRATO_ANTES_ACORDO:") ? originalNotes : `${originalNotes ? `${originalNotes}\n` : ""}${buildPreviousContractMarker((loanExists as any)?.status, (loanExists as any)?.billing_cycle)}`;

    const { error: headerError } = await supabase.from("acordos_inadimplencia").insert({
      id: agreementId, loan_id: safeLoanId, profile_id: profileId, status: "ATIVO", tipo, periodicidade, juros_modo: jurosModo,
      num_parcelas: numParcelas, first_due_date: firstDueDate, total_amount: totalAmount, valor_parcela: valorParcela,
      interest_rate: interestRate, installments: numParcelas, total_negociado: negotiatedTotal, total_base: totalBase,
      juros_mensal_percent: safeNumber((agreementData as any).juros_mensal_percent, 0), principal_base: safeNumber((agreementData as any).principal_base, 0),
      interest_base: safeNumber((agreementData as any).interest_base, 0), late_fee_base: safeNumber((agreementData as any).late_fee_base, 0),
      notes: notesWithPreviousContract, grace_period: safeNumber((agreementData as any).gracePeriod, 0), discount: safeNumber((agreementData as any).discount, 0),
      down_payment: safeNumber((agreementData as any).downPayment, 0), previous_contract_status: (loanExists as any)?.status || null,
      previous_billing_cycle: (loanExists as any)?.billing_cycle || null, calculation_mode: calculationMode,
      interest_application_mode: interestApplicationMode, interest_base_mode: interestBaseMode, installment_value: installmentValue,
      calculation_result: calculationResult, legal_document_id: (agreementData as any).legalDocumentId ?? null
    });
    if (headerError) throw new Error("Erro ao criar acordo: " + headerError.message);

    const installmentsPayload = (installments || []).map((inst) => ({
      id: generateUUID(), acordo_id: agreementId, profile_id: profileId,
      numero: Math.max(1, safeNumber(inst.number, 1)) | 0,
      due_date: toISODateOnly(inst.dueDate), data_vencimento: toISODateOnly(inst.dueDate),
      valor: safeNumber(inst.amount, 0), amount: safeNumber(inst.amount, 0), status: "PENDENTE", valor_pago: 0, paid_amount: 0
    }));

    if (installmentsPayload.length === 0) {
      installmentsPayload.push({ id: generateUUID(), acordo_id: agreementId, profile_id: profileId, numero: 1, due_date: firstDueDate, data_vencimento: firstDueDate, valor: totalAmount, amount: totalAmount, status: "PENDENTE", valor_pago: 0, paid_amount: 0 });
    }

    const { error: installmentsError } = await supabase.from("acordo_parcelas").insert(installmentsPayload);
    if (installmentsError) throw new Error("Erro ao criar parcelas do acordo: " + installmentsError.message);

    await supabase.from("contratos").update({ status: "EM_ACORDO", acordo_ativo_id: agreementId }).eq("id", safeLoanId);
    await supabase.from("parcelas").update({ status: "RENEGOCIADO" }).eq("loan_id", safeLoanId).in("status", ["PENDENTE", "ATRASADO", "PENDING", "LATE", "PAID", "PAGO"]);
  },

  async breakAgreement(agreementId: string) {
    const { data: agreement, error: fetchError } = await supabase.from("acordos_inadimplencia").select("*").eq("id", agreementId).maybeSingle();
    if (fetchError) throw fetchError;
    if (!agreement) throw new Error("Acordo não encontrado.");

    await supabase.from("acordos_inadimplencia").update({ status: "QUEBRADO" }).eq("id", agreementId);
    const totalPaidInAgreement = await getAgreementPaidAmount(agreementId);
    const { data: originalInstallments } = await supabase.from("parcelas").select("*").eq("loan_id", agreement.loan_id).eq("status", "RENEGOCIADO").order("numero_parcela", { ascending: true });
    const restoredInstallments: any[] = [];

    if (originalInstallments && originalInstallments.length > 0) {
      let remainingToAbate = totalPaidInAgreement;
      for (const inst of originalInstallments) {
        const principalKey = inst.principal_remaining !== undefined ? 'principal_remaining' : 'principalRemaining';
        const interestKey = inst.interest_remaining !== undefined ? 'interest_remaining' : 'interestRemaining';
        const lateFeeKey = inst.late_fee_accrued !== undefined ? 'late_fee_accrued' : 'lateFeeAccrued';
        const paidTotalKey = inst.paid_total !== undefined ? 'paid_total' : 'paidTotal';
        let principal = Number(inst[principalKey] || 0);
        let interest = Number(inst[interestKey] || 0);
        let lateFee = Number(inst[lateFeeKey] || 0);
        let paidTotal = Number(inst[paidTotalKey] || 0);

        if (remainingToAbate > 0.01) {
          const allocation = allocatePaymentFromBuckets({ paymentAmount: remainingToAbate, principal, interest, lateFee });
          lateFee -= allocation.paidLateFee; interest -= allocation.paidInterest; principal -= allocation.paidPrincipal;
          remainingToAbate = allocation.avGenerated;
          paidTotal += allocation.paidLateFee + allocation.paidInterest + allocation.paidPrincipal;
        }
        principal = Math.max(0, principal); interest = Math.max(0, interest); lateFee = Math.max(0, lateFee);
        const restoredStatus = getRestoredInstallmentStatus(inst, principal, interest, lateFee);
        await supabase.from("parcelas").update({ [principalKey]: principal, [interestKey]: interest, [lateFeeKey]: lateFee, [paidTotalKey]: paidTotal, status: restoredStatus }).eq("id", inst.id);
        restoredInstallments.push({ ...inst, [principalKey]: principal, [interestKey]: interest, [lateFeeKey]: lateFee, status: restoredStatus });
      }
    }

    const previousBillingCycle = resolvePreviousBillingCycle(agreement);
    const restoredStatus = restoredInstallments.length > 0 ? getRestoredLoanStatus(restoredInstallments) : resolvePreviousContractStatus(agreement, "ATIVO");
    await supabase.from("contratos").update({ status: restoredStatus, acordo_ativo_id: null, ...(previousBillingCycle ? { billing_cycle: previousBillingCycle } : {}) }).eq("id", agreement.loan_id);
    await supabase.from("transacoes").insert({ id: generateUUID(), loan_id: agreement.loan_id, profile_id: agreement.profile_id, date: new Date().toISOString(), type: "RENEGOTIATION_BROKEN", amount: 0, notes: `Quebra de acordo processada. Total pago no acordo: R$ ${totalPaidInAgreement.toFixed(2)}.` });
  },

  async activateAgreement(agreementId: string) {
    if (!agreementId) throw new Error("ID do acordo não fornecido.");
    const { data: agreement, error: fetchError } = await supabase.from("acordos_inadimplencia").select("loan_id, profile_id").eq("id", agreementId).maybeSingle();
    if (fetchError) throw fetchError;
    if (agreement) {
      const { error: previousAgreementError } = await supabase.from("acordos_inadimplencia").update({ status: "CANCELADO" }).eq("loan_id", agreement.loan_id).neq("id", agreementId).in("status", ["ATIVO", "ACTIVE"]);
      if (previousAgreementError) throw previousAgreementError;
    }
    await supabase.from("acordos_inadimplencia").update({ status: "ATIVO" }).eq("id", agreementId);
    if (agreement) {
      await supabase.from("contratos").update({ status: "EM_ACORDO", acordo_ativo_id: agreementId }).eq("id", agreement.loan_id);
      await supabase.from("parcelas").update({ status: "RENEGOCIADO" }).eq("loan_id", agreement.loan_id).in("status", ["PENDENTE", "ATRASADO", "PENDING", "LATE", "PAID", "PAGO"]);
      await supabase.from("transacoes").insert({ id: generateUUID(), loan_id: agreement.loan_id, profile_id: agreement.profile_id, date: new Date().toISOString(), type: "RENEGOTIATION_CREATED", amount: 0, notes: `Acordo reativado manualmente.` });
    }
  },

  async updateAgreementSchedule(agreementId: string, frequency: any, firstDueDate: string, installmentValue: number) {
    if (!agreementId) throw new Error("ID do acordo nao fornecido.");
    const periodicidade = normalizePeriodicidade(frequency);
    const safeFirstDueDate = toISODateOnly(firstDueDate);
    const safeInstallmentValue = Number(installmentValue) || 0;
    if (safeInstallmentValue <= 0) throw new Error("Valor da parcela deve ser maior que zero.");

    const { data, error } = await supabase.rpc('update_agreement_schedule_from_balance', {
      p_agreement_id: agreementId,
      p_periodicity: periodicidade,
      p_first_due_date: safeFirstDueDate,
      p_installment_value: safeInstallmentValue
    });
    if (error) throw new Error(`Falha ao recalcular cronograma do acordo: ${error.message}`);
    return data;
  },

  async processPayment(agreement: any, installment: any, amount: number, sourceId: string, activeUser: any, forgiveLateFee: boolean = false) {
    const idempotencyKey = generateUUID();
    const paymentId = generateUUID();
    const ownerId = safeUUID(activeUser?.supervisor_id) || safeUUID(activeUser?.id);
    const safeSourceId = safeUUID(sourceId);
    const paymentAmount = Math.max(0, Number(amount) || 0);
    const installmentAmount = Number(installment.amount ?? installment.valor ?? 0) || 0;
    const previousPaid = Number(installment.paidAmount ?? installment.paid_amount ?? installment.valor_pago ?? 0) || 0;
    const remainingPrincipal = Math.max(0, installmentAmount - previousPaid);
    const mappedInst = { dueDate: installment.dueDate ?? installment.due_date ?? installment.data_vencimento, amount: installmentAmount, paidAmount: previousPaid };
    const lateFeeDue = forgiveLateFee ? 0 : calculateAgreementInstallmentLateFee(mappedInst);
    const paidLateFee = Math.min(paymentAmount, lateFeeDue);
    const paidPrincipal = Math.min(paymentAmount - paidLateFee, remainingPrincipal);
    const newPaidPrincipal = previousPaid + paidPrincipal;
    const installmentStatus = newPaidPrincipal + 0.05 >= installmentAmount ? 'PAGO' : 'PARCIAL';

    const { error: txAuditError } = await supabase.from('acordo_pagamentos').insert({ id: paymentId, parcela_id: installment.id, acordo_id: agreement.id || agreement.acordo_id, amount: paymentAmount, paid_at: new Date().toISOString(), profile_id: ownerId || activeUser.id });
    if (txAuditError) throw new Error(`Falha ao registrar pagamento de acordo: ${txAuditError.message}`);

    const { error } = await supabase.from('acordo_parcelas').update({ status: installmentStatus, valor_pago: newPaidPrincipal, paid_amount: newPaidPrincipal, data_pagamento: installmentStatus === 'PAGO' ? new Date().toISOString() : null, paid_at: installmentStatus === 'PAGO' ? new Date().toISOString() : null }).eq('id', installment.id);
    if (error) throw new Error(`Falha ao atualizar parcela do acordo: ${error.message}`);

    const loanId = agreement.loanId || agreement.loan_id;
    if (loanId) {
      if (safeSourceId && paymentAmount > 0) {
        const { error: balanceError } = await supabase.rpc('adjust_source_balance', { p_source_id: safeSourceId, p_delta: paymentAmount });
        if (balanceError) throw new Error(`Falha ao creditar recebimento do acordo na fonte: ${balanceError.message}`);
      }
      const { error: txError } = await supabase.from('transacoes').insert({
        id: generateUUID(), loan_id: loanId, profile_id: ownerId || activeUser.id, date: new Date().toISOString(), type: 'AGREEMENT_PAYMENT', amount: paymentAmount,
        principal_delta: paidPrincipal, interest_delta: 0, late_fee_delta: paidLateFee, source_id: sourceId, installment_id: null, payment_type: 'ACORDO', idempotency_key: idempotencyKey,
        meta: { agreement_id: agreement.id || agreement.acordo_id, agreement_installment_id: installment.id, origem: 'acordo_pagamentos' },
        notes: `Pagamento da parcela ${installment.numero || installment.number || 1} do acordo de renegociação.`
      });
      if (txError) throw new Error(`Falha ao registrar transação no ledger: ${txError.message}`);

      const { data: refreshedInstallments, error: refreshError } = await supabase.from('acordo_parcelas').select('id,status,amount,paid_amount,valor,valor_pago').eq('acordo_id', agreement.id || agreement.acordo_id);
      if (refreshError) throw new Error(`Falha ao validar status final do acordo: ${refreshError.message}`);
      const allPaid = (refreshedInstallments || []).length > 0 && (refreshedInstallments || []).every((inst: any) => isAgreementInstallmentPaid({ status: inst.status, amount: Number(inst.amount ?? inst.valor ?? 0), paidAmount: Number(inst.paid_amount ?? inst.valor_pago ?? 0) }));
      if (allPaid) {
        await supabase.from('acordos_inadimplencia').update({ status: 'PAGO' }).eq('id', agreement.id || agreement.acordo_id);
        await supabase.from('contratos').update({ status: 'PAID', acordo_ativo_id: null }).eq('id', loanId);
      } else {
        await supabase.from('contratos').update({ status: 'EM_ACORDO', acordo_ativo_id: agreement.id || agreement.acordo_id }).eq('id', loanId);
      }
    }
  },

  async reversePayment(agreement: any, installment: any, activeUser: any, reason: string = 'Estorno solicitado pelo operador') {
    if (!activeUser?.id) throw new Error('Usuário não autenticado');
    const agreementId = agreement.id || agreement.acordo_id;
    const loanId = agreement.loanId || agreement.loan_id;
    const { data: originalTx, error: fetchError } = await supabase.from('acordo_pagamentos').select('id, amount').eq('parcela_id', installment.id).order('paid_at', { ascending: false }).limit(1).maybeSingle();
    if (fetchError) throw fetchError;
    if (originalTx) await supabase.from('acordo_pagamentos').delete().eq('id', originalTx.id);

    const { error: instError } = await supabase.from('acordo_parcelas').update({ status: 'PENDENTE', valor_pago: 0, paid_amount: 0, data_pagamento: null, paid_at: null }).eq('id', installment.id);
    if (instError) throw instError;

    if (loanId) {
      const amountToReverse = originalTx ? originalTx.amount : (installment.valor_pago || installment.paid_amount || 0);
      await supabase.from('transacoes').insert({ id: generateUUID(), loan_id: loanId, profile_id: activeUser.id, date: new Date().toISOString(), type: 'AGREEMENT_PAYMENT_REVERSED', amount: -amountToReverse, principal_delta: -amountToReverse, interest_delta: 0, late_fee_delta: 0, installment_id: null, payment_type: 'ACORDO', meta: { agreement_id: agreementId, agreement_installment_id: installment.id, origem: 'acordo_pagamentos', reversal: true }, notes: `ESTORNO: Parcela ${installment.numero || installment.number} do acordo. Motivo: ${reason}` });
      await supabase.from('acordos_inadimplencia').update({ status: 'ATIVO' }).eq('id', agreementId);
      await supabase.from('contratos').update({ status: 'EM_ACORDO', acordo_ativo_id: agreementId }).eq('id', loanId);
    }
  }
};
