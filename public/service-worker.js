const CACHE_NAME = 'capitalflow-v7';
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

const refreshNavigationCache = async (request) => {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put('/index.html', response.clone());
    }
  } catch {
    // A abertura continua com o shell local quando não há rede.
  }
};

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const isNavigate = request.mode === 'navigate';
  const url = new URL(request.url);
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
      caches.match('/index.html').then((cached) => {
        const backgroundUpdate = refreshNavigationCache(request);
        event.waitUntil(backgroundUpdate);
        return cached || fetch(request);
      })
    );
    return;
  }

  if (!isSameOrigin) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        event.waitUntil(
          fetch(request)
            .then((response) => {
              if (response && response.ok) {
                return caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
              }
              return undefined;
            })
            .catch(() => undefined)
        );
        return cached;
      }

      return fetch(request)
        .then((response) => {
          if (response && response.ok) {
            caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
          }
          return response;
        })
        .catch(() => caches.match('/index.html'));
    })
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
    icon: '/favicon.ico',
    badge: '/favicon.ico',
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
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
