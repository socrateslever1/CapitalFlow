// services/payments.service.ts
import { supabase } from '../lib/supabase';
import type { CapitalSource, Installment, Loan, UserProfile } from '../types';
import { loanEngine } from '../domain/loanEngine';
import { getLoanInterestReconciliationDelta, getLoanPrincipalReconciliationDelta, ZERO_BALANCE_THRESHOLD } from '../domain/finance/calculations';
import { todayDateOnlyUTC, parseDateOnlyUTC, addDaysUTC } from '../utils/dateHelpers';
import { generateUUID } from '../utils/generators';
import { safeUUID } from '../utils/uuid';
import { isCapitalOnlyRecoveryLoan } from '../utils/capitalOnlyRecovery';
import { resolveRenewalBuckets } from './payments/paymentCalculations';
import {
  applyPaymentDirectFallback,
  applyPrincipalOverpaymentToLastInstallments,
  callProcessPaymentRpcWithCompatibility,
  canUseDirectPaymentFallback,
  persistOfflinePaymentSnapshot,
  reconcileZeroBalanceInstallment,
  revalidateInstallment,
  revalidateLoanOpenBalance,
} from './payments/paymentPersistence';
import { parseMoney, roundMoney } from './payments/paymentUtils';
import { resolveCaixaLivreIdFromDB, resolveCaixaLivreIdFromMemory } from './payments/paymentWallets';

