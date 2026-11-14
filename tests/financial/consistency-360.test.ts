import assert from 'node:assert/strict';
import test from 'node:test';
import { getCardInvoiceEntries, getEffectiveInvoiceCycles } from '../../components/wallet/invoiceStatementDomain';
import { rebuildLoanStateFromLedger, resolveForgivenLateFee } from '../../domain/finance/calculations';
import { calculateFlowDre } from '../../domain/finance/dre.calculations';
import { calculateDaily30 } from '../../domain/finance/modalities/daily30/daily30.calculations';
import { calculateDailyFixed } from '../../domain/finance/modalities/dailyFixed/dailyFixed.calculations';
import { renewDailyFixed } from '../../domain/finance/modalities/dailyFixed/dailyFixed.renewal';
import { calculateDailyFixedTerm } from '../../domain/finance/modalities/dailyFixedTerm/calculations';
import { renewDailyFixedTerm } from '../../domain/finance/modalities/dailyFixedTerm/renewal';
import { businessDateInManaus, shiftBusinessMonth } from '../../utils/businessDate';
import { parseStatementLines } from '../../utils/walletStatementPdf';

test('Pacote 1: businessDateInManaus e shiftBusinessMonth mantêm dia/mês civil após 20h em Manaus', () => {
  // 2026-11-12T23:30:00-04:00 == 2026-11-13T03:30:00Z
  const lateNightManaus = new Date('2026-11-13T03:30:00.000Z');
  assert.equal(businessDateInManaus(lateNightManaus), '2026-11-12');
  assert.deepEqual(shiftBusinessMonth('2026-01', -1), { key: '2025-12', month: 12, year: 2025 });
});

test('Pacote 2: renovação dailyFixed, dailyFixedTerm e rebuildLoanStateFromLedger conservam centavos e piso zero', () => {
  const loan: any = {
    id: 'l1',
    startDate: '2026-10-01',
    interestRate: 10,
    principal: 1000,
    installments: [],
  };
  const inst: any = {
    id: 'i1',
    dueDate: '2026-10-31',
    principalRemaining: 333.33,
    interestRemaining: 33.33,
    scheduledPrincipal: 333.33,
    scheduledInterest: 33.33,
    paidPrincipal: 0,
    paidInterest: 0,
    paidLateFee: 0,
    paidTotal: 0,
  };

  const renewedFixed = renewDailyFixed(loan, inst, 100, { paidPrincipal: 100, paidInterest: 0, paidLateFee: 0, avGenerated: 0 }, new Date(2026, 10, 1));
  assert.equal(renewedFixed.newPrincipalRemaining, 233.33);
  assert.equal(renewedFixed.newAmount, Math.round((renewedFixed.newPrincipalRemaining + renewedFixed.newInterestRemaining) * 100) / 100);

  const renewedTerm = renewDailyFixedTerm(loan, inst, 100, { paidPrincipal: 0, paidInterest: 0, paidLateFee: 0, avGenerated: 0 }, new Date(2026, 10, 1), false);
  const reducedTotal = Math.round(((333.33 - renewedTerm.newPrincipalRemaining) + (33.33 - renewedTerm.newInterestRemaining)) * 100);
  assert.equal(reducedTotal, 10000);

  const rebuilt = rebuildLoanStateFromLedger({
    ...loan,
    installments: [{ id: 'i1', dueDate: '2026-10-31', scheduledPrincipal: 100, scheduledInterest: 10, principalRemaining: 100, interestRemaining: 10, amount: 110 }],
    ledger: [{ id: 't1', date: '2026-10-10', type: 'PAYMENT_FULL', amount: 50, principalDelta: 0, interestDelta: 50, lateFeeDelta: 0, installmentId: 'i1' }],
  });
  assert.equal(rebuilt.installments[0]?.interestRemaining, 0);
});

