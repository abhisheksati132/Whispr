/**
 * TAHC — Pure Black & White Minimalist & Beginner-Friendly Client
 */
(() => {
  'use strict';

  // ═══════════════════ STATE ═══════════════════
  let socket = null;
  let authToken = localStorage.getItem('bestieChatToken') || null;
  let myName = localStorage.getItem('bestieChatName') || '';
  let myRoom = localStorage.getItem('bestieChatRoom') || '';
  let myProfile = { avatar: 'Y', nickname: '', statusBio: '' };
  
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

  const EMOJIS = ['❤️','👍','🔥','🎉','😍','😂','🥺','✨','💯','🙌','👏','🙏','😎','😴','😭','🤔'];

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
    if (els.sidebarSearchInput) {
      els.sidebarSearchInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const val = String(els.sidebarSearchInput.value || '').trim().replace(/^@+/, '');
          if (val) startDMWith(val);
        }
      });
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
    hideLoginError();

    if (tab === 'signin') {
      if (tabIn) tabIn.classList.add('active');
      if (tabReg) tabReg.classList.remove('active');
      if (nickField) nickField.style.display = 'none';
      if (confirmField) confirmField.style.display = 'none';
      if (els.joinBtnText) els.joinBtnText.textContent = 'Sign In';
    } else {
      if (tabReg) tabReg.classList.add('active');
      if (tabIn) tabIn.classList.remove('active');
      if (nickField) nickField.style.display = 'flex';
      if (confirmField) confirmField.style.display = 'flex';
      if (els.joinBtnText) els.joinBtnText.textContent = 'Create Account';
    }
  }

  function showLoginError(msg) {
    if (els.loginError) {
      els.loginError.textContent = msg;
      els.loginError.style.display = 'block';
    }
  }

  function hideLoginError() {
    if (els.loginError) {
      els.loginError.textContent = '';
      els.loginError.style.display = 'none';
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
      showLoginError('Please enter username and password');
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
        showLoginError(data.error || 'Incorrect username or password');
        return;
      }
      completeAuth(data);
    } catch (_) {
      showLoginError('Network error. Please try again.');
    }
  }

  async function handleRegister() {
    const username = (els.nameInput ? els.nameInput.value : '').trim();
    const nickname = (els.regNicknameInput ? els.regNicknameInput.value : '').trim() || username;
    const password = (els.passwordInput ? els.passwordInput.value : '').trim();
    const confirmPass = (els.regPasswordConfirmInput ? els.regPasswordConfirmInput.value : '').trim();

    if (!username || !password) {
      showLoginError('Username and password are required');
      return;
    }
    if (password !== confirmPass) {
      showLoginError('Passwords do not match');
      return;
    }

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, nickname, password, avatar: getInitial(nickname || username) })
      });
      const data = await res.json();
      if (!res.ok) {
        showLoginError(data.error || 'Registration failed');
        return;
      }
      completeAuth(data);
    } catch (_) {
      showLoginError('Network error. Please try again.');
    }
  }

  function completeAuth(data) {
    authToken = data.token;
    myName = data.username;
    myProfile.nickname = data.nickname || data.username;
    myProfile.avatar = getInitial(myProfile.nickname);
    myProfile.statusBio = data.statusBio || 'Online';

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
    showToast(`Welcome to tahc, ${myProfile.nickname}!`);
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
      if (els.sidebarMyAvatar) els.sidebarMyAvatar.textContent = getInitial(myProfile.nickname || myName);
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
        if (msg.user !== myName) playNotificationTone();
        return;
      }
      renderMessage(msg, true);
      scrollBottom();
      loadChatList();
      if (msg.user !== myName) {
        playNotificationTone();
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
    }

    if (!displayRooms.length) {
      list.innerHTML = `<div style="padding:32px 16px; text-align:center; color:var(--muted); font-size:13px;">
        <div style="font-weight:700; color:#ffffff; margin-bottom:6px;">No conversations yet</div>
        <div style="margin-bottom:14px;">Search for someone to start messaging:</div>
        <button type="button" class="login-btn" onclick="BestieChat.openNewChatModal()" style="max-width:180px; margin:0 auto; padding:8px 14px; font-size:12px;">+ New Message</button>
      </div>`;
      return;
    }

    list.innerHTML = renderChatListItems(displayRooms);
  }

  function renderChatListItems(rooms) {
    return rooms.map(room => {
      const isSaved = room.isSaved;
      const name = isSaved ? 'Note to Self' : (room.otherParticipant || room.name.replace('dm_', '').replace(/_/g, ', '));
      const displayName = isSaved ? 'Note to Self' : (room.otherProfile && room.otherProfile.nickname ? room.otherProfile.nickname : `@${name}`);
      const avatarInitial = isSaved ? 'N' : getInitial(displayName);
      const isOnline = !isSaved && currentOnlineUsers.some(u => (u || '').toLowerCase() === (room.otherParticipant || '').toLowerCase());
      const onlineDot = isOnline ? '<span class="dm-online-dot"></span>' : '';

      let tickHtml = '';
      if (room.lastMessage && room.lastMessage.user === myName) {
        tickHtml = '<span style="font-weight:700; margin-right:3px;">✓✓ </span>';
      }

      const preview = room.lastMessage
        ? `${room.lastMessage.user === myName ? 'You: ' : ''}${room.lastMessage.text || (room.lastMessage.type === 'image' ? 'Photo' : room.lastMessage.type === 'voice' ? 'Voice note' : 'Document')}`.slice(0, 32)
        : (isSaved ? 'Your private notes' : 'Tap to chat');
      const timeStr = room.lastActivity ? formatTimestamp(room.lastActivity) : '';
      const badge = room.unread > 0 ? `<div class="dm-badge">${room.unread}</div>` : '';
      const active = room.name === myRoom ? 'active' : '';

      return `<div class="dm-row ${active}" onclick="BestieChat.switchRoom('${escapeHtml(room.name)}')">
        <div class="dm-avatar-wrap">
          <div class="dm-avatar">${avatarInitial}</div>
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
    const cleanQ = String(query || '').trim().toLowerCase().replace(/^@+/, '');

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

        // Always show direct message action at top of search
        html += `
          <div class="dm-row" onclick="BestieChat.startDMWith('${escapeHtml(cleanQ)}')" style="background:var(--surface2); border:1px solid rgba(255,255,255,0.3); margin-bottom:6px;">
            <div class="dm-avatar-wrap"><div class="dm-avatar">${getInitial(cleanQ)}</div></div>
            <div class="dm-info">
              <div class="dm-name">Start chat with @${escapeHtml(cleanQ)}</div>
              <div style="font-size:11.5px; color:var(--muted);">Click to message directly</div>
            </div>
            <button type="button" class="login-btn" onclick="event.stopPropagation(); BestieChat.startDMWith('${escapeHtml(cleanQ)}')" style="padding:4px 12px; font-size:11.5px; margin:0; width:auto;">Message</button>
          </div>
        `;

        if (matchingChats.length > 0) {
          html += '<div style="padding:6px 10px; font-size:10px; font-weight:700; color:var(--muted); text-transform:uppercase;">Active Chats</div>';
          html += renderChatListItems(matchingChats);
        }
        if (otherUsers.length > 0) {
          html += '<div style="padding:8px 10px; font-size:10px; font-weight:700; color:var(--muted); text-transform:uppercase;">Registered Users</div>';
          html += otherUsers.map(u => `
            <div class="dm-row" onclick="BestieChat.startDMWith('${escapeHtml(u.username)}')">
              <div class="dm-avatar-wrap"><div class="dm-avatar">${getInitial(u.nickname || u.username)}</div></div>
              <div class="dm-info">
                <div class="dm-name">${escapeHtml(u.nickname || u.username)}</div>
                <div style="font-size:11.5px; color:var(--muted);">@${escapeHtml(u.username)}</div>
              </div>
              <button type="button" class="login-btn" onclick="event.stopPropagation(); BestieChat.startDMWith('${escapeHtml(u.username)}')" style="padding:4px 12px; font-size:11.5px; margin:0; width:auto;">Chat</button>
            </div>
          `).join('');
        }
        if (els.sidebarDmList) els.sidebarDmList.innerHTML = html;
      } catch (err) {
        console.error('handleSidebarSearch error:', err);
      }
    }, 100);
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
      if (els.headerBestieAvatar) els.headerBestieAvatar.textContent = 'N';
      if (els.headerBestieName) els.headerBestieName.textContent = 'Note to Self';
      if (els.headerBestieStatus) els.headerBestieStatus.textContent = 'Private cloud storage';
      return;
    }

    const otherUser = myRoom.replace('dm_', '').split('_').find(p => p.toLowerCase() !== myName.toLowerCase()) || 'User';
    const isOnline = currentOnlineUsers.some(u => (u || '').toLowerCase() === otherUser.toLowerCase());

    if (els.headerBestieAvatar) els.headerBestieAvatar.textContent = getInitial(otherUser);
    if (els.headerBestieName) els.headerBestieName.textContent = `@${otherUser}`;
    if (els.headerBestieStatus) {
      els.headerBestieStatus.textContent = isOnline ? 'Online' : 'Offline';
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

  function renderMessage(msg, _animate = false) {
    if (!els.messages || !msg) return;
    const isMe = (msg.user || '').toLowerCase() === (myName || '').toLowerCase();
    const wrap = document.createElement('div');
    wrap.className = `msg-wrap ${isMe ? 'me' : 'them'}`;

    let contentHtml = '';

    // Quoted reply
    if (msg.replyTo) {
      contentHtml += `<div class="reply-quote" onclick="BestieChat.scrollToMessage('${msg.replyTo.id}')">
        <span class="reply-quote-name">${escapeHtml(msg.replyTo.user || 'Reply')}</span>
        <span class="reply-quote-text">${escapeHtml(msg.replyTo.text || 'Message')}</span>
      </div>`;
    }

    // Media types
    if (msg.type === 'image' && msg.url) {
      contentHtml += `<img class="chat-photo-img" src="${escapeHtml(msg.url)}" onclick="BestieChat.openLightbox('${escapeHtml(msg.url)}')" loading="lazy" />`;
    } else if (msg.type === 'voice' && msg.url) {
      contentHtml += `<div class="voice-bubble">
        <button type="button" class="voice-play-btn" onclick="BestieChat.playAudio('${escapeHtml(msg.url)}', this)">▶</button>
        <div style="font-size:12px;">Voice note (${msg.duration || 0}s)</div>
      </div>`;
    } else if (msg.type === 'document' && msg.url) {
      contentHtml += `<a href="${escapeHtml(msg.url)}" download class="doc-card" style="text-decoration:none; color:inherit;">
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
    const tickHtml = isMe ? '<span class="msg-status-ticks"> ✓✓</span>' : '';

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

  // ═══════════════════ CALLS ═══════════════════
  async function startCall(type) {
    const isSaved = myRoom === `dm_${myName.toLowerCase()}_${myName.toLowerCase()}`;
    if (isSaved) {
      showToast('Cannot call Note to Self');
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
      showToast('Camera / Microphone permission required');
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
    showToast(isMuted ? 'Muted' : 'Unmuted');
  }

  function toggleCamera() {
    if (!localStream) return;
    isCameraOff = !isCameraOff;
    localStream.getVideoTracks().forEach(t => t.enabled = !isCameraOff);
    showToast(isCameraOff ? 'Camera Off' : 'Camera On');
  }

  function handleCallSignal(data) {
    if (!data) return;
    if (data.type === 'hangup') {
      endCall();
      showToast('Call ended');
    }
  }

  // ═══════════════════ MODALS & HELPERS ═══════════════════
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
      if (input) {
        input.value = '';
        input.focus();
        input.onkeydown = (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            const val = String(input.value || '').trim().replace(/^@+/, '');
            if (val) startDMWith(val);
          }
        };
      }
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
    const cleanQ = String(query || '').trim().replace(/^@+/, '');

    try {
      const resp = await fetch(`/api/rooms/users/search?q=${encodeURIComponent(cleanQ)}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (!resp.ok) return;
      const users = await resp.json();

      let html = '';
      if (cleanQ) {
        html += `
          <div class="user-result-row" onclick="BestieChat.startDMWith('${escapeHtml(cleanQ)}')" style="background:var(--surface2); border:1px solid rgba(255,255,255,0.4);">
            <div style="display:flex; align-items:center; gap:10px;">
              <div style="width:36px; height:36px; border-radius:50%; background:#fff; color:#000; display:flex; align-items:center; justify-content:center; font-size:14px; font-weight:700;">${getInitial(cleanQ)}</div>
              <div>
                <div style="font-weight:700; font-size:13.5px; color:#fff;">Message @${escapeHtml(cleanQ)} directly</div>
                <div style="font-size:11.5px; color:var(--muted);">Click or press Enter to start chat</div>
              </div>
            </div>
            <button type="button" class="login-btn" onclick="event.stopPropagation(); BestieChat.startDMWith('${escapeHtml(cleanQ)}')" style="padding:5px 14px; font-size:12px; margin:0; width:auto;">Chat</button>
          </div>
        `;
      }

      if (users && users.length > 0) {
        html += users.map(u => `
          <div class="user-result-row" onclick="BestieChat.startDMWith('${escapeHtml(u.username)}')">
            <div style="display:flex; align-items:center; gap:10px;">
              <div style="width:36px; height:36px; border-radius:50%; background:var(--surface2); border:1px solid var(--border); display:flex; align-items:center; justify-content:center; font-size:14px; font-weight:700; color:#fff;">${getInitial(u.nickname || u.username)}</div>
              <div>
                <div style="font-weight:700; font-size:13.5px; color:#fff;">${escapeHtml(u.nickname || u.username)}</div>
                <div style="font-size:11.5px; color:var(--muted);">@${escapeHtml(u.username)}</div>
              </div>
            </div>
            <button type="button" class="login-btn" onclick="event.stopPropagation(); BestieChat.startDMWith('${escapeHtml(u.username)}')" style="padding:5px 14px; font-size:12px; margin:0; width:auto;">Message</button>
          </div>
        `).join('');
      } else if (!cleanQ) {
        html += '<div style="padding:20px; text-align:center; color:var(--muted); font-size:13px;">Type any username above to start chatting</div>';
      }

      results.innerHTML = html;
    } catch (_) { /* ignore */ }
  }

  function openProfile() {
    const modal = document.getElementById('profileModal');
    if (modal) {
      modal.style.display = 'flex';
      const nick = document.getElementById('profileNickname');
      const status = document.getElementById('profileStatus');
      if (nick) nick.value = myProfile.nickname || '';
      if (status) status.value = myProfile.statusBio || '';
    }
  }

  function closeProfile() {
    const modal = document.getElementById('profileModal');
    if (modal) modal.style.display = 'none';
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
        body: JSON.stringify({ avatar: getInitial(myProfile.nickname), nickname: myProfile.nickname, statusBio: myProfile.statusBio })
      });
      if (els.sidebarMyAvatar) els.sidebarMyAvatar.textContent = getInitial(myProfile.nickname);
      if (els.sidebarMyName) els.sidebarMyName.textContent = myProfile.nickname;
      closeProfile();
      showToast('Profile updated');
    } catch (_) {
      showToast('Failed to save profile');
    }
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
      showToast('Chat cleared');
      loadChatList();
      switchRoom(`dm_${myName.toLowerCase()}_${myName.toLowerCase()}`);
    } catch (_) { /* ignore */ }
  }

  function playAudio(url, btn) {
    const audio = new Audio(url);
    if (btn) btn.textContent = '⏸';
    audio.onended = () => { if (btn) btn.textContent = '▶'; };
    audio.play().catch(() => { /* ignore */ });
  }

  function playNotificationTone() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch (_) { /* ignore */ }
  }

  function showToast(msg) {
    const container = els.toastContainer || document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 2600);
  }

  function scrollBottom() {
    if (els.messages) {
      els.messages.scrollTop = els.messages.scrollHeight;
    }
  }

  function getInitial(str) {
    if (!str) return 'U';
    return String(str).trim().charAt(0).toUpperCase();
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
    openProfile, closeProfile, saveProfile,
    openLightbox, closeLightbox, cancelReply,
    startCall, endCall, toggleMuteAudio, toggleCamera,
    playAudio,
    toggleSound: () => showToast('Sound active'),
    toggleTheme: () => showToast('Black & White monochrome active')
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
