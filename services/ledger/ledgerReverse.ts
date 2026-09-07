// services/ledger/ledgerReverse.ts
import { supabase } from '../../lib/supabase';
import { Loan, UserProfile, LedgerEntry } from '../../types';
import { getOwnerId, normalizeTransaction, isPaymentTx, isLendMoreTx, isAporteTx, clampNonNegative, toNumber } from './ledgerHelpers';
import { isUUID, safeUUID } from '../../utils/uuid';
import { generateUUID } from '../../utils/generators';

const getPaymentGroupKey = (tx: any): string | null => {
  const raw = String(tx?.idempotencyKey ?? tx?.idempotency_key ?? '').trim();
  if (!raw) return null;
  return raw.replace(/(_lucro|_profit|-OVERPAY)$/i, '');
};

/**
 * Reversao financeira.
 * Pagamentos online SEMPRE passam pela RPC atomica reverse_payment_group,
 * para estornar capital, lucro, excesso e parcela como um unico evento.
 * LEND_MORE/NOVO_APORTE mantem o fluxo especifico por nao serem recebimentos.
 */
export async function reverseTransaction(
  transaction: LedgerEntry,
  activeUser: UserProfile,
  loan: Loan
) {
  if (!activeUser?.id) throw new Error('Usuário não autenticado');
  if (activeUser.id === 'DEMO') return 'Estorno realizado (Demo)';

  const ownerId = getOwnerId(activeUser);
  if (!isUUID(ownerId)) throw new Error('Perfil inválido para estorno.');

  const rawTx: any = transaction as any;
  const tx = normalizeTransaction(transaction);
  const isPayment = isPaymentTx(tx.type);
  const isAgreementPayment = tx.type === 'AGREEMENT_PAYMENT';
  const isLendMore = isLendMoreTx(tx.type);
  const isAporte = isAporteTx(tx.type);

  if (!isPayment && !isLendMore && !isAporte && !isAgreementPayment) {
    throw new Error('Apenas Pagamentos, Empréstimos, Aportes e Acordos podem ser estornados.');
  }

  if (isPayment && !isAgreementPayment) {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new Error('Estorno de recebimento exige internet para manter a operação atômica.');
    }

    const groupKey = getPaymentGroupKey(rawTx);
    if (!groupKey) {
      throw new Error('Este recebimento antigo não possui chave de evento e não pode ser estornado com segurança por esta tela. Use o extrato financeiro.');
    }

    const { data, error } = await supabase.rpc('reverse_payment_group', {
      p_profile_id: safeUUID(ownerId),
      p_idempotency_key: groupKey,
      p_reason: 'Estorno manual pelo contrato',
      p_operator_id: safeUUID(activeUser.id),
    });

    if (error) throw new Error(error.message || 'Falha ao estornar recebimento.');
    if (!(data as any)?.ok) throw new Error('O banco não confirmou o estorno do recebimento.');

    return 'Recebimento estornado por completo. Capital, lucro e parcela foram revertidos juntos.';
  }

  const { syncService } = await import('../sync.service');
  const { db } = await import('../offline/adminOfflineStore');

  // Pagamento de acordo ainda segue fluxo proprio ate existir RPC de grupo especifica.
  if (isAgreementPayment) {
    const agreementInstallmentId = tx.installmentId || tx.meta?.agreement_installment_id;
    if (!agreementInstallmentId || !isUUID(agreementInstallmentId)) {
      throw new Error('Parcela do acordo não identificada para estorno.');
    }

    await syncService.enqueueOperation({
      table: 'acordo_parcelas',
      operation: 'UPDATE',
      data: {
        id: agreementInstallmentId,
        status: 'PENDENTE',
        valor_pago: 0,
        paid_amount: 0,
        data_pagamento: null,
        paid_at: null,
      },
      id: agreementInstallmentId,
    });

    const agreementId = tx.meta?.agreement_id;
    if (agreementId && isUUID(agreementId)) {
      await syncService.enqueueOperation({
        table: 'acordos_inadimplencia',
        operation: 'UPDATE',
        data: { id: agreementId, status: 'ATIVO' },
        id: agreementId,
      });
      await syncService.enqueueOperation({
        table: 'contratos',
        operation: 'UPDATE',
        data: { id: loan.id, status: 'EM_ACORDO', acordo_ativo_id: agreementId },
        id: loan.id,
      });
    }

    const txId = generateUUID();
    await syncService.enqueueOperation({
      table: 'transacoes',
      operation: 'INSERT',
      data: {
        id: txId,
        loan_id: safeUUID(loan.id),
        profile_id: safeUUID(ownerId),
        source_id: safeUUID(tx.sourceId),
        installment_id: null,
        date: new Date().toISOString(),
        type: 'AGREEMENT_PAYMENT_REVERSED',
        amount: -toNumber(tx.amount),
        principal_delta: -toNumber(tx.principalDelta),
        interest_delta: -toNumber(tx.interestDelta),
        late_fee_delta: -toNumber(tx.lateFeeDelta),
        category: 'ESTORNO',
        payment_type: 'ACORDO',
        meta: {
          agreement_id: agreementId,
          agreement_installment_id: agreementInstallmentId,
          origem: 'acordo_pagamentos',
          reversal: true,
        },
        notes: `Estorno aplicado. Ref=${tx.id}`,
      },
      id: txId,
    });

    return 'Pagamento de acordo estornado.';
  }

  // Fluxos de saida de capital: LEND_MORE / NOVO_APORTE.
  if (tx.sourceId && isUUID(tx.sourceId)) {
    const delta = toNumber(tx.amount);
    const prevSource = await db.fontes.get(tx.sourceId).catch(() => null);
    if (prevSource) {
      await db.fontes.update(tx.sourceId, { balance: Number(prevSource.balance || 0) + delta });
    }
    await syncService.enqueueOperation({
      table: '__rpc',
      operation: 'RPC',
      data: { fn: 'adjust_source_balance', args: { p_source_id: tx.sourceId, p_delta: delta } },
      id: generateUUID(),
    });
  }

  if (isAporte && tx.installmentId && isUUID(tx.installmentId)) {
    const dbInst: any = await db.parcelas.get(tx.installmentId).catch(() => null);
    if (!dbInst) throw new Error('Parcela não encontrada para estorno do aporte.');

    const deltaPrincipal = toNumber(tx.principalDelta || tx.amount);
    const deltaAmount = toNumber(tx.amount);
    const nextPrincipalRemaining = clampNonNegative(toNumber(dbInst.principal_remaining ?? dbInst.principalRemaining) - deltaPrincipal);
    const nextScheduledPrincipal = clampNonNegative(toNumber(dbInst.scheduled_principal ?? dbInst.scheduledPrincipal) - deltaPrincipal);
    const nextValorParcela = clampNonNegative(toNumber(dbInst.valor_parcela ?? dbInst.amount) - deltaAmount);

    await syncService.enqueueOperation({
      table: 'parcelas',
      operation: 'UPDATE',
      data: {
        id: tx.installmentId,
        principal_remaining: nextPrincipalRemaining,
        scheduled_principal: nextScheduledPrincipal,
        valor_parcela: nextValorParcela,
        status: 'PENDING',
      },
      id: tx.installmentId,
    });

    await syncService.enqueueOperation({
      table: '__rpc',
      operation: 'RPC',
      data: { fn: 'adjust_loan_principal', args: { p_loan_id: loan.id, p_delta: -deltaAmount } },
      id: generateUUID(),
    });
  } else if (isLendMore) {
    await syncService.enqueueOperation({
      table: '__rpc',
      operation: 'RPC',
      data: { fn: 'adjust_loan_principal', args: { p_loan_id: loan.id, p_delta: -toNumber(tx.amount) } },
      id: generateUUID(),
    });
  }

  const txId = generateUUID();
  await syncService.enqueueOperation({
    table: 'transacoes',
    operation: 'INSERT',
    data: {
      id: txId,
      loan_id: safeUUID(loan.id),
      profile_id: safeUUID(ownerId),
      source_id: safeUUID(tx.sourceId),
      installment_id: safeUUID(tx.installmentId),
      date: new Date().toISOString(),
      type: 'ESTORNO',
      amount: -toNumber(tx.amount),
      principal_delta: -toNumber(tx.amount),
      interest_delta: 0,
      late_fee_delta: 0,
      category: 'ESTORNO',
      notes: `Estorno aplicado. Ref=${tx.id}`,
    },
    id: txId,
  });

  return 'Estorno realizado com sucesso.';
}
