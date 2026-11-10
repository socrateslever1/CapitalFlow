import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const read = file => readFileSync(file, 'utf8');

test('PWA caches versioned wallet JS/CSS, not session or financial data', () => {
  const vite = read('vite.config.ts');
  const sw = read('public/service-worker.js');
  const main = read('main.tsx');
  assert.match(vite, /walletAssetsManifestPlugin\(buildId\)/);
  assert.match(vite, /fileName: 'wallet-precache.json'/);
  assert.match(vite, /entry\.dynamicImports/);
  assert.match(sw, /cacheWalletStaticAssets/);
  assert.match(sw, /CACHE_WALLET_ASSETS/);
  const manifest = JSON.parse(read('dist/wallet-precache.json'));
  assert.ok(Array.isArray(manifest.assets) && manifest.assets.length >= 5,
    'all wallet sections must be represented in the production asset manifest');
  for (const asset of manifest.assets) {
    assert.match(asset, /^\\/assets\\/[^/?]+-[A-Za-z0-9_-]{8,}\\.(?:js|css)$/);
    assert.ok(readFileSync('dist' + asset).byteLength > 0, 'missing packaged wallet asset: ' + asset);
  }
  assert.match(sw, /isImmutableBundleAsset\(url\.pathname\)/);
  assert.match(sw, /caches\.match\(request\)/);
  assert.match(main, /postMessage\(\{ type: 'CACHE_WALLET_ASSETS' \}\)/);
  assert.match(main, /!isNativeCapacitor/);
  assert.doesNotMatch(vite, /personal_wallet_accounts|user_modulos|jwt|auth\.getSession/);
  assert.doesNotMatch(sw, /indexedDB|localStorage|Authorization|\bsupabase\.from\(/);
});

test('only authorized master preloads wallet view code; no preloading private records', () => {
  const app=read('App.tsx');
  assert.match(app, /!isPlatformSuperAdmin \|\| isPublicView/);
  assert.match(app, /import\('\.\/features\/wallet\/WalletModule'\)/);
  assert.match(app, /import\('\.\/features\/wallet\/pages\/WalletOverviewPage'\)/);
  assert.doesNotMatch(app, /walletRepository\.loadOverview\(/);
});

test('legal hub displays documents and legal tools but no second contract dashboard', () => {
  const legal=read('pages/LegalPage.tsx');
  const dashboard=read('App.tsx');
  assert.match(legal, /Documentos jurídicos emitidos/);
  assert.match(legal, /currentLegalDocs\.map/);
  assert.match(legal, /Confissão de Dívida/);
  assert.match(legal, /Nota Promissória/);
  assert.match(legal, /pendingFeedbacks\.map/);
  assert.doesNotMatch(legal, /<LoanCard|activeLegalLoans|finishedLegalLoans|loansWithoutContract|from\('clientes'\)/);
  assert.match(dashboard, /<DashboardContainer/);
  assert.match(dashboard, /loans=\{loans\}/);
});
