import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { WalletSnapshotCache } from '../../features/wallet/services/walletSnapshotCache';
import { deriveOverviewFromSnapshot } from '../../features/wallet/services/walletOfflineStore';
import type { WalletSnapshot } from '../../features/wallet/services/walletRepository';

test('WalletSnapshotCache peek e prime isolam sessões e respeitam TTL', () => {
  const cache = new WalletSnapshotCache<{ total: number }>(10_000);
  cache.prime('user-a', { total: 500 });
  assert.deepEqual(cache.peek('user-a'), { total: 500 });
  assert.equal(cache.peek('user-b'), null);
  cache.invalidate();
  assert.equal(cache.peek('user-a'), null);
});

test('deriveOverviewFromSnapshot extrai visão geral preservando vencimentos de fatura', () => {
  const fakeFull = {
    accounts: [{ id: 'acc-1', nickname: 'Nubank', bank_name: 'Nubank', account_type: 'CHECKING', balance: 150 }],
    cards: [],
    expenses: [],
    installments: [],
    invoicePayments: [],
    accountOperations: [],
    statementRows: [],
    payables: [],
    payablePayments: [],
    payablePaymentSources: [],
    recurringIncomes: [],
    recurringReceipts: [],
    recurringObligations: [],
    capitalSources: [],
  } as unknown as WalletSnapshot;

  const overview = deriveOverviewFromSnapshot(fakeFull, [
    { card_id: 'card-1', due_month: '2026-11-01', due_date: '2026-11-15' },
  ]);

  assert.equal(overview.accounts.length, 1);
  assert.equal(overview.accounts[0].balance, 150);
  assert.equal(overview.cardInvoiceDates.length, 1);
  assert.equal(overview.cardInvoiceDates[0].due_date, '2026-11-15');
});

test('Carteira possui hidratação offline por IndexedDB, pré-carregamento completo e aviso offline', () => {
  const repo = readFileSync('features/wallet/services/walletRepository.ts', 'utf8');
  const mod = readFileSync('features/wallet/WalletModule.tsx', 'utf8');
  const access = readFileSync('features/wallet/hooks/useWalletAccess.ts', 'utf8');
  const hook = readFileSync('features/wallet/hooks/useWalletSnapshot.ts', 'utf8');
  const overview = readFileSync('features/wallet/pages/WalletOverviewPage.tsx', 'utf8');

  assert.match(repo, /loadWalletOfflineFull/);
  assert.match(repo, /loadWalletOfflineOverview/);
  assert.match(repo, /loadWalletOfflineAccess/);
  assert.match(repo, /prefetchFull/);
  assert.match(mod, /walletRepository\.prefetchFull\(\)/);
  assert.match(mod, /Modo offline/);
  assert.match(access, /getSession/);
  assert.match(hook, /peekCachedFull/);
  assert.match(overview, /peekCachedOverview/);
});

