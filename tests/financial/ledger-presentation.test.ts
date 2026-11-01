import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import type { LedgerEntry, Loan } from '../../types';
import { getReceiptInstallmentBreakdown } from '../../utils/receiptInstallmentBreakdown';
import {
  canReverseLedgerEntry, formatLedgerTime, getLedgerDayKey,
  getLedgerDisplayEvents, getLedgerReversalIndex, isLedgerReversal
} from '../../utils/ledgerPresentation';

const uuid1 = '11111111-1111-4111-8111-111111111111';
const uuid2 = '22222222-2222-4222-8222-222222222222';
const uuid3 = '33333333-3333-4333-8333-333333333333';
const e = (id: string, opts: Partial<LedgerEntry> = {}): LedgerEntry => ({
  id, date: '2026-10-29T00:00:00+00:00', createdAt: '2026-10-29T19:00:00Z',
  type: 'PAYMENT', category: 'PAGAMENTO', amount: 100,
  principalDelta: 100, interestDelta: 0, lateFeeDelta: 0, ...opts
});

test('chronological ledger uses accounting date then timestamp and is independent from input order', () => {
  const rows = [
    e('one', { date: '2026-09-16T00:00:00Z' }),
    e('two', { date: '2026-10-29T00:00:00Z', createdAt: '2026-10-29T20:10:00Z' }),
    e('three', { date: '2026-10-29T00:00:00Z', createdAt: '2026-10-29T15:30:00Z' })
  ];
  assert.deepEqual(getLedgerDisplayEvents(rows).map(v => v.id), ['two', 'three', 'one']);
});

test('same-day different payments never merge without a shared persisted event key', () => {
  const a = e('a', { amount: 130, principalDelta: 130 });
  const b = e('b', { amount: 130, principalDelta: 130 });
  assert.equal(getLedgerDisplayEvents([a, b]).length, 2);
});

test('split principal/profit receipt merges once only with the same persisted event key', () => {
  const p = e('p', { amount: 80, principalDelta: 80, idempotencyKey: uuid1 });
  const interest = e('interest', {
    category: 'LUCRO', amount: 20, principalDelta: 0,
    interestDelta: 20, idempotencyKey: uuid1 + '_lucro'
  });
  const grouped = getLedgerDisplayEvents([interest, p]);
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].amount, 100);
  assert.equal(grouped[0].principalDelta, 80);
  assert.equal(grouped[0].interestDelta, 20);
});

test('agreement receipt requires exact atomic identifiers before reversal is offered', () => {
  const recent = e('agreement', {
    type: 'AGREEMENT_PAYMENT',
    idempotencyKey: uuid1,
    meta: { agreement_id: uuid2, agreement_installment_id: uuid3, payment_group_id: uuid1 }
  });
  assert.equal(canReverseLedgerEntry(recent, new Set(), new Set()), true);
  assert.equal(canReverseLedgerEntry({ ...recent, meta: { agreement_id: uuid2 } }, new Set(), new Set()), false);
  assert.equal(canReverseLedgerEntry({ ...recent, idempotencyKey: null }, new Set(), new Set()), false);
  assert.equal(canReverseLedgerEntry({ ...recent, amount: -100 }, new Set(), new Set()), false);
  const reversal = e('reversal', {
    type: 'AGREEMENT_PAYMENT_REVERSED', amount: -100,
    reversedOfTransactionId: recent.id, category: 'ESTORNO'
  });
  const index = getLedgerReversalIndex([recent, reversal]);
  assert.equal(isLedgerReversal(reversal), true);
  assert.equal(canReverseLedgerEntry(recent, index.reversedIds, index.reversedKeys), false);
});

test('accounting midnight does not show fabricated time or shift dates on Android', () => {
  const payment = e('midnight');
  assert.equal(formatLedgerTime(payment), null);
  assert.equal(getLedgerDayKey(payment), '2026-10-29');
  assert.equal(formatLedgerTime(e('clock', { date: '2026-10-29T15:20:00Z' })) !== null, true);
});

