import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { LoanStatus, type Installment, type Loan } from '../types';
import { calculatePaymentOfferPreview, isPaymentOfferActive } from './paymentOffers.service';
import { businessDateInManaus } from '../utils/businessDate';

// O motor conta o atraso pelo dia civil de Manaus; a referência do teste usa a mesma regra.
// (Com o relógio local, a suíte falhava entre 20h e 24h de Manaus em máquinas UTC.)
const localDueDate = (() => {
  const [year, month, day] = businessDateInManaus().split('-').map(Number);
  const due = new Date(Date.UTC(year, month - 1, day - 3));
  return due.toISOString().slice(0, 10);
})();

const installment = {
  id: 'installment',
  // Três dias de atraso: multa 2% + juros diários 1% × 3 = 5% de encargos.
  // Referência relativa evita que a suíte mude de resultado com o calendário.
  dueDate: localDueDate,
  amount: 1300,
  scheduledPrincipal: 1000,
  scheduledInterest: 300,
  principalRemaining: 1000,
  interestRemaining: 300,
  lateFeeAccrued: 20,
  paidTotal: 0,
  paidPrincipal: 0,
  paidInterest: 0,
  paidLateFee: 0,
  status: LoanStatus.PENDING,
} as Installment;

const loan = {
  id: 'loan',
  billingCycle: 'MONTHLY',
  principal: 1000,
  totalToReceive: 1300,
  interestRate: 30,
  finePercent: 2,
  dailyInterestPercent: 1,
  installments: [installment],
  status: LoanStatus.ATIVO,
} as Loan;

test('interest-renewal offer charges interest and fees without principal', () => {
  const preview = calculatePaymentOfferPreview(loan, installment, {
    offerType: 'INTEREST_RENEWAL',
    discountMode: 'NONE',
    discount: 0,
    waiveFine: false,
    waiveDailyInterest: false,
  });

  assert.equal(preview.finalAmount, 365);
  assert.equal(installment.principalRemaining, 1000);
});

test('interest-renewal offer can waive only the fine', () => {
  const fullCharges = calculatePaymentOfferPreview(loan, installment, {
    offerType: 'INTEREST_RENEWAL', discountMode: 'NONE', discount: 0,
    waiveFine: false, waiveDailyInterest: false,
  });
  const preview = calculatePaymentOfferPreview(loan, installment, {
    offerType: 'INTEREST_RENEWAL',
    discountMode: 'NONE',
    discount: 0,
    waiveFine: true,
    waiveDailyInterest: false,
  });

  assert.equal(preview.finalAmount, fullCharges.finalAmount - fullCharges.fine);
  assert.equal(preview.chargesForgiven, fullCharges.fine);
});

test('interest-renewal offer can waive only daily interest', () => {
  const fullCharges = calculatePaymentOfferPreview(loan, installment, {
    offerType: 'INTEREST_RENEWAL', discountMode: 'NONE', discount: 0,
    waiveFine: false, waiveDailyInterest: false,
  });
  const preview = calculatePaymentOfferPreview(loan, installment, {
    offerType: 'INTEREST_RENEWAL',
    discountMode: 'NONE',
    discount: 0,
    waiveFine: false,
    waiveDailyInterest: true,
  });

  assert.equal(preview.finalAmount, fullCharges.finalAmount - fullCharges.dailyInterest);
  assert.equal(preview.chargesForgiven, fullCharges.dailyInterest);
});

test('interest-renewal offer can waive both late charges', () => {
  const preview = calculatePaymentOfferPreview(loan, installment, {
    offerType: 'INTEREST_RENEWAL',
    discountMode: 'NONE',
    discount: 0,
    waiveFine: true,
    waiveDailyInterest: true,
  });

  assert.equal(preview.finalAmount, 300);
  assert.equal(preview.chargesForgiven, 65);
});

test('settlement offer continues to include the principal', () => {
  const preview = calculatePaymentOfferPreview(loan, installment, {
    offerType: 'SETTLEMENT',
    discountMode: 'NONE',
    discount: 0,
    waiveFine: false,
    waiveDailyInterest: false,
  });

  assert.equal(preview.finalAmount, 1365);
});

test('interest-renewal offer still includes overdue charges when current interest is zero', () => {
  const preview = calculatePaymentOfferPreview(loan, {
    ...installment,
    interestRemaining: 0,
    lateFeeAccrued: 0,
  }, {
    offerType: 'INTEREST_RENEWAL',
    discountMode: 'NONE',
    discount: 0,
    waiveFine: false,
    waiveDailyInterest: false,
  });

  assert.equal(preview.finalAmount, 65);
});

