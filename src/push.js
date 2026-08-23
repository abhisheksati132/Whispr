import { loadChatList } from './dm-chat-list.js';
import { showModal, hideModal, toggleModal } from './modals.js';

  // ═══════════════════ PUSH NOTIFICATIONS ═══════════════════
  export function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    return new Uint8Array([...rawData].map(c => c.charCodeAt(0)));
  }

  export function openChatsModal() {
    loadChatList();
    showModal('chatsModal');
  }

  export function closeChatsModal() {
    hideModal('chatsModal');
  }

  export function toggleStickerPanel() {
    const panel = document.getElementById('stickerPanel');
    if (!panel) return;
    const isVisible = panel.style.display !== 'none';
    panel.style.display = isVisible ? 'none' : 'block';
  }

  export function toggleQuickMenu() {
    toggleModal('quickMenu');
  }