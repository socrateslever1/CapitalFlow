// services/payments.service.ts
import { supabase } from '../lib/supabase';
import type { CapitalSource, Installment, Loan, UserProfile } from '../types';
import { loanEngine } from '../domain/loanEngine';
import { calculateTotalDue, ZERO_BALANCE_THRESHOLD } from '../domain/finance/calculations';
import { todayDateOnlyUTC, parseDateOnlyUTC } from '../utils/dateHelpers';
import { generateUUID } from '../utils/generators';
import { isUUID, safeUUID } from '../utils/uuid';
import { isCapitalOnlyRecoveryLoan } from '../utils/capitalOnlyRecovery';

const parseMoney = (v: string) => {
  if (!v) return 0;
  const clean = String(v).replace(/[R$\s]/g, '');
  if (clean.includes('.') && clean.includes(',')) {
    return parseFloat(clean.replace(/\./g, '').replace(',', '.')) || 0;
  }
  if (clean.includes(',')) return parseFloat(clean.replace(',', '.')) || 0;
  return parseFloat(clean) || 0;
};

const normalize = (s: string) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const roundMoney = (value: number) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

function resolveRenewalBuckets(loan: Loan, installment: Installment) {
  const principal = Number(installment.principalRemaining ?? loan.principal ?? 0) || 0;
  const currentCalc = calculateTotalDue(loan, installment);
  const explicitInterest = Number(currentCalc.interest || 0);
  const explicitLateFee = Number(currentCalc.lateFee || 0);
  const expectedCycleInterest = roundMoney(principal * ((Number((loan as any).interestRate) || 0) / 100));
  const interest = Math.max(explicitInterest, expectedCycleInterest);

  return {
    interest,
    lateFee: explicitLateFee,
    total: roundMoney(interest + explicitLateFee),
  };
}

function resolveCaixaLivreIdFromMemory(sources: CapitalSource[]): string | null {
  if (!Array.isArray(sources) || sources.length === 0) return null;

  const byFlag = (sources as any[]).find(
    (s) => s?.is_caixa_livre === true || s?.isCaixaLivre === true || s?.is_profit_box === true
  );
  if (byFlag?.id && isUUID(byFlag.id)) return byFlag.id;

  const caixaLivre = sources.find((s) => {
    const n = normalize((s as any)?.name ?? (s as any)?.nome);
    return n.includes('caixa livre') || n.includes('lucro') || n.includes('disponivel') || n.includes('balance');
  });
  if (caixaLivre?.id && isUUID(caixaLivre.id)) return caixaLivre.id;

  return null;
}

async function resolveCaixaLivreIdFromDB(ownerId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('fontes')
    .select('id,nome')
    .eq('profile_id', ownerId)
    .limit(50);

  if (error || !data) return null;

  const found = data.find((f: any) => {
    const n = normalize(f?.nome);
    return n.includes('caixa livre') || n.includes('lucro') || n.includes('disponivel') || n.includes('balance');
  });

  return found?.id && isUUID(found.id) ? found.id : null;
}

async function revalidateInstallment(instId: string) {
  const safeId = safeUUID(instId);
  if (!safeId) return null;

  const { data, error } = await supabase
    .from('parcelas')
    .select('id,status,principal_remaining,interest_remaining,late_fee_accrued,loan_id')
    .eq('id', safeId)
    .single();

  if (error) throw new Error('Falha ao revalidar parcela no banco: ' + error.message);
  return data as any;
}

