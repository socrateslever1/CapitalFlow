import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { WalletSnapshotCache } from '../../features/wallet/services/walletSnapshotCache';
import { signWalletImagePaths } from '../../features/wallet/services/walletImageSigning';

test('route changes within TTL reuse one user-scoped snapshot', async () => {
  const cache = new WalletSnapshotCache<{ balance: number }>(25_000);
  let calls = 0;
  const loader = async () => ({ balance: ++calls });
  assert.equal((await cache.load('user-a', loader)).balance, 1);
  assert.equal((await cache.load('user-a', loader)).balance, 1);
  assert.equal(calls, 1);
  assert.equal((await cache.load('user-a', loader, true)).balance, 2);
  assert.equal(calls, 2);
  cache.invalidate();
  assert.equal((await cache.load('user-a', loader)).balance, 3);
});

test('financial snapshots cannot bleed across accounts', async () => {
  const cache = new WalletSnapshotCache<{ balance: number }>();
  await cache.load('user-a', async () => ({ balance: 100 }));
  const next = await cache.load('user-b', async () => ({ balance: 300 }));
  assert.equal(next.balance, 300);
  assert.equal((await cache.load('user-b', async () => ({ balance: -1 }))).balance, 300);
  assert.equal((await cache.load('user-a', async () => ({ balance: 10 }))).balance, 10);
});

test('concurrent loads deduplicate requests; invalidated older requests cannot poison cache', async () => {
  const cache = new WalletSnapshotCache<{ balance: number }>();
  let releaseOld!: (value: { balance: number }) => void;
  let calls = 0;
  const oldLoader = () => {
    calls++;
    return new Promise<{ balance: number }>(resolve => { releaseOld = resolve; });
  };
  const first = cache.load('a', oldLoader);
  const same = cache.load('a', oldLoader);
  assert.strictEqual(first, same);
  await Promise.resolve();
  cache.invalidate();
  const second = await cache.load('a', async () => ({ balance: 200 }));
  releaseOld({ balance: 100 });
  assert.equal((await first).balance, 100);
  assert.equal(second.balance, 200);
  assert.equal((await cache.load('a', async () => ({ balance: -1 }))).balance, 200);
  assert.equal(calls, 1);
});

test('custom image URLs are batched and duplicate paths are signed only once', async () => {
  const batches: string[][] = [];
  const result = await signWalletImagePaths(['a.png','b.png','a.png',null,'c.png'],async paths => {
    batches.push(paths);
    return { data: paths.map(path => ({ signedUrl: 'https://img.example/' + path })) };
  },2);
  assert.deepEqual(batches,[['a.png','b.png'],['c.png']]);
  assert.equal(result.size,3);
  assert.equal(result.get('a.png'),'https://img.example/a.png');
  const failed = await signWalletImagePaths(['missing.png'],async () => ({data:null,error:new Error('missing')}));
  assert.equal(failed.size,0);
});

test('overview has no redundant heading; initial page load uses short cache and FAB remains available', () => {
  const overview = readFileSync('features/wallet/pages/WalletOverviewPage.tsx','utf8');
  const repository = readFileSync('features/wallet/services/walletRepository.ts','utf8');
  const fab = readFileSync('features/wallet/components/WalletExpenseFab.tsx','utf8');
  const hook = readFileSync('features/wallet/hooks/useWalletSnapshot.ts','utf8');
  const service = readFileSync('services/personalWallet.service.ts','utf8');
  assert(!overview.includes('Panorama financeiro'));
  assert(!overview.includes('Contas, cartões e compromissos do mês.'));
  assert(overview.includes('<WalletOverviewSummary'));
  assert(overview.includes("walletRepository.load({ force: true })"));
  assert(repository.includes('supabase.auth.getSession()'));
  assert(repository.includes("capitalflow:wallet-updated"));
  assert(repository.includes('WalletSnapshotCache'));
  assert(hook.includes("walletRepository.load({ force: true })"));
  assert(fab.includes('<ExpenseModalOnDemand'));
  assert(fab.includes('Adicionar despesa'));
  assert(!fab.includes('if (!data) return null'));
  assert(service.includes('createSignedUrls(paths, 3600)'));
  assert(!service.includes('createSignedUrl(card.image_path, 3600)'));
  assert(!service.includes('createSignedUrl(account.image_path, 3600)'));
});
