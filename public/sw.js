// Whispr Terminal HUD Service Worker (v2.0)
const CACHE_NAME = 'whispr-terminal-v2';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (!e.request.url.startsWith('http')) return;
  if (e.request.url.includes('/socket.io/')) return;
  if (e.request.url.includes('/api/')) return;

  // Network-first policy to always fetch freshest code
  e.respondWith(
    fetch(e.request)
      .then((response) => {
        if (response && response.status === 200 && response.type !== 'opaque') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((c) => c.put(e.request, clone).catch(() => {}));
        }
        return response;
      })
      .catch(() => caches.match(e.request))
  );
});

// Push notification handling
self.addEventListener('push', (e) => {
  let data = { title: 'WHISPR', body: 'New transmission received', url: '/' };
  try {
    if (e.data) data = e.data.json();
  } catch {
    if (e.data) data.body = e.data.text();
  }

  const options = {
    body: data.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: data.url || '/' }
  };

  e.waitUntil(self.registration.showNotification(data.title, options));
});

// Open window on notification click
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const targetUrl = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