async function revalidateLoanOpenBalance(loanId: string) {
  const safeId = safeUUID(loanId);
  if (!safeId) {
    return {
      totalRemaining: 0,
      principalRemaining: 0,
      interestRemaining: 0,
      lateFeeRemaining: 0,
      openInstallments: 0,
    };
  }

  const { data, error } = await supabase
    .from('parcelas')
    .select('id,status,principal_remaining,interest_remaining,late_fee_accrued')
    .eq('loan_id', safeId);

  if (error) throw new Error('Falha ao revalidar saldo do contrato: ' + error.message);

  let principalRemaining = 0;
  let interestRemaining = 0;
  let lateFeeRemaining = 0;
  let openInstallments = 0;

  for (const row of data || []) {
    const status = String(row.status || '').toUpperCase();
    const principal = Math.max(0, Number(row.principal_remaining || 0));
    const interest = Math.max(0, Number(row.interest_remaining || 0));
    const lateFee = Math.max(0, Number(row.late_fee_accrued || 0));
    const total = roundMoney(principal + interest + lateFee);

    if (
      status === 'PAID' ||
      status === 'PAGO' ||
      status === 'QUITADO' ||
      status === 'QUITADA' ||
      status === 'FINALIZADO' ||
      total <= ZERO_BALANCE_THRESHOLD
    ) {
      continue;
    }

    openInstallments += 1;
    principalRemaining = roundMoney(principalRemaining + principal);
    interestRemaining = roundMoney(interestRemaining + interest);
    lateFeeRemaining = roundMoney(lateFeeRemaining + lateFee);
  }

  return {
    totalRemaining: roundMoney(principalRemaining + interestRemaining + lateFeeRemaining),
    principalRemaining,
    interestRemaining,
    lateFeeRemaining,
    openInstallments,
  };
}

async function applyPrincipalOverpaymentToLastInstallments(params: {
  loanId: string;
  profileId: string;
  sourceId: string;
  amount: number;
  excludeInstallmentId: string;
  idempotencyKey: string;
}) {
  let remaining = roundMoney(params.amount);
  if (remaining <= ZERO_BALANCE_THRESHOLD) return 0;

  const { data, error } = await supabase
    .from('parcelas')
    .select('id,numero_parcela,principal_remaining,paid_total,status')
    .eq('loan_id', params.loanId)
    .neq('id', params.excludeInstallmentId)
    .not('status', 'in', '("PAID","PAGO","QUITADO","RENEGOCIADO","CANCELADO")')
    .order('numero_parcela', { ascending: false });

  if (error) throw new Error('Falha ao buscar parcela final para abatimento: ' + error.message);

  let appliedTotal = 0;
  for (const row of data || []) {
    if (remaining <= ZERO_BALANCE_THRESHOLD) break;
    const openPrincipal = Math.max(0, Number(row.principal_remaining || 0));
    if (openPrincipal <= ZERO_BALANCE_THRESHOLD) continue;
    const applied = Math.min(remaining, openPrincipal);
    const nextPrincipal = roundMoney(openPrincipal - applied);
    const nextPaid = roundMoney(Number(row.paid_total || 0) + applied);

    const { error: updateError } = await supabase
      .from('parcelas')
      .update({
        principal_remaining: nextPrincipal,
        paid_total: nextPaid,
        status: nextPrincipal <= ZERO_BALANCE_THRESHOLD ? 'PAID' : 'PARTIAL'
      })
      .eq('id', row.id);

    if (updateError) throw updateError;
    remaining = roundMoney(remaining - applied);
    appliedTotal = roundMoney(appliedTotal + applied);
  }

  if (appliedTotal > ZERO_BALANCE_THRESHOLD) {
    await supabase.rpc('adjust_source_balance', { p_source_id: params.sourceId, p_delta: appliedTotal });
    await supabase.from('transacoes').insert({
      id: generateUUID(),
      loan_id: params.loanId,
      profile_id: params.profileId,
      source_id: params.sourceId,
      date: new Date().toISOString(),
      type: 'PAYMENT',
      amount: appliedTotal,
      principal_delta: appliedTotal,
      interest_delta: 0,
      late_fee_delta: 0,
      category: 'PAGAMENTO',
      idempotency_key: `${params.idempotencyKey}-OVERPAY`,
      notes: 'Abatimento automatico de pagamento excedente na parcela final.'
    });
  }

  return appliedTotal;
}

