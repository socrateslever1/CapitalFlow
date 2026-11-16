import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const overview = readFileSync('features/wallet/pages/WalletOverviewPage.tsx', 'utf8');
const report = readFileSync('features/wallet/pages/WalletReportPage.tsx', 'utf8');
const payables = readFileSync('components/wallet/WalletPayablesPanel.tsx', 'utf8');
const obligations = readFileSync('components/wallet/RecurringObligationsPanel.tsx', 'utf8');

test('visão geral e relatório explicam o balanço em português sem números duplicados', () => {
  assert.ok(overview.includes('Sobra prevista após compromissos'));
  assert.ok(report.includes('Como calculamos a sobra prevista'));
  assert.ok(overview.includes('Recursos do mês'));
  assert.ok(overview.includes('Compromissos do mês'));
  assert.ok(overview.includes('PrivateMoney value={money(balance.projectedBalance)}'));
  assert.ok(!overview.includes('<details className="group mt-3'));
  assert.ok(!overview.includes('describeWalletBalanceFact(balance.facts.'));
  assert.ok(!overview.includes('(WalletBalanceFacts)'));
});

test('contas a pagar ocultam total e valor a distribuir no modo privacidade', () => {
  assert.match(payables, /Total <PrivateMoney value=\{formatMoney\(p\.total_amount\)\} \/>/);
  assert.match(payables, /Falta distribuir <PrivateMoney value=\{formatMoney\(splitRemaining\)\} \/>/);
  assert.doesNotMatch(payables, /'Total '\+formatMoney/);
});

test('vencimento de conta a pagar é exibido em dd/mm/aaaa', () => {
  assert.doesNotMatch(payables, /Venc\. \{p\.due_date\|\|/);
  assert.match(payables, /Venc\. \{p\.due_date\?String\(p\.due_date\)\.slice\(0,10\)\.split\('-'\)\.reverse\(\)\.join\('\/'\)/);
});

test('despesas recorrentes ocultam valores no modo privacidade', () => {
  assert.match(obligations, /<PrivateMoney value=\{formatMoney\(monthly\)\} \/>/);
  assert.match(obligations, /<PrivateMoney value=\{formatMoney\(item\.amount\)\} \/>/);
});
