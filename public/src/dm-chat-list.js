import { state } from './state.js';
import { closeSidebar } from './sidebar.js';
import { showToast } from './ultimate-features.js';
import { escapeHtml } from './utils.js';

  // ═══════════════════ DM CHAT LIST ═══════════════════
  export async function loadChatList() {
    if (!authToken) return;
    try {
      const resp = await fetch('/api/rooms/list', { headers: { 'Authorization': `Bearer ${authToken}` } });
      if (!resp.ok) return;
      const rooms = await resp.json();
      renderChatList(rooms);
    } catch (err) { console.error('loadChatList:', err); }
  }

  export function renderChatList(rooms) {
    const list = document.getElementById('dmList');
    const sidebarList = document.getElementById('sidebarDmList');
    if (!list && !sidebarList) return;

    if (!rooms || !rooms.length) {
      const emptyHtml = '<div style="padding:10px 8px; font-size:11px; color:var(--muted); text-align:center;">No direct chats yet. Click "+ New" above to message a user!</div>';
      if (list) list.innerHTML = emptyHtml;
      if (sidebarList) sidebarList.innerHTML = emptyHtml;
      return;
    }

    const html = rooms.map(room => {
      const isSaved = room.isSaved;
      const avatar  = (room.otherProfile && room.otherProfile.avatar) || (isSaved ? '🔖' : '✨');
      const name    = isSaved ? 'Saved Messages' : (room.otherParticipant || room.name.replace('dm_', '').replace(/_/g, ', '));
      const displayName = isSaved ? 'Saved Messages ⭐️' : (room.otherProfile && room.otherProfile.nickname ? `${room.otherProfile.nickname}` : `@${name}`);
      const preview = room.lastMessage
        ? `${room.lastMessage.user === myName ? 'You: ' : ''}${room.lastMessage.text || (room.lastMessage.type === 'image' ? '📷 Photo' : room.lastMessage.type === 'voice' ? '🎤 Voice' : room.lastMessage.type === 'document' ? '📄 Document' : '💬')}`.slice(0, 28)
        : (isSaved ? 'Your personal cloud notes' : 'No messages yet');
      const timeStr = room.lastActivity ? formatTimestamp(room.lastActivity) : '';
      const badge   = room.unread > 0 ? `<div class="dm-row-badge">${room.unread}</div>` : '';
      const active  = room.name === myRoom ? 'active' : '';
      const savedBg = isSaved ? 'background:rgba(129,140,248,0.06);' : '';
      return `<div class="dm-row ${active}" style="${savedBg}" onclick="BestieChat.switchRoom('${escapeHtml(room.name)}')">
        <div class="dm-row-avatar">${avatar}</div>
        <div class="dm-row-info">
          <div class="dm-row-name">${escapeHtml(displayName)}</div>
          <div class="dm-row-preview">${escapeHtml(preview)}</div>
        </div>
        ${badge}
        <div style="font-size:0.65rem; color:var(--muted); flex-shrink:0;">${timeStr}</div>
      </div>`;
    }).join('');

    if (list) list.innerHTML = html;
    if (sidebarList) sidebarList.innerHTML = html;
  }

  export function formatTimestamp(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  export async function switchRoom(roomName) {
    if (!roomName || roomName === myRoom) return;
    myRoom = roomName;
    localStorage.setItem('bestieChatRoom', roomName);
    if (els.messages) els.messages.innerHTML = '';
    allMessagesCached = []; lastDateLabel = '';
    replyingTo = null; editingMessageId = null;
    doSocketJoin();
    closeSidebar();
    document.querySelectorAll('.dm-row').forEach(r => r.classList.remove('active'));
    document.querySelectorAll('.dm-row').forEach(r => { if (r.onclick && r.getAttribute('onclick') && r.getAttribute('onclick').includes(roomName)) r.classList.add('active'); });
  }

  export async function deleteRoom() {
    if (!myRoom) return;
    try {
      const res = await fetch(`/api/rooms/${encodeURIComponent(myRoom)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (res.ok) {
        showToast('Room deleted');
        myRoom = `dm_${(myName || '').toLowerCase()}_${(myName || '').toLowerCase()}`;
        localStorage.setItem('bestieChatRoom', myRoom);
        if (els.messages) els.messages.innerHTML = '';
        allMessagesCached = []; lastDateLabel = '';
        doSocketJoin();
        loadChatList();
      } else {
        showToast('Failed to delete room');
      }
    } catch (_) { showToast('Failed to delete room'); }
  }

  export function openNewChatModal() {
    const modal = document.getElementById('newChatModal');
    if (modal) { modal.style.display = 'flex'; modal.classList.add('open'); }
    const search = document.getElementById('newChatSearch');
    if (search) {
      search.value = '';
      setTimeout(() => search.focus(), 100);
    }
    searchUsersForDM('');
  }

  export function closeNewChatModal() {
    const modal = document.getElementById('newChatModal');
    if (modal) { modal.style.display = 'none'; modal.classList.remove('open'); }
  }

  let _dmSearchTimeout;
  export async function searchUsersForDM(query) {
    clearTimeout(_dmSearchTimeout);
    const results = document.getElementById('newChatResults');
    if (!results) return;

    const cleanQ = String(query || '').trim().replace(/^@+/, '');

    _dmSearchTimeout = setTimeout(async () => {
      try {
        const resp = await fetch(`/api/rooms/users/search?q=${encodeURIComponent(cleanQ)}`, {
          headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (!resp.ok) return;
        const users = await resp.json();
        if (!users.length) {
          results.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:0.82rem;padding:24px 0;">No users found. Try searching another username!</div>';
          return;
        }
        results.innerHTML = users.map(u =>
          `<div class="user-result-row" style="display:flex; align-items:center; justify-content:space-between; padding:8px 12px; border-radius:12px; background:var(--surface); border:1px solid var(--border-soft); margin-bottom:6px;">
            <div style="display:flex; align-items:center; gap:10px;">
              <div style="width:36px; height:36px; border-radius:50%; background:var(--surface2); display:flex; align-items:center; justify-content:center; font-size:18px;">${u.avatar || '✨'}</div>
              <div>
                <div style="font-size:13px; font-weight:700; color:var(--text);">${escapeHtml(u.nickname || u.username)}</div>
                <div style="font-size:11px; color:var(--muted);">@${escapeHtml(u.username)}</div>
              </div>
            </div>
            <button type="button" class="user-result-btn" onclick="BestieChat.startDMWith('${escapeHtml(u.username)}')" style="background:linear-gradient(135deg, #4338ca, #818cf8); color:#fff; border:none; border-radius:8px; padding:6px 14px; font-size:12px; font-weight:600; cursor:pointer;">Message</button>
          </div>`
        ).join('');
      } catch (err) { console.error('search error:', err); }
    }, 150);
  }
  export async function startDMWith(username) {
    try {
      const resp = await fetch('/api/rooms/dm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ targetUsername: username })
      });
      if (!resp.ok) { showToast('\u274C Could not start DM'); return; }
      const { roomName } = await resp.json();
      closeNewChatModal();
      await switchRoom(roomName);
      setTimeout(loadChatList, 500);
      showToast(`\uD83D� DM started with @${username}`);
    } catch (_) { showToast('\u274C Error starting DM'); }
  }