test('99% on settlement reduces the whole payable balance including unwaived late charges', () => {
  const preview = calculatePaymentOfferPreview(loan, installment, {
    offerType: 'SETTLEMENT', discountMode: 'PERCENT', discount: 99,
    waiveFine: false, waiveDailyInterest: false,
  });
  assert.equal(preview.originalAmount, 1365);
  assert.equal(preview.discountApplied, 1351.35);
  assert.equal(preview.finalAmount, 13.65);
});

test('99% after waiving late charges applies to the reduced payable amount, without duplicating waivers', () => {
  const preview = calculatePaymentOfferPreview(loan, installment, {
    offerType: 'SETTLEMENT', discountMode: 'PERCENT', discount: 99,
    waiveFine: true, waiveDailyInterest: true,
  });
  assert.equal(preview.chargesForgiven, 65);
  assert.equal(preview.discountApplied, 1287);
  assert.equal(preview.finalAmount, 13);
});

test('fixed settlement discount can reduce late charges without creating a negative offer', () => {
  const preview = calculatePaymentOfferPreview(loan, installment, {
    offerType: 'SETTLEMENT', discountMode: 'VALUE', discount: 1340,
    waiveFine: false, waiveDailyInterest: false,
  });
  assert.equal(preview.discountApplied, 1340);
  assert.equal(preview.finalAmount, 25);
});

test('renewal terms ignore additional settlement discounts', () => {
  const preview = calculatePaymentOfferPreview(loan, installment, {
    offerType: 'INTEREST_RENEWAL', discountMode: 'PERCENT', discount: 99,
    waiveFine: false, waiveDailyInterest: false,
  });
  assert.equal(preview.finalAmount, 365);
});

test('SQL implementation preserves ledger authorization and blocks unsafe partial reductions on charges', () => {
  const sql = readFileSync('supabase/migrations/20261102160000_payment_offer_total_settlement_discount.sql','utf8');
  const service = readFileSync('services/paymentOffers.service.ts','utf8');
  assert.match(service, /supabase\.rpc\('set_installment_payment_offer_v4'/);
  assert.match(sql, /public\.set_installment_payment_offer_v3\(/);
  assert.match(sql, /v_discount_late\s*:=/);
  assert.match(sql, /payment_offer_discount_applied=v_discount_base/);
  assert.match(sql, /payment_offer_late_fee_forgiven=round\(v_waived_late\+v_discount_late,2\)/);
  assert.match(sql, /discount_total/);
  assert.match(sql, /payment_offer_late_fee_forgiven,0\),0\)/);
  assert.match(sql, /exige o pagamento integral do valor combinado/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.set_installment_payment_offer_v4/);
});

test('prazo de condição respeita o dia civil de Manaus antes da virada UTC', () => {
  const utcBeforeLocalMidnight = new Date('2026-11-03T02:59:59Z');
  const localMidnight = new Date('2026-11-03T04:00:00Z');
  assert.equal(businessDateInManaus(utcBeforeLocalMidnight), '2026-11-02');
  assert.equal(businessDateInManaus(localMidnight), '2026-11-03');
  const offer = { paymentOfferStatus: 'ACTIVE', paymentOfferValidUntil: '2026-11-02', paymentOfferAmount: 13.65 };
  assert.equal(isPaymentOfferActive(offer, businessDateInManaus(utcBeforeLocalMidnight)), true);
  assert.equal(isPaymentOfferActive(offer, businessDateInManaus(localMidnight)), false);
});
test('validade da condição atravessa viradas de mês e ano sem confundir UTC', () => {
  assert.equal(businessDateInManaus(new Date('2027-01-01T01:00:00Z')), '2026-12-31');
  assert.equal(businessDateInManaus(new Date('2027-01-01T04:00:00Z')), '2027-01-01');
  assert.throws(() => businessDateInManaus(new Date('inválido')), /Data de referência inválida/);
});
test('interface e backend possuem uma única regra de data civil para condições', () => {
  const modal = readFileSync('components/cards/components/PaymentOfferModal.tsx', 'utf8');
  const service = readFileSync('services/paymentOffers.service.ts', 'utf8');
  const migration = readFileSync('supabase/migrations/20261103090000_payment_offer_manaus_business_date.sql','utf8');
  assert.match(modal, /const today = businessDateInManaus\(\)/);
  assert.match(service, /referenceDate = businessDateInManaus\(\)/);
  assert.match(migration, /America\/Manaus/);
  assert.match(migration, /pg_get_functiondef/);
  assert.match(migration, /definition_md5/);
});