test('archiving is reversible and never pays capital back to wallet implicitly', () => {
  const controller = readFileSync('hooks/controllers/useLoanController.ts', 'utf8');
  const actions = readFileSync('services/ledger/ledgerActions.ts', 'utf8');
  const footer = readFileSync('components/cards/LoanCardComposition/Footer.tsx', 'utf8');
  assert(controller.includes('ui.setRefundChecked(false)'));
  assert(!actions.includes("refundChecked && loan && loan.sourceId && type === 'ARCHIVE'"), 'archive must not credit principal');
  assert(footer.includes('hasFinancialHistory'));
  assert(footer.includes('Arquivar (recuperável)'));
  assert(footer.includes('Exclusão definitiva bloqueada'));
});

test('agreement reverse checks the precise group before calling the existing atomic RPC', () => {
  const code = readFileSync('services/ledger/ledgerReverse.ts', 'utf8');
  assert(code.includes("String(latest.payment_group_id) !== requestedGroup"));
  assert(code.includes("getPaymentGroupKey({ idempotencyKey: String(latest.idempotency_key"));
  assert(code.includes("supabase.rpc('reverse_agreement_payment_atomic'"));
  assert(!code.includes("supabase.from('acordo_pagamentos').update"));
});

const agreementId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const installment3 = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const installment4 = 'cccccccc-cccc-4ccc-cccc-cccccccccccc';
const installment5 = 'dddddddd-dddd-4ddd-dddd-dddddddddddd';
const testLoan = {
  activeAgreement: {
    id: agreementId,
    installments: [
      { id: installment3, number: 3, amount: 400 },
      { id: installment4, number: 4, amount: 400 },
      { id: installment5, number: 5, amount: 400 }
    ]
  },
  installments: [{ id: uuid3, number: 2, amount: 600 }]
} as unknown as Loan;

test('agreement receipt itemizes R$ 500 between installments 4 and 5', () => {
  const payment = e('split', {
    type: 'AGREEMENT_PAYMENT', amount: 500,
    meta: {
      agreement_id: agreementId,
      agreement_installment_id: installment4,
      allocations: [
        { installment_id: installment4, installment_number: 4, principal: 400, late_fee: 0 },
        { installment_id: installment5, installment_number: 5, principal: 100, late_fee: 0 }
      ]
    }
  });
  assert.deepEqual(getReceiptInstallmentBreakdown(payment, testLoan), {
    allocations: [
      { installmentId: installment4, number: 4, amount: 400, scheduledAmount: 400, coverage: 'INTEGRAL' },
      { installmentId: installment5, number: 5, amount: 100, scheduledAmount: 400, coverage: 'PARCIAL' }
    ],
    unidentifiedAmount: 0
  });
});

test('historical agreement receipt resolves exact installment id, not payment order', () => {
  const payment = e('old', {
    type: 'AGREEMENT_PAYMENT', amount: 300,
    meta: { agreement_id: agreementId, agreement_installment_id: installment3 },
    notes: 'Pagamento da parcela 99 do acordo de renegociação.'
  });
  assert.deepEqual(getReceiptInstallmentBreakdown(payment, testLoan), {
    allocations: [
      { installmentId: installment3, number: 3, amount: 300, scheduledAmount: 400, coverage: 'PARCIAL' }
    ],
    unidentifiedAmount: 0
  });
});

test('normal installment receipts are attributed only by persisted installment IDs', () => {
  const identified = getReceiptInstallmentBreakdown(e('p', {
    type: 'PAYMENT', amount: 200, installmentId: uuid3
  }), testLoan);
  assert.equal(identified.allocations[0]?.number, 2);
  assert.equal(identified.allocations[0]?.coverage, 'PARCIAL');
  assert.equal(identified.unidentifiedAmount, 0);
  const unidentified = getReceiptInstallmentBreakdown(e('p', {
    type: 'PAYMENT', amount: 200, notes: 'Pagamento da parcela 2'
  }), testLoan);
  assert.deepEqual(unidentified.allocations, []);
  assert.equal(unidentified.unidentifiedAmount, 200);
});

test('contradictory persisted allocation does not show fictitious attribution', () => {
  const result = getReceiptInstallmentBreakdown(e('bad', {
    type: 'AGREEMENT_PAYMENT', amount: 100,
    meta: { agreement_id: agreementId, allocations: [
      { installment_id: installment4, installment_number: 4, principal: 100 },
      { installment_id: installment5, installment_number: 5, principal: 100 }
    ] }
  }), testLoan);
  assert.deepEqual(result.allocations, []);
  assert.equal(result.unidentifiedAmount, 100);
});