async function persistOfflinePaymentSnapshot(params: {
  loanId: string;
  instId: string;
  ownerId: string;
  sourceId: string;
  caixaLivreId: string | null;
  idempotencyKey: string;
  amountToPay: number;
  principalPaid: number;
  interestPaid: number;
  lateFeePaid: number;
  forgivenLateFee: number;
  paymentDateStr: string;
  installmentSnapshot: Installment;
  rpcArgs: any;
}) {
  const { db } = await import('./offline/adminOfflineStore');
  const { syncService } = await import('./sync.service');

  const nextPrincipal = roundMoney(Number(params.installmentSnapshot.principalRemaining || 0) - params.principalPaid);
  const nextInterest = roundMoney(Number(params.installmentSnapshot.interestRemaining || 0) - params.interestPaid);
  const nextLateFee = roundMoney(Number(params.installmentSnapshot.lateFeeAccrued || 0) - params.lateFeePaid - params.forgivenLateFee);
  const nextOpen = Math.max(0, nextPrincipal) + Math.max(0, nextInterest) + Math.max(0, nextLateFee);
  const previousPaid = Number((params.installmentSnapshot as any).paidTotal ?? (params.installmentSnapshot as any).paid_total ?? 0) || 0;
  const nextPaidTotal = roundMoney(previousPaid + params.principalPaid + params.interestPaid + params.lateFeePaid);

  await db.parcelas.update(params.instId, {
    principal_remaining: Math.max(0, nextPrincipal),
    interest_remaining: Math.max(0, nextInterest),
    late_fee_accrued: Math.max(0, nextLateFee),
    paid_total: nextPaidTotal,
    paid_date: params.paymentDateStr,
    status: nextOpen <= ZERO_BALANCE_THRESHOLD ? 'PAID' : 'PARTIAL',
  });

  const source = await db.fontes.get(params.sourceId);
  if (source && params.principalPaid > ZERO_BALANCE_THRESHOLD) {
    await db.fontes.update(params.sourceId, { balance: roundMoney((Number((source as any).balance) || 0) + params.principalPaid) });
  }

  const profit = roundMoney(params.interestPaid + params.lateFeePaid);
  if (params.caixaLivreId && profit > ZERO_BALANCE_THRESHOLD) {
    const profitSource = await db.fontes.get(params.caixaLivreId);
    if (profitSource) {
      await db.fontes.update(params.caixaLivreId, { balance: roundMoney((Number((profitSource as any).balance) || 0) + profit) });
    }
  }

  await db.transacoes.put({
    id: generateUUID(),
    loan_id: params.loanId,
    profile_id: params.ownerId,
    source_id: params.sourceId,
    date: params.paymentDateStr,
    type: 'PAYMENT',
    amount: params.amountToPay,
    principal_delta: params.principalPaid,
    interest_delta: params.interestPaid,
    late_fee_delta: params.lateFeePaid,
    category: 'PAGAMENTO',
    idempotency_key: params.idempotencyKey,
    notes: 'Pagamento registrado offline, aguardando sincronizacao.',
  });

  await syncService.enqueueOperation({
    table: '__rpc',
    operation: 'RPC',
    id: params.idempotencyKey,
    data: { fn: 'process_payment_v3_selective', args: params.rpcArgs },
    conflictTable: 'parcelas',
    conflictId: params.instId,
    baseUpdatedAt: (params.installmentSnapshot as any).updated_at || (params.installmentSnapshot as any).updatedAt || null,
  });
}

