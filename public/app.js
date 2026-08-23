/**
 * TAHC — God-Level Professional Monochrome Messenger
 * Powered by IndexedDB Local Cache, Client-Side Compression & Fast WebRTC
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
  let currentPinnedMessage = null;

  // WebRTC Call State
  let peerConnection = null;
  let localStream = null;
  let incomingCallData = null;
  let isMuted = false;
  let isCameraOff = false;
  let callTimerInterval = null;
  let callSeconds = 0;
  let ringtoneAudio = null;

  const RTC_CONFIG = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' }
    ]
  };
  
  // Media recorder for voice notes
  let mediaRecorder = null;
  let audioChunks = [];
  let recordingTimerInterval = null;
  let recordingSeconds = 0;

  // DOM Elements cache
  let els = {};

  const EMOJIS = ['❤️','👍','🔥','🎉','😍','😂','🥺','✨','💯','🙌','👏','🙏','😎','😴','😭','🤔'];

  // ═══════════════════ INDEXEDDB LOCAL STORAGE ENGINE ═══════════════════
  let dbPromise = null;

  function initIndexedDB() {
    if (!window.indexedDB) return;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open('tahc_local_db', 1);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('messages')) {
          const store = db.createObjectStore('messages', { keyPath: 'id' });
          store.createIndex('room', 'room', { unique: false });
        }
        if (!db.objectStoreNames.contains('rooms')) {
          db.createObjectStore('rooms', { keyPath: 'name' });
        }
      };
      req.onsuccess = e => resolve(e.target.result);
      req.onerror = e => reject(e);
    }).catch(err => {
      console.warn('IndexedDB unavailable, falling back to network:', err);
      return null;
    });
  }

  async function idbSaveMessages(roomName, msgs) {
    const db = await dbPromise;
    if (!db || !Array.isArray(msgs)) return;
    try {
      const tx = db.transaction('messages', 'readwrite');
      const store = tx.objectStore('messages');
      for (const m of msgs) {
        if (m && m.id) store.put({ ...m, room: roomName });
      }
    } catch (_) { /* ignore */ }
  }

  async function idbGetMessages(roomName) {
    const db = await dbPromise;
    if (!db) return [];
    return new Promise(resolve => {
      try {
        const tx = db.transaction('messages', 'readonly');
        const store = tx.objectStore('messages');
        const index = store.index('room');
        const req = index.getAll(roomName);
        req.onsuccess = () => {
          const res = req.result || [];
          res.sort((a, b) => (a.time || 0) - (b.time || 0));
          resolve(res);
        };
        req.onerror = () => resolve([]);
      } catch (_) { resolve([]); }
    });
  }

  async function idbSaveRooms(rooms) {
    const db = await dbPromise;
    if (!db || !Array.isArray(rooms)) return;
    try {
      const tx = db.transaction('rooms', 'readwrite');
      const store = tx.objectStore('rooms');
      for (const r of rooms) {
        if (r && r.name) store.put(r);
      }
    } catch (_) { /* ignore */ }
  }

  async function idbGetRooms() {
    const db = await dbPromise;
    if (!db) return [];
    return new Promise(resolve => {
      try {
        const tx = db.transaction('rooms', 'readonly');
        const store = tx.objectStore('rooms');
        const req = store.getAll();
        req.onsuccess = () => {
          const res = req.result || [];
          res.sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0));
          resolve(res);
        };
        req.onerror = () => resolve([]);
      } catch (_) { resolve([]); }
    });
  }

  // ═══════════════════ INIT ═══════════════════
  async function init() {
    initIndexedDB();
    cacheElements();
    buildEmojiPicker();
    setupEventListeners();
    setupMobileViewport();
    setupDragAndDrop();
    setupClipboardPaste();
    setupKeyboardShortcuts();

    if (authToken && myName) {
      if (!myRoom) myRoom = `dm_${myName.toLowerCase()}_${myName.toLowerCase()}`;
      els.login.style.display = 'none';
      els.chat.style.display = 'flex';

      // 0ms Instant Render from IndexedDB
      const cachedRooms = await idbGetRooms();
      if (cachedRooms.length > 0) {
        cachedUserRooms = cachedRooms;
        renderChatList(cachedRooms);
      }
      const cachedMsgs = await idbGetMessages(myRoom);
      if (cachedMsgs.length > 0 && els.messages) {
        els.messages.innerHTML = '';
        cachedMsgs.forEach(m => renderMessage(m, false));
        scrollBottom();
      }

      initSocket();
      doSocketJoin();
      loadChatList();
      fetchMessagesForRoom(myRoom);
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
      nameInput: document.getElementById('nameInput'),
      passwordInput: document.getElementById('passwordInput'),
      regNicknameInput: document.getElementById('regNicknameInput'),
      regPasswordConfirmInput: document.getElementById('regPasswordConfirmInput'),
      loginError: document.getElementById('loginError'),
      joinBtnText: document.getElementById('joinBtnText'),
      sidebarMyAvatar: document.getElementById('sidebarMyAvatar'),
      sidebarMyName: document.getElementById('sidebarMyName'),
      sidebarSearchInput: document.getElementById('sidebarSearchInput'),
      sidebarSearchClear: document.getElementById('sidebarSearchClear'),
      sidebarDmList: document.getElementById('sidebarDmList'),
      headerBestieAvatar: document.getElementById('headerBestieAvatar'),
      headerBestieName: document.getElementById('headerBestieName'),
      headerBestieStatus: document.getElementById('headerBestieStatus'),
      pinnedBanner: document.getElementById('pinnedBanner'),
      pinnedBannerText: document.getElementById('pinnedBannerText'),
      inChatSearchBar: document.getElementById('inChatSearchBar'),
      inChatSearchInput: document.getElementById('inChatSearchInput'),
      inChatMatchCount: document.getElementById('inChatMatchCount'),
      dropOverlay: document.getElementById('dropOverlay'),
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
      toastContainer: document.getElementById('toastContainer'),
      callOverlay: document.getElementById('callOverlay'),
      incomingCallModal: document.getElementById('incomingCallModal'),
      callLocalVideo: document.getElementById('callLocalVideo'),
      callRemoteVideo: document.getElementById('callRemoteVideo'),
      callRemoteVideoWrap: document.getElementById('callRemoteVideoWrap'),
      callAvatar: document.getElementById('callAvatar'),
      callUserName: document.getElementById('callUserName'),
      callStatus: document.getElementById('callStatus')
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
        if (socket && socket.connected) socket.emit('typing', { room: myRoom, user: myName });
      });
      els.msgInput.addEventListener('focus', () => {
        setTimeout(scrollBottom, 250);
      });
    }

    if (els.messages) {
      els.messages.addEventListener('scroll', () => {
        const btn = document.getElementById('scrollBottomBtn');
        if (!btn) return;
        const distFromBottom = els.messages.scrollHeight - els.messages.scrollTop - els.messages.clientHeight;
        btn.style.display = distFromBottom > 160 ? 'flex' : 'none';
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

  function setupMobileViewport() {
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => {
        if (document.body.classList.contains('in-chat')) {
          scrollBottom();
        }
      });
    }
  }

  function setupDragAndDrop() {
    const chatMain = document.getElementById('chatMain');
    if (!chatMain) return;

    ['dragenter', 'dragover'].forEach(eventName => {
      window.addEventListener(eventName, e => {
        e.preventDefault();
        e.stopPropagation();
        if (els.dropOverlay && authToken && myRoom) {
          els.dropOverlay.style.display = 'flex';
        }
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      window.addEventListener(eventName, e => {
        e.preventDefault();
        e.stopPropagation();
        if (eventName === 'drop' || (e.clientX === 0 && e.clientY === 0)) {
          if (els.dropOverlay) els.dropOverlay.style.display = 'none';
        }
      });
    });

    window.addEventListener('drop', e => {
      e.preventDefault();
      if (!authToken || !myRoom || !e.dataTransfer || !e.dataTransfer.files) return;
      const files = Array.from(e.dataTransfer.files);
      if (!files.length) return;

      const photos = files.filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'));
      const docs = files.filter(f => !f.type.startsWith('image/') && !f.type.startsWith('video/'));

      if (photos.length) sendPhoto(photos);
      if (docs.length) {
        docs.forEach(d => uploadDirectFile(d));
      }
    });
  }

  function setupClipboardPaste() {
    window.addEventListener('paste', e => {
      if (!authToken || !myRoom || !e.clipboardData) return;
      const items = Array.from(e.clipboardData.items);
      const imgItem = items.find(item => item.type.startsWith('image/'));
      if (imgItem) {
        const file = imgItem.getAsFile();
        if (file) {
          e.preventDefault();
          showToast('Uploading pasted image...');
          sendPhoto([file]);
        }
      }
    });
  }

  function setupKeyboardShortcuts() {
    window.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (els.sidebarSearchInput) {
          document.body.classList.remove('in-chat');
          els.sidebarSearchInput.focus();
          els.sidebarSearchInput.select();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        toggleInChatSearch();
      } else if (e.key === 'Escape') {
        closeInChatSearch();
        closeNewChatModal();
        closeProfile();
        closeStarredModal();
        cancelReply();
      }
    });
  }

  // ═══════════════════ CLIENT-SIDE IMAGE AUTO-COMPRESSOR ═══════════════════
  async function compressImageFile(file, maxWidth = 1600, maxHeight = 1600, quality = 0.85) {
    if (!file || !file.type.startsWith('image/') || file.type.includes('gif') || file.type.includes('svg')) {
      return file;
    }
    return new Promise(resolve => {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(img.src);
        let w = img.width;
        let h = img.height;

        if (w > maxWidth || h > maxHeight) {
          if (w > h) {
            h = Math.round((h * maxWidth) / w);
            w = maxWidth;
          } else {
            w = Math.round((w * maxHeight) / h);
            h = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);

        canvas.toBlob(blob => {
          if (blob && blob.size < file.size) {
            resolve(new File([blob], file.name.replace(/\.[^/.]+$/, '') + '.jpg', { type: 'image/jpeg' }));
          } else {
            resolve(file);
          }
        }, 'image/jpeg', quality);
      };
      img.onerror = () => resolve(file);
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
    fetchMessagesForRoom(myRoom);
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
      if (payload.pinnedMsg) {
        currentPinnedMessage = payload.pinnedMsg;
        renderPinnedBanner(payload.pinnedMsg);
      } else {
        currentPinnedMessage = null;
        if (els.pinnedBanner) els.pinnedBanner.style.display = 'none';
      }
      updateActiveHeader();
    });

    socket.on('presence', data => {
      currentOnlineUsers = data.users || [];
      updatePresenceIndicators();
    });

    socket.on('message', msg => {
      hideTypingIndicator();
      idbSaveMessages(msg.room || myRoom, [msg]);

      if (msg.room && msg.room !== myRoom) {
        loadChatList();
        if (msg.user !== myName) playNotificationTone();
        return;
      }

      // Remove intro card if exists
      const intro = els.messages ? els.messages.querySelector('.chat-intro-card') : null;
      if (intro) intro.remove();

      renderMessage(msg, true);
      scrollBottom();
      loadChatList();
      if (msg.user !== myName) {
        playNotificationTone();
        socket.emit('mark-read', { messageId: msg.id });
      }
    });

    socket.on('typing', (data) => {
      if (typeof data === 'string') {
        if (data !== myName && data !== myProfile.nickname) showTypingIndicator();
      } else if (data && data.user !== myName) {
        showTypingIndicator();
      }
    });

    socket.on('chat-list-update', () => {
      loadChatList();
    });

    socket.on('pinned-message', msg => {
      currentPinnedMessage = msg;
      renderPinnedBanner(msg);
      showToast('Message pinned to conversation');
    });

    socket.on('unpinned-message', () => {
      currentPinnedMessage = null;
      if (els.pinnedBanner) els.pinnedBanner.style.display = 'none';
      showToast('Message unpinned');
    });

    socket.on('message-deleted', data => {
      if (!data || !data.messageId) return;
      const el = document.querySelector(`[data-msg-id="${data.messageId}"]`);
      if (el) {
        el.remove();
        showToast('Message deleted');
      }
    });

    // WebRTC Signaling Events
    socket.on('call-invite', handleCallInvite);
    socket.on('call-accept', handleCallAccept);
    socket.on('call-decline', handleCallDecline);
    socket.on('call-candidate', handleCallCandidate);
    socket.on('call-hangup', handleCallHangup);
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
      idbSaveRooms(cachedUserRooms);
      renderChatList(cachedUserRooms);
    } catch (err) {
      console.error('loadChatList error:', err);
    }
  }

  async function fetchMessagesForRoom(roomName) {
    if (!authToken || !roomName) return;

    // Fast IndexedDB display
    const cached = await idbGetMessages(roomName);
    if (cached.length > 0 && els.messages) {
      els.messages.innerHTML = '';
      cached.forEach(m => renderMessage(m, false));
      scrollBottom();
    }

    try {
      const resp = await fetch(`/api/rooms/${encodeURIComponent(roomName)}/messages`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (!resp.ok) return;
      const messages = await resp.json();
      if (els.messages) {
        els.messages.innerHTML = '';
        if (Array.isArray(messages) && messages.length > 0) {
          messages.forEach(m => renderMessage(m, false));
          idbSaveMessages(roomName, messages);
        } else {
          renderConversationIntro(roomName);
        }
        scrollBottom();
      }
    } catch (err) {
      console.error('fetchMessagesForRoom error:', err);
    }
  }

  function renderConversationIntro(roomName) {
    if (!els.messages) return;
    const isSaved = roomName === `dm_${myName.toLowerCase()}_${myName.toLowerCase()}`;
    const otherUser = isSaved ? 'Note to Self' : (roomName.replace('dm_', '').split('_').find(p => p.toLowerCase() !== myName.toLowerCase()) || 'User');
    const avatarChar = isSaved ? 'N' : getInitial(otherUser);
    const title = isSaved ? 'Note to Self' : `@${otherUser}`;
    const sub = isSaved
      ? 'Your personal cloud notebook. Notes, links, and documents saved here are encrypted and accessible across all your devices.'
      : 'End-to-end encrypted direct messaging. All messages and media sent here remain private between you two.';

    const intro = document.createElement('div');
    intro.className = 'chat-intro-card';
    intro.innerHTML = `
      <div class="chat-intro-avatar">${avatarChar}</div>
      <div class="chat-intro-title">${escapeHtml(title)}</div>
      <div class="chat-intro-sub">${escapeHtml(sub)}</div>
    `;
    els.messages.appendChild(intro);
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
      list.innerHTML = `<div style="padding:32px 16px; text-align:center; color:var(--text-muted); font-size:13px;">
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

        const isSelf = cleanQ === (myName || '').toLowerCase();
        html += `
          <div class="dm-row" onclick="BestieChat.startDMWith('${escapeHtml(cleanQ)}')" style="background:var(--bg-surface); border:1px solid #ffffff; margin-bottom:6px;">
            <div class="dm-avatar-wrap"><div class="dm-avatar">${isSelf ? 'N' : getInitial(cleanQ)}</div></div>
            <div class="dm-info">
              <div class="dm-name">${isSelf ? 'Open Note to Self' : `Start chat with @${escapeHtml(cleanQ)}`}</div>
              <div style="font-size:11.5px; color:var(--text-muted);">${isSelf ? 'Your private notes' : 'Click or press Enter to message'}</div>
            </div>
            <button type="button" class="login-btn" onclick="event.stopPropagation(); BestieChat.startDMWith('${escapeHtml(cleanQ)}')" style="padding:4px 12px; font-size:11.5px; margin:0; width:auto;">${isSelf ? 'Open' : 'Message'}</button>
          </div>
        `;

        if (matchingChats.length > 0) {
          html += '<div style="padding:6px 10px; font-size:10px; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Active Chats</div>';
          html += renderChatListItems(matchingChats);
        }
        if (otherUsers.length > 0) {
          html += '<div style="padding:8px 10px; font-size:10px; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Registered Users</div>';
          html += otherUsers.map(u => `
            <div class="dm-row" onclick="BestieChat.startDMWith('${escapeHtml(u.username)}')">
              <div class="dm-avatar-wrap"><div class="dm-avatar">${getInitial(u.nickname || u.username)}</div></div>
              <div class="dm-info">
                <div class="dm-name">${escapeHtml(u.nickname || u.username)}</div>
                <div style="font-size:11.5px; color:var(--text-muted);">@${escapeHtml(u.username)}</div>
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
    const cleanTarget = String(targetUsername || '').trim().toLowerCase().replace(/^@+/, '');
    if (!cleanTarget) return;

    if (cleanTarget === (myName || '').toLowerCase()) {
      closeNewChatModal();
      clearSidebarSearch();
      await switchRoom(`dm_${myName.toLowerCase()}_${myName.toLowerCase()}`);
      return;
    }

    try {
      const resp = await fetch('/api/rooms/dm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ targetUsername: cleanTarget })
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
    if (!roomName) return;
    myRoom = roomName;
    localStorage.setItem('bestieChatRoom', roomName);
    
    // On mobile, transition view to active chat screen
    document.body.classList.add('in-chat');

    updateActiveHeader();
    await fetchMessagesForRoom(roomName);
    doSocketJoin();
    
    document.querySelectorAll('.dm-row').forEach(r => r.classList.remove('active'));
    document.querySelectorAll('.dm-row').forEach(r => {
      if (r.getAttribute('onclick') && r.getAttribute('onclick').includes(roomName)) r.classList.add('active');
    });

    if (els.msgInput) {
      setTimeout(() => {
        autoExpandMsgInput();
      }, 100);
    }
  }

  function updateActiveHeader() {
    const isSaved = myRoom === `dm_${myName.toLowerCase()}_${myName.toLowerCase()}`;
    if (isSaved) {
      if (els.headerBestieAvatar) els.headerBestieAvatar.textContent = 'N';
      if (els.headerBestieName) els.headerBestieName.textContent = 'Note to Self';
      if (els.headerBestieStatus) els.headerBestieStatus.textContent = 'Private cloud notebook';
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

  // ═══════════════════ MESSAGING (OPTIMISTIC UI) ═══════════════════
  function sendMessage() {
    if (!els.msgInput) return;
    const text = els.msgInput.value.trim();
    if (!text) {
      toggleRecord();
      return;
    }

    const clientMsgId = 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    const payload = {
      id: clientMsgId,
      clientMsgId,
      text,
      user: myName,
      room: myRoom,
      time: Date.now(),
      type: 'text',
      replyTo: replyingTo
    };

    // Remove intro card
    const intro = els.messages ? els.messages.querySelector('.chat-intro-card') : null;
    if (intro) intro.remove();

    renderMessage(payload, true);
    scrollBottom();
    idbSaveMessages(myRoom, [payload]);

    if (socket && socket.connected) {
      socket.emit('message', payload);
    }

    playSendTone();
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
    wrap.setAttribute('data-msg-id', msg.id || '');

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
      contentHtml += `<span class="msg-text-content">${escapeHtml(msg.text || '')}</span>`;
    }

    const timeStr = formatTime(msg.time || Date.now());
    const tickHtml = isMe ? '<span class="msg-status-ticks"> ✓✓</span>' : '';

    // Action bar for power actions
    const deleteBtn = isMe ? `<button type="button" class="msg-action-btn" onclick="BestieChat.deleteMessage('${escapeHtml(msg.id)}')" title="Delete">🗑️</button>` : '';

    wrap.innerHTML = `
      <div class="msg ${isMe ? 'me' : 'them'}" ondblclick="BestieChat.replyToMessage('${escapeHtml(msg.id || '')}', '${escapeHtml(msg.user || '')}', '${escapeHtml(msg.text || 'Media')}')" title="Double click to reply">
        ${contentHtml}
        <div class="bubble-meta">
          <span>${timeStr}</span>
          ${tickHtml}
        </div>
      </div>
      <div class="msg-action-bar">
        <button type="button" class="msg-action-btn" onclick="BestieChat.replyToMessage('${escapeHtml(msg.id || '')}', '${escapeHtml(msg.user || '')}', '${escapeHtml(msg.text || 'Media')}')" title="Reply">↩️</button>
        <button type="button" class="msg-action-btn" onclick="BestieChat.copyMessageText('${escapeHtml(msg.text || msg.url || '')}')" title="Copy">📋</button>
        <button type="button" class="msg-action-btn" onclick="BestieChat.pinMessage('${escapeHtml(msg.id)}')" title="Pin">📌</button>
        <button type="button" class="msg-action-btn" onclick="BestieChat.starMessage('${escapeHtml(msg.id)}')" title="Star">⭐</button>
        ${deleteBtn}
      </div>
    `;

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

  // ═══════════════════ IN-CHAT MESSAGE SEARCH ═══════════════════
  function toggleInChatSearch() {
    if (!els.inChatSearchBar) return;
    const isOpen = els.inChatSearchBar.style.display === 'flex';
    els.inChatSearchBar.style.display = isOpen ? 'none' : 'flex';
    if (!isOpen && els.inChatSearchInput) {
      els.inChatSearchInput.value = '';
      els.inChatSearchInput.focus();
    } else {
      closeInChatSearch();
    }
  }

  function closeInChatSearch() {
    if (els.inChatSearchBar) els.inChatSearchBar.style.display = 'none';
    if (els.inChatMatchCount) els.inChatMatchCount.textContent = '';
    // Clear marks
    if (els.messages) {
      els.messages.querySelectorAll('mark.search-highlight').forEach(m => {
        const textNode = document.createTextNode(m.textContent);
        m.parentNode.replaceChild(textNode, m);
      });
    }
  }

  function searchInChat(query) {
    if (!els.messages) return;
    const cleanQ = String(query || '').trim().toLowerCase();
    
    // Clear previous marks
    els.messages.querySelectorAll('mark.search-highlight').forEach(m => {
      const textNode = document.createTextNode(m.textContent);
      m.parentNode.replaceChild(textNode, m);
    });

    if (!cleanQ) {
      if (els.inChatMatchCount) els.inChatMatchCount.textContent = '';
      return;
    }

    let matchCount = 0;
    let firstMatch = null;

    els.messages.querySelectorAll('.msg-text-content').forEach(node => {
      const text = node.textContent;
      if (text.toLowerCase().includes(cleanQ)) {
        const regex = new RegExp(`(${escapeRegex(cleanQ)})`, 'gi');
        node.innerHTML = escapeHtml(text).replace(regex, '<mark class="search-highlight">$1</mark>');
        matchCount++;
        if (!firstMatch) firstMatch = node;
      }
    });

    if (els.inChatMatchCount) {
      els.inChatMatchCount.textContent = matchCount > 0 ? `${matchCount} found` : 'No match';
    }
    if (firstMatch) {
      firstMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  // ═══════════════════ PIN & STARRED MESSAGES ═══════════════════
  function pinMessage(messageId) {
    if (socket && messageId) {
      socket.emit('pin-message', { messageId });
    }
  }

  function unpinCurrentMessage() {
    if (socket) {
      socket.emit('unpin-message');
    }
  }

  function renderPinnedBanner(msg) {
    if (!els.pinnedBanner || !els.pinnedBannerText) return;
    if (!msg) {
      els.pinnedBanner.style.display = 'none';
      return;
    }
    els.pinnedBannerText.textContent = `Pinned: ${msg.text || (msg.type === 'image' ? 'Photo' : 'Attachment')}`;
    els.pinnedBanner.style.display = 'flex';
  }

  function scrollToPinned() {
    if (!currentPinnedMessage) return;
    scrollToMessage(currentPinnedMessage.id);
  }

  function scrollToMessage(id) {
    if (!id) return;
    const el = document.querySelector(`[data-msg-id="${id}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('msg-highlight');
      setTimeout(() => el.classList.remove('msg-highlight'), 1600);
    }
  }

  async function starMessage(messageId) {
    if (!messageId || !authToken || !myRoom) return;
    try {
      await fetch(`/api/rooms/${encodeURIComponent(myRoom)}/messages/${encodeURIComponent(messageId)}/star`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ starred: true })
      });
      showToast('⭐ Message saved to Starred');
    } catch (_) {
      showToast('Could not star message');
    }
  }

  async function openStarredModal() {
    const modal = document.getElementById('starredModal');
    const list = document.getElementById('starredList');
    if (modal && list) {
      modal.style.display = 'flex';
      list.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-muted); font-size:13px;">Loading starred messages...</div>';

      try {
        const resp = await fetch('/api/rooms/messages/starred', {
          headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (!resp.ok) return;
        const messages = await resp.json();

        if (!messages || !messages.length) {
          list.innerHTML = '<div style="padding:24px; text-align:center; color:var(--text-muted); font-size:13px;">No starred messages yet. Hover any message and click ⭐ to save it.</div>';
          return;
        }

        list.innerHTML = messages.map(m => `
          <div class="starred-item-card" onclick="BestieChat.closeStarredModal(); BestieChat.switchRoom('${escapeHtml(m.room)}');">
            <div class="starred-item-header">
              <span style="font-weight:700; color:#ffffff;">@${escapeHtml(m.user)}</span>
              <span>${formatTimestamp(m.time)}</span>
            </div>
            <div style="font-size:13px; color:#ffffff;">${escapeHtml(m.text || (m.type === 'image' ? 'Photo' : 'Document'))}</div>
          </div>
        `).join('');
      } catch (_) {
        list.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-muted);">Failed to load starred messages</div>';
      }
    }
  }

  function closeStarredModal() {
    const modal = document.getElementById('starredModal');
    if (modal) modal.style.display = 'none';
  }

  function deleteMessage(messageId) {
    if (!messageId || !socket) return;
    socket.emit('delete-message', { messageId });
  }

  function copyMessageText(text) {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      showToast('📋 Copied to clipboard');
    }).catch(() => {
      showToast('Could not copy text');
    });
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
          id: 'msg_' + Date.now(),
          type: 'voice',
          url: data.url,
          duration,
          user: myName,
          room: myRoom,
          time: Date.now()
        };
        renderMessage(payload, true);
        scrollBottom();
        idbSaveMessages(myRoom, [payload]);
        if (socket && socket.connected) socket.emit('message', payload);
      }
    } catch (_) {
      showToast('Failed to upload voice note');
    }
  }

  // ═══════════════════ FILE / PHOTO UPLOAD WITH AUTO-COMPRESSION ═══════════════════
  async function sendPhoto(files) {
    if (!files || !files.length) return;
    for (const rawFile of Array.from(files)) {
      const file = await compressImageFile(rawFile);
      const formData = new FormData();
      formData.append('file', file);
      formData.append('room', myRoom);

      try {
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        const data = await res.json();
        if (data.url) {
          const payload = {
            id: 'msg_' + Date.now(),
            type: 'image',
            url: data.url,
            user: myName,
            room: myRoom,
            time: Date.now()
          };
          renderMessage(payload, true);
          scrollBottom();
          idbSaveMessages(myRoom, [payload]);
          if (socket && socket.connected) socket.emit('message', payload);
        }
      } catch (_) {
        showToast('Failed to upload photo');
      }
    }
  }

  async function uploadDocumentFile(input) {
    if (!input || !input.files || !input.files.length) return;
    for (const file of Array.from(input.files)) {
      await uploadDirectFile(file);
    }
  }

  async function uploadDirectFile(file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('room', myRoom);

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.url) {
        const payload = {
          id: 'msg_' + Date.now(),
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
        idbSaveMessages(myRoom, [payload]);
        if (socket && socket.connected) socket.emit('message', payload);
      }
    } catch (_) {
      showToast('Failed to upload document');
    }
  }

  async function uploadCameraFile(input) {
    if (input && input.files) sendPhoto(input.files);
  }

  // ═══════════════════ COMPLETE WEBRTC CALLS ═══════════════════
  async function startCall(type) {
    const isSaved = myRoom === `dm_${myName.toLowerCase()}_${myName.toLowerCase()}`;
    if (isSaved) {
      showToast('Cannot call Note to Self');
      return;
    }

    const otherUser = myRoom.replace('dm_', '').split('_').find(p => p.toLowerCase() !== myName.toLowerCase());
    if (!otherUser) return;

    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: type === 'video'
      });

      if (els.callOverlay) els.callOverlay.style.display = 'flex';
      if (els.callUserName) els.callUserName.textContent = `@${otherUser}`;
      if (els.callStatus) els.callStatus.textContent = 'Calling...';
      if (els.callAvatar) els.callAvatar.textContent = getInitial(otherUser);

      if (type === 'video' && els.callRemoteVideoWrap) {
        els.callRemoteVideoWrap.style.display = 'block';
        if (els.callLocalVideo) els.callLocalVideo.srcObject = localStream;
      } else if (els.callRemoteVideoWrap) {
        els.callRemoteVideoWrap.style.display = 'none';
      }

      peerConnection = new RTCPeerConnection(RTC_CONFIG);
      localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

      peerConnection.ontrack = e => {
        if (els.callRemoteVideo && e.streams[0]) {
          els.callRemoteVideo.srcObject = e.streams[0];
        }
      };

      peerConnection.onicecandidate = e => {
        if (e.candidate && socket) {
          socket.emit('call-candidate', { candidate: e.candidate, targetUser: otherUser, room: myRoom });
        }
      };

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      if (socket) {
        socket.emit('call-invite', {
          type,
          offer,
          targetUser: otherUser,
          room: myRoom
        });
      }
    } catch (_) {
      showToast('Microphone & Camera permission required for calling');
      endCall();
    }
  }

  function handleCallInvite(data) {
    if (!data || !data.offer) return;
    incomingCallData = data;

    const modal = els.incomingCallModal || document.getElementById('incomingCallModal');
    if (modal) {
      modal.style.display = 'flex';
      const nameEl = document.getElementById('incomingCallName');
      const typeEl = document.getElementById('incomingCallType');
      const avatarEl = document.getElementById('incomingCallAvatar');
      if (nameEl) nameEl.textContent = `@${data.from || 'Someone'}`;
      if (typeEl) typeEl.textContent = data.type === 'video' ? 'Incoming Video Call...' : 'Incoming Voice Call...';
      if (avatarEl) avatarEl.textContent = getInitial(data.from);
    }
    playRingtone();
  }

  async function acceptCall() {
    stopRingtone();
    const modal = els.incomingCallModal || document.getElementById('incomingCallModal');
    if (modal) modal.style.display = 'none';
    if (!incomingCallData) return;

    const { offer, type, from, callerSocketId } = incomingCallData;

    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: type === 'video'
      });

      if (els.callOverlay) els.callOverlay.style.display = 'flex';
      if (els.callUserName) els.callUserName.textContent = `@${from}`;
      if (els.callStatus) els.callStatus.textContent = 'Connected';
      if (els.callAvatar) els.callAvatar.textContent = getInitial(from);

      if (type === 'video' && els.callRemoteVideoWrap) {
        els.callRemoteVideoWrap.style.display = 'block';
        if (els.callLocalVideo) els.callLocalVideo.srcObject = localStream;
      } else if (els.callRemoteVideoWrap) {
        els.callRemoteVideoWrap.style.display = 'none';
      }

      peerConnection = new RTCPeerConnection(RTC_CONFIG);
      localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

      peerConnection.ontrack = e => {
        if (els.callRemoteVideo && e.streams[0]) {
          els.callRemoteVideo.srcObject = e.streams[0];
        }
      };

      peerConnection.onicecandidate = e => {
        if (e.candidate && socket) {
          socket.emit('call-candidate', { candidate: e.candidate, targetSocketId: callerSocketId, targetUser: from });
        }
      };

      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      if (socket) {
        socket.emit('call-accept', {
          answer,
          callerSocketId,
          targetUser: from
        });
      }

      startCallTimer();
    } catch (_) {
      showToast('Media permissions required');
      declineCall();
    }
  }

  function declineCall() {
    stopRingtone();
    const modal = els.incomingCallModal || document.getElementById('incomingCallModal');
    if (modal) modal.style.display = 'none';
    if (incomingCallData && socket) {
      socket.emit('call-decline', {
        callerSocketId: incomingCallData.callerSocketId,
        targetUser: incomingCallData.from
      });
    }
    incomingCallData = null;
  }

  async function handleCallAccept(data) {
    if (!peerConnection || !data || !data.answer) return;
    try {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
      if (els.callStatus) els.callStatus.textContent = 'Connected';
      startCallTimer();
    } catch (_) { /* ignore */ }
  }

  function handleCallDecline() {
    showToast('Call declined');
    endCall();
  }

  async function handleCallCandidate(data) {
    if (peerConnection && data && data.candidate) {
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (_) { /* ignore */ }
    }
  }

  function handleCallHangup() {
    showToast('Call ended');
    cleanupCall();
  }

  function endCall() {
    if (socket && myRoom) {
      socket.emit('call-hangup', { room: myRoom });
    }
    cleanupCall();
  }

  function cleanupCall() {
    stopRingtone();
    if (callTimerInterval) clearInterval(callTimerInterval);
    callSeconds = 0;

    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
      localStream = null;
    }
    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }

    if (els.callOverlay) els.callOverlay.style.display = 'none';
    if (els.callLocalVideo) els.callLocalVideo.srcObject = null;
    if (els.callRemoteVideo) els.callRemoteVideo.srcObject = null;
    incomingCallData = null;
  }

  function startCallTimer() {
    if (callTimerInterval) clearInterval(callTimerInterval);
    callSeconds = 0;
    callTimerInterval = setInterval(() => {
      callSeconds++;
      const m = Math.floor(callSeconds / 60);
      const s = callSeconds % 60;
      if (els.callStatus) els.callStatus.textContent = `Connected ${m}:${s < 10 ? '0' : ''}${s}`;
    }, 1000);
  }

  function toggleMuteAudio() {
    if (!localStream) return;
    isMuted = !isMuted;
    localStream.getAudioTracks().forEach(t => t.enabled = !isMuted);
    const btn = document.getElementById('muteAudioBtn');
    if (btn) btn.textContent = isMuted ? 'Unmute' : 'Mute';
    showToast(isMuted ? 'Muted' : 'Unmuted');
  }

  function toggleCamera() {
    if (!localStream) return;
    isCameraOff = !isCameraOff;
    localStream.getVideoTracks().forEach(t => t.enabled = !isCameraOff);
    const btn = document.getElementById('toggleCamBtn');
    if (btn) btn.textContent = isCameraOff ? 'Camera On' : 'Camera Off';
    showToast(isCameraOff ? 'Camera Off' : 'Camera On');
  }

  // ═══════════════════ TYPING INDICATOR & SCROLL ═══════════════════
  let _typingTimer = null;
  function showTypingIndicator() {
    clearTimeout(_typingTimer);
    if (!els.messages) return;
    let bubble = document.getElementById('chatTypingBubble');
    if (!bubble) {
      bubble = document.createElement('div');
      bubble.id = 'chatTypingBubble';
      bubble.className = 'typing-bubble';
      bubble.innerHTML = '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>';
      els.messages.appendChild(bubble);
      scrollBottom();
    }
    _typingTimer = setTimeout(hideTypingIndicator, 2500);
  }

  function hideTypingIndicator() {
    clearTimeout(_typingTimer);
    const bubble = document.getElementById('chatTypingBubble');
    if (bubble) bubble.remove();
  }

  function scrollBottom() {
    if (els.messages) {
      els.messages.scrollTop = els.messages.scrollHeight;
    }
    const btn = document.getElementById('scrollBottomBtn');
    if (btn) btn.style.display = 'none';
  }

  // ═══════════════════ MODALS & HELPERS ═══════════════════
  function toggleSidebar() {
    document.body.classList.toggle('in-chat');
  }

  function closeSidebar() {
    document.body.classList.remove('in-chat');
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
      let users = [];
      if (resp.ok) users = await resp.json();

      let html = '';
      if (cleanQ) {
        const isSelf = cleanQ.toLowerCase() === (myName || '').toLowerCase();
        const actionLabel = isSelf ? 'Open Note to Self' : `Start chat with @${escapeHtml(cleanQ)}`;
        const actionSub = isSelf ? 'Your private cloud notes' : 'Click or press Enter to message directly';
        html += `
          <div class="user-result-row" onclick="BestieChat.startDMWith('${escapeHtml(cleanQ)}')" style="background:var(--bg-surface); border:1px solid #ffffff; margin-bottom:8px;">
            <div style="display:flex; align-items:center; gap:10px;">
              <div style="width:36px; height:36px; border-radius:50%; background:#fff; color:#000; display:flex; align-items:center; justify-content:center; font-size:14px; font-weight:700;">${isSelf ? 'N' : getInitial(cleanQ)}</div>
              <div>
                <div style="font-weight:700; font-size:13.5px; color:#fff;">${actionLabel}</div>
                <div style="font-size:11.5px; color:var(--text-muted);">${actionSub}</div>
              </div>
            </div>
            <button type="button" class="login-btn" onclick="event.stopPropagation(); BestieChat.startDMWith('${escapeHtml(cleanQ)}')" style="padding:5px 14px; font-size:12px; margin:0; width:auto;">${isSelf ? 'Open' : 'Message'}</button>
          </div>
        `;
      }

      if (users && users.length > 0) {
        html += '<div style="padding:4px 2px; font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Registered Contacts</div>';
        html += users.map(u => `
          <div class="user-result-row" onclick="BestieChat.startDMWith('${escapeHtml(u.username)}')">
            <div style="display:flex; align-items:center; gap:10px;">
              <div style="width:36px; height:36px; border-radius:50%; background:var(--bg-surface); border:1px solid var(--border); display:flex; align-items:center; justify-content:center; font-size:14px; font-weight:700; color:#fff;">${getInitial(u.nickname || u.username)}</div>
              <div>
                <div style="font-weight:700; font-size:13.5px; color:#fff;">${escapeHtml(u.nickname || u.username)}</div>
                <div style="font-size:11.5px; color:var(--text-muted);">@${escapeHtml(u.username)}</div>
              </div>
            </div>
            <button type="button" class="login-btn" onclick="event.stopPropagation(); BestieChat.startDMWith('${escapeHtml(u.username)}')" style="padding:5px 14px; font-size:12px; margin:0; width:auto;">Chat</button>
          </div>
        `).join('');
      } else if (!cleanQ) {
        html += '<div style="padding:20px; text-align:center; color:var(--text-muted); font-size:13px;">Type any username above to start chatting</div>';
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

  function replyToMessage(id, user, text) {
    replyingTo = { id, user, text };
    if (els.replyBar) {
      els.replyBar.style.display = 'flex';
      if (els.replyPreviewText) els.replyPreviewText.textContent = `${user}: ${text.slice(0, 35)}`;
    }
    if (els.msgInput) els.msgInput.focus();
  }

  function cancelReply() {
    replyingTo = null;
    if (els.replyBar) els.replyBar.style.display = 'none';
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

  function playSendTone() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    } catch (_) { /* ignore */ }
  }

  function playNotificationTone() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(580, ctx.currentTime);
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + 0.14);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.14);
    } catch (_) { /* ignore */ }
  }

  function playRingtone() {
    try {
      if (!ringtoneAudio) {
        ringtoneAudio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
        ringtoneAudio.loop = true;
      }
      ringtoneAudio.play().catch(() => {});
    } catch (_) { /* ignore */ }
  }

  function stopRingtone() {
    if (ringtoneAudio) {
      try {
        ringtoneAudio.pause();
        ringtoneAudio.currentTime = 0;
      } catch (_) { /* ignore */ }
    }
  }

  function showToast(msg) {
    const container = els.toastContainer || document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 2400);
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

  function escapeRegex(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
    openLightbox, closeLightbox, replyToMessage, cancelReply,
    startCall, acceptCall, declineCall, endCall, toggleMuteAudio, toggleCamera,
    playAudio, scrollBottom,
    toggleInChatSearch, closeInChatSearch, searchInChat,
    pinMessage, unpinCurrentMessage, scrollToPinned, scrollToMessage,
    starMessage, openStarredModal, closeStarredModal,
    deleteMessage, copyMessageText,
    toggleSound: () => showToast('Sound active'),
    toggleTheme: () => showToast('Black & White monochrome active')
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
