// Socket.io connection and event manager

/* global io */

export function createSocketConnection(token, onStatusChange) {
  if (typeof io === 'undefined') {
    console.error('Socket.io library not loaded');
    return null;
  }

  const socket = io({
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000
  });

  let pingInterval = null;

  socket.on('connect', () => {
    if (onStatusChange) onStatusChange('ESTABLISHED');

    // Periodically measure latency
    pingInterval = setInterval(() => {
      const start = Date.now();
      socket.volatile.emit('ping-check', () => {
        const latency = Date.now() - start;
        if (onStatusChange) onStatusChange(null, latency);
      });
    }, 10000);
  });

  socket.on('disconnect', () => {
    if (pingInterval) clearInterval(pingInterval);
    if (onStatusChange) onStatusChange('OFFLINE');
  });

  socket.on('connect_error', (err) => {
    console.error('Socket connect error:', err.message);
    if (onStatusChange) onStatusChange('RECONNECTING');
  });

  return socket;
}

export async function registerPushNotifications(authToken) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !authToken) return;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    const keyRes = await fetch('/api/push/public-key');
    if (!keyRes.ok) return;
    const { publicKey } = await keyRes.json();
    if (!publicKey) return;

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const padding = '='.repeat((4 - (publicKey.length % 4)) % 4);
      const base64 = (publicKey + padding).replace(/-/g, '+').replace(/_/g, '/');
      const rawData = window.atob(base64);
      const applicationServerKey = new Uint8Array(rawData.length);
      for (let i = 0; i < rawData.length; ++i) {
        applicationServerKey[i] = rawData.charCodeAt(i);
      }
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey
      });
    }

    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify(sub)
    });
  } catch (err) {
    console.warn('Push registration notice:', err.message);
  }
}
