import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const overview = readFileSync('features/wallet/pages/WalletOverviewPage.tsx', 'utf8');
const payables = readFileSync('components/wallet/WalletPayablesPanel.tsx', 'utf8');
const obligations = readFileSync('components/wallet/RecurringObligationsPanel.tsx', 'utf8');

test('visão geral apresenta a fórmula sem duplicar auditoria e sem códigos internos', () => {
  assert.doesNotMatch(overview, /\\.state\\}\\s*·\\s*\\{balance\\.facts/);
  assert.doesNotMatch(overview, /\\(WalletBalanceFacts\\)/);
  assert.match(overview,/Como chegamos à projeção/);
  assert.match(overview,/Saldo disponível em contas hoje/);
  assert.match(overview,/Receitas recorrentes ainda não recebidas/);
  assert.match(overview,/Faturas com vencimento neste mês/);
  assert.match(overview,/Dívidas e contas pendentes do mês/);
  assert.match(overview,/!privacyHidden && <section/);
  assert.doesNotMatch(overview,/<details className="group mt-3/);
  assert.doesNotMatch(overview,/describeWalletBalanceFact\\(balance\\.facts\\./);
  assert.match(overview,/PrivateMoney value=\\{money\\(balance\\.projectedBalance\\)\\}/);
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
