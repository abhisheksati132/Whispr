
  // ═══════════════════ OFFLINE QUEUE & CACHE ═══════════════════
  export async function initOfflineDB() {
    if (!window.indexedDB) return;
    return new Promise(resolve => {
      const req = indexedDB.open('bestie-store-v2', 1);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        try { db.createObjectStore('queue', { autoIncrement: true }); } catch { /* ignore */ }
        try {
          const msgStore = db.createObjectStore('messages', { keyPath: 'id' });
          msgStore.createIndex('room', 'room', { unique: false });
        } catch { /* ignore */ }
      };
      req.onsuccess = e => { offlineDB = e.target.result; resolve(); };
      req.onerror  = () => resolve();
    });
  }

  export async function saveMessageToOfflineDB(msg) {
    if (!offlineDB || !msg || !msg.id) return;
    msg.room = myRoom;
    return new Promise(resolve => {
      try {
        const tx = offlineDB.transaction('messages', 'readwrite');
        tx.objectStore('messages').put(msg);
        tx.oncomplete = resolve; tx.onerror = resolve;
      } catch(_) { resolve(); }
    });
  }

  export async function saveMessagesHistoryToOfflineDB(history) {
    if (!offlineDB || !history) return;
    return new Promise(resolve => {
      try {
        const tx = offlineDB.transaction('messages', 'readwrite');
        const store = tx.objectStore('messages');
        history.forEach(msg => {
          if (msg && msg.id) {
            msg.room = myRoom;
            store.put(msg);
          }
        });
        tx.oncomplete = resolve; tx.onerror = resolve;
      } catch(_) { resolve(); }
    });
  }

  export async function deleteMessageFromOfflineDB(messageId) {
    if (!offlineDB) return;
    return new Promise(resolve => {
      try {
        const tx = offlineDB.transaction('messages', 'readwrite');
        tx.objectStore('messages').delete(messageId);
        tx.oncomplete = resolve; tx.onerror = resolve;
      } catch(_) { resolve(); }
    });
  }

  export async function clearRoomHistoryInOfflineDB(room) {
    if (!offlineDB) return;
    return new Promise(resolve => {
      try {
        const tx = offlineDB.transaction('messages', 'readwrite');
        const store = tx.objectStore('messages');
        const index = store.index('room');
        const req = index.openCursor(IDBKeyRange.only(room));
        req.onsuccess = e => {
          const cursor = e.target.result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          } else {
            resolve();
          }
        };
        req.onerror = () => resolve();
      } catch(_) { resolve(); }
    });
  }

  export async function loadCachedMessagesFromOfflineDB(room) {
    if (!offlineDB) return [];
    return new Promise(resolve => {
      try {
        const tx = offlineDB.transaction('messages', 'readonly');
        const store = tx.objectStore('messages');
        const index = store.index('room');
        const req = index.getAll(IDBKeyRange.only(room));
        req.onsuccess = e => {
          const msgs = e.target.result || [];
          msgs.sort((a, b) => (a.time || 0) - (b.time || 0));
          resolve(msgs);
        };
        req.onerror = () => resolve([]);
      } catch(_) { resolve([]); }
    });
  }

  export async function queueOfflineMessage(msg) {
    if (!offlineDB) return;
    return new Promise(resolve => {
      try {
        const tx = offlineDB.transaction('queue', 'readwrite');
        tx.objectStore('queue').add(msg);
        tx.oncomplete = resolve; tx.onerror = resolve;
      } catch(_) { resolve(); }
    });
  }

  export async function flushOfflineQueue() {
    if (!offlineDB || !socket || !socket.connected) return;
    return new Promise(resolve => {
      try {
        const tx   = offlineDB.transaction('queue', 'readwrite');
        const store = tx.objectStore('queue');
        const req   = store.openCursor();
        req.onsuccess = e => {
          const cursor = e.target.result;
          if (!cursor) { resolve(); return; }
          socket.emit('message', cursor.value);
          cursor.delete();
          cursor.continue();
        };
        req.onerror = () => resolve();
      } catch(_) { resolve(); }
    });
  }

  export function loadOutboxQueue() {
    try {
      const raw = localStorage.getItem('bestieOutboxQueue');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) outboxQueue = parsed;
        else outboxQueue = [];
      }
    } catch (_e) {
      outboxQueue = [];
    }
  }

  export function saveOutboxQueue() {
    try {
      localStorage.setItem('bestieOutboxQueue', JSON.stringify(outboxQueue));
    } catch { /* ignore */ }
  }

  export function flushOutboxQueue() {
    if (!socket || !socket.connected) return;
    loadOutboxQueue();
    if (!outboxQueue || !outboxQueue.length) return;
    const now = Date.now();
    outboxQueue = outboxQueue.filter(item => item && item.clientMsgId && (now - (item.time || now)) < 120000);
    const queue = [...outboxQueue];
    outboxQueue = [];
    saveOutboxQueue();
    queue.forEach((item, index) => {
      setTimeout(() => {
        if (socket && socket.connected && item) {
          socket.emit('message', item);
        }
      }, index * 150);
    });
  }