/**
 * WHISPR — Clean, Minimal, Modern Deep AMOLED Black (Signal Style) Client
 */
(() => {
  'use strict';

  // ═══════════════════ STATE ═══════════════════
  let socket = null;
  let authToken = localStorage.getItem('bestieChatToken') || null;
  let myName = localStorage.getItem('bestieChatName') || '';
  let myRoom = localStorage.getItem('bestieChatRoom') || '';
  let myProfile = { avatar: '✨', nickname: '', statusBio: '' };
  
  let currentOnlineUsers = [];
  let cachedUserRooms = [];
  let currentChatFilter = 'all';
  let replyingTo = null;
  let localStream = null;
  let isMuted = false;
  let isCameraOff = false;
  
  // Media recorder for voice notes
  let mediaRecorder = null;
  let audioChunks = [];
  let recordingTimerInterval = null;
  let recordingSeconds = 0;

  // DOM Elements cache
  let els = {};

  const EMOJIS = ['❤️','🔥','👍','🎉','😍','😂','🥺','✨','💯','🙌','👏','🙏','😘','🥰','😎','🥳','😴','😭','🤔','🤩'];

  // ═══════════════════ INIT ═══════════════════
  function init() {
    cacheElements();
    buildEmojiPicker();
    setupEventListeners();

    if (authToken && myName) {
      if (!myRoom) myRoom = `dm_${myName.toLowerCase()}_${myName.toLowerCase()}`;
      els.login.style.display = 'none';
      els.chat.style.display = 'flex';
      initSocket();
      doSocketJoin();
      loadChatList();
    } else {
      els.login.style.display = 'flex';
      els.chat.style.display = 'none';
    }
  }

  function cacheElements() {
    els = {
      login: document.getElementById('login'),
      chat: document.getElementById('chat'),
      sidebar: document.getElementById('sidebar'),
      sidebarOverlay: document.getElementById('sidebarOverlay'),
      nameInput: document.getElementById('nameInput'),
      passwordInput: document.getElementById('passwordInput'),
      regNicknameInput: document.getElementById('regNicknameInput'),
      regPasswordConfirmInput: document.getElementById('regPasswordConfirmInput'),
      loginError: document.getElementById('loginError'),
      joinBtn: document.getElementById('joinBtn'),
      joinBtnText: document.getElementById('joinBtnText'),
      sidebarMyAvatar: document.getElementById('sidebarMyAvatar'),
      sidebarMyName: document.getElementById('sidebarMyName'),
      sidebarMyBio: document.getElementById('sidebarMyBio'),
      sidebarSearchInput: document.getElementById('sidebarSearchInput'),
      sidebarSearchClear: document.getElementById('sidebarSearchClear'),
      sidebarDmList: document.getElementById('sidebarDmList'),
      headerBestieAvatar: document.getElementById('headerBestieAvatar'),
      headerBestieName: document.getElementById('headerBestieName'),
      headerBestieStatus: document.getElementById('headerBestieStatus'),
      messages: document.getElementById('messages'),
      msgInput: document.getElementById('msgInput'),
      sendBtn: document.getElementById('sendBtn'),
      sendIcon: document.getElementById('sendIcon'),
      micIcon: document.getElementById('micIcon'),
      attachMenu: document.getElementById('attachMenu'),
      emojiPicker: document.getElementById('emojiPicker'),
      replyBar: document.getElementById('replyBar'),
      replyPreviewText: document.getElementById('replyPreviewText'),
      recordingWaveformBar: document.getElementById('recordingWaveformBar'),
      recordingTimer: document.getElementById('recordingTimer'),
      charCount: document.getElementById('charCount'),
      toastContainer: document.getElementById('toastContainer')
    };
  }

  function setupEventListeners() {
    if (els.nameInput) {
      els.nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleAuthSubmit(); });
    }
    if (els.passwordInput) {
      els.passwordInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleAuthSubmit(); });
    }
    if (els.msgInput) {
      els.msgInput.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendMessage();
        }
      });
      els.msgInput.addEventListener('input', () => {
        autoExpandMsgInput();
        updateSendBtnIcon();
        if (socket && socket.connected) socket.emit('typing');
      });
    }

    window.addEventListener('click', e => {
      if (els.attachMenu && !e.target.closest('#attachMenu') && !e.target.closest('button[onclick*="toggleAttachMenu"]')) {
        els.attachMenu.style.display = 'none';
      }
      if (els.emojiPicker && !e.target.closest('#emojiPicker') && !e.target.closest('button[onclick*="toggleEmojiPicker"]')) {
        els.emojiPicker.classList.remove('open');
        els.emojiPicker.style.display = 'none';
      }
    });
  }

  // ═══════════════════ AUTHENTICATION ═══════════════════
  let currentAuthTab = 'signin';

  function switchAuthTab(tab) {
    currentAuthTab = tab;
    const tabIn = document.getElementById('authTabSignIn');
    const tabReg = document.getElementById('authTabRegister');
    const nickField = document.getElementById('nicknameField');
    const confirmField = document.getElementById('confirmPasswordField');
    if (els.loginError) els.loginError.textContent = '';

    if (tab === 'signin') {
      if (tabIn) tabIn.classList.add('active');
      if (tabReg) tabReg.classList.remove('active');
      if (nickField) nickField.style.display = 'none';
      if (confirmField) confirmField.style.display = 'none';
      if (els.joinBtnText) els.joinBtnText.textContent = 'Enter Whispr';
    } else {
      if (tabReg) tabReg.classList.add('active');
      if (tabIn) tabIn.classList.remove('active');
      if (nickField) nickField.style.display = 'flex';
      if (confirmField) confirmField.style.display = 'flex';
      if (els.joinBtnText) els.joinBtnText.textContent = 'Create Account';
    }
  }

  async function handleAuthSubmit() {
    if (currentAuthTab === 'register') {
      await handleRegister();
    } else {
      await handleSignIn();
    }
  }

  async function handleSignIn() {
    const username = (els.nameInput ? els.nameInput.value : '').trim();
    const password = (els.passwordInput ? els.passwordInput.value : '').trim();

    if (!username || !password) {
      if (els.loginError) els.loginError.textContent = 'Please enter both username and password';
      return;
    }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) {
        if (els.loginError) els.loginError.textContent = data.error || 'Login failed';
        return;
      }
      completeAuth(data);
    } catch (_) {
      if (els.loginError) els.loginError.textContent = 'Network error. Please try again.';
    }
  }

  async function handleRegister() {
    const username = (els.nameInput ? els.nameInput.value : '').trim();
    const nickname = (els.regNicknameInput ? els.regNicknameInput.value : '').trim() || username;
    const password = (els.passwordInput ? els.passwordInput.value : '').trim();
    const confirmPass = (els.regPasswordConfirmInput ? els.regPasswordConfirmInput.value : '').trim();

    if (!username || !password) {
      if (els.loginError) els.loginError.textContent = 'Username and password are required';
      return;
    }
    if (password !== confirmPass) {
      if (els.loginError) els.loginError.textContent = 'Passwords do not match';
      return;
    }

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, nickname, password, avatar: '✨' })
      });
      const data = await res.json();
      if (!res.ok) {
        if (els.loginError) els.loginError.textContent = data.error || 'Registration failed';
        return;
      }
      completeAuth(data);
    } catch (_) {
      if (els.loginError) els.loginError.textContent = 'Network error. Please try again.';
    }
  }

  function completeAuth(data) {
    authToken = data.token;
    myName = data.username;
    myProfile.avatar = data.avatar || '✨';
    myProfile.nickname = data.nickname || data.username;
    myProfile.statusBio = data.statusBio || 'Available';

    localStorage.setItem('bestieChatToken', authToken);
    localStorage.setItem('bestieChatName', myName);
    myRoom = `dm_${myName.toLowerCase()}_${myName.toLowerCase()}`;
    localStorage.setItem('bestieChatRoom', myRoom);

    if (els.sidebarMyAvatar) els.sidebarMyAvatar.textContent = myProfile.avatar;
    if (els.sidebarMyName) els.sidebarMyName.textContent = myProfile.nickname;

    els.login.style.display = 'none';
    els.chat.style.display = 'flex';

    initSocket();
    doSocketJoin();
    loadChatList();
    showToast(`Welcome, ${myProfile.nickname}! 🔒`);
  }

  function logout() {
    localStorage.removeItem('bestieChatToken');
    localStorage.removeItem('bestieChatName');
    localStorage.removeItem('bestieChatRoom');
    if (socket) socket.disconnect();
    window.location.reload();
  }

  // ═══════════════════ SOCKET CONNECTION ═══════════════════
  function initSocket() {
    if (!authToken || (socket && socket.connected)) return;
    if (typeof io === 'undefined') return;

    socket = io({
      reconnection: true,
      auth: { token: authToken }
    });

    socket.on('connect', () => {
      doSocketJoin();
    });

    socket.on('joined', payload => {
      if (payload.profile) myProfile = payload.profile;
      if (els.sidebarMyAvatar) els.sidebarMyAvatar.textContent = myProfile.avatar || '✨';
      if (els.sidebarMyName) els.sidebarMyName.textContent = myProfile.nickname || myName;
      
      // Render message history
      if (els.messages) {
        els.messages.innerHTML = '';
        if (payload.history && payload.history.length) {
          payload.history.forEach(m => renderMessage(m, false));
        }
        scrollBottom();
      }
      updateActiveHeader();
    });

    socket.on('presence', data => {
      currentOnlineUsers = data.users || [];
      updatePresenceIndicators();
    });

    socket.on('message', msg => {
      if (msg.room && msg.room !== myRoom) {
        loadChatList();
        if (msg.user !== myName) playNotificationSound();
        return;
      }
      renderMessage(msg, true);
      scrollBottom();
      loadChatList();
      if (msg.user !== myName) {
        playNotificationSound();
        socket.emit('mark-read', { messageId: msg.id });
      }
    });

    socket.on('chat-list-update', () => {
      loadChatList();
    });

    socket.on('call-signal', handleCallSignal);
  }

  function doSocketJoin() {
    if (!socket || !authToken) return;
    socket.emit('join', {
      name: myName,
      room: myRoom,
      nickname: myProfile.nickname
    });
  }

  // ═══════════════════ CHAT LIST & USER SEARCH ═══════════════════
  async function loadChatList() {
    if (!authToken) return;
    try {
      const resp = await fetch('/api/rooms/list', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (!resp.ok) return;
      const rooms = await resp.json();
      cachedUserRooms = rooms || [];
      renderChatList(cachedUserRooms);
    } catch (err) {
      console.error('loadChatList error:', err);
    }
  }

  function filterChatList(filterType, btn) {
    currentChatFilter = filterType || 'all';
    document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderChatList(cachedUserRooms);
  }

  function renderChatList(rooms) {
    const list = els.sidebarDmList;
    if (!list) return;

    let displayRooms = rooms || [];
    if (currentChatFilter === 'unread') {
      displayRooms = displayRooms.filter(r => r.unread > 0);
    } else if (currentChatFilter === 'direct') {
      displayRooms = displayRooms.filter(r => !r.isSaved);
    }

    if (!displayRooms.length) {
      list.innerHTML = `<div style="padding:32px 16px; text-align:center; color:var(--muted); font-size:13px;">
        <div style="font-size:36px; margin-bottom:8px;">💬</div>
        <div style="font-weight:700; color:#ffffff; margin-bottom:4px;">No chats yet</div>
        <div style="margin-bottom:12px;">Search for contacts above to start messaging</div>
        <button type="button" class="login-btn" onclick="BestieChat.openNewChatModal()" style="max-width:160px; margin:0 auto; padding:8px 14px; font-size:12px;">+ New Chat</button>
      </div>`;
      return;
    }

    list.innerHTML = renderChatListItems(displayRooms);
  }

  function renderChatListItems(rooms) {
    return rooms.map(room => {
      const isSaved = room.isSaved;
      const avatar = (room.otherProfile && room.otherProfile.avatar) || (isSaved ? '🔖' : '✨');
      const name = isSaved ? 'Note to Self' : (room.otherParticipant || room.name.replace('dm_', '').replace(/_/g, ', '));
      const displayName = isSaved ? 'Note to Self' : (room.otherProfile && room.otherProfile.nickname ? room.otherProfile.nickname : `@${name}`);
      const isOnline = !isSaved && currentOnlineUsers.some(u => (u || '').toLowerCase() === (room.otherParticipant || '').toLowerCase());
      const onlineDot = isOnline ? '<span class="dm-online-dot"></span>' : '';

      let tickHtml = '';
      if (room.lastMessage && room.lastMessage.user === myName) {
        tickHtml = '<span style="color:var(--check-blue); font-size:11px; font-weight:700; margin-right:3px;">✓✓ </span>';
      }

      const preview = room.lastMessage
        ? `${room.lastMessage.user === myName ? 'You: ' : ''}${room.lastMessage.text || (room.lastMessage.type === 'image' ? '📷 Photo' : room.lastMessage.type === 'voice' ? '🎤 Voice' : '📄 Document')}`.slice(0, 32)
        : (isSaved ? 'Your private notes & media' : 'Tap to message');
      const timeStr = room.lastActivity ? formatTimestamp(room.lastActivity) : '';
      const badge = room.unread > 0 ? `<div class="dm-badge">${room.unread}</div>` : '';
      const active = room.name === myRoom ? 'active' : '';

      return `<div class="dm-row ${active}" onclick="BestieChat.switchRoom('${escapeHtml(room.name)}')">
        <div class="dm-avatar-wrap">
          <div class="dm-avatar">${avatar}</div>
          ${onlineDot}
        </div>
        <div class="dm-info">
          <div class="dm-header-row">
            <div class="dm-name">${escapeHtml(displayName)}</div>
            <div class="dm-time">${timeStr}</div>
          </div>
          <div class="dm-sub-row">
            <div class="dm-preview">${tickHtml}${escapeHtml(preview)}</div>
            ${badge}
          </div>
        </div>
      </div>`;
    }).join('');
  }

  let _sidebarSearchTimeout;
  function handleSidebarSearch(query) {
    clearTimeout(_sidebarSearchTimeout);
    if (els.sidebarSearchClear) els.sidebarSearchClear.style.display = query ? 'block' : 'none';
    const cleanQ = String(query || '').trim().toLowerCase();

    if (!cleanQ) {
      renderChatList(cachedUserRooms);
      return;
    }

    _sidebarSearchTimeout = setTimeout(async () => {
      try {
        const matchingChats = cachedUserRooms.filter(r => {
          const name = (r.otherParticipant || r.name || '').toLowerCase();
          const nick = (r.otherProfile && r.otherProfile.nickname || '').toLowerCase();
          const lastText = (r.lastMessage && r.lastMessage.text || '').toLowerCase();
          return name.includes(cleanQ) || nick.includes(cleanQ) || lastText.includes(cleanQ);
        });

        let registeredUsers = [];
        try {
          const resp = await fetch(`/api/rooms/users/search?q=${encodeURIComponent(cleanQ)}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
          });
          if (resp.ok) registeredUsers = await resp.json();
        } catch (_) { /* ignore */ }

        const existingNames = matchingChats.map(r => (r.otherParticipant || '').toLowerCase());
        const otherUsers = registeredUsers.filter(u => !existingNames.includes(u.username.toLowerCase()) && u.username.toLowerCase() !== myName.toLowerCase());

        let html = '';
        if (matchingChats.length > 0) {
          html += '<div style="padding:6px 10px; font-size:10px; font-weight:700; color:var(--muted); text-transform:uppercase;">Conversations</div>';
          html += renderChatListItems(matchingChats);
        }
        if (otherUsers.length > 0) {
          html += '<div style="padding:8px 10px; font-size:10px; font-weight:700; color:var(--muted); text-transform:uppercase;">Users Directory</div>';
          html += otherUsers.map(u => `
            <div class="dm-row" onclick="BestieChat.startDMWith('${escapeHtml(u.username)}')">
              <div class="dm-avatar-wrap"><div class="dm-avatar">${u.avatar || '✨'}</div></div>
              <div class="dm-info">
                <div class="dm-name">${escapeHtml(u.nickname || u.username)}</div>
                <div style="font-size:11.5px; color:var(--muted);">@${escapeHtml(u.username)}</div>
              </div>
              <button type="button" class="login-btn" style="padding:4px 12px; font-size:11.5px; margin:0; width:auto;">Chat</button>
            </div>
          `).join('');
        }
        if (!matchingChats.length && !otherUsers.length) {
          html = `<div style="padding:24px 16px; text-align:center; color:var(--muted); font-size:13px;">No results found for "${escapeHtml(cleanQ)}"</div>`;
        }
        if (els.sidebarDmList) els.sidebarDmList.innerHTML = html;
      } catch (err) {
        console.error('handleSidebarSearch error:', err);
      }
    }, 150);
  }

  function clearSidebarSearch() {
    if (els.sidebarSearchInput) els.sidebarSearchInput.value = '';
    if (els.sidebarSearchClear) els.sidebarSearchClear.style.display = 'none';
    renderChatList(cachedUserRooms);
  }

  async function startDMWith(targetUsername) {
    if (!targetUsername) return;
    try {
      const resp = await fetch('/api/rooms/dm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ targetUsername })
      });
      if (!resp.ok) { showToast('Could not open chat'); return; }
      const data = await resp.json();
      closeNewChatModal();
      clearSidebarSearch();
      await switchRoom(data.roomName);
      await loadChatList();
      if (els.msgInput) els.msgInput.focus();
    } catch (_) {
      showToast('Error opening chat');
    }
  }

  async function switchRoom(roomName) {
    if (!roomName || roomName === myRoom) return;
    myRoom = roomName;
    localStorage.setItem('bestieChatRoom', roomName);
    if (els.messages) els.messages.innerHTML = '';
    doSocketJoin();
    closeSidebar();
    document.querySelectorAll('.dm-row').forEach(r => r.classList.remove('active'));
    document.querySelectorAll('.dm-row').forEach(r => {
      if (r.getAttribute('onclick') && r.getAttribute('onclick').includes(roomName)) r.classList.add('active');
    });
    updateActiveHeader();
  }

  function updateActiveHeader() {
    const isSaved = myRoom === `dm_${myName.toLowerCase()}_${myName.toLowerCase()}`;
    if (isSaved) {
      if (els.headerBestieAvatar) els.headerBestieAvatar.textContent = '🔖';
      if (els.headerBestieName) els.headerBestieName.textContent = 'Note to Self';
      if (els.headerBestieStatus) els.headerBestieStatus.textContent = 'Cloud storage & notes';
      return;
    }

    const otherUser = myRoom.replace('dm_', '').split('_').find(p => p.toLowerCase() !== myName.toLowerCase()) || 'Bestie';
    const isOnline = currentOnlineUsers.some(u => (u || '').toLowerCase() === otherUser.toLowerCase());

    if (els.headerBestieAvatar) els.headerBestieAvatar.textContent = '✨';
    if (els.headerBestieName) els.headerBestieName.textContent = `@${otherUser}`;
    if (els.headerBestieStatus) {
      els.headerBestieStatus.textContent = isOnline ? '● Online' : 'offline';
      els.headerBestieStatus.classList.toggle('online', isOnline);
    }
  }

  function updatePresenceIndicators() {
    updateActiveHeader();
    if (cachedUserRooms && cachedUserRooms.length) {
      renderChatList(cachedUserRooms);
    }
  }

  // ═══════════════════ MESSAGING ═══════════════════
  function sendMessage() {
    if (!els.msgInput) return;
    const text = els.msgInput.value.trim();
    if (!text) {
      toggleRecord();
      return;
    }

    const payload = {
      text,
      user: myName,
      room: myRoom,
      time: Date.now(),
      type: 'text',
      replyTo: replyingTo
    };

    renderMessage(payload, true);
    scrollBottom();

    if (socket && socket.connected) {
      socket.emit('message', payload);
    }

    els.msgInput.value = '';
    autoExpandMsgInput();
    cancelReply();
    updateSendBtnIcon();
  }

  function renderMessage(msg, animate = false) {
    if (!els.messages || !msg) return;
    const isMe = (msg.user || '').toLowerCase() === (myName || '').toLowerCase();
    const wrap = document.createElement('div');
    wrap.className = `msg-wrap ${isMe ? 'me' : 'them'}`;
    if (!animate) wrap.style.animation = 'none';

    let contentHtml = '';

    // Quoted reply
    if (msg.replyTo) {
      contentHtml += `<div class="reply-quote" onclick="BestieChat.scrollToMessage('${msg.replyTo.id}')">
        <span class="reply-quote-name">${escapeHtml(msg.replyTo.user || 'Reply')}</span>
        <span class="reply-quote-text">${escapeHtml(msg.replyTo.text || 'Message')}</span>
      </div>`;
    }

    // Media type handling
    if (msg.type === 'image' && msg.url) {
      contentHtml += `<img class="chat-photo-img" src="${escapeHtml(msg.url)}" onclick="BestieChat.openLightbox('${escapeHtml(msg.url)}')" loading="lazy" />`;
    } else if (msg.type === 'voice' && msg.url) {
      contentHtml += `<div class="voice-bubble">
        <button type="button" class="voice-play-btn" onclick="BestieChat.playAudio('${escapeHtml(msg.url)}', this)">▶</button>
        <div style="font-size:12px; color:var(--muted);">Voice note (${msg.duration || 0}s)</div>
      </div>`;
    } else if (msg.type === 'document' && msg.url) {
      contentHtml += `<a href="${escapeHtml(msg.url)}" download class="doc-card" style="text-decoration:none;">
        <div class="doc-icon">📄</div>
        <div>
          <div class="doc-name">${escapeHtml(msg.docName || 'Document')}</div>
          <div class="doc-size">${msg.docSize ? Math.round(msg.docSize / 1024) + ' KB' : 'Download'}</div>
        </div>
      </a>`;
    } else {
      contentHtml += `<span>${escapeHtml(msg.text || '')}</span>`;
    }

    const timeStr = formatTime(msg.time || Date.now());
    const tickHtml = isMe ? '<span class="msg-status-ticks read"><svg viewBox="0 0 16 15" width="14" height="13" fill="none"><path d="M15.01 3.316l-7.92 8.56a.91.91 0 01-.67.3.91.91 0 01-.67-.3L2.3 8.35a.96.96 0 010-1.34.93.93 0 011.33 0l3.46 3.72 7.25-7.84a.93.93 0 011.34 0 .96.96 0 010 1.166l-7.92 8.56" fill="currentColor"/></svg></span>' : '';

    wrap.innerHTML = `<div class="msg ${isMe ? 'me' : 'them'}">
      ${contentHtml}
      <div class="bubble-meta">
        <span>${timeStr}</span>
        ${tickHtml}
      </div>
    </div>`;

    els.messages.appendChild(wrap);
  }

  function autoExpandMsgInput() {
    if (!els.msgInput) return;
    els.msgInput.style.height = 'auto';
    els.msgInput.style.height = Math.min(els.msgInput.scrollHeight, 120) + 'px';
  }

  function updateSendBtnIcon() {
    if (!els.sendBtn) return;
    const hasText = Boolean(els.msgInput && els.msgInput.value.trim());
    if (els.sendIcon) els.sendIcon.style.display = hasText ? 'block' : 'none';
    if (els.micIcon) els.micIcon.style.display = hasText ? 'none' : 'block';
  }

  function handleSendBtnClick() {
    const hasText = Boolean(els.msgInput && els.msgInput.value.trim());
    if (hasText) sendMessage();
    else toggleRecord();
  }

  // ═══════════════════ VOICE RECORDING ═══════════════════
  async function toggleRecord() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      if (els.sendBtn) els.sendBtn.classList.remove('recording');
      if (els.recordingWaveformBar) els.recordingWaveformBar.style.display = 'none';
      if (recordingTimerInterval) clearInterval(recordingTimerInterval);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunks = [];
      mediaRecorder = new MediaRecorder(stream);

      mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        stream.getTracks().forEach(t => t.stop());
        if (recordingSeconds > 0) {
          await uploadVoiceBlob(audioBlob, recordingSeconds);
        }
      };

      mediaRecorder.start();
      recordingSeconds = 0;
      if (els.sendBtn) els.sendBtn.classList.add('recording');
      if (els.recordingWaveformBar) els.recordingWaveformBar.style.display = 'flex';

      recordingTimerInterval = setInterval(() => {
        recordingSeconds++;
        const mins = Math.floor(recordingSeconds / 60);
        const secs = recordingSeconds % 60;
        if (els.recordingTimer) els.recordingTimer.textContent = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
      }, 1000);
    } catch (_) {
      showToast('Microphone access denied');
    }
  }

  function cancelRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      recordingSeconds = 0;
      mediaRecorder.stop();
      if (els.sendBtn) els.sendBtn.classList.remove('recording');
      if (els.recordingWaveformBar) els.recordingWaveformBar.style.display = 'none';
      if (recordingTimerInterval) clearInterval(recordingTimerInterval);
      showToast('Recording cancelled');
    }
  }

  async function uploadVoiceBlob(blob, duration) {
    const formData = new FormData();
    formData.append('file', blob, 'voice.webm');
    formData.append('room', myRoom);
    formData.append('duration', duration);

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.url) {
        const payload = {
          type: 'voice',
          url: data.url,
          duration,
          user: myName,
          room: myRoom,
          time: Date.now()
        };
        renderMessage(payload, true);
        scrollBottom();
        if (socket && socket.connected) socket.emit('message', payload);
      }
    } catch (_) {
      showToast('Failed to upload voice note');
    }
  }

  // ═══════════════════ FILE / PHOTO UPLOAD ═══════════════════
  async function sendPhoto(files) {
    if (!files || !files.length) return;
    const file = files[0];
    const formData = new FormData();
    formData.append('file', file);
    formData.append('room', myRoom);

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.url) {
        const payload = {
          type: 'image',
          url: data.url,
          user: myName,
          room: myRoom,
          time: Date.now()
        };
        renderMessage(payload, true);
        scrollBottom();
        if (socket && socket.connected) socket.emit('message', payload);
      }
    } catch (_) {
      showToast('Failed to upload photo');
    }
  }

  async function uploadDocumentFile(input) {
    if (!input || !input.files || !input.files.length) return;
    const file = input.files[0];
    const formData = new FormData();
    formData.append('file', file);
    formData.append('room', myRoom);

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.url) {
        const payload = {
          type: 'document',
          url: data.url,
          docName: file.name,
          docSize: file.size,
          user: myName,
          room: myRoom,
          time: Date.now()
        };
        renderMessage(payload, true);
        scrollBottom();
        if (socket && socket.connected) socket.emit('message', payload);
      }
    } catch (_) {
      showToast('Failed to upload document');
    }
  }

  async function uploadCameraFile(input) {
    if (input && input.files) sendPhoto(input.files);
  }

  // ═══════════════════ WEBRTC CALLS ═══════════════════
  async function startCall(type) {
    const isSaved = myRoom === `dm_${myName.toLowerCase()}_${myName.toLowerCase()}`;
    if (isSaved) {
      showToast('Cannot call yourself in Note to Self');
      return;
    }

    const overlay = document.getElementById('callOverlay');
    if (overlay) overlay.style.display = 'flex';

    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: type === 'video'
      });
      const localVid = document.getElementById('callLocalVideo');
      if (localVid && type === 'video') localVid.srcObject = localStream;
      if (socket) socket.emit('call-signal', { room: myRoom, type: 'offer', callType: type });
    } catch (_) {
      showToast('Media permissions required for calling');
      endCall();
    }
  }

  function endCall() {
    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
      localStream = null;
    }
    const overlay = document.getElementById('callOverlay');
    if (overlay) overlay.style.display = 'none';
    if (socket) socket.emit('call-signal', { room: myRoom, type: 'hangup' });
  }

  function toggleMuteAudio() {
    if (!localStream) return;
    isMuted = !isMuted;
    localStream.getAudioTracks().forEach(t => t.enabled = !isMuted);
    showToast(isMuted ? 'Muted 🔇' : 'Unmuted 🎙️');
  }

  function toggleCamera() {
    if (!localStream) return;
    isCameraOff = !isCameraOff;
    localStream.getVideoTracks().forEach(t => t.enabled = !isCameraOff);
    showToast(isCameraOff ? 'Camera off 🚫' : 'Camera on 📹');
  }

  function handleCallSignal(data) {
    if (!data) return;
    if (data.type === 'hangup') {
      endCall();
      showToast('Call ended');
    }
  }

  // ═══════════════════ MODALS & UI HELPERS ═══════════════════
  function toggleSidebar() {
    document.body.classList.toggle('in-chat');
  }

  function closeSidebar() {
    document.body.classList.add('in-chat');
  }

  function openNewChatModal() {
    const modal = document.getElementById('newChatModal');
    if (modal) {
      modal.style.display = 'flex';
      const input = document.getElementById('newChatSearch');
      if (input) { input.value = ''; input.focus(); }
      searchUsersForDM('');
    }
  }

  function closeNewChatModal() {
    const modal = document.getElementById('newChatModal');
    if (modal) modal.style.display = 'none';
  }

  async function searchUsersForDM(query) {
    const results = document.getElementById('newChatResults');
    if (!results) return;
    try {
      const resp = await fetch(`/api/rooms/users/search?q=${encodeURIComponent(query || '')}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (!resp.ok) return;
      const users = await resp.json();
      if (!users.length) {
        results.innerHTML = '<div style="padding:20px; text-align:center; color:var(--muted); font-size:13px;">No registered users found</div>';
        return;
      }
      results.innerHTML = users.map(u => `
        <div class="user-result-row" onclick="BestieChat.startDMWith('${escapeHtml(u.username)}')">
          <div style="display:flex; align-items:center; gap:10px;">
            <div style="width:38px; height:38px; border-radius:50%; background:var(--surface2); display:flex; align-items:center; justify-content:center; font-size:18px;">${u.avatar || '✨'}</div>
            <div>
              <div style="font-weight:700; font-size:13.5px; color:#fff;">${escapeHtml(u.nickname || u.username)}</div>
              <div style="font-size:11.5px; color:var(--muted);">@${escapeHtml(u.username)}</div>
            </div>
          </div>
          <button type="button" class="login-btn" style="padding:5px 14px; font-size:12px; margin:0; width:auto;">Message</button>
        </div>
      `).join('');
    } catch (_) { /* ignore */ }
  }

  function openProfile() {
    const modal = document.getElementById('profileModal');
    if (modal) {
      modal.style.display = 'flex';
      const nick = document.getElementById('profileNickname');
      const status = document.getElementById('profileStatus');
      const bigAvatar = document.getElementById('profileBigAvatar');
      if (nick) nick.value = myProfile.nickname || '';
      if (status) status.value = myProfile.statusBio || '';
      if (bigAvatar) bigAvatar.textContent = myProfile.avatar || '✨';
    }
  }

  function closeProfile() {
    const modal = document.getElementById('profileModal');
    if (modal) modal.style.display = 'none';
  }

  function selectAvatar(emoji) {
    myProfile.avatar = emoji;
    const bigAvatar = document.getElementById('profileBigAvatar');
    if (bigAvatar) bigAvatar.textContent = emoji;
  }

  async function saveProfile() {
    const nick = (document.getElementById('profileNickname') || {}).value;
    const status = (document.getElementById('profileStatus') || {}).value;
    myProfile.nickname = nick || myName;
    myProfile.statusBio = status || '';

    try {
      await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ avatar: myProfile.avatar, nickname: myProfile.nickname, statusBio: myProfile.statusBio })
      });
      if (els.sidebarMyAvatar) els.sidebarMyAvatar.textContent = myProfile.avatar;
      if (els.sidebarMyName) els.sidebarMyName.textContent = myProfile.nickname;
      closeProfile();
      showToast('Profile updated ✨');
    } catch (_) {
      showToast('Failed to save profile');
    }
  }

  function openPrefsModal() {
    const modal = document.getElementById('prefsModal');
    if (modal) modal.style.display = 'flex';
  }

  function closePrefsModal() {
    const modal = document.getElementById('prefsModal');
    if (modal) modal.style.display = 'none';
  }

  function selectTheme(_val) {
    showToast('Signal AMOLED Dark mode active 🔒');
  }

  function openStarredModal() {
    const modal = document.getElementById('starredModal');
    if (modal) modal.style.display = 'flex';
  }

  function closeStarredModal() {
    const modal = document.getElementById('starredModal');
    if (modal) modal.style.display = 'none';
  }

  function toggleAttachMenu() {
    if (!els.attachMenu) return;
    els.attachMenu.style.display = els.attachMenu.style.display === 'grid' ? 'none' : 'grid';
  }

  function buildEmojiPicker() {
    if (!els.emojiPicker) return;
    els.emojiPicker.innerHTML = EMOJIS.map(e => `<button type="button" onclick="BestieChat.insertEmoji('${e}')">${e}</button>`).join('');
  }

  function toggleEmojiPicker() {
    if (!els.emojiPicker) return;
    const isOpen = els.emojiPicker.classList.toggle('open');
    els.emojiPicker.style.display = isOpen ? 'grid' : 'none';
  }

  function insertEmoji(emoji) {
    if (!els.msgInput) return;
    els.msgInput.value += emoji;
    els.msgInput.focus();
    updateSendBtnIcon();
  }

  function openLightbox(url) {
    const lb = document.getElementById('lightbox');
    const img = document.getElementById('lightboxImg');
    if (lb && img) {
      img.src = url;
      lb.style.display = 'flex';
    }
  }

  function closeLightbox() {
    const lb = document.getElementById('lightbox');
    if (lb) lb.style.display = 'none';
  }

  function cancelReply() {
    replyingTo = null;
    if (els.replyBar) els.replyBar.style.display = 'none';
  }

  async function deleteRoom() {
    if (!myRoom) return;
    try {
      await fetch(`/api/rooms/${encodeURIComponent(myRoom)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      showToast('Chat cleared 🗑️');
      loadChatList();
      switchRoom(`dm_${myName.toLowerCase()}_${myName.toLowerCase()}`);
    } catch (_) { /* ignore */ }
  }

  function toggleSearch() {
    const bar = document.getElementById('searchBar');
    if (bar) {
      bar.style.display = bar.style.display === 'flex' ? 'none' : 'flex';
      const input = document.getElementById('searchInput');
      if (input && bar.style.display === 'flex') input.focus();
    }
  }

  function clearSearch() {
    const bar = document.getElementById('searchBar');
    if (bar) bar.style.display = 'none';
  }

  function playAudio(url, btn) {
    const audio = new Audio(url);
    if (btn) btn.textContent = '⏸';
    audio.onended = () => { if (btn) btn.textContent = '▶'; };
    audio.play().catch(() => {});
  }

  function playNotificationSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12); // A5
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.18);
    } catch (_) { /* ignore */ }
  }

  function showToast(msg) {
    const container = els.toastContainer || document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 2800);
  }

  function scrollBottom() {
    if (els.messages) {
      els.messages.scrollTop = els.messages.scrollHeight;
    }
  }

  function formatTime(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function formatTimestamp(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  // ═══════════════════ EXPORTS ═══════════════════
  window.BestieChat = {
    switchAuthTab, handleSignIn, handleRegister, joinChat: handleAuthSubmit, logout,
    toggleSidebar, closeSidebar,
    loadChatList, filterChatList, handleSidebarSearch, clearSidebarSearch,
    openNewChatModal, closeNewChatModal, searchUsersForDM, startDMWith, switchRoom, deleteRoom,
    sendMessage, handleSendBtnClick, toggleRecord, cancelRecording,
    sendPhoto, uploadDocumentFile, uploadCameraFile,
    toggleAttachMenu, toggleEmojiPicker, insertEmoji,
    openProfile, closeProfile, selectAvatar, saveProfile,
    openPrefsModal, closePrefsModal, selectTheme,
    openStarredModal, closeStarredModal,
    openLightbox, closeLightbox, cancelReply,
    startCall, endCall, toggleMuteAudio, toggleCamera,
    toggleSearch, clearSearch, playAudio,
    toggleSound: () => showToast('Sound active 🔊'),
    toggleTheme: () => showToast('Signal AMOLED Dark active 🌙')
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
