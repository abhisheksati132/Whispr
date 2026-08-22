import { state } from './state.js';
import { REACTIONS, ROOM_LABELS } from './constants.js';
import { escapeHtml, formatDateLabel, formatLastSeen, formatBytes, debounce } from './utils.js';

export function sendMessagePayload(payload) {
  if (!payload) return;
  state.joined = true;
  const clientMsgId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  payload.clientMsgId = clientMsgId;
  payload.user = state.myName || localStorage.getItem('bestieChatName') || 'Bestie';
  payload.room = state.myRoom || localStorage.getItem('bestieChatRoom') || `dm_${(state.myName || localStorage.getItem('bestieChatName') || 'Bestie').toLowerCase()}_${(state.myName || localStorage.getItem('bestieChatName') || 'Bestie').toLowerCase()}`;

  triggerHaptic(10);

  const localMsg = {
    id: clientMsgId,
    clientMsgId,
    user: payload.user,
    time: Date.now(),
    reactions: {},
    isPending: true,
    ...payload
  };

  if (typeof renderMessage === 'function') renderMessage(localMsg);
  if (typeof scrollBottom === 'function') scrollBottom();
  if (typeof playSound === 'function') playSound('send');

  state.outboxQueue.push(payload);
  saveOutboxQueue();

  if (!state.socket) initSocket();
  if (state.socket) {
    state.socket.emit('message', payload);
  }
}

export function sendMessage() {
  const rawText = state.els.msgInput?.value.trim();
  if (!rawText) {
    if (typeof toggleRecord === 'function') toggleRecord();
    return;
  }
  if (!state.myName) state.myName = localStorage.getItem('bestieChatName') || 'Bestie';
  if (!state.myRoom) state.myRoom = localStorage.getItem('bestieChatRoom') || `dm_${state.myName.toLowerCase()}_${state.myName.toLowerCase()}`;
  if (!state.socket || !state.socket.connected) {
    initSocket();
    doSocketJoin();
  }

  const url = findUrl(rawText);
  const text = encryptE2EE(rawText);

  if (state.editingMessageId) {
    const encEdit = encryptE2EE(rawText);
    state.socket.emit('edit-message', { messageId: state.editingMessageId, text: encEdit });
    state.editingMessageId = null;
    if (state.els.replyBar) { state.els.replyBar.style.display = 'none'; state.els.replyBar.classList.remove('open'); }
    if (state.els.replyPreview) state.els.replyPreview.innerHTML = '';
  } else {
    const sendPayload = (preview) => {
      const payload = { text, replyTo: state.replyingTo };
      if (preview) payload.linkPreview = preview;
      if (isMusicUrl(rawText)) { payload.type = 'music'; payload.url = rawText; }
      sendMessagePayload(payload);
      if (state.els.msgInput) state.els.msgInput.value = '';
      autoExpandMsgInput();
      localStorage.removeItem(`bestieDraft_${state.myRoom}`);
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
}

export function loadChatList() {
  // DM list loading logic
}

export function switchRoom(roomName) {
  if (!roomName || roomName === state.myRoom) return;
  state.myRoom = roomName;
  localStorage.setItem('bestieChatRoom', roomName);
  if (state.els.messages) state.els.messages.innerHTML = '';
  state.allMessagesCached = []; state.lastDateLabel = '';
  state.replyingTo = null; state.editingMessageId = null;
  doSocketJoin();
  closeSidebar();
  document.querySelectorAll('.dm-row').forEach(r => r.classList.remove('active'));
  document.querySelectorAll('.dm-row').forEach(r => { if (r.onclick && r.getAttribute('onclick') && r.getAttribute('onclick').includes(roomName)) r.classList.add('active'); });
}

export function deleteRoom() {
  if (!state.myRoom) return;
  fetch(`/api/rooms/${encodeURIComponent(state.myRoom)}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${state.authToken}` } })
    .then(res => { if (res.ok) { state.myRoom = `dm_${(state.myName || '').toLowerCase()}_${(state.myName || '').toLowerCase()}`; localStorage.setItem('bestieChatRoom', state.myRoom); if (state.els.messages) state.els.messages.innerHTML = ''; state.allMessagesCached = []; state.lastDateLabel = ''; doSocketJoin(); loadChatList(); } })
    .catch(() => {});
}

