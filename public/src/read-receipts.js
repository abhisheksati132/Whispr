import { state } from './state.js';

  // ═══════════════════ READ RECEIPTS ═══════════════════
  export function emitReadReceipt(msgId) {
    if (!joined || !socket || !msgId) return;
    socket.emit('read-receipt', { messageId: msgId });
  }

  export function emitReadReceiptForLastVisible() {
    const wraps = els.messages.querySelectorAll('.msg-wrap');
    let lastOtherMsgId = null;
    wraps.forEach((w) => {
      const msg = w.querySelector('.msg');
      if (msg && !w.classList.contains('me')) lastOtherMsgId = w.dataset.id;
    });
    if (lastOtherMsgId) emitReadReceipt(lastOtherMsgId);
  }

  export function getMessageIndex(msgId) {
    return allMessagesCached.findIndex((m) => m.id === msgId);
  }

  export function updateReadTickForMessage(msgId) {
    const tick = document.getElementById(`tick-${msgId}`);
    if (!tick) return;
    const others = Object.entries(readBy).filter(([name]) => name !== myName);
    if (!others.length) return;
    
    const targetIdx = getMessageIndex(msgId);
    if (targetIdx === -1) return;
    
    let hasBeenRead = false;
    let readReceiptTime = null;
    
    for (const [name, readMsgId] of others) {
      const readIdx = getMessageIndex(readMsgId);
      if (readIdx >= targetIdx) {
        hasBeenRead = true;
        if (readMsgId === msgId) {
          const msgObj = allMessagesCached[readIdx];
          if (msgObj) readReceiptTime = msgObj.time;
        }
      }
    }
    
    if (hasBeenRead) {
      tick.className = 'read-tick';
      if (readReceiptTime) {
        tick.innerHTML = `✓✓ <span class="receipt-time">Seen</span>`;
      } else {
        tick.textContent = '✓✓';
      }
    }
  }

  export function applyReadReceipts(rb) {
    readBy = rb || {};
    els.messages.querySelectorAll('.msg-wrap.me').forEach((wrap) => {
      updateReadTickForMessage(wrap.dataset.id);
    });
  }