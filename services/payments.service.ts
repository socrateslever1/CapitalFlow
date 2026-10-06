// services/payments.service.ts
import { supabase } from '../lib/supabase';
import type { CapitalSource, Installment, Loan, UserProfile } from '../types';
import { ZERO_BALANCE_THRESHOLD } from '../domain/finance/calculations';
import { todayDateOnlyUTC, toISODateOnlyUTC } from '../utils/dateHelpers';
import { generateUUID } from '../utils/generators';
import { safeUUID } from '../utils/uuid';
import { revalidateInstallment } from './payments/paymentPersistence';
import { parseMoney, roundMoney } from './payments/paymentUtils';
import { resolveCaixaLivreIdFromDB, resolveCaixaLivreIdFromMemory } from './payments/paymentWallets';
import {
  executeFinancialOperation,
  getStableFinancialRequestKey,
  clearStableFinancialRequestKey,
  type FinancialOperationType,
  type FinancialPaymentMethod,
  type FinancialOperationResult,
} from './payments/paymentEngineV4';

export const paymentsService = {
  async processPayment(params: {
    loan: Loan;
    inst: Installment;
    calculations: any;
    amountPaid: number;
    activeUser: UserProfile;
    sources: CapitalSource[];
    forgivenessMode?: 'NONE' | 'FINE_ONLY' | 'MORA_ONLY' | 'FINE_AND_MORA' | 'TOTAL_CHARGES' | 'CAPITAL_ONLY' | 'INTEREST_ONLY' | 'BOTH';
    lateFeeForgiven?: number;
    manualDate?: Date | null;
    realDate?: Date | null;
    capitalizeRemaining?: boolean;
    renewWithPending?: boolean;
    partialAction?: FinancialOperationType;
    paymentMethod?: FinancialPaymentMethod;
    expectedPreview?: FinancialOperationResult | null;
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
      lateFeeForgiven: requestedLateFeeForgiven = 0,
      realDate,
      manualDate,
      capitalizeRemaining = false,
      renewWithPending = false,
      paymentType: legacyPaymentType,
      avAmount: legacyAvAmount,
    } = params;

    if (!activeUser?.id) throw new Error('Usuário não autenticado. Refaça o login.');
    if (activeUser.id === 'DEMO') return { amountToPay: amountPaid || 0, paymentType: 'CUSTOM' };

    const ownerId = safeUUID((loan as any).profile_id) || safeUUID((activeUser as any).supervisor_id) || safeUUID(activeUser.id);
    if (!ownerId) throw new Error('Perfil inválido. Refaça o login.');

    const loanId = safeUUID((loan as any).id);
    const instId = safeUUID((inst as any).id);
    if (!loanId) throw new Error('Contrato inválido (loan.id).');
    if (!instId) throw new Error('Parcela inválida (inst.id).');

    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    const instDb = isOffline ? null : await revalidateInstallment(instId);
    const remainingDb = Number(instDb?.principal_remaining || 0) + Number(instDb?.interest_remaining || 0) + Number(instDb?.late_fee_accrued || 0);
    const idempotencyKey = generateUUID();

    if (legacyPaymentType === 'LEND_MORE') {
      const lendAmount = parseMoney(legacyAvAmount || '0');
      if (lendAmount <= 0) throw new Error('Valor do aporte inválido.');
      const sourceId = safeUUID((loan as any).sourceId);
      if (!sourceId) throw new Error('Fonte do contrato inválida (sourceId).');
      if (isOffline) throw new Error('Conecte-se à internet para registrar este aporte com segurança.');
      const stableRequest = getStableFinancialRequestKey(`capital-advance:${loanId}:${instId}:${sourceId}:${lendAmount.toFixed(2)}:LEND_MORE`);
      const { error } = await supabase.rpc('process_lend_more_atomic', { p_idempotency_key: stableRequest.idempotencyKey, p_loan_id: loanId, p_installment_id: instId, p_profile_id: ownerId, p_operator_id: safeUUID(activeUser.id), p_source_id: sourceId, p_amount: lendAmount, p_notes: `Novo empréstimo (+ R$ ${lendAmount.toFixed(2)})`, p_operation_type: 'LEND_MORE' });
      if (error) throw new Error(error.message);
      clearStableFinancialRequestKey(stableRequest.storageKey);
      return { amountToPay: lendAmount, paymentType: 'LEND_MORE' };
    }

    const amountToPay = Number(amountPaid || 0);
    if (!Number.isFinite(amountToPay) || amountToPay <= 0) throw new Error('O valor do pagamento deve ser maior que zero.');

    const paymentDate = realDate || todayDateOnlyUTC();
    const paymentDateStr = toISODateOnlyUTC(paymentDate);
    const dbIsActuallySettled = remainingDb <= ZERO_BALANCE_THRESHOLD;
    const offerStatus = String(instDb?.payment_offer_status || '').toUpperCase();
    const offerValidUntil = String(instDb?.payment_offer_valid_until || '').slice(0, 10);
    const offerAmount = roundMoney(Number(instDb?.payment_offer_amount || 0));
    const offerType = String(instDb?.payment_offer_type || 'SETTLEMENT').toUpperCase();
    const hasValidPaymentOffer = offerStatus === 'ACTIVE'
      && offerValidUntil >= toISODateOnlyUTC(todayDateOnlyUTC())
      && offerValidUntil >= paymentDateStr
      && offerAmount > ZERO_BALANCE_THRESHOLD;

    if (hasValidPaymentOffer && amountToPay > ZERO_BALANCE_THRESHOLD && amountToPay <= offerAmount + ZERO_BALANCE_THRESHOLD) {
      if (isOffline) throw new Error('Conecte-se à internet para registrar esta condição com segurança.');
      const sourceId = safeUUID((loan as any).sourceId);
      if (!sourceId) throw new Error('Fonte do contrato inválida (sourceId).');
      let offerCaixaLivreId = resolveCaixaLivreIdFromMemory(sources);
      if (!offerCaixaLivreId) offerCaixaLivreId = await resolveCaixaLivreIdFromDB(ownerId);
      const isPartialOfferPayment = amountToPay < offerAmount - ZERO_BALANCE_THRESHOLD;
      if (isPartialOfferPayment && offerType !== 'SETTLEMENT') throw new Error('Renovação por juros exige o valor completo da condição.');
      const offerRpc = isPartialOfferPayment ? 'process_installment_payment_offer_partial'
        : offerType === 'INTEREST_RENEWAL' ? 'process_interest_renewal_payment_offer' : 'process_installment_payment_offer';
      const { data: offerResult, error: offerError } = await supabase.rpc(offerRpc, { p_idempotency_key: idempotencyKey, p_loan_id: loanId, p_installment_id: instId, p_profile_id: ownerId, p_operator_id: safeUUID(activeUser.id), p_amount_paid: amountToPay, p_payment_date: paymentDateStr, p_source_id: sourceId, p_caixa_livre_id: safeUUID(offerCaixaLivreId) });
      if (offerError) throw new Error('Falha ao aplicar a condição especial: ' + offerError.message);
      return { amountToPay, paymentType: isPartialOfferPayment ? 'SPECIAL_OFFER_PARTIAL' : 'SPECIAL_OFFER', amortization: offerResult };
    }

    if (hasValidPaymentOffer) throw new Error(`A condição especial tem saldo de R$ ${offerAmount.toFixed(2).replace('.', ',')}. Informe valor positivo até esse saldo ou altere a condição explicitamente.`);

    if (!isOffline && dbIsActuallySettled) {
      return { amountToPay: 0, paymentType: 'ALREADY_PAID_SYNCED', amortization: { paidPrincipal: 0, paidInterest: 0, paidLateFee: 0, forgivenLateFee: 0, avGenerated: 0 } };
    }

    let caixaLivreId = resolveCaixaLivreIdFromMemory(sources);
    if (!caixaLivreId) {
      try { caixaLivreId = await resolveCaixaLivreIdFromDB(ownerId); } catch (e) { console.warn('Erro ao buscar Caixa Livre no DB:', e); }
    }
    if (isOffline) throw new Error('Conecte-se à internet para registrar este recebimento com segurança.');

    const operationType: FinancialOperationType = params.partialAction
      || (capitalizeRemaining ? 'CAPITALIZE' : renewWithPending ? 'RENEW_KEEP_PENDING' : 'KEEP_PENDING');
    const paymentMethod = params.paymentMethod
      || String((loan as any).preferredPaymentMethod || 'OTHER').toUpperCase() as FinancialPaymentMethod;
    const result = await executeFinancialOperation({
      loanId,
      installmentId: instId,
      operationType,
      amountReceived: amountToPay,
      paymentMethod,
      paymentDate: paymentDateStr,
      competenceDate: paymentDateStr,
      forgivenessMode,
      requestedLateFeeForgiven,
      manualDueDate: operationType === 'RENEW_KEEP_PENDING' && manualDate
        ? toISODateOnlyUTC(manualDate)
        : null,
      caixaLivreId: safeUUID(caixaLivreId),
      reason: operationType === 'SETTLE' ? 'Quitação por valor negociado confirmada pelo operador.' : null,
      expectedPreview: params.expectedPreview,
    });

    const afterTotal = Number((result.after as any)?.total || 0);
    const finalType = afterTotal <= ZERO_BALANCE_THRESHOLD
      ? 'FULL'
      : operationType === 'RENEW_KEEP_PENDING'
        ? 'PARTIAL_INTEREST'
        : Number(result.principal_paid || 0) > ZERO_BALANCE_THRESHOLD
          ? 'RENEW_AV'
          : 'RENEW_INTEREST';

    return {
      amountToPay,
      paymentType: finalType,
      amortization: {
        paidPrincipal: result.principal_paid,
        paidInterest: result.interest_paid,
        paidLateFee: result.late_fee_paid,
        forgivenLateFee: result.late_fee_forgiven,
        avGenerated: 0,
      },
      operation: result,
    };
  },
};

