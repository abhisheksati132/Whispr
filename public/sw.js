// Service Worker — tahc v8000
const CACHE = 'tahc-v8000';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (!e.request.url.startsWith('http')) return;
  if (e.request.url.includes('socket.io/?')) return;
  if (e.request.url.includes('/api/')) return;

  // Network-first policy to always fetch freshest code
  e.respondWith(
    fetch(e.request).then((response) => {
      if (response && response.status === 200 && response.type !== 'opaque') {
        const clone = response.clone();
        caches.open(CACHE).then((c) => c.put(e.request, clone).catch(() => {}));
      }
      return response;
    }).catch(() => caches.match(e.request))
  );
});
