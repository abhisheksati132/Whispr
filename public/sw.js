// Whispr Terminal HUD Service Worker (v2.0)
// Strictly caches ONLY static frontend shell. NEVER caches /api, /socket.io, media, or auth-bearing requests.

const CACHE_NAME = 'whispr-shell-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/manifest.json',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/fonts/JetBrainsMono-Regular.woff2',
  '/js/app.js',
  '/js/media.js',
  '/js/socket.js',
  '/js/terminal-ui.js',
  '/js/webrtc.js',
  '/socket.io/socket.io.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
  );
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
  if (!e.request.url.startsWith(self.location.origin)) return;

  // NEVER cache API requests, socket.io, or requests with Authorization headers
  if (e.request.headers.has('Authorization')) return;

  const url = new URL(e.request.url);
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/')) {
    return;
  }

  // Only handle static shell file types
  const isStaticShell =
    url.pathname === '/' ||
    /\.(html|css|js|woff2|svg|png|ico|json)$/i.test(url.pathname);

  if (!isStaticShell) return;

  // Stale-while-revalidate for static shell assets only
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetchPromise = fetch(e.request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
          }
          return response;
        })
        .catch(() => cached);

      return cached || fetchPromise;
    })
  );
});

// Clear all caches on message (e.g. on logout)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CLEAR_CACHES') {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
    );
  }
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
