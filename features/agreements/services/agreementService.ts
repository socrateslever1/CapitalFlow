// /app/applet/features/agreements/services/agreementService.ts
import { supabase } from "../../../lib/supabase";
import { Agreement, AgreementInstallment, UserProfile } from "../../../types";
import { allocatePaymentFromBuckets, isAgreementInstallmentPaid } from "../../../domain/finance/calculations";
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
    if (!safeLoanId) {
      throw new Error("Erro ao criar acordo: ID do contrato invalido.");
    }

    const interestRate = safeNumber(
      (agreementData as any).interestRate ??
      (agreementData as any).interest_rate,
      0
    );

    const negotiatedTotal = safeNumber(
      (agreementData as any).negotiatedTotal ??
      (agreementData as any).totalAmount ??
      (agreementData as any).total_amount,
      0
    );

    const totalBase = safeNumber(
      (agreementData as any).totalDebtAtNegotiation ??
      (agreementData as any).total_divida_base ??
      (agreementData as any).total_base,
      0
    );

    const periodicidade = normalizePeriodicidade(
      (agreementData as any).frequency ??
      (agreementData as any).periodicidade
    );

    const jurosModo = normalizeJurosModo(
      (agreementData as any).juros_modo,
      interestRate
    );

    const tipo = normalizeTipo(
      (agreementData as any).type ??
      (agreementData as any).tipo,
      jurosModo,
      interestRate
    );

    const numParcelas =
      Math.max(
        1,
        safeNumber(
          (agreementData as any).installmentsCount ??
          (agreementData as any).num_parcelas ??
          installments?.length,
          1
        )
      ) | 0;

    const firstDueDate =
      installments?.[0]?.dueDate
        ? toISODateOnly(installments[0].dueDate)
        : toISODateOnly(new Date(Date.now() + 86400000));

    const totalAmount =
      negotiatedTotal > 0
        ? negotiatedTotal
        : Math.max(0, totalBase);

    const valorParcela = safeNumber(
      (agreementData as any).valor_parcela ??
      (agreementData as any).valorParcela ??
      (agreementData as any).installmentValue ??
      installments?.[0]?.amount ??
      (numParcelas > 0 ? totalAmount / numParcelas : totalAmount),
      0
    );

    const installmentsInt = numParcelas;

    const calculationMode =
      (agreementData as any).calculationMode ??
      (agreementData as any).calculation_mode ??
      "BY_INSTALLMENTS";

    const installmentValue = safeNumber(
      (agreementData as any).installmentValue ??
      (agreementData as any).installment_value,
      0
    );

    const calculationResult =
      (agreementData as any).calculationResult ??
      (agreementData as any).calculation_result ??
      null;

    const { data: loanExists, error: loanCheckError } = await supabase
      .from("contratos")
      .select("id")
      .eq("id", safeLoanId)
      .maybeSingle();

    if (loanCheckError) {
      throw new Error("Erro ao criar acordo: falha ao validar contrato vinculado: " + loanCheckError.message);
    }

    if (!loanExists) {
      throw new Error("Erro ao criar acordo: contrato vinculado nao existe no banco. Sincronize os dados e tente novamente.");
    }

    const { error: previousAgreementError } = await supabase
      .from("acordos_inadimplencia")
      .update({ status: "CANCELADO" })
      .eq("loan_id", safeLoanId)
      .in("status", ["ATIVO", "ACTIVE"]);

    if (previousAgreementError) {
      throw new Error("Erro ao criar acordo: falha ao inativar acordo anterior: " + previousAgreementError.message);
    }

    const { error: headerError } =
      await supabase.from("acordos_inadimplencia").insert({
        id: agreementId,
        loan_id: safeLoanId,
        profile_id: profileId,
        status: "ATIVO",
        tipo,
        periodicidade,
        juros_modo: jurosModo,
        num_parcelas: numParcelas,
        first_due_date: firstDueDate,
        total_amount: totalAmount,
        valor_parcela: valorParcela,
        interest_rate: interestRate,
        installments: installmentsInt,
        total_negociado: negotiatedTotal,
        total_base: totalBase,
        juros_mensal_percent: safeNumber((agreementData as any).juros_mensal_percent, 0),
        principal_base: safeNumber((agreementData as any).principal_base, 0),
        interest_base: safeNumber((agreementData as any).interest_base, 0),
        late_fee_base: safeNumber((agreementData as any).late_fee_base, 0),
        notes: (agreementData as any).notes ?? null,
        grace_period: safeNumber((agreementData as any).gracePeriod, 0),
        discount: safeNumber((agreementData as any).discount, 0),
        down_payment: safeNumber((agreementData as any).downPayment, 0),
        calculation_mode: calculationMode,
        installment_value: installmentValue,
        calculation_result: calculationResult,
        legal_document_id: (agreementData as any).legalDocumentId ?? null
      });

    if (headerError)
      throw new Error("Erro ao criar acordo: " + headerError.message);

    const installmentsPayload = (installments || []).map((inst) => ({
      id: generateUUID(),
      acordo_id: agreementId,
      profile_id: profileId,
      numero: Math.max(1, safeNumber(inst.number, 1)) | 0,
      due_date: toISODateOnly(inst.dueDate),
      data_vencimento: toISODateOnly(inst.dueDate),
      valor: safeNumber(inst.amount, 0),
      amount: safeNumber(inst.amount, 0),
      status: "PENDENTE",
      valor_pago: 0,
      paid_amount: 0
    }));

    if (installmentsPayload.length === 0) {
      installmentsPayload.push({
        id: generateUUID(),
        acordo_id: agreementId,
        profile_id: profileId,
        numero: 1,
        due_date: firstDueDate,
        data_vencimento: firstDueDate,
        valor: valorParcela || totalAmount,
        amount: valorParcela || totalAmount,
        status: "PENDENTE",
        valor_pago: 0,
        paid_amount: 0
      });
    }

    const { error: instError } =
      await supabase.from("acordo_parcelas").insert(installmentsPayload);

    if (instError)
      throw new Error("Erro ao gerar parcelas do acordo: " + instError.message);

    // 1. Atualiza o status do contrato para EM_ACORDO
    await supabase.from("contratos").update({ 
      status: "EM_ACORDO",
      acordo_ativo_id: agreementId
    }).eq("id", loanId);

    // 2. Congela as parcelas originais que estavam pendentes/atrasadas
    await supabase.from("parcelas").update({ 
      status: "RENEGOCIADO" 
    }).eq("loan_id", loanId).in("status", ["PENDENTE", "ATRASADO", "PENDING", "LATE"]);

    // 3. Registra o evento de renegociação no extrato (ledger)
    await supabase.from("transacoes").insert({
      id: generateUUID(),
      loan_id: loanId,
      profile_id: profileId,
      date: new Date().toISOString(),
      type: "RENEGOTIATION_CREATED",
      amount: 0,
      notes: `Contrato renegociado em ${numParcelas}x de R$ ${valorParcela.toFixed(2)}. Acordo vinculado.`
    });

    return agreementId;
  },

  async breakAgreement(agreementId: string) {
    if (!agreementId) throw new Error("ID do acordo não fornecido.");
    
    const { data: agreement, error: fetchError } = await supabase
      .from("acordos_inadimplencia")
      .select("loan_id, profile_id")
      .eq("id", agreementId)
      .maybeSingle();

    if (fetchError) throw fetchError;

    const { error: updateError } = await supabase
      .from("acordos_inadimplencia")
      .update({ status: "QUEBRADO" })
      .eq("id", agreementId);

    if (updateError) throw updateError;

    if (agreement) {
      const agreementLoanShortId = String(agreement.loan_id || "").slice(0, 8);
      const { data: legacyLoans, error: legacyError } = await supabase
        .from("contratos")
        .select("id, notes")
        .ilike("notes", `%[LEGADO_PARCELAMENTO:${agreementLoanShortId};%`);

      if (legacyError) throw legacyError;

      if (legacyLoans && legacyLoans.length > 0) {
        const { data: paidInstallments } = await supabase
          .from("acordo_parcelas")
          .select("paid_amount")
          .eq("acordo_id", agreementId)
          .in("status", ["PAGO", "PAID", "QUITADO"]);

        let remainingToAbate = (paidInstallments || []).reduce((acc, curr) => acc + (Number(curr.paid_amount) || 0), 0);
        const legacyIds = [agreement.loan_id, ...legacyLoans.map((loan: any) => loan.id)];

        const { data: originalInstallments } = await supabase
          .from("parcelas")
          .select("*")
          .in("loan_id", legacyIds)
          .eq("status", "RENEGOCIADO")
          .order("loan_id", { ascending: true })
          .order("numero_parcela", { ascending: true });

        const restoredInstallmentsByLoan = new Map<string, any[]>();

        for (const inst of originalInstallments || []) {
          const principalKey = inst.principal_remaining !== undefined ? 'principal_remaining' : 'principalRemaining';
          const interestKey = inst.interest_remaining !== undefined ? 'interest_remaining' : 'interestRemaining';
          const lateFeeKey = inst.late_fee_accrued !== undefined ? 'late_fee_accrued' : 'lateFeeAccrued';
          const paidTotalKey = inst.paid_total !== undefined ? 'paid_total' : 'paidTotal';

          let principal = Number(inst[principalKey] || 0);
          let interest = Number(inst[interestKey] || 0);
          let lateFee = Number(inst[lateFeeKey] || 0);
          let paidTotal = Number(inst[paidTotalKey] || 0);

          if (remainingToAbate > 0.01) {
            const allocation = allocatePaymentFromBuckets({
              paymentAmount: remainingToAbate,
              principal,
              interest,
              lateFee,
            });

            lateFee -= allocation.paidLateFee;
            interest -= allocation.paidInterest;
            principal -= allocation.paidPrincipal;
            remainingToAbate = allocation.avGenerated;
            paidTotal += allocation.paidLateFee + allocation.paidInterest + allocation.paidPrincipal;
          }

          principal = Math.max(0, principal);
          interest = Math.max(0, interest);
          lateFee = Math.max(0, lateFee);

          const restoredStatus = getRestoredInstallmentStatus(inst, principal, interest, lateFee);
          await supabase.from("parcelas").update({
            [principalKey]: principal,
            [interestKey]: interest,
            [lateFeeKey]: lateFee,
            [paidTotalKey]: paidTotal,
            status: restoredStatus
          }).eq("id", inst.id);

          const restoredInst = {
            ...inst,
            [principalKey]: principal,
            [interestKey]: interest,
            [lateFeeKey]: lateFee,
            status: restoredStatus
          };
          const loanRows = restoredInstallmentsByLoan.get(inst.loan_id) || [];
          loanRows.push(restoredInst);
          restoredInstallmentsByLoan.set(inst.loan_id, loanRows);
        }

        await supabase.from("contratos").update({
          status: getRestoredLoanStatus(restoredInstallmentsByLoan.get(agreement.loan_id) || []),
          acordo_ativo_id: null,
          is_archived: false
        }).eq("id", agreement.loan_id);

        for (const loan of legacyLoans) {
          await supabase.from("contratos").update({
            status: getRestoredLoanStatus(restoredInstallmentsByLoan.get(loan.id) || []) || extractPreviousStatusFromLegacyNote(loan.notes),
            acordo_ativo_id: null,
            is_archived: false
          }).eq("id", loan.id);
        }

        await supabase.from("transacoes").insert({
          id: generateUUID(),
          loan_id: agreement.loan_id,
          profile_id: agreement.profile_id,
          date: new Date().toISOString(),
          type: "RENEGOTIATION_BROKEN",
          amount: 0,
          notes: `Quebra de parcelamento. Contratos legados restaurados: ${legacyIds.map((id: string) => id.slice(0, 8)).join(", ")}.`
        });

        return;
      }

      const { data: paidInstallments } = await supabase
        .from("acordo_parcelas")
        .select("paid_amount")
        .eq("acordo_id", agreementId)
        .in("status", ["PAGO", "PAID", "QUITADO"]);
      
      const totalPaidInAgreement = (paidInstallments || []).reduce((acc, curr) => acc + (Number(curr.paid_amount) || 0), 0);

      const { data: originalInstallments } = await supabase
        .from("parcelas")
        .select("*")
        .eq("loan_id", agreement.loan_id)
        .eq("status", "RENEGOCIADO")
        .order("numero_parcela", { ascending: true });

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
            const allocation = allocatePaymentFromBuckets({
              paymentAmount: remainingToAbate,
              principal,
              interest,
              lateFee,
            });

            lateFee -= allocation.paidLateFee;
            interest -= allocation.paidInterest;
            principal -= allocation.paidPrincipal;
            remainingToAbate = allocation.avGenerated;
            paidTotal += allocation.paidLateFee + allocation.paidInterest + allocation.paidPrincipal;

            // Insere a transação específica para a parcela para que o ledger (rebuildLoanStateFromLedger) a reconheça
            if (allocation.paidPrincipal > 0 || allocation.paidInterest > 0 || allocation.paidLateFee > 0) {
                await supabase.from("transacoes").insert({
                    id: generateUUID(),
                    loan_id: agreement.loan_id,
                    profile_id: agreement.profile_id,
                    date: new Date().toISOString(),
                    type: "RENEGOTIATION_ABATEMENT",
                    amount: allocation.paidPrincipal + allocation.paidInterest + allocation.paidLateFee,
                    principal_delta: allocation.paidPrincipal,
                    interest_delta: allocation.paidInterest,
                    late_fee_delta: allocation.paidLateFee,
                    installment_id: inst.id,
                    payment_type: "ACORDO",
                    notes: `Abatimento automático de R$ ${(allocation.paidPrincipal + allocation.paidInterest + allocation.paidLateFee).toFixed(2)} devido à quebra de acordo (Parc. ${inst.numero || inst.number}).`
                });
            }
          }

          principal = Math.max(0, principal);
          interest = Math.max(0, interest);
          lateFee = Math.max(0, lateFee);

          const restoredStatus = getRestoredInstallmentStatus(inst, principal, interest, lateFee);

          await supabase.from("parcelas").update({
            [principalKey]: principal,
            [interestKey]: interest,
            [lateFeeKey]: lateFee,
            [paidTotalKey]: paidTotal,
            status: restoredStatus
          }).eq("id", inst.id);

          restoredInstallments.push({
            ...inst,
            [principalKey]: principal,
            [interestKey]: interest,
            [lateFeeKey]: lateFee,
            status: restoredStatus
          });
        }
      } else {
        await supabase.from("parcelas").update({ 
          status: "PENDENTE" 
        }).eq("loan_id", agreement.loan_id).eq("status", "RENEGOCIADO");
      }

      await supabase.from("contratos").update({
        status: getRestoredLoanStatus(restoredInstallments),
        acordo_ativo_id: null
      }).eq("id", agreement.loan_id);

      await supabase.from("transacoes").insert({
        id: generateUUID(),
        loan_id: agreement.loan_id,
        profile_id: agreement.profile_id,
        date: new Date().toISOString(),
        type: "RENEGOTIATION_BROKEN",
        amount: 0,
        notes: `Quebra de acordo processada. Total pago no acordo: R$ ${totalPaidInAgreement.toFixed(2)}.`
      });
    }
  },

  async activateAgreement(agreementId: string) {
    if (!agreementId) throw new Error("ID do acordo não fornecido.");

    const { data: agreement, error: fetchError } = await supabase
      .from("acordos_inadimplencia")
      .select("loan_id, profile_id")
      .eq("id", agreementId)
      .maybeSingle();

    if (fetchError) throw fetchError;

    if (agreement) {
      const { error: previousAgreementError } = await supabase
        .from("acordos_inadimplencia")
        .update({ status: "CANCELADO" })
        .eq("loan_id", agreement.loan_id)
        .neq("id", agreementId)
        .in("status", ["ATIVO", "ACTIVE"]);

      if (previousAgreementError) throw previousAgreementError;
    }

    await supabase
      .from("acordos_inadimplencia")
      .update({ status: "ATIVO" })
      .eq("id", agreementId);

    if (agreement) {
      await supabase.from("contratos").update({ 
        status: "EM_ACORDO",
        acordo_ativo_id: agreementId
      }).eq("id", agreement.loan_id);

      await supabase.from("parcelas").update({ 
        status: "RENEGOCIADO" 
      }).eq("loan_id", agreement.loan_id).in("status", ["PENDENTE", "ATRASADO", "PENDING", "LATE", "PAID", "PAGO"]);

      await supabase.from("transacoes").insert({
        id: generateUUID(),
        loan_id: agreement.loan_id,
        profile_id: agreement.profile_id,
        date: new Date().toISOString(),
        type: "RENEGOTIATION_CREATED",
        amount: 0,
        notes: `Acordo reativado manualmente.`
      });
    }
  },

  async processPayment(agreement: any, installment: any, amount: number, sourceId: string, activeUser: any) {
    const idempotencyKey = generateUUID();
    const paymentId = generateUUID();

    // 1. Registra na tabela de pagamentos de acordo (Audit Log)
    const { error: txAuditError } = await supabase.from('acordo_pagamentos').insert({
      id: paymentId,
      parcela_id: installment.id,
      acordo_id: agreement.id || agreement.acordo_id,
      amount: amount,
      paid_at: new Date().toISOString(),
      profile_id: activeUser.id
    });

    if (txAuditError) {
      console.error("Erro ao registrar pagamento de acordo:", txAuditError);
      throw new Error(`Falha ao registrar pagamento de acordo: ${txAuditError.message}`);
    }

    // 2. Atualiza a parcela específica do acordo (Estado da Parcela)
    const { error } = await supabase
      .from('acordo_parcelas')
      .update({
        status: 'PAGO',
        valor_pago: amount,
        paid_amount: amount,
        data_pagamento: new Date().toISOString(),
        paid_at: new Date().toISOString()
      })
      .eq('id', installment.id);

    if (error) throw new Error(`Falha ao atualizar parcela do acordo: ${error.message}`);

    // 3. Registra o pagamento no extrato (ledger) do contrato principal
    const loanId = agreement.loanId || agreement.loan_id;
    if (loanId) {
      const { error: txError } = await supabase.from('transacoes').insert({
        id: generateUUID(),
        loan_id: loanId,
        profile_id: activeUser.id,
        date: new Date().toISOString(),
        type: 'AGREEMENT_PAYMENT',
        amount: amount,
        principal_delta: amount,
        interest_delta: 0,
        late_fee_delta: 0,
        source_id: sourceId,
        installment_id: null,
        payment_type: 'ACORDO',
        idempotency_key: idempotencyKey,
        meta: {
          agreement_id: agreement.id || agreement.acordo_id,
          agreement_installment_id: installment.id,
          origem: 'acordo_pagamentos'
        },
        notes: `Pagamento da parcela ${installment.numero || installment.number || 1} do acordo de renegociação.`
      });

      if (txError) throw new Error(`Falha ao registrar transação no ledger: ${txError.message}`);

      // 4. Verifica se o acordo foi totalmente quitado
      const { data: refreshedInstallments, error: refreshError } = await supabase
        .from('acordo_parcelas')
        .select('id,status,amount,paid_amount,valor,valor_pago')
        .eq('acordo_id', agreement.id || agreement.acordo_id);

      if (refreshError) throw new Error(`Falha ao validar status final do acordo: ${refreshError.message}`);

      const allPaid = (refreshedInstallments || []).length > 0 &&
        (refreshedInstallments || []).every((inst: any) =>
          isAgreementInstallmentPaid({
            status: inst.status,
            amount: Number(inst.amount ?? inst.valor ?? 0),
            paidAmount: Number(inst.paid_amount ?? inst.valor_pago ?? 0),
          })
        );

      if (allPaid) {
        await supabase.from('acordos_inadimplencia').update({ status: 'PAGO' }).eq('id', agreement.id || agreement.acordo_id);
        await supabase.from('contratos').update({ status: 'PAID', acordo_ativo_id: null }).eq('id', loanId);
      } else {
        await supabase.from('contratos').update({ 
          status: 'EM_ACORDO', 
          acordo_ativo_id: agreement.id || agreement.acordo_id 
        }).eq('id', loanId);
      }
    }
  },

  async reversePayment(agreement: any, installment: any, activeUser: any, reason: string = 'Estorno solicitado pelo operador') {
    if (!activeUser?.id) throw new Error('Usuário não autenticado');

    const agreementId = agreement.id || agreement.acordo_id;
    const loanId = agreement.loanId || agreement.loan_id;

    const { data: originalTx, error: fetchError } = await supabase
      .from('acordo_pagamentos')
      .select('id, amount')
      .eq('parcela_id', installment.id)
      .order('paid_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchError) throw fetchError;

    if (originalTx) {
      await supabase.from('acordo_pagamentos').delete().eq('id', originalTx.id);
    }

    const { error: instError } = await supabase
      .from('acordo_parcelas')
      .update({
        status: 'PENDENTE',
        valor_pago: 0,
        paid_amount: 0,
        data_pagamento: null,
        paid_at: null
      })
      .eq('id', installment.id);

    if (instError) throw instError;

    if (loanId) {
      const amountToReverse = originalTx ? originalTx.amount : (installment.valor_pago || installment.paid_amount || 0);

      await supabase.from('transacoes').insert({
        id: generateUUID(),
        loan_id: loanId,
        profile_id: activeUser.id,
        date: new Date().toISOString(),
        type: 'AGREEMENT_PAYMENT_REVERSED',
        amount: -amountToReverse,
        principal_delta: -amountToReverse,
        interest_delta: 0,
        late_fee_delta: 0,
        installment_id: null,
        payment_type: 'ACORDO',
        meta: {
          agreement_id: agreementId,
          agreement_installment_id: installment.id,
          origem: 'acordo_pagamentos',
          reversal: true
        },
        notes: `ESTORNO: Parcela ${installment.numero || installment.number} do acordo. Motivo: ${reason}`
      });

      await supabase.from('acordos_inadimplencia').update({ status: 'ATIVO' }).eq('id', agreementId);
      await supabase.from('contratos').update({ status: 'EM_ACORDO', acordo_ativo_id: agreementId }).eq('id', loanId);
    }
  }
};
