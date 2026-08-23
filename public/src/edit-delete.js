import { state } from './state.js';
import { toggleSendMicIcons } from './ui-helpers.js';
import { hideContextMenu } from './context-menu.js';
import { decryptE2EE } from './ultimate-features.js';

  // ═══════════════════ EDIT / DELETE ═══════════════════
  export function startEditMessage(msgId, text) {
    editingMessageId = msgId;
    els.msgInput.value = decryptE2EE(text);
    els.msgInput.focus();
    toggleSendMicIcons();
    hideContextMenu();
  }

  export function deleteMessage(msgId) {
    if (!joined) return;
    socket.emit('delete-message', { messageId: msgId });
    hideContextMenu();
  }