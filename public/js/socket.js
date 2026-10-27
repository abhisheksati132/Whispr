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