test('Pacote 3: modalidades expõem finePart/moraPart, perdão seletivo funciona e DRE inclui estornos/aportes', () => {
  const policy: any = { finePercent: 2, dailyInterestPercent: 1, interestRate: 10 };
  const loan: any = { id: 'l1', startDate: '2026-09-01', interestRate: 10, billingCycle: 'DAILY_FIXED' };
  const inst: any = { id: 'i1', dueDate: '2026-10-01', principalRemaining: 1000, interestRemaining: 100 };

  const df = calculateDailyFixed(loan, inst, policy, '2026-10-06');
  assert.equal(df.interest, 100);
  assert.ok((df.finePart || 0) > 0);
  assert.ok((df.moraPart || 0) > 0);
  assert.equal(df.lateFee, Math.round(((df.finePart || 0) + (df.moraPart || 0)) * 100) / 100);
  assert.equal(resolveForgivenLateFee(df, 'FINE_ONLY').forgivenLateFee, df.finePart);
  assert.equal(resolveForgivenLateFee(df, 'MORA_ONLY').forgivenLateFee, df.moraPart);

  const d30 = calculateDaily30(loan, inst, policy, '2026-10-06');
  assert.ok((d30.finePart || 0) > 0 && (d30.moraPart || 0) > 0);

  const dft = calculateDailyFixedTerm(loan, inst, policy, '2026-10-06');
  assert.ok((dft.finePart || 0) > 0 && (dft.moraPart || 0) > 0);

  const dre = calculateFlowDre([
    { id: '1', date: '2026-10-01', type: 'NEW_LOAN', amount: 1000 } as any,
    { id: '2', date: '2026-10-10', type: 'PAYMENT_FULL', amount: 1100, principalDelta: 1000, interestDelta: 100, lateFeeDelta: 0 } as any,
    { id: '3', date: '2026-10-11', type: 'ESTORNO', amount: 100, principalDelta: 0, interestDelta: -50, lateFeeDelta: 0 } as any,
  ]);
  assert.equal(dre.investment, 1000);
  assert.equal(dre.interestReceived, 50);
  assert.equal(dre.principalRecovered, 1000);
  assert.equal(dre.netResult, 50);
});

test('Pacote 3: getEffectiveInvoiceCycles e getCardInvoiceEntries mantêm consistência com invoice_due_month', () => {
  const expenses: any[] = [{
    id: 'e1',
    card_id: 'c1',
    status: 'CONFIRMED',
    entry_type: 'PURCHASE',
    expense_date: '2026-10-05',
    invoice_due_month: '2026-11-01',
    description: 'Compra teste',
    total_amount: 300,
    installments_count: 1,
  }];
  const installments: any[] = [{
    id: 'inst1',
    expense_id: 'e1',
    installment_number: 1,
    due_month: '2026-10-01',
    amount: 300,
    paid_amount: 0,
    status: 'PENDING',
  }];

  const cycles = getEffectiveInvoiceCycles('c1', expenses, installments);
  const entries = getCardInvoiceEntries('c1', '2026-11-01', expenses, installments);
  assert.equal(cycles.length, 1);
  assert.equal(cycles[0]?.dueMonth, '2026-11-01');
  assert.equal(cycles[0]?.amount, 300);
  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.installment.amount, 300);
});

test('Pacote 4: parseStatementLines não inverte Pagamento recebido nem Estorno de compra em conta bancária', () => {
  const parsed = parseStatementLines(
    [
      { key: 'l1', text: '10/11/2026 Pagamento recebido PIX 250,00' },
      { key: 'l2', text: '11/11/2026 Estorno de compra Loja X 80,00' },
      { key: 'l3', text: '12/11/2026 Compra Supermercado 120,00' },
    ],
    'ACCOUNT',
  );
  assert.equal(parsed.rows.length, 3);
  assert.equal(parsed.rows[0]?.amount, 250);
  assert.equal(parsed.rows[1]?.amount, 80);
  assert.equal(parsed.rows[2]?.amount, -120);
});
