import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const moduleSource = readFileSync('features/wallet/WalletModule.tsx', 'utf8');
const overview = readFileSync('features/wallet/pages/WalletOverviewPage.tsx', 'utf8');
const summary = readFileSync('features/wallet/components/WalletOverviewSummary.tsx', 'utf8');
const accounts = readFileSync('components/wallet/AccountCardStack.tsx', 'utf8');
const fab = readFileSync('features/wallet/components/WalletExpenseFab.tsx', 'utf8');

test('wallet header does not expose realtime banner but retains live invalidation', () => {
  assert(!moduleSource.includes('Sincronizado'));
  assert(!moduleSource.includes('Sem conexão ao vivo'));
  assert(!moduleSource.includes('realtimeStatus'));
  assert(moduleSource.includes('useWalletRealtime('));
  assert(moduleSource.includes("capitalflow:wallet-updated"));
  assert(moduleSource.includes('<PageHeader'));
  assert(!moduleSource.includes('stackActionsUntilLg'));
});

test('internal navigation remains functional and visually restrained for five sections', () => {
  assert(moduleSource.includes('grid-cols-5'));
  assert(moduleSource.includes("WALLET_ROUTES.filter(item => item.key !== 'cobranca')"));
  assert(moduleSource.includes('aria-current={active'));
  assert(moduleSource.includes('onClick={() => go(item.key)}'));
  assert(moduleSource.includes('border-b-2'));
  assert(!moduleSource.includes("bg-blue-600 text-white font-semibold"));
  assert(!moduleSource.includes('overflow-x-auto'));
  assert(moduleSource.includes('sm:hidden'));
});

test('one expense action lives in global FAB, not a duplicated overview toolbar', () => {
  assert(moduleSource.includes("<WalletExpenseFab />"));
  assert(!moduleSource.includes("route !== 'cartoes' && <WalletExpenseFab />"));
  assert(fab.includes('Adicionar despesa'));
  assert(fab.includes('<QuickExpenseModal'));
  assert(!overview.includes('Lançar despesa'));
  assert(!overview.includes('Atualizar indicadores da carteira'));
  assert(!overview.includes('<QuickExpenseModal'));
  assert(overview.includes('Tentar novamente'), 'error recovery must remain available');
  assert(overview.includes("addEventListener('capitalflow:wallet-updated'"));
});

test('overview account liquidity has a single dominant total and compact institution rows', () => {
  assert(summary.includes('Saldo disponível nas contas'));
  assert(summary.includes('<AccountCardStack compact'));
  assert(summary.includes("onNavigate('contas')"));
  assert(!summary.includes('Total livre para movimentação nas suas instituições'));
  assert(accounts.includes("!compact && <span"));
  assert(accounts.includes('min-h-12 items-center justify-between'));
  assert(accounts.includes('BankLogo'));
  assert(summary.includes('aria-label="Seus cartões"'));
  assert(summary.includes('getCardSummaryDestination(card.id)'));
});

test('UI-only revision does not introduce direct Supabase finance calls', () => {
  for (const source of [moduleSource, overview, summary, accounts]) {
    assert(!/supabase\.(from|rpc)\(/.test(source));
  }
});
