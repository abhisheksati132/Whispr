import { encryptE2EE, showToast } from './ultimate-features.js';
import { isMusicUrl, scrollBottom, triggerHaptic } from './helpers.js';
import { toggleRecord } from './copy.js';
import { toggleSendMicIcons } from './ui-helpers.js';
import { initSocket } from './socket.js';
import { renderMessage } from './ui.js';
import { playSound, confetti } from './sounds.js';
import { cancelReply } from './reply.js';
import { uploadFileWithProgress } from './media.js';
import { openLightbox } from './time-capsule.js';

  // ═══════════════════ SEND MESSAGE ═══════════════════
  export function findUrl(text) {
    const match = text.match(/https?:\/\/[^\s]+/i);
    return match ? match[0] : null;
  }

  export function autoExpandMsgInput() {
    if (!els.msgInput) return;
    els.msgInput.style.height = '36px';
    els.msgInput.style.height = Math.min(els.msgInput.scrollHeight, 120) + 'px';
    saveDraft();
  }

  export function saveDraft() {
    if (!myRoom || !els.msgInput) return;
    localStorage.setItem(`bestieDraft_${myRoom}`, els.msgInput.value);
  }

  export function restoreDraft() {
    if (!myRoom || !els.msgInput) return;
    const draft = localStorage.getItem(`bestieDraft_${myRoom}`) || '';
    els.msgInput.value = draft;
  }

  export function sendMessagePayload(payload) {
    if (!payload) return;
    joined = true;
    const clientMsgId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    payload.clientMsgId = clientMsgId;
    payload.user = myName || localStorage.getItem('bestieChatName') || 'Bestie';
    payload.room = myRoom || localStorage.getItem('bestieChatRoom') || `dm_${(myName || localStorage.getItem('bestieChatName') || 'Bestie').toLowerCase()}_${(myName || localStorage.getItem('bestieChatName') || 'Bestie').toLowerCase()}`;

    triggerHaptic(10);

    // Optimistic local rendering with clock icon (🕒)
    const localMsg = {
      id: clientMsgId,
      clientMsgId,
      user: payload.user,
      time: Date.now(),
      reactions: {},
      isPending: true,
      ...payload
    };

    renderMessage(localMsg);
    scrollBottom();
    playSound('send');

    outboxQueue.push(payload);
    saveOutboxQueue();

    if (!socket) initSocket();
    if (socket) {
      socket.emit('message', payload);
    }
  }

  export function sendMessage() {
    const rawText = els.msgInput.value.trim();
    if (!rawText) {
      toggleRecord();
      return;
    }
    if (!myName) myName = localStorage.getItem('bestieChatName') || 'Bestie';
    if (!myRoom) myRoom = localStorage.getItem('bestieChatRoom') || `dm_${myName.toLowerCase()}_${myName.toLowerCase()}`;
    if (!socket || !socket.connected) {
      initSocket();
      doSocketJoin();
    }

    const url = findUrl(rawText);
    const text = encryptE2EE(rawText);

    // Editing mode
    if (editingMessageId) {
      const encEdit = encryptE2EE(rawText);
      socket.emit('edit-message', { messageId: editingMessageId, text: encEdit });
      els.msgInput.value     = '';
      autoExpandMsgInput();
      localStorage.removeItem(`bestieDraft_${myRoom}`);
      editingMessageId       = null;
      cancelReply();
      toggleSendMicIcons();
      return;
    }

    const sendPayload = (preview) => {
      const payload = { text, replyTo: replyingTo };
      if (preview) payload.linkPreview = preview;
      
      // Check for music URL
      if (isMusicUrl(rawText)) {
        payload.type = 'music';
        payload.url = rawText;
      }
      
      sendMessagePayload(payload);
      els.msgInput.value = '';
      autoExpandMsgInput();
      localStorage.removeItem(`bestieDraft_${myRoom}`);
      cancelReply();
      toggleSendMicIcons();
      localStorage.setItem('bestieLastMsgDate', new Date().toISOString().slice(0, 10));
    };

    if (url && !e2eEnabled) {
      fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
        .then(r => r.json())
        .then(preview => sendPayload(preview))
        .catch(() => sendPayload(null));
    } else {
      sendPayload(null);
    }
  }

  export function sendHug() {
    if (!joined) return;
    socket.emit('message', { type: 'hug' });
    playSound('hug'); confetti();
    localStorage.setItem('bestieLastMsgDate', new Date().toISOString().slice(0, 10));
  }

  export function forwardMessage(messageId, targetRoom) {
    if (!socket || !joined) return;
    socket.emit('forward-message', { messageId, targetRoom });
    showToast('Message forwarded 📨');
  }

  export async function sendPhoto(filesInput) {
    if (!filesInput || !joined) return;
    const files = Array.isArray(filesInput) ? filesInput : (filesInput.length !== undefined ? Array.from(filesInput) : [filesInput]);
    if (!files.length) return;

    if (files.length === 1) {
      const file = files[0];
      if (!file.type.startsWith('image/')) return;
      showToast('Compressing & sending photo… 📸');
      try {
        const { dataUrl, mime } = await compressImage(file);
        const blob = dataUrlToBlob(dataUrl, mime);
        const result = await uploadFileWithProgress(blob, 'image', (pct) => showToast(`Uploading… ${pct}%`));
        sendMessagePayload({ type: 'image', url: result.url, replyTo: replyingTo });
        cancelReply();
      } catch {
        showToast('Could not upload photo');
      }
    } else {
      showToast(`Sending ${files.length} photos collage… 📸`);
      try {
        const uploadPromises = files.slice(0, 4).map(async (f) => {
          const { dataUrl, mime } = await compressImage(f);
          const blob = dataUrlToBlob(dataUrl, mime);
          const result = await uploadFileWithProgress(blob, 'image', (pct) => showToast(`Uploading… ${pct}%`));
          return { url: result.url, name: f.name };
        });
        const items = await Promise.all(uploadPromises);
        sendMessagePayload({ type: 'media-group', items, replyTo: replyingTo });
        cancelReply();
      } catch {
        showToast('Could not upload photo group');
      }
    }
  }

  export function dataUrlToBlob(dataUrl, mime) {
    const [header, base64] = dataUrl.split(',');
    const mimeMatch = header.match(/:(.*?);/);
    const mimeType = mime || (mimeMatch ? mimeMatch[1] : 'application/octet-stream');
    const binary = atob(base64);
    const arr = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
    return new Blob([arr], { type: mimeType });
  }

  export async function uploadDocumentFile(input) {
    const file = input && input.files && input.files[0];
    if (!file || !joined) return;
    input.value = '';
    if (els.attachMenu) els.attachMenu.style.display = 'none';

    if (file.size > 25 * 1024 * 1024) {
      showToast('File too large (Max 25MB)');
      return;
    }
    showToast(`Uploading ${file.name}… 📄`);
    try {
      const result = await uploadFileWithProgress(file, 'document', (pct) => showToast(`Uploading… ${pct}%`));
      sendMessagePayload({
        type: 'document',
        url: result.url,
        docName: file.name,
        docSize: file.size,
      replyTo: replyingTo
    });
    cancelReply();
  } catch {
    showToast('Could not upload document');
  }
  }

  export function openViewOnceMedia(messageId, url) {
    if (!url) {
      showToast('This view-once media was already opened');
      return;
    }
    openLightbox(url);
    if (socket) {
      socket.emit('view-once-opened', { messageId });
    }
  }