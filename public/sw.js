// Cache Version - force complete cache wipe
const CACHE = 'hmm-v1000-flush';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then((clients) => {
        clients.forEach((client) => client.postMessage({ type: 'SW_UPDATED' }));
      })
  );
});

// Network-First Strategy for all assets
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('socket.io/?')) return;
  
  e.respondWith(
    fetch(e.request).then((response) => {
      if (response && response.status === 200 && response.type !== 'opaque') {
        const clone = response.clone();
        caches.open(CACHE).then((c) => c.put(e.request, clone));
      }
      return response;
    }).catch(() => caches.match(e.request))
  );
});

// Push Notification Handler
self.addEventListener('push', (e) => {
  let data = { title: 'hmm', body: 'New message from your bestie! 💌', icon: '/icon-192.png' };
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
