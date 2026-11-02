import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { buildMonthlyBalances, localAccountingMonth, type FinancialMovement } from '../../domain/finance/monthlyBalance';

const PROFILE_A = '00000000-0000-4000-8000-000000000001';
const PROFILE_B = '00000000-0000-4000-8000-000000000002';
const row = (overrides: Partial<FinancialMovement> = {}): FinancialMovement => ({
  id: 'id-' + Math.random().toString(16).slice(2),
  profile_id: PROFILE_A,
  loan_id: 'loan-one',
  source_id: 'cash-source',
  date: '2026-10-23T18:00:00.000Z',
  type: 'PAYMENT_RECEIVED',
  category: 'PAGAMENTO',
  amount: 0,
  principal_delta: 0,
  interest_delta: 0,
  late_fee_delta: 0,
  ...overrides,
});

test('accounting calendar is pinned to Manaus, even across UTC midnight', () => {
  assert.equal(localAccountingMonth('2026-11-01T00:30:00.000Z'), '2026-10');
  assert.equal(localAccountingMonth('2026-11-01T04:30:00.000Z'), '2026-11');
  assert.equal(localAccountingMonth('nonsense'), null);
});

test('October received balance separates capital, profit, withdrawals and loans', () => {
  const rows = [
    row({id:'c1',amount:5998,principal_delta:5998}),
    row({id:'c2',type:'AGREEMENT_PAYMENT',amount:1510,principal_delta:1510}),
    row({id:'c3',type:'PAYMENT',amount:500,principal_delta:500}),
    row({id:'p1',category:'LUCRO',amount:3530,interest_delta:3530}),
    row({id:'r1',type:'REVERSAL',category:'ESTORNO',amount:-324,principal_delta:-324}),
    row({id:'w1',type:'PROFIT_WITHDRAWAL',amount:7008.69}),
    row({id:'l1',type:'LOAN_INITIAL',amount:3200}),
    row({id:'l2',type:'NOVO_APORTE',amount:144}),
    row({id:'a1',type:'ADJUSTMENT',category:'AUDIT',amount:0}),
  ];
  const [oct] = buildMonthlyBalances(rows,new Set(),PROFILE_A);
  assert.equal(oct.month,'2026-10');
  assert.equal(oct.principal,7684);
  assert.equal(oct.profit,3530);
  assert.equal(oct.totalReceived,11214);
  assert.equal(oct.withdrawal,7008.69);
  assert.equal(oct.lent,3344);
  assert.equal(oct.loss,0);
  assert.equal(oct.expense,0);
  assert.equal(oct.count,8);
});

test('separate payment legs sum once; repeated rows do not inflate revenue', () => {
  const records = [
    row({id:'principal-leg',amount:'46.35',principal_delta:'46.35',idempotency_key:'receipt'}),
    row({id:'profit-leg',category:'LUCRO',amount:'538.65',interest_delta:'538.65',idempotency_key:'receipt_lucro'}),
  ];
  const balances = buildMonthlyBalances([...records,records[0]],new Set(),PROFILE_A);
  assert.equal(balances[0].totalReceived,585);
  assert.equal(balances[0].count,2);
});

test('profile B never contaminates profile A, even when supplied in a mixed response', () => {
  const rows = [
    row({id:'own',amount:100,principal_delta:40,interest_delta:60}),
    row({id:'other',profile_id:PROFILE_B,amount:80000,principal_delta:80000}),
    row({id:'test',source_id:'test-wallet',amount:555,interest_delta:555}),
  ];
  const result = buildMonthlyBalances(rows,new Set(['test-wallet']),PROFILE_A);
  assert.equal(result.length,1);
  assert.equal(result[0].totalReceived,100);
  assert.equal(result[0].count,1);
  assert.equal(result[0].entries[0].id,'own');
});

test('future profit projections are not realized income; unclassified movements are disclosed', () => {
  const rows = [
    row({id:'capitalized-audit',type:'CAPITALIZATION',amount:1200}),
    row({id:'unknown',type:'MYSTERY_RECEIPT',amount:350}),
    row({id:'expense',type:'FINANCEIRO',category:'DESPESA',amount:-29.90}),
    row({id:'loss',type:'BAD_DEBT_WRITE_OFF',amount:80}),
  ];
  const result = buildMonthlyBalances(rows,new Set(),PROFILE_A)[0];
  assert.equal(result.totalReceived,0);
  assert.equal(result.unclassified,350);
  assert.equal(result.expense,29.90);
  assert.equal(result.loss,80);
});

test('personal report is queried by profile and guarded against cross-account rows', () => {
  const source = readFileSync('services/finance/monthlyBalance.service.ts','utf8');
  const ui = readFileSync('features/reports/pages/ReportsPage.tsx','utf8');
  const app = readFileSync('App.tsx','utf8');
  assert.match(source,/\.eq\('profile_id', id\)/);
  assert.match(source,/entry\.profile_id !== id/);
  assert.match(ui,/activeUser\?\.id === profileId/);
  assert.match(app,/profileId=\{activeProfileId \|\| ''\}/);
  assert.match(ui,/<MonthlyBalanceReport/);
});
