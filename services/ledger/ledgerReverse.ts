// services/ledger/ledgerReverse.ts
import { supabase } from '../../lib/supabase';
import { Loan, UserProfile, LedgerEntry } from '../../types';
import { getOwnerId, normalizeTransaction, isPaymentTx, isLendMoreTx, isAporteTx } from './ledgerHelpers';
import { isUUID, safeUUID } from '../../utils/uuid';
import { getPaymentGroupKey } from '../../utils/paymentGroups';
import { clearStableFinancialRequestKey, getStableFinancialRequestKey, reverseFinancialOperation } from '../payments/paymentEngineV4';


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

    const v4Result = await reverseFinancialOperation(groupKey, 'Estorno manual pelo contrato');
    if (v4Result) {
      return 'Recebimento V4 estornado por completo e vinculado à operação original.';
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

  if (isAgreementPayment) {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new Error('Estorno de acordo exige internet para manter a operação atômica.');
    }
    const agreementInstallmentId = tx.installmentId || tx.meta?.agreement_installment_id;
    const agreementId = tx.meta?.agreement_id;
    if (!agreementInstallmentId || !isUUID(agreementInstallmentId)) {
      throw new Error('Parcela do acordo não identificada para estorno.');
    }
    if (!agreementId || !isUUID(agreementId)) throw new Error('Acordo não identificado para estorno.');
    const { data, error } = await supabase.rpc('reverse_agreement_payment_atomic', {
      p_agreement_id: agreementId,
      p_installment_id: agreementInstallmentId,
      p_operator_id: safeUUID(activeUser.id),
      p_reason: 'Estorno manual pelo extrato',
    });
    if (error) throw new Error(error.message || 'Falha ao estornar pagamento de acordo.');
    if (!(data as any)?.success && !(data as any)?.ok) throw new Error('O banco não confirmou o estorno do acordo.');
    return 'Pagamento de acordo estornado.';
  }

  if (isLendMore || isAporte) {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new Error('Estorno de aporte exige internet para manter a operação atômica.');
    }
    const originalKey = getPaymentGroupKey(rawTx);
    if (!isUUID(originalKey)) {
      throw new Error('Aporte legado sem chave auditável. Reconciliação manual obrigatória.');
    }
    const reversalRequest = getStableFinancialRequestKey(`capital-advance-reversal:${originalKey}:Estorno manual pelo extrato`);
    const { data, error } = await supabase.rpc('reverse_capital_advance_v4', {
      p_original_idempotency_key: originalKey,
      p_reversal_idempotency_key: reversalRequest.idempotencyKey,
      p_reason: 'Estorno manual pelo extrato',
    });
    if (error) throw new Error(error.message || 'Falha ao estornar aporte.');
    if (!(data as any)?.success) throw new Error('O banco não confirmou o estorno do aporte.');
    clearStableFinancialRequestKey(reversalRequest.storageKey);
    return 'Aporte estornado por completo e vinculado à operação original.';
  }

  throw new Error('Estorno de aporte ou novo empréstimo está bloqueado até existir uma RPC atômica e auditável específica.');
}