export function openNewChatModal() {
  const modal = document.getElementById('newChatModal');
  if (modal) { modal.style.display = 'flex'; modal.classList.add('open'); }
  const search = document.getElementById('newChatSearch');
  if (search) { search.value = ''; setTimeout(() => search.focus(), 100); }
}

export function closeNewChatModal() {
  const modal = document.getElementById('newChatModal');
  if (modal) { modal.style.display = 'none'; modal.classList.remove('open'); }
}

export function searchUsersForDM(query) {
  const results = document.getElementById('newChatResults');
  if (!results) return;
  const cleanQ = String(query || '').trim().replace(/^@+/, '');
  if (!cleanQ) { results.innerHTML = ''; return; }
  fetch(`/api/rooms/users/search?q=${encodeURIComponent(cleanQ)}`, { headers: { 'Authorization': `Bearer ${state.authToken}` } })
    .then(r => r.json())
    .then(users => {
      if (!users.length) { results.innerHTML = '<div style="padding:12px; color:var(--muted); text-align:center;">No users found</div>'; return; }
      results.innerHTML = users.map(u => `
        <div class="dm-user-row" onclick="BestieChat.startDMWith('${escapeHtml(u.username)}')">
          <span style="font-size:1.4rem;">${escapeHtml(u.avatar || '👤')}</span>
          <div>
            <div style="font-weight:600; color:var(--text);">@${escapeHtml(u.username)}</div>
            <div style="font-size:0.75rem; color:var(--muted);">${escapeHtml(u.statusBio || 'Available')}</div>
          </div>
        </div>
      `).join('');
    })
    .catch(() => { results.innerHTML = ''; });
}

export function startDMWith(username) {
  if (!username) return;
  closeNewChatModal();
  fetch('/api/rooms/dm', { method: 'POST', headers: { 'Authorization': `Bearer ${state.authToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ targetUsername: username }) })
    .then(r => r.json())
    .then(dm => { if (dm.roomName) switchRoom(dm.roomName); })
    .catch(() => {});
}

export function openChatsModal() {
  const modal = document.getElementById('chatsModal');
  if (modal) { modal.style.display = 'flex'; modal.classList.add('open'); }
  renderChatsList();
}

export function closeChatsModal() {
  const modal = document.getElementById('chatsModal');
  if (modal) { modal.style.display = 'none'; modal.classList.remove('open'); }
}

export function toggleStickerPanel() {
  const panel = document.getElementById('stickerPanel');
  if (!panel) return;
  const isVisible = panel.style.display !== 'none';
  panel.style.display = isVisible ? 'none' : 'block';
}

// Placeholder implementations for functions that remain in app.js for now
export function encryptE2EE(text) { return text; }
export function findUrl(text) { const m = text.match(/https?:\/\/[^\s]+/i); return m ? m[0] : null; }
export function isMusicUrl(text) { return /^https?:\/\/(open\.spotify\.com|music\.apple\.com|soundcloud\.com|www\.youtube\.com|youtu\.be|spotify\.link)/i.test((text || '').trim()); }
export function autoExpandMsgInput() {}
export function saveDraft() {}
export function restoreDraft() {}
export function toggleRecord() {}
export function toggleSendMicIcons() {}
export function initSocket() {}
export function doSocketJoin() {}
export function renderMessage(msg, skipSound, container) {}
export function scrollBottom(smooth) {}
export function playSound(name) {}
export function triggerHaptic(ms) {}
export function cancelReply() {}
export function hideContextMenu() {}
export function closeSidebar() {}
export function updateSidebarMyProfile() {}
export function getProfile(username) { return state.profiles[username] || state.myProfile; }
export function renderChatsList() {}