export const paymentsService = {
  async processPayment(params: {
    loan: Loan;
    inst: Installment;
    calculations: any;
    amountPaid: number;
    activeUser: UserProfile;
    sources: CapitalSource[];
    forgivenessMode?: 'NONE' | 'FINE_ONLY' | 'INTEREST_ONLY' | 'BOTH' | 'CAPITAL_ONLY';
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
    const statusDb = String(instDb?.status || '').toUpperCase();
    const remainingDb =
      Number(instDb?.principal_remaining || 0) +
      Number(instDb?.interest_remaining || 0) +
      Number(instDb?.late_fee_accrued || 0);

    if (!isOffline && (statusDb === 'PAID' || remainingDb <= ZERO_BALANCE_THRESHOLD)) {
      throw new Error('Parcela já quitada (revalidado no banco). Atualize a tela.');
    }

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

    const installmentSnapshot = {
      ...inst,
      principalRemaining: Number(instDb?.principal_remaining ?? (inst as any)?.principalRemaining ?? 0),
      interestRemaining: Number(instDb?.interest_remaining ?? (inst as any)?.interestRemaining ?? 0),
      lateFeeAccrued: Number(instDb?.late_fee_accrued ?? (inst as any)?.lateFeeAccrued ?? 0),
      status: String(instDb?.status ?? (inst as any)?.status ?? 'PENDING'),
    } as Installment;
    const currentPrincipalOpen = Number(installmentSnapshot.principalRemaining || 0);
    const shouldSettleWithForgivenCharges =
      effectiveForgivenessMode === 'BOTH' &&
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
    if (!shouldSettleWithForgivenCharges && effectiveForgivenessMode !== 'CAPITAL_ONLY' && principalPaid > 0 && renewalBuckets.total > ZERO_BALANCE_THRESHOLD) {
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

    // Formata data para YYYY-MM-DD (Evita erros de timestamp no Postgres DATE)
    const paymentDate = realDate || todayDateOnlyUTC();
    const paymentDateStr = paymentDate.toISOString().split('T')[0];

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
      p_payment_date: paymentDateStr,
      p_capitalize_remaining: !!capitalizeRemaining,
      p_source_id: sourceId,
      p_caixa_livre_id: safeUUID(caixaLivreId),
    };

    if (isOffline && (effectiveForgivenessMode === 'CAPITAL_ONLY' || shouldSettleWithForgivenCharges)) {
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
        paymentDateStr,
        installmentSnapshot,
        rpcArgs: paymentRpcArgs,
      });

      return { amountToPay, paymentType: 'OFFLINE_PENDING', amortization };
    }

    const { error } = await supabase.rpc('process_payment_v3_selective', paymentRpcArgs);

    if (error) throw new Error('Falha na persistência: ' + error.message);

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

    let balanceAfterRpc = await revalidateLoanOpenBalance(loanId);

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

    if (effectiveForgivenessMode === 'CAPITAL_ONLY' || shouldSettleWithForgivenCharges) {
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

    if (manualDate && balanceAfterRpc.totalRemaining > ZERO_BALANCE_THRESHOLD) {
      const nextDueDate = manualDate.toISOString().split('T')[0];
      const updatePayload: any = {
        data_vencimento: nextDueDate,
        due_date: nextDueDate,
      };

      // ✅ FIX: Se a data está avançando e o contrato é Mensal/Giro (Modo de Renovação),
      // precisamos repor os juros do próximo mês se o capital ainda existe.
      const isMonthlyOrGiro = ['MONTHLY', 'GIRO', 'REVOLVING'].includes((loan as any).billingCycle || '');
      const hasPrincipalRemaining = Number(balanceAfterRpc.principalRemaining || 0) > ZERO_BALANCE_THRESHOLD;

      if (effectiveForgivenessMode !== 'CAPITAL_ONLY' && isMonthlyOrGiro && hasPrincipalRemaining) {
        // Se a data avançou pelo menos 15 dias, consideramos um novo ciclo
        const currentDueDate = parseDateOnlyUTC(inst.dueDate);
        const diffDays = (manualDate.getTime() - currentDueDate.getTime()) / (1000 * 3600 * 24);

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

    if ((effectiveForgivenessMode === 'CAPITAL_ONLY' || shouldSettleWithForgivenCharges) && remainingAfterPayment <= ZERO_BALANCE_THRESHOLD) {
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
