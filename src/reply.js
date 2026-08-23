import { renderMessage } from './ui.js';
import { hideContextMenu } from './context-menu.js';
import { showModal, hideModal } from './modals.js';
import { escapeHtml } from './utils.js';

  // ═══════════════════ REPLY ═══════════════════
  export function replyToMessage(msgId, user, text, type) {
    replyingTo = { id: msgId, user, text, type };
    const preview = type === 'image' ? '📸 Photo' : type === 'voice' ? '🎤 Voice note' : text;
    els.replyPreview.innerHTML = `<strong>${escapeHtml(user)}</strong>${escapeHtml(preview.slice(0, 80))}${preview.length > 80 ? '…' : ''}`;
    els.replyBar.style.display = 'flex';
    els.replyBar.classList.add('open');
    els.msgInput.focus();
    hideContextMenu();
  }

  export function cancelReply() {
    replyingTo = null;
    els.replyBar.style.display = 'none';
    els.replyBar.classList.remove('open');
    els.replyPreview.innerHTML = '';
  }

  export function openThread(messageId) {
    contextTarget = messageId;
    const parent = allMessagesCached.find(m => m.id === messageId);
    if (!parent) return;
    const replies = allMessagesCached.filter(m => m.replyTo === messageId && !m.deleted);
    const threadBody = document.getElementById('threadBody');
    const threadTitle = document.getElementById('threadTitle');
    if (threadTitle) threadTitle.textContent = `Thread · ${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}`;
    if (!threadBody) return;
    if (!replies.length) {
      threadBody.innerHTML = '<div style="padding:32px; text-align:center; color:var(--muted);">No replies yet — be the first! 💬</div>';
    } else {
      const temp = document.createElement('div');
      replies.forEach(m => renderMessage(m, true, temp));
      threadBody.innerHTML = temp.innerHTML;
    }
    showModal('threadModal');
    hideContextMenu();
  }

  export function closeThread() {
    hideModal('threadModal');
    contextTarget = null;
  }

  export function sendThreadReply() {
    if (!contextTarget || !socket || !joined) return;
    const input = document.getElementById('threadReplyInput');
    const text = input ? input.value.trim() : '';
    if (!text) return;
    const payload = { text, replyTo: contextTarget, room: myRoom };
    socket.emit('message', payload);
    if (input) input.value = '';
    setTimeout(() => openThread(contextTarget), 300);
  }

  export function scrollToMessage(msgId) {
    const el = els.messages.querySelector(`[data-id="${msgId}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('pinned-msg-highlight');
    setTimeout(() => el.classList.remove('pinned-msg-highlight'), 1300);
  }