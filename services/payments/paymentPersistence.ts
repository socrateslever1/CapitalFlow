import { supabase } from '../../lib/supabase';
import type { Installment } from '../../types';
import { ZERO_BALANCE_THRESHOLD } from '../../domain/finance/calculations';
import { generateUUID } from '../../utils/generators';
import { safeUUID } from '../../utils/uuid';
import { normalizeText, roundMoney } from './paymentUtils';
import { adjustSourceBalanceSafe } from './paymentWallets';

export async function revalidateInstallment(instId: string) {
  const safeId = safeUUID(instId);
  if (!safeId) return null;

  const { data, error } = await supabase
    .from('parcelas')
    .select('id,status,principal_remaining,interest_remaining,late_fee_accrued,loan_id,paid_total,paid_principal,paid_interest,paid_late_fee,paid_date,due_date,data_vencimento')
    .eq('id', safeId)
    .maybeSingle();

  if (error) throw new Error('Falha ao revalidar parcela no banco: ' + error.message);
  return data as any;
}

export async function revalidateLoanOpenBalance(loanId: string) {
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
    const principal = Math.max(0, Number(row.principal_remaining || 0));
    const interest = Math.max(0, Number(row.interest_remaining || 0));
    const lateFee = Math.max(0, Number(row.late_fee_accrued || 0));
    const total = roundMoney(principal + interest + lateFee);

    if (total <= ZERO_BALANCE_THRESHOLD) {
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

export async function reconcileZeroBalanceInstallment(
  loanId: string,
  instId: string,
  paymentDateStr: string
) {
  const { data, error } = await supabase.rpc('sync_paid_installment_status', {
    p_loan_id: loanId,
    p_installment_id: instId,
    p_payment_date: paymentDateStr,
  });

  if (error) {
    const { error: updateError } = await supabase
      .from('parcelas')
      .update({ status: 'PAID', paid_date: paymentDateStr })
      .eq('id', instId)
      .eq('loan_id', loanId);

    if (updateError) {
      throw new Error('Falha ao sincronizar parcela quitada: ' + updateError.message);
    }

    const balance = await revalidateLoanOpenBalance(loanId);
    if (balance.totalRemaining <= ZERO_BALANCE_THRESHOLD) {
      await supabase.from('contratos').update({ status: 'PAID' }).eq('id', loanId);
    }
    return { success: true, fallback: true };
  }

  return data;
}

export async function callProcessPaymentRpcWithCompatibility(args: any) {
  const { error } = await supabase.rpc('process_payment_v3_selective', args);
  if (!error) return;

  const message = String(error.message || '');
  const shouldRetryLegacy =
    message.includes('p_interest_forgiven') ||
    message.includes('Could not find the function') ||
    message.includes('schema cache');

  if (!shouldRetryLegacy) throw error;

  const { p_interest_forgiven, ...legacyArgs } = args;
  const { error: legacyError } = await supabase.rpc('process_payment_v3_selective', legacyArgs);
  if (legacyError) throw legacyError;
}

export function canUseDirectPaymentFallback(message: string, remainingBefore: number) {
  const text = normalizeText(message);

  const schemaOrRpcMismatch =
    text.includes('updated_at') ||
    text.includes('does not exist') ||
    text.includes('schema cache') ||
    text.includes('could not find the function');

  const paidStatusButStillOpen =
    remainingBefore > ZERO_BALANCE_THRESHOLD &&
    (
      text.includes('parcela ja esta paga') ||
      text.includes('parcela ja esta quitada') ||
      text.includes('already paid') ||
      text.includes('already settled')
    );

  return schemaOrRpcMismatch || paidStatusButStillOpen;
}

export async function applyPaymentDirectFallback(params: {
  loanId: string;
  instId: string;
  ownerId: string;
  sourceId: string;
  caixaLivreId: string | null;
  idempotencyKey?: string;
  principalPaid: number;
  interestPaid: number;
  lateFeePaid: number;
  forgivenLateFee: number;
  forgivenInterest: number;
  paymentDateStr: string;
}) {
  const instDb = await revalidateInstallment(params.instId);
  if (!instDb) throw new Error('Parcela nao encontrada para fallback de recebimento.');

  const nextPrincipal = Math.max(0, roundMoney(Number(instDb.principal_remaining || 0) - params.principalPaid));
  const nextInterest = Math.max(0, roundMoney(Number(instDb.interest_remaining || 0) - params.interestPaid - params.forgivenInterest));
  const nextLateFee = Math.max(0, roundMoney(Number(instDb.late_fee_accrued || 0) - params.lateFeePaid - params.forgivenLateFee));
  const nextOpen = roundMoney(nextPrincipal + nextInterest + nextLateFee);

  const { error: updateError } = await supabase
    .from('parcelas')
    .update({
      principal_remaining: nextPrincipal,
      interest_remaining: nextInterest,
      late_fee_accrued: nextLateFee,
      paid_principal: roundMoney(Number(instDb.paid_principal || 0) + params.principalPaid),
      paid_interest: roundMoney(Number(instDb.paid_interest || 0) + params.interestPaid),
      paid_late_fee: roundMoney(Number(instDb.paid_late_fee || 0) + params.lateFeePaid),
      paid_total: roundMoney(Number(instDb.paid_total || 0) + params.principalPaid + params.interestPaid + params.lateFeePaid),
      paid_date: params.paymentDateStr,
      status: nextOpen <= ZERO_BALANCE_THRESHOLD ? 'PAID' : 'PARTIAL',
    })
    .eq('id', params.instId)
    .eq('loan_id', params.loanId);

  if (updateError) throw new Error('Falha no fallback direto do recebimento: ' + updateError.message);

  await adjustSourceBalanceSafe(params.sourceId, params.principalPaid);
  const profit = roundMoney(params.interestPaid + params.lateFeePaid);
  if (params.caixaLivreId) {
    await adjustSourceBalanceSafe(params.caixaLivreId, profit);
  } else if (profit > ZERO_BALANCE_THRESHOLD) {
    try {
      const { data } = await supabase
        .from('perfis')
        .select('interest_balance')
        .eq('id', params.ownerId)
        .maybeSingle();

      await supabase
        .from('perfis')
        .update({ interest_balance: roundMoney(Number((data as any)?.interest_balance || 0) + profit) })
        .eq('id', params.ownerId);
    } catch (profileBalanceError) {
      console.error('Erro ao atualizar lucro no perfil pelo fallback:', profileBalanceError);
    }
  }

  if (nextOpen <= ZERO_BALANCE_THRESHOLD) {
    await reconcileZeroBalanceInstallment(params.loanId, params.instId, params.paymentDateStr);
  }
}

export async function applyPrincipalOverpaymentToLastInstallments(params: {
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
    .select('id,numero_parcela,principal_remaining,interest_remaining,late_fee_accrued,paid_total,status')
    .eq('loan_id', params.loanId)
    .neq('id', params.excludeInstallmentId)
    .not('status', 'in', '("RENEGOCIADO","CANCELADO")')
    .order('numero_parcela', { ascending: false });

  if (error) throw new Error('Falha ao buscar parcela final para abatimento: ' + error.message);

  let appliedTotal = 0;
  for (const row of data || []) {
    if (remaining <= ZERO_BALANCE_THRESHOLD) break;
    const openPrincipal = Math.max(0, Number(row.principal_remaining || 0));
    const openInterest = Math.max(0, Number((row as any).interest_remaining || 0));
    const openLateFee = Math.max(0, Number((row as any).late_fee_accrued || 0));
    if (openPrincipal <= ZERO_BALANCE_THRESHOLD) continue;

    const applied = Math.min(remaining, openPrincipal);
    const nextPrincipal = roundMoney(openPrincipal - applied);
    const nextOpenTotal = roundMoney(nextPrincipal + openInterest + openLateFee);
    const nextPaid = roundMoney(Number(row.paid_total || 0) + applied);

    const { error: updateError } = await supabase
      .from('parcelas')
      .update({
        principal_remaining: nextPrincipal,
        paid_total: nextPaid,
        status: nextOpenTotal <= ZERO_BALANCE_THRESHOLD ? 'PAID' : 'PARTIAL',
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
      notes: 'Abatimento automatico de pagamento excedente na parcela final.',
    });
  }

  return appliedTotal;
}

export async function persistOfflinePaymentSnapshot(params: {
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
  forgivenInterest: number;
  paymentDateStr: string;
  installmentSnapshot: Installment;
  rpcArgs: any;
}) {
  const { db } = await import('../offline/adminOfflineStore');
  const { syncService } = await import('../sync.service');

  const nextPrincipal = roundMoney(Number(params.installmentSnapshot.principalRemaining || 0) - params.principalPaid);
  const nextInterest = roundMoney(Number(params.installmentSnapshot.interestRemaining || 0) - params.interestPaid - params.forgivenInterest);
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
    await db.fontes.update(params.sourceId, {
      balance: roundMoney((Number((source as any).balance) || 0) + params.principalPaid),
    });
  }

  const profit = roundMoney(params.interestPaid + params.lateFeePaid);
  if (params.caixaLivreId && profit > ZERO_BALANCE_THRESHOLD) {
    const profitSource = await db.fontes.get(params.caixaLivreId);
    if (profitSource) {
      await db.fontes.update(params.caixaLivreId, {
        balance: roundMoney((Number((profitSource as any).balance) || 0) + profit),
      });
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
