// frontend/sw.js
const CACHE_NAME = 'bill-saas-cache-v5';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/pages/login.html',
  '/pages/register.html',
  '/css/style.css'
  // We explicitly do NOT cache the dashboard or js files aggressively here 
  // to ensure you always get the latest SaaS updates on refresh.
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS_TO_CACHE))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const reqUrl = new URL(event.request.url);

  // CRITICAL FIX: Never cache API calls. Financial data must be real-time.
  if (reqUrl.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // UI Assets: Network-first, fallback to cache
  event.respondWith(
    fetch(event.request)
      .then(networkResp => {
        if (networkResp && networkResp.ok && event.request.method === 'GET') {
          const resClone = networkResp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, resClone));
        }
        return networkResp;
      })
      .catch(async () => {
        const cachedResp = await caches.match(event.request);
        if (cachedResp) return cachedResp;
        
        // If offline and requesting a page, return the index/login
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
        return new Response('Network error (offline)', { status: 503 });
      })
  );
});