export const paymentsService = {
  async processPayment(params: {
    loan: Loan;
    inst: Installment;
    calculations: any;
    amountPaid: number;
    activeUser: UserProfile;
    sources: CapitalSource[];
    forgivenessMode?: 'NONE' | 'FINE_ONLY' | 'MORA_ONLY' | 'FINE_AND_MORA' | 'TOTAL_CHARGES' | 'CAPITAL_ONLY' | 'INTEREST_ONLY' | 'BOTH';
    manualDate?: Date | null;
    realDate?: Date | null;
    capitalizeRemaining?: boolean;
    paymentType?: string;
    avAmount?: string;
  }) {
    const {
      loan,
      inst,
      amountPaid,
      activeUser,
      sources,
      forgivenessMode = 'NONE',
      realDate,
      manualDate,
      capitalizeRemaining = false,
      paymentType: legacyPaymentType,
      avAmount: legacyAvAmount,
    } = params;

    if (!activeUser?.id) {
      throw new Error('Usuário não autenticado. Refaça o login.');
    }

    if (activeUser.id === 'DEMO') {
      return { amountToPay: amountPaid || 0, paymentType: 'CUSTOM' };
    }

    const ownerId =
      safeUUID((loan as any).profile_id) ||
      safeUUID((activeUser as any).supervisor_id) ||
      safeUUID(activeUser.id);

    if (!ownerId) throw new Error('Perfil inválido. Refaça o login.');

    const loanId = safeUUID((loan as any).id);
    const instId = safeUUID((inst as any).id);

    if (!loanId) throw new Error('Contrato inválido (loan.id).');
    if (!instId) throw new Error('Parcela inválida (inst.id).');

    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    const instDb = isOffline ? null : await revalidateInstallment(instId);
    const remainingDb =
      Number(instDb?.principal_remaining || 0) +
      Number(instDb?.interest_remaining || 0) +
      Number(instDb?.late_fee_accrued || 0);

    const idempotencyKey = generateUUID();

    if (legacyPaymentType === 'LEND_MORE') {
      const lendAmount = parseMoney(legacyAvAmount || '0');
      if (lendAmount <= 0) throw new Error('Valor do aporte inválido.');

      const sourceId = safeUUID((loan as any).sourceId);
      if (!sourceId) throw new Error('Fonte do contrato inválida (sourceId).');

      if (isOffline) {
        const { db } = await import('./offline/adminOfflineStore');
        const { syncService } = await import('./sync.service');
        await syncService.enqueueOperation({
          table: '__rpc',
          operation: 'RPC',
          id: idempotencyKey,
          data: {
            fn: 'process_lend_more_atomic',
            args: {
              p_idempotency_key: idempotencyKey,
              p_loan_id: loanId,
              p_installment_id: instId,
              p_profile_id: ownerId,
              p_operator_id: safeUUID(activeUser.id),
              p_source_id: sourceId,
              p_amount: lendAmount,
              p_notes: `Novo Aporte (+ R$ ${lendAmount.toFixed(2)})`,
            }
          },
          conflictTable: 'parcelas',
          conflictId: instId,
          baseUpdatedAt: (inst as any).updated_at || (inst as any).updatedAt || null,
        });
        const source = await db.fontes.get(sourceId);
        if (source) {
          await db.fontes.update(sourceId, { balance: roundMoney((Number((source as any).balance) || 0) - lendAmount) });
        }
        return { amountToPay: lendAmount, paymentType: 'OFFLINE_PENDING' };
      }
      const { error } = await supabase.rpc('process_lend_more_atomic', {
        p_idempotency_key: idempotencyKey,
        p_loan_id: loanId,
        p_installment_id: instId,
        p_profile_id: ownerId,
        p_operator_id: safeUUID(activeUser.id),
        p_source_id: sourceId,
        p_amount: lendAmount,
        p_notes: `Novo Aporte (+ R$ ${lendAmount.toFixed(2)})`,
      });

      if (error) throw new Error(error.message);
      return { amountToPay: lendAmount, paymentType: 'LEND_MORE' };
    }

    const effectiveForgivenessMode = isCapitalOnlyRecoveryLoan(loan) ? 'CAPITAL_ONLY' : forgivenessMode;
    const amountToPay = Number(amountPaid || 0);
    if (!Number.isFinite(amountToPay) || amountToPay <= 0) {
      throw new Error('O valor do pagamento deve ser maior que zero.');
    }

    const principalReconciliationDelta = getLoanPrincipalReconciliationDelta(loan);
    const interestReconciliationDelta = getLoanInterestReconciliationDelta(loan);
    const paymentDate = realDate || todayDateOnlyUTC();
    const paymentDateStr = paymentDate.toISOString().split('T')[0];
    const dbIsActuallySettled = remainingDb <= ZERO_BALANCE_THRESHOLD;

    if (
      !isOffline &&
      dbIsActuallySettled &&
      principalReconciliationDelta <= ZERO_BALANCE_THRESHOLD &&
      interestReconciliationDelta <= ZERO_BALANCE_THRESHOLD
    ) {
      await reconcileZeroBalanceInstallment(loanId, instId, paymentDateStr);
      return {
        amountToPay: 0,
        paymentType: 'ALREADY_PAID_SYNCED',
        amortization: {
          paidPrincipal: 0,
          paidInterest: 0,
          paidLateFee: 0,
          forgivenLateFee: 0,
          avGenerated: 0,
        },
      };
    }

    const installmentSnapshot = {
      ...inst,
      principalRemaining: Number(instDb?.principal_remaining ?? (inst as any)?.principalRemaining ?? 0) + principalReconciliationDelta,
      scheduledPrincipal: Number((inst as any)?.scheduledPrincipal ?? (inst as any)?.scheduled_principal ?? 0) + principalReconciliationDelta,
      amount: Number((inst as any)?.amount ?? (inst as any)?.valor_parcela ?? 0) + principalReconciliationDelta + interestReconciliationDelta,
      interestRemaining: Number(instDb?.interest_remaining ?? (inst as any)?.interestRemaining ?? 0) + interestReconciliationDelta,
      scheduledInterest: Number((inst as any)?.scheduledInterest ?? (inst as any)?.scheduled_interest ?? 0) + interestReconciliationDelta,
      lateFeeAccrued: Number(instDb?.late_fee_accrued ?? (inst as any)?.lateFeeAccrued ?? 0),
      status: String(instDb?.status ?? (inst as any)?.status ?? 'PENDING'),
    } as Installment;
    const currentPrincipalOpen = Number(installmentSnapshot.principalRemaining || 0);
    const shouldSettleWithForgivenCharges =
      effectiveForgivenessMode === 'TOTAL_CHARGES' &&
      currentPrincipalOpen > ZERO_BALANCE_THRESHOLD &&
      amountToPay >= currentPrincipalOpen - ZERO_BALANCE_THRESHOLD;

    const amortization = loanEngine.calculateInstallmentAmortization(
      amountToPay,
      loan,
      installmentSnapshot,
      effectiveForgivenessMode
    ) as unknown as {
      paidPrincipal: number;
      paidInterest: number;
      paidLateFee: number;
      forgivenLateFee: number;
      avGenerated: number;
    };

    let principalPaid = Number(amortization.paidPrincipal || 0);
    let interestPaid = Number(amortization.paidInterest || 0);
    let lateFeePaid = Number(amortization.paidLateFee || 0);
    const forgivenLateFee = Number(amortization.forgivenLateFee || 0);
    let forgivenInterest = 0;

    // ✅ TRATAMENTO DE EXCESSO: Se houver sobra (AV), amortiza no principal automaticamente
    let avExtra = Number(amortization.avGenerated || 0);

    let totalPaid = principalPaid + interestPaid + lateFeePaid;

    const renewalBuckets = resolveRenewalBuckets(loan, installmentSnapshot);

    if (shouldSettleWithForgivenCharges) {
      principalPaid = Math.min(amountToPay, currentPrincipalOpen);
      interestPaid = 0;
      lateFeePaid = 0;
      totalPaid = principalPaid;
      avExtra = roundMoney(Math.max(0, amountToPay - currentPrincipalOpen));
    }

    // ✅ FIX DEFINITIVO: Sempre prioriza a alocação nos encargos esperados (Mora -> Juros -> Principal)
    if (!shouldSettleWithForgivenCharges && effectiveForgivenessMode === 'NONE' && principalPaid > 0 && renewalBuckets.total > ZERO_BALANCE_THRESHOLD) {
      let remaining = amountToPay;

      lateFeePaid = Math.min(remaining, renewalBuckets.lateFee);
      remaining = roundMoney(remaining - lateFeePaid);

      interestPaid = Math.min(remaining, renewalBuckets.interest);
      remaining = roundMoney(remaining - interestPaid);

      principalPaid = remaining;
      totalPaid = amountToPay;
    }

    if (principalPaid > currentPrincipalOpen + ZERO_BALANCE_THRESHOLD) {
      avExtra = roundMoney(avExtra + principalPaid - currentPrincipalOpen);
      principalPaid = currentPrincipalOpen;
      totalPaid = roundMoney(principalPaid + interestPaid + lateFeePaid);
    }

    // ✅ DEFENSIVE FALLBACK: Se o motor de amortização falhou (retornou 0) mas há valor sendo pago
    if (totalPaid <= 0 && amountToPay > 0) {
      console.warn('[Payments] Amortização retornou ZERO. Ativando alocação defensiva...', { amountToPay, loanId: loan.id });

      const interestRate = (Number((loan as any).interestRate) || 0) / 100;
      const headPrincipal = Number(loan.principal) || 0;
      const estimatedInterest = Math.round(headPrincipal * interestRate * 100) / 100;

      if (estimatedInterest > 0) {
        interestPaid = Math.min(amountToPay, estimatedInterest);
        principalPaid = Math.max(0, amountToPay - interestPaid);
      } else {
        principalPaid = amountToPay;
      }
      totalPaid = principalPaid + interestPaid + lateFeePaid;
    }

    if (!Number.isFinite(totalPaid) || totalPaid <= 0) {
      throw new Error(`[V3] Falha ao calcular amortização (Pago: ${totalPaid}, Esperado: ${amountToPay}). Verifique o saldo do contrato.`);
    }

    const sourceId = safeUUID((loan as any).sourceId);
    if (!sourceId) throw new Error('Fonte do contrato inválida (sourceId).');

    const nextCycleInterest = roundMoney(
      Number(installmentSnapshot.principalRemaining || 0) * ((Number((loan as any).interestRate) || 0) / 100)
    );
    const isInterestRenewal =
      principalPaid <= ZERO_BALANCE_THRESHOLD &&
      renewalBuckets.total > ZERO_BALANCE_THRESHOLD &&
      amountToPay >= renewalBuckets.total - ZERO_BALANCE_THRESHOLD &&
      Number(installmentSnapshot.principalRemaining || 0) > ZERO_BALANCE_THRESHOLD;

    if (
      shouldSettleWithForgivenCharges ||
      effectiveForgivenessMode === 'CAPITAL_ONLY' ||
      effectiveForgivenessMode === 'TOTAL_CHARGES' ||
      effectiveForgivenessMode === 'INTEREST_ONLY'
    ) {
      forgivenInterest = Math.max(0, Number(installmentSnapshot.interestRemaining || 0) - interestPaid);
    }

    // Busca carteira de lucro, mas não bloqueia se não encontrar (o banco usará interest_balance como fallback)
    let caixaLivreId = resolveCaixaLivreIdFromMemory(sources);
    if (!caixaLivreId) {
       try {
          caixaLivreId = await resolveCaixaLivreIdFromDB(ownerId);
       } catch (e) {
          console.warn('Erro ao buscar Caixa Livre no DB:', e);
       }
    }

    const paymentRpcArgs = {
      p_idempotency_key: idempotencyKey,
      p_loan_id: loanId,
      p_installment_id: instId,
      p_profile_id: ownerId,
      p_operator_id: safeUUID(activeUser.id),
      p_principal_paid: principalPaid,
      p_interest_paid: interestPaid,
      p_late_fee_paid: lateFeePaid,
      p_late_fee_forgiven: forgivenLateFee,
      p_interest_forgiven: forgivenInterest,
      p_payment_date: paymentDateStr,
      p_capitalize_remaining: !!capitalizeRemaining,
      p_source_id: sourceId,
      p_caixa_livre_id: safeUUID(caixaLivreId),
    };

    if (isOffline && (effectiveForgivenessMode === 'CAPITAL_ONLY' || effectiveForgivenessMode === 'TOTAL_CHARGES' || shouldSettleWithForgivenCharges)) {
      throw new Error('Recebimento com perdao de juros/encargos exige internet para zerar os encargos com seguranca no banco.');
    }

    if (isOffline) {
      if (avExtra > ZERO_BALANCE_THRESHOLD) {
        throw new Error('Pagamento offline com valor excedente ainda exige internet para abater parcelas futuras com seguranca.');
      }

      await persistOfflinePaymentSnapshot({
        loanId,
        instId,
        ownerId,
        sourceId,
        caixaLivreId: safeUUID(caixaLivreId),
        idempotencyKey,
        amountToPay,
        principalPaid,
        interestPaid,
        lateFeePaid,
        forgivenLateFee,
        forgivenInterest,
        paymentDateStr,
        installmentSnapshot,
        rpcArgs: paymentRpcArgs,
      });

      return { amountToPay, paymentType: 'OFFLINE_PENDING', amortization };
    }

    const paidTotalBefore = Number(instDb?.paid_total || 0);
    let directFallbackApplied = false;

    try {
      await callProcessPaymentRpcWithCompatibility(paymentRpcArgs);
    } catch (error: any) {
      const message = String(error?.message || '');
      const canUseDirectFallback = canUseDirectPaymentFallback(message, Number(remainingDb || 0));

      if (!canUseDirectFallback) {
        throw new Error('Falha na persistência: ' + (error?.message || 'erro desconhecido'));
      }

      await applyPaymentDirectFallback({
        loanId,
        instId,
        ownerId,
        sourceId,
        caixaLivreId: safeUUID(caixaLivreId),
        idempotencyKey,
        principalPaid,
        interestPaid,
        lateFeePaid,
        forgivenLateFee,
        forgivenInterest,
        paymentDateStr,
      });
      directFallbackApplied = true;
    }

    let instAfterRpc = await revalidateInstallment(instId);
    let balanceAfterRpc = await revalidateLoanOpenBalance(loanId);
    const paidTotalAfterRpc = Number(instAfterRpc?.paid_total || 0);
    const installmentOpenAfterRpc = roundMoney(
      Number(instAfterRpc?.principal_remaining || 0) +
      Number(instAfterRpc?.interest_remaining || 0) +
      Number(instAfterRpc?.late_fee_accrued || 0)
    );

    if (
      !directFallbackApplied &&
      paidTotalAfterRpc <= paidTotalBefore + ZERO_BALANCE_THRESHOLD &&
      installmentOpenAfterRpc >= Number(remainingDb || 0) - ZERO_BALANCE_THRESHOLD &&
      amountToPay > ZERO_BALANCE_THRESHOLD
    ) {
      await applyPaymentDirectFallback({
        loanId,
        instId,
        ownerId,
        sourceId,
        caixaLivreId: safeUUID(caixaLivreId),
        idempotencyKey,
        principalPaid,
        interestPaid,
        lateFeePaid,
        forgivenLateFee,
        forgivenInterest,
        paymentDateStr,
      });
      instAfterRpc = await revalidateInstallment(instId);
      balanceAfterRpc = await revalidateLoanOpenBalance(loanId);
    }

    if (avExtra > ZERO_BALANCE_THRESHOLD) {
      await applyPrincipalOverpaymentToLastInstallments({
        loanId,
        profileId: ownerId,
        sourceId,
        amount: avExtra,
        excludeInstallmentId: instId,
        idempotencyKey
      });
    }

    balanceAfterRpc = await revalidateLoanOpenBalance(loanId);

    try {
      await supabase.from('payment_transactions').insert({
        installment_id: instId,
        contract_id: loanId,
        amount: amountToPay,
        payment_method: 'OTHER',
        paid_at: new Date().toISOString(),
        operator_profile_id: activeUser.id,
        status: 'PAID',
        idempotency_key: idempotencyKey,
      });
    } catch (auditErr) {
      console.error('Erro ao gravar auditoria de pagamento:', auditErr);
    }

    if (effectiveForgivenessMode === 'CAPITAL_ONLY' || effectiveForgivenessMode === 'TOTAL_CHARGES' || shouldSettleWithForgivenCharges) {
      const { error: forgiveInterestError } = await supabase
        .from('parcelas')
        .update({
          interest_remaining: 0,
          late_fee_accrued: 0,
        })
        .eq('id', instId);

      if (forgiveInterestError) {
        throw new Error('Falha ao zerar encargos do recebimento sem juros: ' + forgiveInterestError.message);
      }

      balanceAfterRpc = await revalidateLoanOpenBalance(loanId);
    }

    const renewalDate = manualDate || (isInterestRenewal ? addDaysUTC(paymentDate, 30) : null);

    if (renewalDate && balanceAfterRpc.totalRemaining > ZERO_BALANCE_THRESHOLD) {
      const nextDueDate = renewalDate.toISOString().split('T')[0];
      const updatePayload: any = {
        data_vencimento: nextDueDate,
        due_date: nextDueDate,
      };

      // ✅ FIX: Se a data está avançando e o contrato é Mensal/Giro (Modo de Renovação),
      // precisamos repor os juros do próximo mês se o capital ainda existe.
      const isMonthlyOrGiro = ['MONTHLY', 'GIRO', 'REVOLVING'].includes((loan as any).billingCycle || '');
      const hasPrincipalRemaining = Number(balanceAfterRpc.principalRemaining || 0) > ZERO_BALANCE_THRESHOLD;

      if (!['CAPITAL_ONLY', 'TOTAL_CHARGES'].includes(effectiveForgivenessMode) && isMonthlyOrGiro && hasPrincipalRemaining && isInterestRenewal) {
        // Se a data avançou pelo menos 15 dias, consideramos um novo ciclo
        const currentDueDate = parseDateOnlyUTC(inst.dueDate);
        const diffDays = (renewalDate.getTime() - currentDueDate.getTime()) / (1000 * 3600 * 24);

        if (diffDays >= 15) {
          updatePayload.interest_remaining = nextCycleInterest;
          updatePayload.scheduled_interest = nextCycleInterest;
          updatePayload.late_fee_accrued = 0;
          updatePayload.status = 'PENDING';
          updatePayload.paid_date = null;
        }
      }

      const { error: dateError } = await supabase
        .from('parcelas')
        .update(updatePayload)
        .eq('id', instId);

      if (dateError) {
        console.error('Erro ao atualizar data de vencimento:', dateError);
      }
    }

    let finalType = 'CUSTOM';
    const finalBalance = await revalidateLoanOpenBalance(loanId);
    const remainingAfterPayment = Number(finalBalance.totalRemaining || 0);

    if ((effectiveForgivenessMode === 'CAPITAL_ONLY' || effectiveForgivenessMode === 'TOTAL_CHARGES' || shouldSettleWithForgivenCharges) && remainingAfterPayment <= ZERO_BALANCE_THRESHOLD) {
      await supabase
        .from('parcelas')
        .update({
          status: 'PAID',
          paid_date: paymentDateStr,
        })
        .eq('id', instId);

      await supabase
        .from('contratos')
        .update({ status: 'PAID' })
        .eq('id', loanId);
    }

    if (remainingAfterPayment <= ZERO_BALANCE_THRESHOLD) finalType = 'FULL';
    else if (principalPaid > 0) finalType = 'RENEW_AV';
    else finalType = 'RENEW_INTEREST';

    return { amountToPay, paymentType: finalType, amortization };
  },
};
