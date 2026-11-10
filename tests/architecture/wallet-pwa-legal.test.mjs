import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
const read = file => readFileSync(file, 'utf8');

test('PWA caches versioned wallet JS/CSS, not session or financial data', () => {
  const vite = read('vite.config.ts');
  const sw = read('public/service-worker.js');
  const main = read('main.tsx');
  assert.match(vite, /walletAssetsManifestPlugin\(buildId\)/);
  assert.match(vite, /fileName: 'wallet-precache.json'/);
  assert.match(vite, /fileName: 'app-precache.json'/);
  const all = JSON.parse(read('dist/app-precache.json'));
  const wallet = JSON.parse(read('dist/wallet-precache.json'));
  assert.equal(all.version, wallet.version);
  assert.ok(all.assets.includes('/brand/capitalflow-app-icon.svg'),
    'the PWA must download public brand assets on first launch');
  assert.ok(all.assets.includes('/images/infinitepay.png'),
    'the PWA must include the static images shipped with the application');
  assert.ok(all.assets.length >= wallet.assets.length, 'the full app must contain every wallet chunk');
  for (const asset of wallet.assets) {
    assert.ok(all.assets.includes(asset), 'wallet file missing from full app: ' + asset);
  }
  const builtScripts = readdirSync('dist/assets')
    .filter(name => name.endsWith('.js') || name.endsWith('.css'))
    .map(name => '/assets/' + name).sort();
  assert.deepEqual(all.assets.filter(name => name.endsWith('.js') || name.endsWith('.css')).sort(),
    builtScripts, 'every compiled JS/CSS chunk, including lazy modules, must be in the precache');

  assert.match(vite, /entry\.dynamicImports/);
  assert.match(sw, /cacheWalletStaticAssets/);
  assert.match(sw, /CACHE_WALLET_ASSETS/);
  assert.match(sw, /CACHE_ALL_ASSETS/);
  assert.match(sw, /app-precache.json/);
  assert.match(main, /postMessage\(\{ type: 'CACHE_ALL_ASSETS' \}\)/);
  assert.doesNotMatch(sw.split("self.addEventListener('install'")[1].split("self.addEventListener('activate'")[0],
    /cacheAllApplicationAssets|cacheWalletStaticAssets/,
    'installing the PWA must not wait for downloading the whole system');

  const manifest = JSON.parse(read('dist/wallet-precache.json'));
  assert.ok(Array.isArray(manifest.assets) && manifest.assets.length >= 5,
    'all wallet sections must be represented in the production asset manifest');
  for (const asset of manifest.assets) {
    assert.ok(asset.startsWith('/assets/') && (asset.endsWith('.js') || asset.endsWith('.css')), 'wallet asset must be a static module or stylesheet');
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
  assert.match(app, /walletRepository\.loadOverview\(\)/);
  assert.doesNotMatch(app, /localStorage\.setItem.*wallet|indexedDB\.open.*wallet/);

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

test('wallet navigation has consistent tappable buttons and no clipped mobile labels', () => {
  const wallet = read('features/wallet/WalletModule.tsx');
  const fab = read('features/wallet/components/WalletExpenseFab.tsx');
  assert.match(wallet, /grid-cols-5/);
  assert.match(wallet, /min-h-14/);
  assert.match(wallet, /whitespace-nowrap/);
  assert.match(wallet, /item\.key === 'dividas' \? 'Pagar'/);
  assert.match(wallet, /focus-visible:ring-2/);
  assert.match(wallet, /aria-current=\{active \? 'page' : undefined\}/);
  assert.doesNotMatch(wallet, /truncate sm:hidden/);
  assert.match(fab, /max-h-\[min\(68dvh,26rem\)\]/);
  assert.match(fab, /overflow-y-auto/);
});

test('service worker caches all static routes, reports completion and retries a failed file', async () => {
  const handlers = new Map();
  const stored = new Map();
  const counts = new Map();
  const targets = [
    '/assets/dashboard-abcdefgh.js',
    '/assets/wallet-12345678.js',
    '/assets/finance-87654321.css',
  ];
  const fetchMock = async (target) => {
    const path = typeof target === 'string' ? target : target.url;
    counts.set(path, (counts.get(path) || 0) + 1);
    if (path === '/app-precache.json') return new Response(
      JSON.stringify({ version: 'build-2026', assets: targets }),
      { headers: { 'Content-Type': 'application/json' } });
    if (!targets.includes(path)) throw new Error('Unexpected request: ' + path);
    // One file fails once. The next message must retry only this file.
    if (path.endsWith('wallet-12345678.js') && counts.get(path) === 1) {
      throw new TypeError('Transient network failure');
    }
    return new Response('/* immutable frontend */', {
      headers: { 'Content-Type': path.endsWith('.css') ? 'text/css' : 'text/javascript' },
    });
  };
  const cache = {
    match: async (key) => stored.get(String(key))?.clone(),
    put: async (key, response) => { stored.set(String(key), response.clone()); },
  };
  const worker = {
    location: { origin: 'https://capitalflow.example' },
    addEventListener: (name, listener) => { handlers.set(name, listener); },
  };
  vm.runInNewContext(read('public/service-worker.js'), {
    self: worker, URL, Response, fetch: fetchMock,
    caches: { open: async () => cache, match: cache.match, keys: async () => [] },
    console, Promise, Set, Map,
  });
  const emitPrecache = async () => {
    let pending;
    handlers.get('message')({
      data: { type: 'CACHE_ALL_ASSETS' },
      waitUntil: (task) => { pending = task; },
    });
    assert.ok(pending, 'the worker must schedule a background task');
    await pending;
    return (await stored.get('https://capitalflow.example/_cf_app_cache_status').json());
  };
  const first = await emitPrecache();
  assert.equal(first.complete, false);
  assert.equal(first.cached, 2);
  const second = await emitPrecache();
  assert.equal(second.complete, true);
  assert.equal(second.cached, 3);
  assert.equal(counts.get('/assets/dashboard-abcdefgh.js'), 1);
  assert.equal(counts.get('/assets/finance-87654321.css'), 1);
  assert.equal(counts.get('/assets/wallet-12345678.js'), 2);
  for (const file of targets) assert.ok(stored.has(file), 'asset not cached: ' + file);
});
