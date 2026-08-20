// Cache Version
const CACHE = 'whispr-v12038-speed';
const IMMUTABLE_ASSETS = [
  '/icon-192.png',
  '/favicon.ico',
  '/crypto-js.min.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(IMMUTABLE_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Stale-while-revalidate for fonts/images, Network-First for HTML/CSS/JS
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (!e.request.url.startsWith('http')) return;
  if (e.request.url.includes('socket.io/?')) return;
  if (e.request.url.includes('/api/')) return;
  
  const isStaticMedia = e.request.url.match(/\.(png|jpg|jpeg|gif|webp|svg|ico|woff2|woff|ttf|mp3|wav|ogg)$/i);

  if (isStaticMedia) {
    // Cache-first with background revalidate for static media
    e.respondWith(
      caches.match(e.request).then((cached) => {
        const fetchPromise = fetch(e.request).then((networkRes) => {
          if (networkRes && networkRes.status === 200 && networkRes.type !== 'opaque') {
            const clone = networkRes.clone();
            caches.open(CACHE).then((c) => c.put(e.request, clone).catch(() => {}));
          }
          return networkRes;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // Network-first for everything else
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

// Push Notification Handler
self.addEventListener('push', (e) => {
  let data = { title: 'Whispr', body: 'New message received 💬', icon: '/icon-192.png' };
  if (e.data) {
    try {
      data = e.data.json();
    } catch {
      data.body = e.data.text();
    }
  }
  const options = {
    body: data.body,
    icon: data.icon || '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: data.url || '/' },
    vibrate: [100, 50, 100]
  };
  e.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const urlToOpen = (e.notification.data && e.notification.data.url) ? e.notification.data.url : '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(urlToOpen) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(urlToOpen);
    })
  );
});

// Background Sync
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-messages') {
    event.waitUntil(Promise.resolve());
  }
});

// Periodic Background Sync
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'check-messages') {
    event.waitUntil(Promise.resolve());
  }
});
