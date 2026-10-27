// Main application bootstrap & coordination (Vanilla ES Module)

import {
  updateStatusBar,
  updateTypingIndicator,
  renderMessage,
  updateReceipts,
  setupScanlinesToggle,
  setupLightbox,
  openLightbox,
  setAuthToken
} from './terminal-ui.js';
import { compressImage, uploadMedia, VoiceRecorder, cleanupAllMediaUrls } from './media.js';
import { createSocketConnection, registerPushNotifications } from './socket.js';
import { WebRTCManager } from './webrtc.js';

let currentUser = null;
let currentPartner = null;
let authToken = localStorage.getItem('whispr_jwt_token') || null;
let socket = null;
let webrtc = null;
let voiceRecorder = new VoiceRecorder();
let replyingToId = null;
let editingMsgId = null;
let typingTimeout = null;

// ── DOM References ────────────────────────────────────────────────────────────
const els = {
  authOverlay: document.getElementById('auth-overlay'),
  authForm: document.getElementById('auth-form'),
  authTitle: document.getElementById('auth-header-title'),
  authUsername: document.getElementById('auth-username'),
  authPassword: document.getElementById('auth-password'),
  authError: document.getElementById('auth-error-msg'),
  btnToggleAuth: document.getElementById('btn-toggle-auth-mode'),
  messageInput: document.getElementById('message-input'),
  btnSend: document.getElementById('btn-send-message'),
  btnAttachImg: document.getElementById('btn-attach-img'),
  fileInputPhoto: document.getElementById('file-input-photo'),
  btnRecordVoice: document.getElementById('btn-record-voice'),
  btnStartCall: document.getElementById('btn-start-call'),
  contextBar: document.getElementById('input-context-bar'),
  contextLabel: document.getElementById('context-label'),
  btnCancelContext: document.getElementById('btn-cancel-context')
};

let authMode = 'login'; // 'login' | 'register'

// ── Authentication Flow ───────────────────────────────────────────────────────
async function checkExistingAuth() {
  if (!authToken) {
    showAuthOverlay();
    return;
  }

  try {
    const res = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    if (res.ok) {
      const data = await res.json();
      currentUser = data.username;
      currentPartner = data.partner;
      hideAuthOverlay();
      initAppSession();
    } else {
      clearAllCachesAndState();
      localStorage.removeItem('whispr_jwt_token');
      authToken = null;
      showAuthOverlay();
    }
  } catch {
    showAuthOverlay();
  }
}

export function clearAllCachesAndState() {
  cleanupAllMediaUrls();
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHES' });
  }
  if ('caches' in window) {
    caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
  }
}

function showAuthOverlay() {
  if (els.authOverlay) els.authOverlay.style.display = 'flex';
  updateAuthModeUI();
}

function hideAuthOverlay() {
  if (els.authOverlay) els.authOverlay.style.display = 'none';
}

function updateAuthModeUI() {
  if (!els.authTitle || !els.btnToggleAuth) return;
  if (authMode === 'login') {
    els.authTitle.textContent = 'WHISPR // TERMINAL AUTH [LOGIN]';
    els.btnToggleAuth.textContent = '[SWITCH TO REGISTER]';
  } else {
    els.authTitle.textContent = 'WHISPR // TERMINAL AUTH [REGISTER]';
    els.btnToggleAuth.textContent = '[SWITCH TO LOGIN]';
  }
  if (els.authError) els.authError.textContent = '';
}

if (els.btnToggleAuth) {
  els.btnToggleAuth.addEventListener('click', () => {
    authMode = authMode === 'login' ? 'register' : 'login';
    updateAuthModeUI();
  });
}

