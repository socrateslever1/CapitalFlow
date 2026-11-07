import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const overview = readFileSync('features/wallet/pages/WalletOverviewPage.tsx', 'utf8');
const payables = readFileSync('components/wallet/WalletPayablesPanel.tsx', 'utf8');
const obligations = readFileSync('components/wallet/RecurringObligationsPanel.tsx', 'utf8');

test('visão geral apresenta estado e origem do balanço em português, sem códigos internos', () => {
  assert.doesNotMatch(overview, /\.state\}\s*·\s*\{balance\.facts/);
  assert.doesNotMatch(overview, /\(WalletBalanceFacts\)/);
  for (const key of ['effective', 'projected', 'pending']) {
    assert.match(overview, new RegExp(`describeWalletBalanceFact\\(balance\\.facts\\.${key}\\)`));
  }
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
