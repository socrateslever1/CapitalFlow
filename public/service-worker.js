const CACHE_NAME = 'capitalflow-v15-full-app-precache';
const APP_SHELL = ['/', '/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png', '/brand/capitalflow-mark-dark.svg', '/brand/capitalflow-loader.svg'];

const isCacheableAsset = (href) => {
  try {
    const url = new URL(href, self.location.origin);
    if (url.origin !== self.location.origin) return false;
    return (
      url.pathname.startsWith('/assets/') ||
      url.pathname.startsWith('/images/') ||
      url.pathname.startsWith('/brand/') ||
      /\.(?:js|css|png|jpg|jpeg|webp|svg|ico|woff2?)$/i.test(url.pathname)
    );
  } catch {
    return false;
  }
};

const extractAssetUrls = (html) => {
  const urls = new Set();
  const attrRegex = /\b(?:src|href)=["']([^"']+)["']/gi;
  let match;

  while ((match = attrRegex.exec(html))) {
    if (isCacheableAsset(match[1])) {
      urls.add(new URL(match[1], self.location.origin).pathname);
    }
  }

  return Array.from(urls);
};


// O app instalado em um APK usa seus arquivos locais. Este cache é apenas
// para o navegador/PWA. Dados bancários, sessões e APIs nunca são pré-cacheados.
const isImmutableBundleAsset = (pathname) =>
  /^\/assets\/[^/?]+-[A-Za-z0-9_-]{8,}\.(?:js|css|png|jpe?g|webp|svg|woff2?|wasm)$/i.test(pathname);

// The first render must never wait for the whole frontend download. A single
// in-flight job handles repeated focus/online messages without duplicate work.
let applicationCacheJob = null;

const cacheAllApplicationAssets = () => {
  if (applicationCacheJob) return applicationCacheJob;
  const job = (async () => {
    const response = await fetch('/app-precache.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Frontend manifest unavailable');
    const manifest = await response.json();
    if (typeof manifest?.version !== 'string' || !Array.isArray(manifest.assets)) {
      throw new Error('Invalid application asset manifest');
    }
    const assets = [...new Set(manifest.assets.filter(path =>
      typeof path === 'string' && isImmutableBundleAsset(path)
    ))];
    const cache = await caches.open(CACHE_NAME);
    let failed = 0;

    // Bounded batches prevent flooding the connection used by authenticated
    // queries. Each failed file is retried on the next focus/online event.
    for (let offset = 0; offset < assets.length; offset += 3) {
      await Promise.all(assets.slice(offset, offset + 3).map(async path => {
        if (await cache.match(path)) return;
        try {
          const asset = await fetch(path);
          const type = asset.headers.get('content-type') || '';
          if (!asset.ok || type.includes('text/html') || asset.type === 'opaque') {
            throw new Error('Invalid static asset response');
          }
          await cache.put(path, asset);
        } catch {
          failed += 1;
        }
      }));
    }
    // Keep the completion marker inside CacheStorage for verifiable readiness.
    // Never store session tokens, responses from Supabase, or private records.
    const report = new Response(JSON.stringify({
      version: manifest.version, total: assets.length,
      cached: assets.length - failed, complete: failed === 0,
    }), { headers: { 'Content-Type': 'application/json' } });
    await cache.put(new URL('/_cf_app_cache_status', self.location.origin).href, report);
  })();
  applicationCacheJob = job.finally(() => { applicationCacheJob = null; });
  return applicationCacheJob;
};

// Retained alias: older frontend versions may still send this message.
const cacheWalletStaticAssets = cacheAllApplicationAssets;

const cacheAppShell = async () => {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(APP_SHELL);

  const indexResponse = await fetch('/index.html', { cache: 'no-store' });
  if (!indexResponse.ok) return;

  await cache.put('/index.html', indexResponse.clone());
  const html = await indexResponse.text();
  const assetUrls = extractAssetUrls(html);
  await Promise.allSettled(assetUrls.map((url) => cache.add(url)));
  // The static bundle precache is triggered after the first page paints.
};

self.addEventListener('install', (event) => {
  event.waitUntil(cacheAppShell());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      ),
      self.clients.claim(),
    ])
  );
});

const fetchFreshNavigation = async (request) => {
  const response = await fetch(request, { cache: 'no-store' });
  if (response && response.ok) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put('/index.html', response.clone());
  }
  return response;
};

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const isNavigate = request.mode === 'navigate';
  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;
  // APK is a binary download, never an app navigation or an offline shell.
  // Bypass the service worker so Cloudflare streams it straight to the browser.
  if (isSameOrigin && url.pathname === '/api/android/apk') return;
  const isDevAsset =
    url.pathname.startsWith('/node_modules/') ||
    url.pathname.startsWith('/@vite') ||
    url.pathname.startsWith('/@react-refresh') ||
    url.pathname.includes('/.vite/') ||
    url.pathname.endsWith('.ts') ||
    url.pathname.endsWith('.tsx');

  if (isDevAsset) return;

  if (isNavigate) {
    event.respondWith(
      fetchFreshNavigation(request).catch(async () => {
        return (await caches.match('/index.html')) || fetch(request);
      })
    );
    return;
  }

  if (!isSameOrigin) return;

  // Hashes fingerprint each release: cache-first is safe only for immutable
  // chunks. Unversioned HTML, version.json and financial requests stay fresh.
  if (isImmutableBundleAsset(url.pathname)) {
    event.respondWith(
      caches.match(request).then(async cached => {
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }
        return response;
      })
    );
    return;
  }

  event.respondWith(
    fetch(request, { cache: 'no-store' })
      .then(async (response) => {
        if (response && response.ok && isCacheableAsset(request.url)) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }
        return response;
      })
      .catch(async () => (await caches.match(request)) || Response.error())
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'CapitalFlow';
  const options = {
    body: data.body || 'Você tem uma nova atualização no sistema.',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    silent: true,
    vibrate: [],
    tag: data.tag || data.notification_id || undefined,
    renotify: false,
    data: {
      url: data.url || '/',
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/', self.location.origin);

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        const currentUrl = new URL(client.url);
        if (currentUrl.origin !== targetUrl.origin) continue;

        if ('focus' in client) {
          if (currentUrl.pathname === targetUrl.pathname && currentUrl.search === targetUrl.search) {
            return client.focus();
          }

          client.postMessage({
            type: 'PUSH_NAVIGATE',
            url: `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`,
          });
          return client.focus();
        }
      }

      return clients.openWindow(targetUrl.href);
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (event.data?.type === 'CACHE_ALL_ASSETS' ||
             event.data?.type === 'CACHE_WALLET_ASSETS') {
    event.waitUntil(cacheWalletStaticAssets().catch(() => undefined));
  }
});
