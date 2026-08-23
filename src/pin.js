import { hideContextMenu } from './context-menu.js';
import { scrollToMessage } from './reply.js';

  // ═══════════════════ PIN ═══════════════════
  export function pinMessageById(msgId) {
    if (!joined) return;
    socket.emit('pin-message', { messageId: msgId });
    hideContextMenu();
  }

  export function unpinMessage() {
    if (!joined) return;
    socket.emit('unpin-message');
    hideContextMenu();
  }

  export function scrollToPinned() {
    if (pinnedMsg) scrollToMessage(pinnedMsg.id);
  }