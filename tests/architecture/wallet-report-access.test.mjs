import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(path, 'utf8');

test('relatório da Carteira é acessível sem ampliar as cinco abas ou duplicar o FAB', () => {
  const routes = read('features/wallet/routes.tsx');
  const wallet = read('features/wallet/WalletModule.tsx');
  const report = read('features/wallet/pages/WalletReportPage.tsx');
  const guide = read('features/wallet/components/WalletSpendingGuide.tsx');
  assert.match(routes, /segment === 'relatorio'/);
  assert.match(routes, /route === 'relatorio'/);
  assert.match(guide, /onNavigate\('relatorio'\)/);
  assert.match(guide, /Abrir relatório da Carteira/);
  assert.match(report, /walletRepository\.loadOverview/);
  assert.match(report, /deriveOverview\(snapshot, today\)/);
  assert.match(report, /Despesas por categoria/);
  assert.match(report, /Projeção após compromissos cadastrados/);
  assert.match(report, /<PrivateMoney /);
  assert.match(wallet, /<WalletExpenseFab \/>/);
  assert.match(wallet, /grid-cols-5/);
  assert.doesNotMatch(report, /supabase\.(from|rpc)\(/);
});

test('a interface permite consultar todas as fontes e traduz os códigos internos', () => {
  const links=read('features/wallet/components/WalletCapitalLinks.tsx');
  const accounts=read('features/wallet/pages/WalletAccountsPage.tsx');
  const detail=read('components/wallet/AccountDetailsPage.tsx');
  assert.match(links, /getAccountCapitalSourceChoices/);
  assert.match(links, /disabled=\{!selectable\}/);
  assert.match(links, /!choice\?\.selectable/);
  assert.match(accounts, /describeWalletBalanceFact\(balanceFacts\.effective\)/);
  assert.match(detail, /describeWalletBalanceFact\(accountBalanceFacts\.effective\)/);
  assert.doesNotMatch(accounts, /\{balanceFacts\.effective\.state\}/);
});

test('Flux permanece pequeno em aparelhos móveis', () => {
  const component = read('components/ai/MasterMascot.tsx');
  assert.match(component, /grid h-11 w-11/);
  assert.match(component, /className="h-6 w-6"/);
});
