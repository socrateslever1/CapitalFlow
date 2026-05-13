
// services/ledger/ledgerReverse.ts
import { supabase } from '../../lib/supabase';
import { Loan, UserProfile, LedgerEntry } from '../../types';
import {
  getOwnerId,
  normalizeTransaction,
  isPaymentTx,
  isLendMoreTx,
  isAporteTx,
  calcSourceBalanceDelta,
  calcProfitToRemove,
  clampNonNegative,
  toNumber,
} from './ledgerHelpers';
import { logReversalAudit } from './ledgerAudit';
import { isUUID, safeUUID } from '../../utils/uuid';
import { generateUUID } from '../../utils/generators';

/**
 * Estorno (reversão) com regras:
 * - Juros/multa: removem apenas do "Lucro disponível" (perfis.interest_balance)
 * - Capital: sai/volta na fonte (carteira)
 * - Parcela/contrato volta ao estado anterior
 * - Estorno gravado como auditoria com valor NEGATIVO para anular o original nos gráficos
 */
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
  const isAporte = isAporteTx(tx.type); // NOVO_APORTE (ou como você definir)
  const agreementInstallmentId = tx.installmentId || tx.meta?.agreement_installment_id;

  // ✅ Permitir pagamento, lend_more, aporte e pagamento de acordo
  if (!isPayment && !isLendMore && !isAporte && !isAgreementPayment) {
    throw new Error('Apenas Pagamentos, Empréstimos, Aportes e Acordos podem ser estornados.');
  }

  /**
   * 1) Ajuste de caixa (fonte): SOMENTE capital
   * - Pagamento: remove do caixa o principal que tinha entrado (delta negativo)
   * - LEND_MORE / NOVO_APORTE: devolve ao caixa o valor emprestado/aportado (delta positivo)
   */
  const balanceDelta = calcSourceBalanceDelta(tx);

  if (tx.sourceId && balanceDelta !== 0 && isUUID(tx.sourceId)) {
    const { error: balanceError } = await supabase.rpc('adjust_source_balance', {
      p_source_id: tx.sourceId,
      p_delta: balanceDelta,
    });
    if (balanceError) throw new Error('Erro ao reverter saldo da fonte: ' + balanceError.message);
  }

  /**
   * 2) Ajuste do lucro disponível: (juros + multa) APENAS para pagamento
   * - Juros/multa não existem “na carteira”; eles só existem em interest_balance.
   * - O valor a remover é subtraído do saldo atual.
   */
  const profitToRemove = Math.abs(calcProfitToRemove(tx)); // Força valor positivo para garantir subtração

  if (profitToRemove > 0) {
    const { data: profile, error: profileErr } = await supabase
      .from('perfis')
      .select('interest_balance')
      .eq('id', ownerId)
      .maybeSingle();

    if (profileErr) throw profileErr;

    const currentProfit = toNumber((profile as any)?.interest_balance);
    const nextProfit = currentProfit - profitToRemove; // Permite ficar negativo se necessário para correção

    const { error: updProfitErr } = await supabase
      .from('perfis')
      .update({ interest_balance: nextProfit })
      .eq('id', ownerId);

    if (updProfitErr) throw updProfitErr;
  }

  /**
   * 3) Reverter estado do contrato/parcela
   * - Pagamento: volta a dívida (soma nos remaining) + reduz pagos
   * - NOVO_APORTE: desfaz o que foi adicionado (subtrai do remaining/scheduled/valor)
   */
  if (tx.installmentId) {
    // Para pagamento, podemos usar o objeto do loan pra restaurar paid_*,
    // mas para APORTE é obrigatório ler do banco pra não usar estado antigo do frontend.
    const instFromLoan: any = (loan.installments || []).find(
      (i: any) => i.id === tx.installmentId
    );

    // --- 3A) Reversão de PAGAMENTO ---
    if (isPayment && instFromLoan && isUUID(tx.installmentId)) {
      const restoredPrincipalRemaining =
        toNumber(instFromLoan.principalRemaining) + toNumber(tx.principalDelta);
      const restoredInterestRemaining =
        toNumber(instFromLoan.interestRemaining) + toNumber(tx.interestDelta);
      const restoredLateFeeRemaining =
        toNumber(instFromLoan.lateFeeAccrued) + toNumber(tx.lateFeeDelta);

      const restoredPaidTotal = clampNonNegative(
        toNumber(instFromLoan.paidTotal) - toNumber(tx.amount)
      );
      const restoredPaidPrincipal = clampNonNegative(
        toNumber(instFromLoan.paidPrincipal) - toNumber(tx.principalDelta)
      );
      const restoredPaidInterest = clampNonNegative(
        toNumber(instFromLoan.paidInterest) - toNumber(tx.interestDelta)
      );
      const restoredPaidLateFee = clampNonNegative(
        toNumber(instFromLoan.paidLateFee) - toNumber(tx.lateFeeDelta)
      );
      const restoredStatus =
        restoredPrincipalRemaining + restoredInterestRemaining + restoredLateFeeRemaining <= 0.05
          ? 'PAID'
          : restoredPaidTotal > 0.05
            ? 'PARTIAL'
            : 'PENDING';

      const { error: instErr } = await supabase
        .from('parcelas')
        .update({
          principal_remaining: restoredPrincipalRemaining,
          interest_remaining: restoredInterestRemaining,
          late_fee_accrued: restoredLateFeeRemaining,
          paid_total: restoredPaidTotal,
          paid_principal: restoredPaidPrincipal,
          paid_interest: restoredPaidInterest,
          paid_late_fee: restoredPaidLateFee,
          status: restoredStatus,
        })
        .eq('id', tx.installmentId);

      if (instErr) throw instErr;

      const { error: loanStatusErr } = await supabase
        .from('contratos')
        .update({ status: 'ATIVO' })
        .eq('id', loan.id);

      if (loanStatusErr) throw loanStatusErr;
    }

    // --- 3C) Reversão de PAGAMENTO DE ACORDO ---
    if (isAgreementPayment && isUUID(agreementInstallmentId)) {
      const { error: instErr } = await supabase
        .from('acordo_parcelas')
        .update({
          status: 'PENDENTE',
          valor_pago: 0,
          paid_amount: 0,
          data_pagamento: null,
          paid_at: null
        })
        .eq('id', agreementInstallmentId);

      if (instErr) throw instErr;

      const agreementId = tx.meta?.agreement_id;
      if (agreementId && isUUID(agreementId)) {
        const { error: agreementErr } = await supabase
          .from('acordos_inadimplencia')
          .update({ status: 'ATIVO' })
          .eq('id', agreementId);

        if (agreementErr) throw agreementErr;

        const { error: loanStatusErr } = await supabase
          .from('contratos')
          .update({
            status: 'EM_ACORDO',
            acordo_ativo_id: agreementId,
          })
          .eq('id', loan.id);

        if (loanStatusErr) throw loanStatusErr;
      }
    }

    // --- 3B) Reversão de NOVO_APORTE ---
    if (isAporte && isUUID(tx.installmentId)) {
      const deltaPrincipal = toNumber(tx.principalDelta || tx.amount);
      const deltaAmount = toNumber(tx.amount);

      // ✅ FONTE DA VERDADE: busca no banco
      const { data: dbInst, error: dbErr } = await supabase
        .from('parcelas')
        .select('principal_remaining, scheduled_principal, valor_parcela')
        .eq('id', tx.installmentId)
        .maybeSingle();

      if (dbErr) throw dbErr;
      if (!dbInst) throw new Error('Parcela não encontrada para estorno do aporte.');

      const currentPrincipalRemaining = toNumber((dbInst as any).principal_remaining);
      const currentScheduledPrincipal = toNumber((dbInst as any).scheduled_principal);
      const currentValorParcela = toNumber((dbInst as any).valor_parcela);

      const nextPrincipalRemaining = clampNonNegative(
        currentPrincipalRemaining - deltaPrincipal
      );
      const nextScheduledPrincipal = clampNonNegative(
        currentScheduledPrincipal - deltaPrincipal
      );
      const nextValorParcela = clampNonNegative(currentValorParcela - deltaAmount);

      const { error: instErr } = await supabase
        .from('parcelas')
        .update({
          principal_remaining: nextPrincipalRemaining,
          scheduled_principal: nextScheduledPrincipal,
          valor_parcela: nextValorParcela,
          status: 'PENDING',
        })
        .eq('id', tx.installmentId);

      if (instErr) throw instErr;

      // ✅ Também reduz o principal do contrato (aporte aumentou no header)
      const { error: adjErr } = await supabase.rpc('adjust_loan_principal', {
        p_loan_id: loan.id,
        p_delta: -deltaAmount,
      });

      if (adjErr) throw new Error('Erro ao ajustar principal do contrato: ' + adjErr.message);
    }
  } else if (isLendMore) {
    // ✅ Estorno de LEND_MORE sem parcela: reduz principal total do contrato
    const { error: adjErr } = await supabase.rpc('adjust_loan_principal', {
      p_loan_id: loan.id,
      p_delta: -toNumber(tx.amount),
    });

    if (adjErr) throw new Error('Erro ao ajustar principal do contrato: ' + adjErr.message);
  }

  /**
   * 4) Log auditável com VALORES NEGATIVOS para anular a soma
   * - Isso garante que gráficos de "Total Recebido" subtraiam este valor
   */
  const reversedPrincipal =
    (isPayment || isAgreementPayment) ? -toNumber(tx.principalDelta) : (isLendMore || isAporte) ? -toNumber(tx.amount) : 0;

  const reversedProfit = isPayment ? -profitToRemove : 0;
  
  // Total da transação negativa
  const totalReversedAmount = -toNumber(tx.amount);

  // Se for acordo, usamos o tipo específico solicitado pelo usuário
  const reversalType = isAgreementPayment ? 'AGREEMENT_PAYMENT_REVERSED' : 'ESTORNO';

  await supabase.from('transacoes').insert({
    id: generateUUID(),
    loan_id: safeUUID(loan.id),
    profile_id: safeUUID(ownerId),
    source_id: safeUUID(tx.sourceId),
    installment_id: isAgreementPayment ? null : safeUUID(tx.installmentId),
    date: new Date().toISOString(),
    type: reversalType,
    amount: totalReversedAmount,
    principal_delta: reversedPrincipal,
    interest_delta: reversedProfit,
    late_fee_delta: 0,
    category: 'ESTORNO',
    payment_type: isAgreementPayment ? 'ACORDO' : undefined,
    meta: isAgreementPayment ? {
      agreement_id: tx.meta?.agreement_id,
      agreement_installment_id: agreementInstallmentId,
      origem: 'acordo_pagamentos',
      reversal: true
    } : undefined,
    notes: `Estorno aplicado. Ref=${tx.id}` + (tx.notes ? ` | Obs Original: ${tx.notes}` : ''),
  });

  // 5) Auditoria de Estorno nas novas tabelas
  try {
    if (isPayment && tx.installmentId) {
      // Buscar o pagamento original na tabela de auditoria
      const { data: originalPayment } = await supabase
        .from('payment_transactions')
        .select('id')
        .eq('installment_id', tx.installmentId)
        .eq('status', 'PAID')
        .order('paid_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (originalPayment) {
        // Marcar como estornado
        await supabase
          .from('payment_transactions')
          .update({ status: 'REVERSED' })
          .eq('id', originalPayment.id);

        // Registrar o estorno
        await supabase.from('payment_reversals').insert({
          payment_id: originalPayment.id,
          installment_id: tx.installmentId,
          reversed_by: activeUser.id,
          reversal_reason: 'Estorno via Ledger',
          reversed_at: new Date().toISOString()
        });
      }
    }
  } catch (auditErr) {
    console.error('Erro ao gravar auditoria de estorno:', auditErr);
  }

  return 'Estorno realizado com sucesso. Saldos ajustados.';
}
