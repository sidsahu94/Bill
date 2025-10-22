// frontend/service-worker.js
const CACHE_NAME = 'bill-app-cache-v4';
const ASSETS_TO_CACHE = [
  '/', // keep generic pages cached
  '/index.html',
  '/pages/dashboard.html',
  '/pages/products.html',
  '/pages/customers.html',
  '/pages/billing.html',
  '/pages/history.html',
  '/pages/analytics.html',
  '/pages/settings.html',
  // NOTE: intentionally DO NOT include /components/navbar.html or /js/navbar.js here
  '/css/style.css'
];

// Install: cache selected assets
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    for (const url of ASSETS_TO_CACHE) {
      try {
        const res = await fetch(url, {cache: 'no-store'});
        if (res && res.ok) await cache.put(url, res.clone());
      } catch (err) {
        console.warn('SW install: failed to cache', url, err && err.message);
      }
    }
    self.skipWaiting();
  })());
});

// Activate: remove old caches
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    self.clients.claim();
  })());
});

// Fetch: use network-first for navbar and navbar JS, network-first for others too but fallback to cache
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const reqUrl = new URL(event.request.url);

  // Force network for navbar component and navbar script (always get latest)
  if (reqUrl.pathname.endsWith('/components/navbar.html') || reqUrl.pathname.endsWith('/js/navbar.js')) {
    event.respondWith((async () => {
      try {
        const networkResp = await fetch(event.request);
        // update cache (optional) but we prefer always fresh
        try {
          const cache = await caches.open(CACHE_NAME);
          if (networkResp && networkResp.ok && reqUrl.origin === location.origin) {
            cache.put(event.request, networkResp.clone()).catch(()=>{});
          }
        } catch(e){}
        return networkResp;
      } catch (err) {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        return new Response('Network error (offline)', { status: 503, statusText: 'Service Unavailable' });
      }
    })());
    return;
  }

  // Default behavior: network-first, fallback to cache
  event.respondWith((async () => {
    try {
      const networkResp = await fetch(event.request);
      if (networkResp && networkResp.ok) {
        const cache = await caches.open(CACHE_NAME);
        const reqOrigin = new URL(event.request.url).origin;
        if (reqOrigin === location.origin) {
          cache.put(event.request, networkResp.clone()).catch(()=>{});
        }
      }
      return networkResp;
    } catch (err) {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      const fallback = await caches.match('/index.html');
      if (fallback) return fallback;
      return new Response('Network error (offline)', { status: 503, statusText: 'Service Unavailable' });
    }
  })());
});
