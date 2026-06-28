const CACHE_NAME = 'capitalflow-v5';
const APP_SHELL = ['/', '/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png'];

const isCacheableAsset = (href) => {
  try {
    const url = new URL(href, self.location.origin);
    if (url.origin !== self.location.origin) return false;
    return (
      url.pathname.startsWith('/assets/') ||
      url.pathname.startsWith('/images/') ||
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

const cacheAppShell = async () => {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(APP_SHELL);

  const indexResponse = await fetch('/index.html', { cache: 'reload' });
  if (!indexResponse.ok) return;

  const indexCopy = indexResponse.clone();
  await cache.put('/index.html', indexCopy);

  const html = await indexResponse.text();
  const assetUrls = extractAssetUrls(html);
  await Promise.allSettled(assetUrls.map((url) => cache.add(url)));
};

self.addEventListener('install', (event) => {
  event.waitUntil(cacheAppShell());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const isNavigate = req.mode === 'navigate';
  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;
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
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy));
          return res;
        })
        .catch(async () => {
          const cached = await caches.match('/index.html');
          return cached || new Response('Offline', { status: 503 });
        })
    );
    return;
  }

  if (!isSameOrigin) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        return res;
      }).catch(() => caches.match('/index.html'));
    })
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'CapitalFlow';
  const options = {
    body: data.body || 'Você tem uma nova atualização no sistema.',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/'
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
