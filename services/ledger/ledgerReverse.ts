// services/ledger/ledgerReverse.ts
import { supabase } from '../../lib/supabase';
import { Loan, UserProfile, LedgerEntry } from '../../types';
import {
  getOwnerId,
  normalizeTransaction,
  isPaymentTx,
  isLendMoreTx,
  isAporteTx,
  clampNonNegative,
  toNumber,
} from './ledgerHelpers';
import { isUUID, safeUUID } from '../../utils/uuid';
import { generateUUID } from '../../utils/generators';

const getPaymentGroupKey = (transaction: any): string | null => {
  const raw = String(transaction?.idempotencyKey ?? transaction?.idempotency_key ?? '').trim();
  if (!raw) return null;
  return raw.replace(/(_lucro|_profit|-OVERPAY)$/i, '');
};

export async function reverseTransaction(
  transaction: LedgerEntry,
  activeUser: UserProfile,
  loan: Loan
) {
  if (!activeUser?.id) throw new Error('Usuário não autenticado');
  if (activeUser.id === 'DEMO') return 'Estorno realizado (Demo)';

  const ownerId = getOwnerId(activeUser);
  if (!isUUID(ownerId)) return 'Estorno realizado (Demo/Inválido)';

  const tx = normalizeTransaction(transaction);
  const isPayment = isPaymentTx(tx.type);
  const isAgreementPayment = tx.type === 'AGREEMENT_PAYMENT';
  const isLendMore = isLendMoreTx(tx.type);
  const isAporte = isAporteTx(tx.type);

  if (!isPayment && !isLendMore && !isAporte && !isAgreementPayment) {
    throw new Error('Apenas Pagamentos, Empréstimos, Aportes e Acordos podem ser estornados.');
  }

  // Pagamentos comuns são sempre revertidos pelo evento financeiro inteiro.
  // Isso evita deixar capital, lucro ou OVERPAY órfãos em alguma carteira.
  if (isPayment && !isAgreementPayment) {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new Error('O estorno de recebimento exige internet para garantir reversão atômica.');
    }

    const groupKey = getPaymentGroupKey(transaction as any);
    if (!groupKey) {
      throw new Error('Este recebimento é legado e não possui chave de grupo segura para estorno automático.');
    }

    const { data, error } = await supabase.rpc('reverse_payment_group', {
      p_profile_id: safeUUID(ownerId),
      p_idempotency_key: groupKey,
      p_reason: 'Estorno via histórico do contrato',
      p_operator_id: safeUUID(activeUser.id),
    });

    if (error) throw new Error('Falha ao estornar recebimento: ' + error.message);
    if (!(data as any)?.ok) throw new Error('O banco não confirmou o estorno do recebimento.');

    return 'Estorno realizado com sucesso. O recebimento inteiro foi revertido.';
  }

  // Fluxos não-pagamento continuam específicos, pois representam saída de capital/aporte.
  const { syncService } = await import('../sync.service');
  const { db } = await import('../offline/adminOfflineStore');
  const agreementInstallmentId = tx.installmentId || tx.meta?.agreement_installment_id;

  if (isAgreementPayment && isUUID(agreementInstallmentId)) {
    await syncService.enqueueOperation({
      table: 'acordo_parcelas',
      operation: 'UPDATE',
      data: {
        id: agreementInstallmentId,
        status: 'PENDENTE',
        valor_pago: 0,
        paid_amount: 0,
        data_pagamento: null,
        paid_at: null
      },
      id: agreementInstallmentId
    });

    const agreementId = tx.meta?.agreement_id;
    if (agreementId && isUUID(agreementId)) {
      await syncService.enqueueOperation({
        table: 'acordos_inadimplencia',
        operation: 'UPDATE',
        data: { id: agreementId, status: 'ATIVO' },
        id: agreementId
      });
      await syncService.enqueueOperation({
        table: 'contratos',
        operation: 'UPDATE',
        data: { id: loan.id, status: 'EM_ACORDO', acordo_ativo_id: agreementId },
        id: loan.id
      });
    }
  }

  if (isAporte && tx.installmentId && isUUID(tx.installmentId)) {
    const deltaPrincipal = toNumber(tx.principalDelta || tx.amount);
    const deltaAmount = toNumber(tx.amount);
    let dbInst: any = null;
    try { dbInst = await db.parcelas.get(tx.installmentId); } catch {}
    if (!dbInst && typeof navigator !== 'undefined' && navigator.onLine) {
      const { data } = await supabase
        .from('parcelas')
        .select('principal_remaining, scheduled_principal, valor_parcela')
        .eq('id', tx.installmentId)
        .maybeSingle();
      dbInst = data;
    }
    if (!dbInst) throw new Error('Parcela não encontrada para estorno do aporte.');

    await syncService.enqueueOperation({
      table: 'parcelas',
      operation: 'UPDATE',
      data: {
        id: tx.installmentId,
        principal_remaining: clampNonNegative(toNumber(dbInst.principal_remaining ?? dbInst.principalRemaining) - deltaPrincipal),
        scheduled_principal: clampNonNegative(toNumber(dbInst.scheduled_principal ?? dbInst.scheduledPrincipal) - deltaPrincipal),
        valor_parcela: clampNonNegative(toNumber(dbInst.valor_parcela ?? dbInst.amount) - deltaAmount),
        status: 'PENDING',
      },
      id: tx.installmentId
    });

    await syncService.enqueueOperation({
      table: '__rpc',
      operation: 'RPC',
      data: { fn: 'adjust_loan_principal', args: { p_loan_id: loan.id, p_delta: -deltaAmount } },
      id: generateUUID()
    });
  } else if (isLendMore) {
    await syncService.enqueueOperation({
      table: '__rpc',
      operation: 'RPC',
      data: { fn: 'adjust_loan_principal', args: { p_loan_id: loan.id, p_delta: -toNumber(tx.amount) } },
      id: generateUUID()
    });
  }

  return 'Estorno realizado com sucesso.';
}