if (els.authForm) {
  els.authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (els.authError) els.authError.textContent = '';

    const username = els.authUsername.value.trim().toLowerCase();
    const password = els.authPassword.value;

    const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();
      if (!res.ok) {
        if (els.authError) els.authError.textContent = `ERR: ${data.error || 'Authentication failed'}`;
        return;
      }

      authToken = data.token;
      currentUser = data.username;
      localStorage.setItem('whispr_jwt_token', authToken);

      // Fetch partner name
      const meRes = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      if (meRes.ok) {
        const meData = await meRes.json();
        currentPartner = meData.partner;
      }

      hideAuthOverlay();
      initAppSession();
    } catch {
      if (els.authError) els.authError.textContent = 'ERR: Network connection failure';
    }
  });
}

// ── App Session Initialization ────────────────────────────────────────────────
function initAppSession() {
  setAuthToken(authToken);

  updateStatusBar({
    state: 'CONNECTING',
    partnerName: currentPartner,
    isOnline: false,
    lastSeen: null
  });

  socket = createSocketConnection(authToken, (state, latency) => {
    updateStatusBar({ state, latency });
  });

  if (!socket) return;

  webrtc = new WebRTCManager(socket);
  window.__webrtc = webrtc;

  socket.on('partner-status', ({ partner, online, lastSeen }) => {
    currentPartner = partner;
    updateStatusBar({ partnerName: partner, isOnline: online, lastSeen });
  });

  socket.on('presence', ({ user, online, lastSeen }) => {
    if (!currentPartner && user && user !== currentUser) {
      currentPartner = user;
    }
    if (user === currentPartner) {
      updateStatusBar({ partnerName: user, isOnline: online, lastSeen });
    }
  });

  socket.on('init-messages', (history) => {
    if (Array.isArray(history)) {
      history.forEach(msg => {
        renderMessage(msg, currentUser, handleReply, handleEdit, handleDelete, openLightbox);
      });
      // Send read receipt for initial messages
      socket.emit('receipt', { type: 'read' });
    }
  });

  socket.on('message', (msg) => {
    renderMessage(msg, currentUser, handleReply, handleEdit, handleDelete, openLightbox);
    if (msg.sender !== currentUser) {
      socket.emit('receipt', { type: 'read' });
    }
  });

  socket.on('message-edited', (msg) => {
    const lineEl = document.getElementById(`msg-${msg.id}`);
    if (lineEl) {
      const textEl = lineEl.querySelector('.msg-text-own, .msg-text-partner');
      if (textEl) textEl.textContent = msg.body;

      if (!lineEl.querySelector('.msg-meta-edited')) {
        const editedSpan = document.createElement('span');
        editedSpan.className = 'msg-meta-edited';
        editedSpan.textContent = '(edited)';
        const row = lineEl.querySelector('.msg-content-row') || lineEl;
        row.appendChild(editedSpan);
      }
    }
  });

  socket.on('message-deleted', ({ id }) => {
    const lineEl = document.getElementById(`msg-${id}`);
    if (lineEl) {
      const textEl = lineEl.querySelector('.msg-text-own, .msg-text-partner');
      if (textEl) {
        textEl.className = 'msg-meta-deleted';
        textEl.textContent = '[deleted]';
      }
    }
  });

  socket.on('receipt', ({ type }) => {
    updateReceipts(type);
  });

  socket.on('typing', ({ user, isTyping }) => {
    if (user === currentPartner) {
      updateTypingIndicator(user, isTyping);
    }
  });

  registerPushNotifications(authToken);
}

// ── Messaging Handlers ────────────────────────────────────────────────────────
function sendMessage() {
  const text = els.messageInput.value.trim();
  if (!text || !socket) return;

  if (editingMsgId) {
    socket.emit('edit-message', { id: editingMsgId, text });
    cancelContext();
    els.messageInput.value = '';
    return;
  }

  socket.emit('message', {
    type: 'text',
    body: text,
    replyTo: replyingToId
  });

  els.messageInput.value = '';
  cancelContext();

  if (socket) {
    socket.emit('typing', { isTyping: false });
  }
}

