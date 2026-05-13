(function () {
  var isLocalDev =
    location.hostname === 'localhost' ||
    location.hostname === '127.0.0.1' ||
    location.hostname === '0.0.0.0';

  if (!isLocalDev) return;

  var resetKey = 'capitalflow-dev-cache-reset-v5';
  if (sessionStorage.getItem(resetKey) === 'done') return;

  window.__CF_DEV_CACHE_RESETTING__ = true;
  sessionStorage.setItem(resetKey, 'done');

  var unregisterServiceWorkers = 'serviceWorker' in navigator
    ? navigator.serviceWorker.getRegistrations().then(function (registrations) {
        return Promise.all(registrations.map(function (registration) {
          return registration.unregister();
        }));
      })
    : Promise.resolve();

  var clearCaches = 'caches' in window
    ? caches.keys().then(function (keys) {
        return Promise.all(keys.map(function (key) {
          return caches.delete(key);
        }));
      })
    : Promise.resolve();

  Promise.all([unregisterServiceWorkers, clearCaches]).finally(function () {
    var url = new URL(location.href);
    url.searchParams.set('__cf_cache_bust', Date.now().toString());
    location.replace(url.toString());
  });
})();
