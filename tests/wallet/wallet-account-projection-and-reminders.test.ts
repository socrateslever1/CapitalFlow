import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateAccountProjections, calculateWalletBalance } from '../../components/wallet/walletBalanceDomain';
import { buildInvoiceReminders } from '../../features/wallet/utils/invoiceReminders';

// Dados fictícios.
const accounts = [
  { id: 'a1', nickname: 'Conta A', balance: 1000 },
  { id: 'a2', nickname: 'Conta B', balance: 200 },
] as never[];
const recurringIncomes = [
  { id: 'r1', active: true, amount: 500, destination_account_id: 'a1' },
  { id: 'r2', active: true, amount: 300, destination_account_id: 'a2' },
] as never[];
const payables = [
  { id: 'p1', status: 'PENDING', due_date: '2026-11-20', outstanding_balance: 150, origin_account_id: 'a1' },
  { id: 'p2', status: 'PENDING', due_date: '2026-11-25', outstanding_balance: 40, origin_account_id: null },
  { id: 'p3', status: 'PENDING', due_date: '2026-12-25', outstanding_balance: 999, origin_account_id: 'a1' },
] as never[];
const pendingOperations = [
  { id: 'o1', account_id: 'a2', direction: 'IN', amount: 100, posted_amount: 30, expected_date: '2026-11-28', status: 'PENDING' },
  { id: 'o2', account_id: 'a1', direction: 'OUT', amount: 60, posted_amount: 0, expected_date: '2026-11-10', status: 'PENDING' },
  { id: 'o3', account_id: 'a1', direction: 'OUT', amount: 70, posted_amount: 0, expected_date: '2026-12-02', status: 'PENDING' },
  { id: 'o4', account_id: 'a1', direction: 'OUT', amount: 80, posted_amount: 0, expected_date: '2026-11-02', status: 'CANCELED' },
] as never[];

test('saldo previsto por conta soma linha a linha e bate com o total do balanço', () => {
  const received = new Set(['r2']);
  const projections = calculateAccountProjections({
    accounts, recurringIncomes, receivedIncomeIds: received, payables,
    invoices: [{ accountId: 'a2', amount: 120 }, { accountId: null, amount: 10 }],
    pendingOperations, month: '2026-11',
  });
  const byName = Object.fromEntries(projections.map(p => [p.name, p]));
  // A: 1000 + 500 (receita) − 60 (saída pendente do mês) − 150 (conta a pagar) = 1290
  assert.equal(byName['Conta A'].projected, 1290);
  // B: 200 + 70 (restante da entrada pendente) − 120 (fatura) = 150; receita r2 já recebida
  assert.equal(byName['Conta B'].projected, 150);
  // Sem conta: −40 (conta a pagar) −10 (fatura) = −50
  assert.equal(byName['Sem conta definida'].projected, -50);
  for (const item of projections) {
    assert.equal(item.projected, Math.round((item.balance + item.lines.reduce((s, l) => s + l.amount, 0)) * 100) / 100);
  }
  const total = calculateWalletBalance({
    accounts, recurringIncomes, receivedIncomeIds: received, payables,
    openCardInvoices: 130, pendingOperations, month: '2026-11',
  });
  const sum = projections.reduce((s, p) => s + p.projected, 0);
  assert.equal(Math.round(sum * 100) / 100, Math.round(total.projectedBalance * 100) / 100);
});

test('pendentes não mudam o saldo atual; sem pendentes o total fica igual ao de antes', () => {
  const base = { accounts, recurringIncomes: [], receivedIncomeIds: new Set<string>(), payables: [], openCardInvoices: 0, month: '2026-11' };
  assert.equal(calculateWalletBalance(base).projectedBalance, 1200);
  const withPending = calculateWalletBalance({ ...base, pendingOperations });
  assert.equal(withPending.accountBalance, 1200);
  assert.equal(withPending.projectedBalance, 1200 + 70 - 60);
});

test('lembretes: fecha e vence em até 3 dias, sem valores no texto; cartão cancelado fica de fora', () => {
  const cards = [
    { id: 'c1', nickname: 'Cartão X', closing_day: 28, due_day: 5, status: 'ACTIVE' },
    { id: 'c2', nickname: 'Cartão Y', closing_day: 20, due_day: 27, status: 'ACTIVE' },
    { id: 'c3', nickname: 'Cartão Z', closing_day: 28, due_day: 5, status: 'CANCELED' },
  ] as never[];
  const reminders = buildInvoiceReminders(cards, '2026-11-26');
  const texts = reminders.map(r => r.text);
  assert.ok(texts.some(t => t.startsWith('Cartão X: fatura fecha em 2 dias (28/11)')), texts.join(' | '));
  assert.ok(texts.some(t => t.startsWith('Cartão Y: fatura vence amanhã (27/11)')), texts.join(' | '));
  assert.ok(!texts.some(t => t.includes('Cartão Z')));
  assert.ok(texts.every(t => !/R\$/.test(t)));
  assert.equal(new Set(reminders.map(r => r.key)).size, reminders.length);
});

test('compromissos dos próximos 30 dias entram mesmo vencendo no mês seguinte', () => {
  const base = { accounts, recurringIncomes: [], receivedIncomeIds: new Set<string>(), openCardInvoices: 0, month: '2026-11' };
  const payables = [{ id: 'x', status: 'PENDING', due_date: '2026-12-05', outstanding_balance: 100, origin_account_id: 'a1' }] as never[];
  assert.equal(calculateWalletBalance({ ...base, payables }).projectedBalance, 1200, 'sem horizonte: só o mês atual');
  assert.equal(calculateWalletBalance({ ...base, payables, horizonDate: '2026-12-26' }).projectedBalance, 1100);
  assert.equal(calculateWalletBalance({ ...base, payables, horizonDate: '2026-12-01' }).projectedBalance, 1200, 'fora do horizonte');
});