function handleReply(msg) {
  replyingToId = msg.id;
  editingMsgId = null;
  if (els.contextBar && els.contextLabel) {
    els.contextLabel.textContent = `re: ${msg.body ? msg.body.slice(0, 40) : '[media]'}`;
    els.contextBar.classList.add('active');
  }
  els.messageInput.focus();
}

function handleEdit(msg) {
  editingMsgId = msg.id;
  replyingToId = null;
  if (els.contextBar && els.contextLabel) {
    els.contextLabel.textContent = `edit: ${msg.body.slice(0, 40)}`;
    els.contextBar.classList.add('active');
  }
  els.messageInput.value = msg.body;
  els.messageInput.focus();
}

function handleDelete(msg) {
  if (confirm('Delete this message for both participants?')) {
    socket.emit('delete-message', { id: msg.id });
  }
}

function cancelContext() {
  replyingToId = null;
  editingMsgId = null;
  if (els.contextBar) els.contextBar.classList.remove('active');
}

if (els.btnCancelContext) {
  els.btnCancelContext.addEventListener('click', cancelContext);
}

if (els.btnSend) {
  els.btnSend.addEventListener('click', sendMessage);
}

if (els.messageInput) {
  els.messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  els.messageInput.addEventListener('input', () => {
    if (!socket) return;
    socket.emit('typing', { isTyping: true });
    if (typingTimeout) clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      socket.emit('typing', { isTyping: false });
    }, 2000);
  });
}

// ── Photo Attachment ──────────────────────────────────────────────────────────
if (els.btnAttachImg && els.fileInputPhoto) {
  els.btnAttachImg.addEventListener('click', () => {
    els.fileInputPhoto.click();
  });

  els.fileInputPhoto.addEventListener('change', async () => {
    const file = els.fileInputPhoto.files[0];
    if (!file || !socket) return;

    try {
      const compressed = await compressImage(file);
      const res = await uploadMedia(compressed, authToken);
      socket.emit('message', {
        type: 'image',
        mediaPath: res.mediaPath,
        replyTo: replyingToId
      });
      cancelContext();
    } catch (err) {
      alert(`Photo upload failed: ${err.message}`);
    } finally {
      els.fileInputPhoto.value = '';
    }
  });
}

// ── Voice Recording ───────────────────────────────────────────────────────────
let isRecording = false;

if (els.btnRecordVoice) {
  els.btnRecordVoice.addEventListener('click', async () => {
    if (!isRecording) {
      try {
        await voiceRecorder.start((sec) => {
          els.btnRecordVoice.textContent = `[REC ${sec}s]`;
        });
        isRecording = true;
        els.btnRecordVoice.classList.add('recording');
      } catch (err) {
        alert(`Mic access failed: ${err.message}`);
      }
    } else {
      try {
        const { file, durationMs } = await voiceRecorder.stop();
        els.btnRecordVoice.textContent = '[UPLOADING]';
        const res = await uploadMedia(file, authToken);
        socket.emit('message', {
          type: 'voice',
          mediaPath: res.mediaPath,
          durationMs,
          replyTo: replyingToId
        });
        cancelContext();
      } catch (err) {
        alert(`Voice recording failed: ${err.message}`);
      } finally {
        isRecording = false;
        els.btnRecordVoice.textContent = '[REC]';
        els.btnRecordVoice.classList.remove('recording');
      }
    }
  });
}

// ── WebRTC Call Trigger ───────────────────────────────────────────────────────
if (els.btnStartCall) {
  els.btnStartCall.addEventListener('click', () => {
    if (!webrtc) return;
    const isVideo = confirm('Start with video camera enabled? (Cancel = Voice only)');
    webrtc.startCall(currentPartner || 'Partner', isVideo);
  });
}

// ── Setup UI Controls & Start ─────────────────────────────────────────────────
setupScanlinesToggle();
setupLightbox();
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
window.addEventListener('beforeunload', cleanupAllMediaUrls);
checkExistingAuth();
