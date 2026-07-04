import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { AppErrorBoundary } from './components/system/AppErrorBoundary';

console.log('CapitalFlow: Booting main.tsx...');
if (typeof window !== 'undefined') {
  (window as any).__BOOT_LOG = (msg: string) => console.log(`[BOOT_TRACE] ${msg}`);
  (window as any).__BOOT_LOG('Check 1: main.tsx loaded');
}

const removeExternalBuilderBadge = () => {
  if (typeof document === 'undefined') return;

  const matchesBuilderBadge = (element: Element) => {
    const text = (element.textContent || '').trim().toLowerCase();
    const href = element instanceof HTMLAnchorElement ? element.href.toLowerCase() : '';
    return text.includes('made with manus') || text === 'manus' || href.includes('manus');
  };

  const removeMatches = () => {
    document.querySelectorAll('a, button, div, span').forEach((element) => {
      if (matchesBuilderBadge(element)) element.remove();
    });
  };

  removeMatches();
  new MutationObserver(removeMatches).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
};

removeExternalBuilderBadge();

const isDevCacheResetting =
  typeof window !== 'undefined' && (window as any).__CF_DEV_CACHE_RESETTING__;

if (isDevCacheResetting) {
  console.log('CapitalFlow: dev cache reset in progress; render skipped.');
} else {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    console.error("CapitalFlow: Could not find root element to mount to");
    throw new Error("Could not find root element to mount to");
  }

  const root = createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <AppErrorBoundary>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AppErrorBoundary>
    </React.StrictMode>
  );
  console.log('CapitalFlow: Render initiated.');
}

if (typeof window !== 'undefined' && 'serviceWorker' in navigator && import.meta.env.DEV) {
  window.addEventListener('load', async () => {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));

    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  });
}

if (typeof window !== 'undefined' && 'serviceWorker' in navigator && import.meta.env.PROD) {
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      console.log('CapitalFlow: Novo service worker ativo. Recarregando a pagina para atualizar assets...');
      window.location.reload();
    }
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then((registration) => {
        if (registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('CapitalFlow: Nova versao baixada em background. Forcando ativacao imediata...');
              worker.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });
      })
      .catch((err) => {
        console.error('Falha ao registrar service worker:', err);
      });
  });
}
