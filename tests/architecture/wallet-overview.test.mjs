import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const overview = readFileSync('features/wallet/pages/WalletOverviewPage.tsx','utf8');
const summary = readFileSync('features/wallet/components/WalletOverviewSummary.tsx','utf8');
const shell = readFileSync('layout/AppShell.tsx','utf8');
test('overview uses independent summary and the canonical wallet snapshot',()=>{
  assert.match(overview,/walletRepository\.loadOverview\(\)/);
  assert.match(overview,/calculateWalletBalance/);
  assert.match(overview,/getCreditSummary/);
  assert.match(overview,/lg:grid-cols-12/);
  assert.match(overview,/lg:col-span-6/);
  for(const label of ['Liquidez imediata','Cartões','Balanço do mês','Compromissos próximos']) assert.ok((overview+summary).includes(label),label);
  for(const route of ["onNavigate('contas')","onNavigate('cartoes')"]) assert.ok(summary.includes(route),route);
  assert.ok(overview.includes("go('dividas')"));
  assert.doesNotMatch(overview,/<BankStack/);
  assert.doesNotMatch(overview,/<PersonalWalletPage/);
  assert.match(overview,/addEventListener\('capitalflow:wallet-updated'/);
  assert.match(overview,/removeEventListener\('capitalflow:wallet-updated'/);
});
test('wallet navigation does not display global FAB overlay',()=>{
  assert.match(shell,/walletModuleRoute/);
  assert.match(shell,/!isSupportOpen && !walletModuleRoute/);
});
