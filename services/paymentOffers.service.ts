import { supabase } from '../lib/supabase';
import type { Installment, Loan } from '../types';
import { calculateTotalDue } from '../domain/finance/calculations';

export interface PaymentOfferInput {
  offerType: 'SETTLEMENT' | 'INTEREST_RENEWAL';
  agreedDate: string;
  validUntil: string;
  discountMode: 'NONE' | 'PERCENT' | 'VALUE';
  discount: number;
  waiveFine: boolean;
  waiveDailyInterest: boolean;
  note?: string;
}

export interface PaymentOfferHistoryItem {
  id: string;
  action: string;
  offerType?: string | null;
  grossAmount: number;
  offeredAmount: number;
  discountApplied: number;
  lateFeeForgiven: number;
  validUntil?: string | null;
  note?: string | null;
  createdAt: string;
}

const todayKey = () => new Date().toISOString().slice(0, 10);

export const isPaymentOfferActive = (installment: Installment | any, referenceDate = todayKey()) =>
  String(installment?.paymentOfferStatus ?? installment?.payment_offer_status ?? '').toUpperCase() === 'ACTIVE'
  && String(installment?.paymentOfferValidUntil ?? installment?.payment_offer_valid_until ?? '') >= referenceDate
  && Number(installment?.paymentOfferAmount ?? installment?.payment_offer_amount ?? 0) > 0.05;

export const paymentOffersService = {
  async save(loan: Loan, installment: Installment, input: PaymentOfferInput) {
    const discount = Number(input.discount || 0);
    const { data, error } = await supabase.rpc('set_installment_payment_offer_v3', {
      p_loan_id: loan.id,
      p_installment_id: installment.id,
      p_agreed_date: input.agreedDate,
      p_valid_until: input.validUntil,
      p_discount_percent: input.discountMode === 'PERCENT' ? discount : 0,
      p_discount_value: input.discountMode === 'VALUE' ? discount : 0,
      p_waive_fine: input.waiveFine,
      p_waive_daily_interest: input.waiveDailyInterest,
      p_note: input.note?.trim() || null,
      p_offer_type: input.offerType,
    });

    if (error) throw new Error(error.message || 'Falha ao salvar condição especial.');
    return data;
  },

  async cancel(loan: Loan, installment: Installment, reason?: string) {
    const { data, error } = await supabase.rpc('cancel_installment_payment_offer', {
      p_loan_id: loan.id,
      p_installment_id: installment.id,
      p_reason: reason?.trim() || null,
    });

    if (error) throw new Error(error.message || 'Falha ao cancelar condição especial.');
    return data;
  },

  async history(installmentId: string): Promise<PaymentOfferHistoryItem[]> {
    const { data, error } = await supabase
      .from('installment_payment_offer_history')
      .select('id, action, offer_type, gross_amount, offered_amount, discount_applied, late_fee_forgiven, valid_until, note, created_at')
      .eq('installment_id', installmentId)
      .order('created_at', { ascending: false })
      .limit(12);

    if (error) throw new Error(error.message || 'Falha ao carregar historico da condicao.');

    return (data || []).map((row: any) => ({
      id: String(row.id),
      action: String(row.action || ''),
      offerType: row.offer_type,
      grossAmount: Number(row.gross_amount || 0),
      offeredAmount: Number(row.offered_amount || 0),
      discountApplied: Number(row.discount_applied || 0),
      lateFeeForgiven: Number(row.late_fee_forgiven || 0),
      validUntil: row.valid_until,
      note: row.note,
      createdAt: row.created_at,
    }));
  },
};

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export const calculatePaymentOfferPreview = (
  loan: Loan,
  installment: Installment,
  input: Pick<PaymentOfferInput, 'offerType' | 'discountMode' | 'discount' | 'waiveFine' | 'waiveDailyInterest'>
) => {
  const base = roundMoney(
    Math.max(0, Number(installment.principalRemaining || 0))
    + Math.max(0, Number(installment.interestRemaining || 0))
  );
  const debt = calculateTotalDue(loan, installment);
  const calculatedFine = roundMoney(Math.max(0, Number(debt.finePart || 0)));
  const calculatedDailyInterest = roundMoney(Math.max(0, Number(debt.moraPart || 0)));
  const calculatedLateCharges = roundMoney(calculatedFine + calculatedDailyInterest);
  const lateCharges = roundMoney(Math.max(
    calculatedLateCharges,
    Math.max(0, Number(installment.lateFeeAccrued || 0))
  ));
  const fine = calculatedLateCharges > 0
    ? roundMoney(lateCharges * calculatedFine / calculatedLateCharges)
    : lateCharges > 0 && Number(loan.finePercent || 0) > 0 ? lateCharges : 0;
  const dailyInterest = roundMoney(lateCharges - fine);
  const fineForgiven = input.waiveFine ? fine : 0;
  const dailyInterestForgiven = input.waiveDailyInterest ? dailyInterest : 0;
  const subtotal = roundMoney(base + lateCharges - fineForgiven - dailyInterestForgiven);
  const renewalSubtotal = roundMoney(
    Math.max(0, Number(installment.interestRemaining || 0))
    + lateCharges - fineForgiven - dailyInterestForgiven
  );
  const requestedDiscount = input.discountMode === 'PERCENT'
    ? subtotal * (Math.max(0, Number(input.discount || 0)) / 100)
    : input.discountMode === 'VALUE' ? Math.max(0, Number(input.discount || 0)) : 0;
  const discountApplied = roundMoney(Math.min(base, requestedDiscount));

  return {
    base,
    fine,
    dailyInterest,
    originalAmount: roundMoney(base + lateCharges),
    chargesForgiven: roundMoney(fineForgiven + dailyInterestForgiven),
    discountApplied,
    finalAmount: input.offerType === 'INTEREST_RENEWAL'
      ? renewalSubtotal
      : roundMoney(Math.max(0, subtotal - discountApplied)),
  };
};
