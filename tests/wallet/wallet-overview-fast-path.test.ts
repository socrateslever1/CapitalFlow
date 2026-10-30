import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WalletSpendingGuide } from '../../features/wallet/components/WalletSpendingGuide';
import { getWalletSpendingOverview } from '../../features/wallet/domain/walletSpendingInsights';

test('overview fetches eight finance data sources without fetching the whole ledger snapshot', () => {
  const service = readFileSync('services/personalWallet.service.ts','utf8');
  const repository = readFileSync('features/wallet/services/walletRepository.ts','utf8');
  const overview = readFileSync('features/wallet/pages/WalletOverviewPage.tsx','utf8');
  const start = service.indexOf('  async loadOverview()');
  const end = service.indexOf('  async load() {', start);
  assert(start >= 0 && end > start);
  const query = service.slice(start, end);
  const expected = [
    'personal_wallet_accounts','personal_wallet_cards','personal_wallet_expenses',
    'personal_wallet_expense_installments','personal_wallet_invoice_payments',
    'personal_wallet_payables','personal_wallet_recurring_incomes','personal_wallet_recurring_receipts',
  ];
  for (const table of expected) assert(query.includes("from('" + table + "')"), table);
  assert.equal((query.match(/supabase\.from\('/g) ?? []).length, 8);
  for (const excluded of [
    'personal_wallet_statement_rows','personal_wallet_account_operations',
    'personal_wallet_payable_payments','personal_wallet_recurring_obligations',
  ]) assert(!query.includes("from('" + excluded + "')"));
  assert(!query.includes('createSignedUrl'), 'overview should not sign optional images on first paint');
  assert(!query.includes('.limit(') || query.includes('.limit(500)'), 'do not truncate purchases or installments');
  assert(query.includes('getCardCreditPosition'), 'credit must use the canonical calculation');
  assert(repository.includes('overviewCache'));
  assert(repository.includes('overviewCache.invalidate()'));
  assert(overview.includes('walletRepository.loadOverview()'));
  assert(overview.includes('walletRepository.loadOverview({ force: true })'));
});

test('wallet routes lazily load sections and provide loading skeletons', () => {
  const routes = readFileSync('features/wallet/routes.tsx','utf8');
  assert(routes.includes('React.lazy('));
  assert(routes.includes('React.Suspense'));
  assert(routes.includes('Carregando seção da Carteira'));
  for(const page of ['WalletOverviewPage','WalletCardsPage','WalletAccountsPage',
    'WalletPayablesPage','WalletIncomePage','WalletChargePage']) {
    assert(routes.includes("import('./pages/" + page + "')"));
  }
});

test('read-only financial guidance shows overdue, near-term risk and pending recurring income', () => {
  const spending = getWalletSpendingOverview([], '2026-10');
  const html = renderToStaticMarkup(React.createElement(WalletSpendingGuide,{
    projectedBalance:-140.25, creditPercent:85, cardCount:2,pendingCount:8,
    overdueCount:3,dueSoonCount:2,pendingIncome:280.75,spending,onNavigate:()=>{},
  }));
  assert(html.includes('3 compromisso(s) vencido(s)'));
  assert(html.includes('2 compromisso(s) vence(m)'));
  assert(html.includes('280,75'));
  assert(html.includes('Conferir receitas'));
  assert(html.includes('Exige atenção'));
  assert(html.includes('140,25'));
  const noData = renderToStaticMarkup(React.createElement(WalletSpendingGuide,{
    projectedBalance:0,creditPercent:0,cardCount:0,pendingCount:0,spending,onNavigate:()=>{},
  }));
  assert(!noData.includes('Exige atenção'));
  assert(noData.includes('Ainda não há despesas cadastradas'));
});
