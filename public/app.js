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
  const renderedMsgIds = new Set(); // msg.id and 'c:'+clientMsgId — guards against echo/optimistic duplicates
  let cachedUserRooms = [];
  let _currentChatFilter = 'all';
  let replyingTo = null;
  let isScreenSharing = false;
  let screenStream = null;
  let currentPinnedMessage = null;
  let offlineOutbox = [];

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
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' }
    ]
  };
  let pendingIceCandidates = [];
  
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

  async function idbDeleteMessage(_roomName, messageId) {
    const db = await dbPromise;
    if (!db || !messageId) return;
    try {
      const tx = db.transaction('messages', 'readwrite');
      const store = tx.objectStore('messages');
      store.delete(messageId);
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
    setupEventListeners(); initNotifications();
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
        els.messages.innerHTML = ''; _lastRenderedDateStr = '';
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
        handleSlashInput();
        handleMentionInput();
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

    // ── Delegated actions (XSS-safe replacement for interpolated inline handlers) ──
    document.addEventListener('click', e => {
      const el = e.target.closest('[data-action]');
      if (!el) return;
      const url = el.dataset.url || '';
      switch (el.dataset.action) {
        case 'open-lightbox': openLightbox(url); break;
        case 'play-audio': playAudio(url, el); break;
        case 'cycle-audio-speed': cycleAudioSpeed(el, url); break;
        case 'delete-message': deleteMessage(el.dataset.id); break;
        case 'reply-msg': replyToMessage(el.dataset.id, el.dataset.user, el.dataset.text); break;
        case 'copy-msg': copyMessageText(el.dataset.text || ''); break;
      }
    });
    document.addEventListener('dblclick', e => {
      const el = e.target.closest('[data-action="reply-msg"]');
      if (!el) return;
      replyToMessage(el.dataset.id, el.dataset.user, el.dataset.text);
    });

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
      triggerBackgroundNotification(msg);

      // Dedup: the server echoes our own messages back (room + user:<name>
      // broadcast), and optimistic sends may have rendered already.
      if (msg && msg.clientMsgId && renderedMsgIds.has('c:' + msg.clientMsgId)) {
        // Adopt the server id on the optimistic element so edit/delete/receipt
        // handlers can address it, then skip the duplicate render.
        if (msg.id && els.messages) {
          const optimistic = els.messages.querySelector(`[data-msg-id="${CSS.escape(String(msg.clientMsgId))}"]`);
          if (optimistic) optimistic.dataset.msgId = String(msg.id);
        }
        idbSaveMessages(msg.room || myRoom, [msg]);
        return;
      }
      if (msg && msg.id) {
        const sel = `[data-msg-id="${CSS.escape(String(msg.id))}"]`;
        if ((els.messages && els.messages.querySelector(sel)) || renderedMsgIds.has(String(msg.id))) {
          idbSaveMessages(msg.room || myRoom, [msg]);
          return;
        }
        renderedMsgIds.add(String(msg.id));
        if (renderedMsgIds.size > 500) {
          const it = renderedMsgIds.values().next();
          if (!it.done) renderedMsgIds.delete(it.value);
        }
      }

      idbSaveMessages(msg.room || myRoom, [msg]);

      if (msg.room && msg.room !== myRoom) {
        scheduleChatListRefresh();
        if (msg.user !== myName) playNotificationTone();
        return;
      }

      // Remove intro card if exists
      const intro = els.messages ? els.messages.querySelector('.chat-intro-card') : null;
      if (intro) intro.remove();

      renderMessage(msg, true);
      scrollBottom();
      scheduleChatListRefresh();
      if (msg.user !== myName) {
        playNotificationTone();
        socket.emit('mark-read', { messageId: msg.id });
      }
    });

    socket.on('room-error', data => {
      if (data && data.error && typeof showToast === 'function') showToast(data.error);
    });

    socket.on('typing', (data) => {
      if (typeof data === 'string') {
        if (data !== myName && data !== myProfile.nickname) showTypingIndicator();
      } else if (data && data.user !== myName) {
        showTypingIndicator();
      }
    });

        socket.on('message-edited', data => {
      if (!data || !data.messageId) return;
      const el = document.querySelector(`[data-msg-id="${CSS.escape(String(data.messageId))}"]`);
      if (el) {
        const textSpan = el.querySelector('.msg-text-content');
        if (textSpan) {
          textSpan.innerHTML = formatMessageContent(data.text) + ' <span class="edited-tag">(edited)</span>';
        }
      }
    });

        socket.on('task-toggled', data => {
      if (!data || !data.messageId) return;
      const el = document.querySelector(`[data-msg-id="${CSS.escape(String(data.messageId))}"]`);
      if (el) {
        const textSpan = el.querySelector('.msg-text-content');
        if (textSpan) {
          textSpan.innerHTML = formatMessageContent(data.text, data.messageId);
        }
      }
    });

    socket.on('poll-voted', data => {
      if (!data || !data.messageId) return;
      const pollCard = document.querySelector(`[data-poll-id="${data.messageId}"]`);
      if (pollCard && pollCard.parentElement) {
        const parentMsg = pollCard.closest('.msg-wrap');
        if (parentMsg) {
          const fakeMsg = { id: data.messageId, type: 'poll', question: pollCard.querySelector('.poll-question').textContent.replace('📊 ', ''), options: [], votes: data.votes };
          // parse options from DOM
          const optRows = pollCard.querySelectorAll('.poll-option-content > span:first-child');
          fakeMsg.options = Array.from(optRows).map(span => ({ text: span.textContent }));
          pollCard.outerHTML = renderPollHtml(fakeMsg);
        }
      }
    });

    socket.on('chat-list-update', () => {
      scheduleChatListRefresh();
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
      if (myRoom) idbDeleteMessage(myRoom, data.messageId);
      const el = document.querySelector(`[data-msg-id="${CSS.escape(String(data.messageId))}"]`);
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
  // Incoming messages used to trigger one /api/rooms/list round-trip EACH.
  // Instead: mark dirty, and refresh at most every CHAT_LIST_REFRESH_MS.
  let chatListDirty = false;
  let chatListTimer = null;
  const CHAT_LIST_REFRESH_MS = 3000;

  function scheduleChatListRefresh() {
    chatListDirty = true;
    if (chatListTimer) return;
    chatListTimer = setTimeout(async () => {
      chatListTimer = null;
      if (chatListDirty) {
        chatListDirty = false;
        await loadChatList();
      }
    }, CHAT_LIST_REFRESH_MS);
  }

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
    const cleanCached = (cached || []).filter(m => !m.deleted && m.text !== '🗑️ Message deleted' && m.text !== 'Message deleted');
    if (cleanCached.length > 0 && els.messages) {
      els.messages.innerHTML = '';
      cleanCached.forEach(m => renderMessage(m, false));
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
        const cleanMsgs = (messages || []).filter(m => !m.deleted && m.text !== '🗑️ Message deleted' && m.text !== 'Message deleted');
        if (cleanMsgs.length > 0) {
          cleanMsgs.forEach(m => renderMessage(m, false));
          idbSaveMessages(roomName, cleanMsgs);
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
      ? 'Your private encrypted cloud notebook. Notes, links, and files saved here sync across all your devices.'
      : 'End-to-end encrypted direct session. All messages, voice notes, and media remain private.';

    const intro = document.createElement('div');
    intro.className = 'chat-intro-card';
    intro.innerHTML = `
      <div class="chat-intro-avatar">${avatarChar}</div>
      <div class="chat-intro-title">${escapeHtml(title)}</div>
      <div style="display:inline-flex; align-items:center; gap:4px; font-size:11px; font-weight:600; color:#ffffff; background:rgba(255,255,255,0.08); padding:3px 8px; border-radius:12px; margin-bottom:4px;">🔒 AES-256 Direct Encrypted</div>
      <div class="chat-intro-sub">${escapeHtml(sub)}</div>
      <div class="starter-chips">
        <button type="button" class="starter-chip" onclick="BestieChat.insertStarter('hello')">👋 Say Hello</button>
        <button type="button" class="starter-chip" onclick="BestieChat.insertStarter('task')">☑️ Create Task</button>
        <button type="button" class="starter-chip" onclick="BestieChat.insertStarter('file')">📁 Share File</button>
      </div>
    `;
    els.messages.appendChild(intro);
  }

  function insertStarter(type) {
    if (type === 'hello') {
      if (els.msgInput) {
        els.msgInput.value = 'Hello! 👋';
        sendMessage();
      }
    } else if (type === 'task') {
      if (els.msgInput) {
        els.msgInput.value = '/todo ';
        els.msgInput.focus();
        updateSendBtnIcon();
      }
    } else if (type === 'file') {
      const docInput = document.getElementById('docInput');
      if (docInput) docInput.click();
    }
  }

  function filterChatList(filterType, btn) {
    _currentChatFilter = filterType || 'all';
    document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderChatList(cachedUserRooms);
  }

  let currentActiveRailTab = 'direct';

  function renderChatList(rooms) {
    const list = els.sidebarDmList;
    if (!list) return;

    let displayRooms = rooms || [];
    if (currentActiveRailTab === 'direct') {
      displayRooms = displayRooms.filter(r => !r.isGroup && !(r.name || '').startsWith('group_'));
    } else if (currentActiveRailTab === 'groups') {
      displayRooms = displayRooms.filter(r => r.isGroup || (r.name || '').startsWith('group_'));
    }

    if (!displayRooms.length) {
      list.innerHTML = `<div style="padding:32px 16px; text-align:center; color:var(--text-muted); font-size:13px;">
        <div style="font-weight:700; color:#ffffff; margin-bottom:6px;">No ${currentActiveRailTab === 'groups' ? 'groups' : 'conversations'} yet</div>
        <div style="margin-bottom:14px;">Tap below to connect:</div>
        <button type="button" class="login-btn" onclick="BestieChat.${currentActiveRailTab === 'groups' ? 'openNewGroupModal()' : 'openNewChatModal()'}" style="max-width:180px; margin:0 auto; padding:8px 14px; font-size:12px;">${currentActiveRailTab === 'groups' ? '+ New Group' : '+ New Chat'}</button>
      </div>`;
      return;
    }

    const pinnedChats = displayRooms.filter(r => r.isSaved || r.name === `dm_${myName.toLowerCase()}_${myName.toLowerCase()}`);
    const regularChats = displayRooms.filter(r => !r.isSaved && r.name !== `dm_${myName.toLowerCase()}_${myName.toLowerCase()}`);

    let html = '';
    if (pinnedChats.length) {
      html += '<div class="sidebar-section-title">📌 Pinned & Note to Self</div>';
      html += renderChatListItems(pinnedChats);
    }
    if (regularChats.length) {
      html += `<div class="sidebar-section-title">${currentActiveRailTab === 'groups' ? '👥 Groups & Channels' : '💬 Direct Messages'}</div>`;
      html += renderChatListItems(regularChats);
    }

    list.innerHTML = html;
  }

  function renderChatListItems(rooms) {
    return rooms.map(room => {
      const isSaved = room.isSaved || room.name === `dm_${myName.toLowerCase()}_${myName.toLowerCase()}`;
      const isGroup = room.isGroup || (room.name || '').startsWith('group_');
      const name = isSaved ? 'Note to Self' : (room.otherParticipant || room.displayName || room.name.replace('dm_', '').replace(/_/g, ', '));
      const displayName = isSaved ? 'Note to Self' : (room.otherProfile && room.otherProfile.nickname ? room.otherProfile.nickname : (isGroup ? (room.displayName || name) : `@${name}`));
      const avatarInitial = isSaved ? 'N' : (isGroup ? '👥' : getInitial(displayName));
      const isOnline = !isSaved && !isGroup && currentOnlineUsers.some(u => (u || '').toLowerCase() === (room.otherParticipant || '').toLowerCase());
      const onlineDot = isOnline ? '<span class="dm-online-dot"></span>' : '';

      let tickHtml = '';
      if (room.lastMessage && room.lastMessage.user === myName) {
        tickHtml = '<span style="font-weight:700; margin-right:3px;">✓✓ </span>';
      }

      const preview = room.lastMessage
        ? `${room.lastMessage.user === myName ? 'You: ' : ''}${room.lastMessage.text || (room.lastMessage.type === 'image' ? 'Photo' : room.lastMessage.type === 'voice' ? 'Voice note' : 'Document')}`.slice(0, 32)
        : (isSaved ? 'Your private notes' : (isGroup ? 'Group channel' : 'Tap to chat'));
      const timeStr = room.lastActivity ? formatTimestamp(room.lastActivity) : '';
      const badge = room.unread > 0 ? `<div class="dm-badge">${room.unread}</div>` : '';
      const active = room.name === myRoom ? 'active' : '';

      return `<div class="dm-row ${active}" onclick="BestieChat.switchRoom(${jsAttr(room.name)})">
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
          <div class="dm-row" onclick="BestieChat.startDMWith(${jsAttr(cleanQ)})" style="background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.15); margin-bottom:6px;">
            <div class="dm-avatar-wrap"><div class="dm-avatar">${isSelf ? 'N' : getInitial(cleanQ)}</div></div>
            <div class="dm-info">
              <div class="dm-name">${isSelf ? 'Open Note to Self' : `Start chat with @${escapeHtml(cleanQ)}`}</div>
              <div style="font-size:11.5px; color:var(--text-muted);">${isSelf ? 'Your private notes' : 'Click or press Enter to message'}</div>
            </div>
            <button type="button" class="login-btn" onclick="event.stopPropagation(); BestieChat.startDMWith(${jsAttr(cleanQ)})" style="padding:4px 12px; font-size:11.5px; margin:0; width:auto;">${isSelf ? 'Open' : 'Message'}</button>
          </div>
        `;

        if (matchingChats.length > 0) {
          html += '<div style="padding:6px 10px; font-size:10px; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Active Chats</div>';
          html += renderChatListItems(matchingChats);
        }
        if (otherUsers.length > 0) {
          html += '<div style="padding:8px 10px; font-size:10px; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Registered Users</div>';
          html += otherUsers.map(u => `
            <div class="dm-row" onclick="BestieChat.startDMWith(${jsAttr(u.username)})">
              <div class="dm-avatar-wrap"><div class="dm-avatar">${getInitial(u.nickname || u.username)}</div></div>
              <div class="dm-info">
                <div class="dm-name">${escapeHtml(u.nickname || u.username)}</div>
                <div style="font-size:11.5px; color:var(--text-muted);">@${escapeHtml(u.username)}</div>
              </div>
              <button type="button" class="login-btn" onclick="event.stopPropagation(); BestieChat.startDMWith(${jsAttr(u.username)})" style="padding:4px 12px; font-size:11.5px; margin:0; width:auto;">Chat</button>
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
    playClickTone();
    myRoom = roomName;
    localStorage.setItem('bestieChatRoom', roomName);
    
    // On desktop & mobile, transition view to active chat screen
    const chatMain = document.getElementById('chatMain');
    const sidebar = document.getElementById('sidebar');
    const welcome = document.getElementById('welcomeDashboard');
    if (chatMain) {
      chatMain.classList.add('chat-active', 'mobile-chat-open');
    }
    if (sidebar) sidebar.classList.add('mobile-chat-open');
    if (welcome) welcome.style.display = 'none';
    document.body.classList.add('in-chat', 'mobile-chat-active');

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
        els.msgInput.focus();
      }, 100);
    }
  }

  function updateActiveHeader() {
    if (!myRoom) return;
    const isSaved = myRoom === `dm_${myName.toLowerCase()}_${myName.toLowerCase()}`;
    const isGroup = (myRoom || '').startsWith('group_');
    if (isSaved) {
      if (els.headerBestieAvatar) els.headerBestieAvatar.textContent = 'N';
      if (els.headerBestieName) els.headerBestieName.textContent = 'Note to Self';
      if (els.headerBestieStatus) els.headerBestieStatus.textContent = 'Private cloud notebook';
      return;
    }
    if (isGroup) {
      const groupName = myRoom.replace('group_', '').replace(/_/g, ' ');
      if (els.headerBestieAvatar) els.headerBestieAvatar.textContent = '👥';
      if (els.headerBestieName) els.headerBestieName.textContent = groupName;
      if (els.headerBestieStatus) els.headerBestieStatus.textContent = 'Group Channel';
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

    // Slash command parsers
    if (text.startsWith('/poll ')) {
      const pollParts = text.replace('/poll ', '').split('|').map(s => s.trim()).filter(Boolean);
      if (pollParts.length >= 2) {
        const question = pollParts[0];
        const options = pollParts.slice(1).map(opt => ({ text: opt, votes: [] }));
        const pollPayload = {
          id: 'poll_' + Date.now(),
          type: 'poll',
          question,
          options,
          votes: [],
          user: myName,
          room: myRoom,
          time: Date.now()
        };
        sendDirectPayload(pollPayload);
        els.msgInput.value = '';
        hideSlashMenu();
        return;
      }
    } else if (text.startsWith('/todo ')) {
      const taskText = text.replace('/todo ', '').trim();
      if (taskText) {
        els.msgInput.value = '- [ ] ' + taskText;
      }
    } else if (text === '/clear') {
      els.msgInput.value = '';
      hideSlashMenu();
      deleteRoom();
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
    renderedMsgIds.add('c:' + clientMsgId);

    if (socket && socket.connected) {
      socket.emit('message', payload);
    }

    playSendTone();
    els.msgInput.value = '';
    autoExpandMsgInput();
    cancelReply();
    updateSendBtnIcon();
  }

  let _lastRenderedDateStr = '';

  function renderMessage(msg, animate = false) {
    if (!els.messages || !msg) return;
    const msgDate = new Date(msg.time || Date.now());
    const dateStr = msgDate.toDateString();

    // Check if we need to render a Date Divider
    if (dateStr !== _lastRenderedDateStr) {
      _lastRenderedDateStr = dateStr;
      const divider = document.createElement('div');
      divider.className = 'date-divider';
      const todayStr = new Date().toDateString();
      const yesterdayStr = new Date(Date.now() - 86400000).toDateString();
      let label = msgDate.toLocaleDateString([], { month: 'short', day: 'numeric' });
      if (dateStr === todayStr) label = 'Today';
      else if (dateStr === yesterdayStr) label = 'Yesterday';
      divider.innerHTML = `<span>${label}</span>`;
      els.messages.appendChild(divider);
    }

    const isMe = (msg.user || '').toLowerCase() === (myName || '').toLowerCase();
    const wrap = document.createElement('div');
    wrap.className = `msg-wrap ${isMe ? 'me' : 'them'} ${animate ? 'msg-new' : ''}`;
    wrap.setAttribute('data-msg-id', msg.id || '');
    wrap.setAttribute('data-msg-user', (msg.user || '').toLowerCase());
    wrap.setAttribute('data-msg-time', msg.time || Date.now());

    // Forwarded attribution
    let forwardedHtml = '';
    if (msg.forwardedFrom) {
      forwardedHtml = `<div class="forwarded-tag">↪️ Forwarded from @${escapeHtml(msg.forwardedFrom)}</div>`;
    }

    // Message Grouping / Stacking with previous message
    const prevWrap = els.messages.lastElementChild;
    if (prevWrap && prevWrap.classList.contains('msg-wrap')) {
      const prevUser = prevWrap.getAttribute('data-msg-user');
      const prevTime = parseInt(prevWrap.getAttribute('data-msg-time') || '0', 10);
      if (prevUser === (msg.user || '').toLowerCase() && ((msg.time || Date.now()) - prevTime < 300000)) {
        if (!prevWrap.classList.contains('grouped-top') && !prevWrap.classList.contains('grouped-middle')) {
          prevWrap.classList.add('grouped-top');
        } else if (prevWrap.classList.contains('grouped-top')) {
          prevWrap.classList.remove('grouped-top');
          prevWrap.classList.add('grouped-middle');
        }
        wrap.classList.add('grouped-bottom');
      }
    }

    let contentHtml = forwardedHtml;

    // Quoted reply — id is escaped for both attribute-JS and HTML contexts
    if (msg.replyTo) {
      contentHtml += `<div class="reply-quote" onclick="BestieChat.scrollToMessage(${jsAttr(msg.replyTo.id || '')})">
        <span class="reply-quote-name">${escapeHtml(msg.replyTo.user || 'Reply')}</span>
        <span class="reply-quote-text">${escapeHtml(msg.replyTo.text || 'Message')}</span>
      </div>`;
    }

    // Media types
    if (msg.type === 'image' && msg.url) {
      contentHtml += `<img class="chat-photo-img" src="${escapeHtml(msg.url)}" data-action="open-lightbox" data-url="${escapeHtml(msg.url)}" loading="lazy" />`;
    } else if (msg.type === 'voice' && msg.url) {
      contentHtml += `<div class="voice-bubble">
        <button type="button" class="voice-play-btn" data-action="play-audio" data-url="${escapeHtml(msg.url)}">▶</button>
        <div style="font-size:12px;">Voice note (${msg.duration || 0}s)</div>
        <button type="button" class="voice-speed-btn" data-action="cycle-audio-speed" data-url="${escapeHtml(msg.url)}">1x</button>
      </div>`;
    } else if (msg.type === 'poll') {
      contentHtml += renderPollHtml(msg);
    } else if (msg.type === 'document' && msg.url) {
      contentHtml += `<a href="${escapeHtml(msg.url)}" download class="doc-card" style="text-decoration:none; color:inherit;">
        <div class="doc-icon">📄</div>
        <div>
          <div class="doc-name">${escapeHtml(msg.docName || 'Document')}</div>
          <div class="doc-size">${msg.docSize ? Math.round(msg.docSize / 1024) + ' KB' : 'Download'}</div>
        </div>
      </a>`;
    } else {
      const formatted = formatMessageContent(msg.text || '', msg.id || '');
      const editedTag = msg.edited ? '<span class="edited-tag">(edited)</span>' : '';
      contentHtml += `<span class="msg-text-content">${formatted}${editedTag}</span>`;
    }

    const timeStr = formatTime(msg.time || Date.now());
    const tickHtml = isMe ? '<span class="msg-status-ticks"> ✓✓</span>' : '';

    // Action bar for power actions
    const deleteBtn = isMe ? `<button type="button" class="msg-action-btn" onclick="BestieChat.deleteMessage(${jsAttr(msg.id)})" title="Delete">🗑️</button>` : '';

    wrap.innerHTML = `
      <div class="msg ${isMe ? 'me' : 'them'}" data-action="reply-msg" data-id="${escapeHtml(msg.id || '')}" data-user="${escapeHtml(msg.user || '')}" data-text="${escapeHtml(msg.text || 'Media')}" title="Double click to reply">
        ${contentHtml}
        <div class="bubble-meta">
          <span>${timeStr}</span>
          ${tickHtml}
        </div>
      </div>
      <div class="msg-action-bar">
        <button type="button" class="msg-action-btn" onclick="BestieChat.replyToMessage(${jsAttr(msg.id || '')}, ${jsAttr(msg.user || '')}, ${jsAttr(msg.text || 'Media')})" title="Reply">↩️</button>
        <button type="button" class="msg-action-btn" data-action="copy-msg" data-text="${escapeHtml(msg.text || msg.url || '')}" title="Copy">📋</button>
        <button type="button" class="msg-action-btn" onclick="BestieChat.openForwardModal(${jsAttr(msg.id)})" title="Forward">↪️</button>
        <button type="button" class="msg-action-btn" onclick="BestieChat.openReminderModal(${jsAttr(msg.id)}, ${jsAttr(msg.text || 'Message')})" title="Remind Me">🔔</button>
        ${(isMe && msg.type === 'text') ? `<button type="button" class="msg-action-btn" onclick="BestieChat.openEditModal(${jsAttr(msg.id)}, ${jsAttr(msg.text || '')})" title="Edit">✏️</button>` : ''}
        <button type="button" class="msg-action-btn" onclick="BestieChat.pinMessage(${jsAttr(msg.id)})" title="Pin">📌</button>
        <button type="button" class="msg-action-btn" onclick="BestieChat.starMessage(${jsAttr(msg.id)})" title="Star">⭐</button>
        ${deleteBtn}
      </div>
    `;

    els.messages.appendChild(wrap);

    // Auto-fetch link preview if message contains URL
    if (msg.text && /https?:\/\/[^\s]+/.test(msg.text)) {
      const match = msg.text.match(/(https?:\/\/[^\s]+)/);
      if (match && match[1]) {
        fetchAndAttachLinkPreview(match[1], wrap.querySelector('.msg'));
      }
    }
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
    const safeId = String(id).replace(/%27/g, "'");
    let el = null;
    try {
      el = document.querySelector(`[data-msg-id="${CSS.escape(safeId)}"]`);
    } catch { /* invalid selector — ignore */ }
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
          <div class="starred-item-card" onclick="BestieChat.closeStarredModal(); BestieChat.switchRoom(${jsAttr(m.room)});">
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
    if (!messageId) return;
    if (socket && socket.connected) {
      socket.emit('delete-message', { messageId });
    }
    if (myRoom) {
      idbDeleteMessage(myRoom, messageId);
    }
    const el = document.querySelector(`[data-msg-id="${CSS.escape(String(messageId))}"]`);
    if (el) el.remove();
    showToast('Message deleted');
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
    if (!myRoom) { showToast('Select a chat to send voice note'); return; }
    const formData = new FormData();
    formData.append('file', blob, 'voice.webm');
    formData.append('room', myRoom);
    formData.append('duration', duration);

    try {
      const uploadHeaders = authToken ? { 'Authorization': `Bearer ${authToken}` } : {};
      let res = await fetch('/api/upload-multipart', { method: 'POST', headers: uploadHeaders, body: formData });
      if (!res.ok) res = await fetch('/api/upload', { method: 'POST', headers: uploadHeaders, body: formData });
      const data = await res.json();
      if (data && data.url) {
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
        loadChatList();
      }
    } catch (_) {
      showToast('Failed to upload voice note');
    }
  }

  // ═══════════════════ FILE / PHOTO UPLOAD WITH AUTO-COMPRESSION ═══════════════════
  async function sendPhoto(files) {
    if (!files || !files.length) return;
    if (!myRoom) { showToast('Select a chat to send photos'); return; }
    for (const rawFile of Array.from(files)) {
      let file;
      try { file = await compressImageFile(rawFile); } catch (_) { file = rawFile; }
      const formData = new FormData();
      formData.append('file', file);
      formData.append('room', myRoom);

      try {
        const uploadHeaders = authToken ? { 'Authorization': `Bearer ${authToken}` } : {};
        let res = await fetch('/api/upload-multipart', { method: 'POST', headers: uploadHeaders, body: formData });
        if (!res.ok) res = await fetch('/api/upload', { method: 'POST', headers: uploadHeaders, body: formData });
        const data = await res.json();
        if (data && data.url) {
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
          renderedMsgIds.add(String(payload.id));
          if (socket && socket.connected) socket.emit('message', payload);
          loadChatList();
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
    if (!myRoom) { showToast('Select a chat to send files'); return; }
    const formData = new FormData();
    formData.append('file', file);
    formData.append('room', myRoom);

    try {
      const uploadHeaders = authToken ? { 'Authorization': `Bearer ${authToken}` } : {};
      let res = await fetch('/api/upload-multipart', { method: 'POST', headers: uploadHeaders, body: formData });
      if (!res.ok) res = await fetch('/api/upload', { method: 'POST', headers: uploadHeaders, body: formData });
      const data = await res.json();
      if (data && data.url) {
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
        loadChatList();
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
    if (!myRoom) return;
    const isSaved = myRoom === `dm_${myName.toLowerCase()}_${myName.toLowerCase()}`;
    if (isSaved) {
      showToast('Cannot call Note to Self');
      return;
    }

    const otherUser = myRoom.replace('dm_', '').split('_').find(p => p.toLowerCase() !== myName.toLowerCase());
    if (!otherUser) {
      showToast('Direct contact required for call');
      return;
    }

    pendingIceCandidates = [];

    // Attempt camera/mic, gracefully fallback to audio only
    try {
      try {
        localStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: type === 'video' ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : false
        });
      } catch (mediaErr) {
        if (type === 'video') {
          localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          type = 'audio';
          showToast('Camera unavailable — switching to voice call');
        } else {
          throw mediaErr;
        }
      }

      if (els.callOverlay) els.callOverlay.style.display = 'flex';
      if (els.callUserName) els.callUserName.textContent = `@${otherUser}`;
      if (els.callStatus) els.callStatus.textContent = 'Ringing...';
      if (els.callAvatar) els.callAvatar.textContent = getInitial(otherUser);

      if (type === 'video' && els.callRemoteVideoWrap) {
        els.callRemoteVideoWrap.style.display = 'block'; const sec = document.getElementById('callUserSection'); if (sec) sec.style.display = 'none';
        if (els.callLocalVideo) {
          els.callLocalVideo.srcObject = localStream;
          els.callLocalVideo.play().catch(() => {});
        }
      } else if (els.callRemoteVideoWrap) {
        els.callRemoteVideoWrap.style.display = 'none';
      }

      peerConnection = new RTCPeerConnection(RTC_CONFIG);
      localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

      peerConnection.ontrack = e => {
        let remoteStream = (e.streams && e.streams[0]) ? e.streams[0] : null;
        if (!remoteStream) {
          if (!peerConnection._remoteStream) {
            peerConnection._remoteStream = new MediaStream();
          }
          peerConnection._remoteStream.addTrack(e.track);
          remoteStream = peerConnection._remoteStream;
        }

        const remoteAudio = document.getElementById('callRemoteAudio');
        if (remoteAudio) {
          remoteAudio.srcObject = remoteStream;
          remoteAudio.play().catch(() => {});
        }
        if (els.callRemoteVideo) {
          els.callRemoteVideo.srcObject = remoteStream;
          els.callRemoteVideo.play().catch(() => {});
        }
      };

      peerConnection.onicecandidate = e => {
        if (e.candidate && socket && socket.connected) {
          socket.emit('call-candidate', { candidate: e.candidate, targetUser: otherUser, room: myRoom });
        }
      };

      const offer = await peerConnection.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: type === 'video' });
      await peerConnection.setLocalDescription(offer);

      if (socket && socket.connected) {
        socket.emit('call-invite', {
          type,
          offer,
          targetUser: otherUser,
          room: myRoom
        });
      }
    } catch (_) {
      showToast('Microphone permission required for calling');
      endCall();
    }
  }

  function handleCallInvite(data) {
    if (!data || !data.offer) return;
    incomingCallData = data;
    startRingtoneLoop();

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
    stopRingtoneLoop();
    stopRingtone();
    const modal = els.incomingCallModal || document.getElementById('incomingCallModal');
    if (modal) modal.style.display = 'none';
    if (!incomingCallData) return;

    const { offer, type, from, callerSocketId } = incomingCallData;
    logCall(from, type, 'incoming', 'completed');
    pendingIceCandidates = [];

    try {
      let callType = type;
      try {
        localStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: type === 'video' ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : false
        });
      } catch (mediaErr) {
        if (type === 'video') {
          localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          callType = 'audio';
        } else {
          throw mediaErr;
        }
      }

      if (els.callOverlay) els.callOverlay.style.display = 'flex';
      if (els.callUserName) els.callUserName.textContent = `@${from}`;
      if (els.callStatus) els.callStatus.textContent = 'Connected';
      if (els.callAvatar) els.callAvatar.textContent = getInitial(from);

      if (callType === 'video' && els.callRemoteVideoWrap) {
        els.callRemoteVideoWrap.style.display = 'block';
        if (els.callLocalVideo) {
          els.callLocalVideo.srcObject = localStream;
          els.callLocalVideo.play().catch(() => {});
        }
      } else if (els.callRemoteVideoWrap) {
        els.callRemoteVideoWrap.style.display = 'none';
      }

      peerConnection = new RTCPeerConnection(RTC_CONFIG);
      localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

      peerConnection.ontrack = e => {
        let remoteStream = (e.streams && e.streams[0]) ? e.streams[0] : null;
        if (!remoteStream) {
          if (!peerConnection._remoteStream) {
            peerConnection._remoteStream = new MediaStream();
          }
          peerConnection._remoteStream.addTrack(e.track);
          remoteStream = peerConnection._remoteStream;
        }

        const remoteAudio = document.getElementById('callRemoteAudio');
        if (remoteAudio) {
          remoteAudio.srcObject = remoteStream;
          remoteAudio.play().catch(() => {});
        }
        if (els.callRemoteVideo) {
          els.callRemoteVideo.srcObject = remoteStream;
          els.callRemoteVideo.play().catch(() => {});
        }
      };

      peerConnection.onicecandidate = e => {
        if (e.candidate && socket && socket.connected) {
          socket.emit('call-candidate', { candidate: e.candidate, targetSocketId: callerSocketId, targetUser: from });
        }
      };

      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

      // Flush buffered candidates
      while (pendingIceCandidates.length) {
        const c = pendingIceCandidates.shift();
        try { await peerConnection.addIceCandidate(new RTCIceCandidate(c)); } catch (_) { /* ignore */ }
      }

      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      if (socket && socket.connected) {
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
    stopRingtoneLoop();
    stopRingtone();
    const modal = els.incomingCallModal || document.getElementById('incomingCallModal');
    if (modal) modal.style.display = 'none';
    if (incomingCallData && socket && socket.connected) {
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
      while (pendingIceCandidates.length) {
        const c = pendingIceCandidates.shift();
        try { await peerConnection.addIceCandidate(new RTCIceCandidate(c)); } catch (_) { /* ignore */ }
      }
      if (els.callStatus) els.callStatus.textContent = 'Connected';
      startCallTimer();
    } catch (_) { /* ignore */ }
  }

  function handleCallDecline() {
    showToast('Call declined');
    endCall();
  }

  async function handleCallCandidate(data) {
    if (!data || !data.candidate) return;
    if (peerConnection && peerConnection.remoteDescription && peerConnection.remoteDescription.type) {
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (_) { /* ignore */ }
    } else {
      pendingIceCandidates.push(data.candidate);
    }
  }

  function handleCallHangup() {
    showToast('Call ended');
    cleanupCall();
  }

  function endCall() { stopRingtoneLoop();
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
          <div class="user-result-row" onclick="BestieChat.startDMWith(${jsAttr(cleanQ)})" style="background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.15); margin-bottom:8px;">
            <div style="display:flex; align-items:center; gap:10px;">
              <div style="width:36px; height:36px; border-radius:50%; background:#fff; color:#000; display:flex; align-items:center; justify-content:center; font-size:14px; font-weight:700;">${isSelf ? 'N' : getInitial(cleanQ)}</div>
              <div>
                <div style="font-weight:700; font-size:13.5px; color:#fff;">${actionLabel}</div>
                <div style="font-size:11.5px; color:var(--text-muted);">${actionSub}</div>
              </div>
            </div>
            <button type="button" class="login-btn" onclick="event.stopPropagation(); BestieChat.startDMWith(${jsAttr(cleanQ)})" style="padding:5px 14px; font-size:12px; margin:0; width:auto;">${isSelf ? 'Open' : 'Message'}</button>
          </div>
        `;
      }

      if (users && users.length > 0) {
        html += '<div style="padding:4px 2px; font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Registered Contacts</div>';
        html += users.map(u => `
          <div class="user-result-row" onclick="BestieChat.startDMWith(${jsAttr(u.username)})">
            <div style="display:flex; align-items:center; gap:10px;">
              <div style="width:36px; height:36px; border-radius:50%; background:var(--bg-surface); border:1px solid var(--border); display:flex; align-items:center; justify-content:center; font-size:14px; font-weight:700; color:#fff;">${getInitial(u.nickname || u.username)}</div>
              <div>
                <div style="font-weight:700; font-size:13.5px; color:#fff;">${escapeHtml(u.nickname || u.username)}</div>
                <div style="font-size:11.5px; color:var(--text-muted);">@${escapeHtml(u.username)}</div>
              </div>
            </div>
            <button type="button" class="login-btn" onclick="event.stopPropagation(); BestieChat.startDMWith(${jsAttr(u.username)})" style="padding:5px 14px; font-size:12px; margin:0; width:auto;">Chat</button>
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
    openLightboxSlideshow(url);
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

  function playSendTone() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(920, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(460, ctx.currentTime + 0.06);
      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.06);
    } catch (_) { /* ignore */ }
  }

  function playNotificationTone() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(560, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(840, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch (_) { /* ignore */ }
  }

  function playClickTone() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1400, ctx.currentTime);
      gain.gain.setValueAtTime(0.02, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.02);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.02);
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

  // Safe embedding of dynamic values inside inline handlers. JSON.stringify
  // produces a valid JS string literal; HTML-escaping then makes it safe
  // inside a double-quoted attribute (the browser decodes entities BEFORE the
  // JS engine evaluates the attribute, so the JSON escapes survive intact and
  // no attacker-controlled quote can break out of either context).
  function jsAttr(value) {
    return escapeHtml(JSON.stringify(String(value == null ? '' : value)));
  }

  function escapeRegex(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function formatMessageContent(rawText, msgId) {
    if (!rawText) return '';
    let str = escapeHtml(rawText);

    // Mentions
    str = str.replace(/@([a-zA-Z0-9_-]+)/g, '<span class="mention-tag">@$1</span>');

    // Auto link formatting
    str = str.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" style="color:inherit; text-decoration:underline;">$1</a>');
    const triple = String.fromCharCode(96, 96, 96);
    const single = String.fromCharCode(96);
    if (str.includes(triple)) {
      str = str.replace(new RegExp(triple + '([\\s\\S]*?)' + triple, 'g'), '<pre class="chat-code-block"><code>$1</code></pre>');
    }
    if (str.includes(single)) {
      str = str.replace(new RegExp(single + '([^' + single + ']+)' + single, 'g'), '<code style="background:rgba(255,255,255,0.15); padding:1px 4px; border-radius:3px; font-size:12px;">$1</code>');
    }

    // Interactive Checklists
    const lines = str.split('\n');
    let taskIdx = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^-\s*\[([ xX])\]\s*(.*)/.test(line)) {
        const isDone = /^-\s*\[[xX]\]/.test(line);
        const taskText = line.replace(/^-\s*\[[ xX]\]\s*/, '');
        lines[i] = `<label class="task-item ${isDone ? 'completed' : ''}"><input type="checkbox" ${isDone ? 'checked' : ''} onchange="BestieChat.toggleTaskItem(this, ${jsAttr(msgId || '')}, ${taskIdx})" /><span>${taskText}</span></label>`;
        taskIdx++;
      }
    }
    return lines.join('\n');
  }

  async function toggleScreenShare() {
    if (!peerConnection) return;
    if (isScreenSharing) {
      if (screenStream) {
        screenStream.getTracks().forEach(t => t.stop());
        screenStream = null;
      }
      isScreenSharing = false;
      const camTrack = localStream ? localStream.getVideoTracks()[0] : null;
      if (camTrack) {
        const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) sender.replaceTrack(camTrack);
        if (els.callLocalVideo) els.callLocalVideo.srcObject = localStream;
      }
      if (els.screenShareBtn) els.screenShareBtn.textContent = 'Screen';
      showToast('Screen sharing stopped');
    } else {
      try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];
        const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) sender.replaceTrack(screenTrack);
        if (els.callLocalVideo) els.callLocalVideo.srcObject = screenStream;
        
        isScreenSharing = true;
        if (els.screenShareBtn) els.screenShareBtn.textContent = 'Stop Share';
        showToast('Screen sharing started');

        screenTrack.onended = () => toggleScreenShare();
      } catch (_) {
        showToast('Screen sharing cancelled');
      }
    }
  }

  const activeAudioPlayers = new Map();
  function playAudio(url, btn) {
    let audio = activeAudioPlayers.get(url);
    if (!audio) {
      audio = new Audio(url);
      activeAudioPlayers.set(url, audio);
      audio.onended = () => { if (btn) btn.textContent = '▶'; };
    }

    if (audio.paused) {
      audio.play().catch(() => {});
      if (btn) btn.textContent = '⏸';
    } else {
      audio.pause();
      if (btn) btn.textContent = '▶';
    }
  }

  function cycleAudioSpeed(btn, url) {
    let audio = activeAudioPlayers.get(url);
    if (!audio) {
      audio = new Audio(url);
      activeAudioPlayers.set(url, audio);
    }
    const rates = [1.0, 1.5, 2.0];
    const currentRate = audio.playbackRate || 1.0;
    const nextIdx = (rates.indexOf(currentRate) + 1) % rates.length;
    const nextRate = rates[nextIdx];
    audio.playbackRate = nextRate;
    btn.textContent = nextRate + 'x';
    showToast('Audio speed: ' + nextRate + 'x');
  }

  let editingMessageId = null;
  function openEditModal(messageId, currentText) {
    editingMessageId = messageId;
    const modal = document.getElementById('editMessageModal');
    const input = document.getElementById('editMessageInput');
    if (modal && input) {
      input.value = currentText || '';
      modal.style.display = 'flex';
      input.focus();
    }
  }

  function closeEditModal() {
    editingMessageId = null;
    const modal = document.getElementById('editMessageModal');
    if (modal) modal.style.display = 'none';
  }

  function submitEditMessage() {
    const input = document.getElementById('editMessageInput');
    if (!input || !editingMessageId || !socket) return;
    const newText = input.value.trim();
    if (!newText) return;

    socket.emit('edit-message', { messageId: editingMessageId, text: newText });

    const el = document.querySelector(`[data-msg-id="${CSS.escape(String(editingMessageId))}"]`);
    if (el) {
      const textSpan = el.querySelector('.msg-text-content');
      if (textSpan) {
        textSpan.innerHTML = formatMessageContent(newText) + ' <span class="edited-tag">(edited)</span>';
      }
    }
    closeEditModal();
    showToast('Message edited');
  }

  function openDisappearingModal() {
    const modal = document.getElementById('disappearingModal');
    if (modal) modal.style.display = 'flex';
  }

  function closeDisappearingModal() {
    const modal = document.getElementById('disappearingModal');
    if (modal) modal.style.display = 'none';
  }

  function setDisappearingTimer(ms) {
    if (socket && myRoom) {
      socket.emit('set-disappearing-timer', ms);
      const labels = { 0: 'Off', 30000: '30s', 300000: '5m', 3600000: '1h', 86400000: '24h' };
      showToast('⏱️ Disappearing timer: ' + (labels[ms] || ms + 'ms'));
    }
    closeDisappearingModal();
  }

  async function exportChatHistory() {
    if (!myRoom || !authToken) return;
    try {
      const resp = await fetch(`/api/rooms/${encodeURIComponent(myRoom)}/messages`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (!resp.ok) return;
      const messages = await resp.json();
      
      const otherUser = myRoom === `dm_${myName.toLowerCase()}_${myName.toLowerCase()}` ? 'Note_to_Self' : myRoom.replace('dm_', '');
      let transcript = '=== tahc Chat Transcript for room: @' + otherUser + ' ===\n';
      transcript += 'Exported on: ' + new Date().toLocaleString() + '\n\n';

      if (Array.isArray(messages)) {
        messages.forEach(m => {
          const time = new Date(m.time).toLocaleString();
          const user = m.user || 'Unknown';
          const text = m.text || (m.type === 'image' ? '[Photo: ' + m.url + ']' : m.type === 'document' ? '[Document: ' + m.docName + ']' : '[Voice Note]');
          transcript += '[' + time + '] @' + user + ': ' + text + '\n';
        });
      }

      const blob = new Blob([transcript], { type: 'text/plain;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'tahc_chat_' + otherUser + '_' + Date.now() + '.txt';
      document.body.appendChild(a);
      a.click();
      a.remove();
      showToast('📥 Chat transcript downloaded');
    } catch (_) {
      showToast('Could not export chat');
    }
  }

  function sendDirectPayload(payload) {
    const intro = els.messages ? els.messages.querySelector('.chat-intro-card') : null;
    if (intro) intro.remove();

    renderMessage(payload, true);
    scrollBottom();
    idbSaveMessages(myRoom, [payload]);

    if (socket && socket.connected) {
      socket.emit('message', payload);
    } else {
      offlineOutbox.push(payload);
      showToast('Offline — message queued');
    }

    playSendTone();
    autoExpandMsgInput();
    cancelReply();
    updateSendBtnIcon();
  }


  // ═══════════════════ PRODUCTIVITY: TASKS, POLLS, SLASH & SCHEDULE ═══════════════════
  function handleSlashInput() {
    const slashMenu = document.getElementById('slashMenu');
    if (!slashMenu || !els.msgInput) return;
    const val = els.msgInput.value;
    if (val.startsWith('/')) {
      slashMenu.style.display = 'flex';
    } else {
      slashMenu.style.display = 'none';
    }
  }

  function hideSlashMenu() {
    const slashMenu = document.getElementById('slashMenu');
    if (slashMenu) slashMenu.style.display = 'none';
  }

  function applySlashCommand(cmd) {
    if (!els.msgInput) return;
    if (cmd === '/clear') {
      deleteRoom();
      hideSlashMenu();
      return;
    }
    els.msgInput.value = cmd;
    els.msgInput.focus();
    hideSlashMenu();
    updateSendBtnIcon();
  }

  function toggleTaskItem(input, messageId, taskIndex) {
    if (!messageId || !socket) return;
    const isChecked = input.checked;
    const label = input.closest('.task-item');
    if (label) {
      if (isChecked) label.classList.add('completed');
      else label.classList.remove('completed');
    }
    socket.emit('toggle-task', { messageId, taskIndex, checked: isChecked });
  }

  function renderPollHtml(msg) {
    const question = escapeHtml(msg.question || 'Poll');
    const options = Array.isArray(msg.options) ? msg.options : [];
    const votes = Array.isArray(msg.votes) ? msg.votes : [];
    const totalVotes = votes.length;

    let optionsHtml = '';
    options.forEach((opt, idx) => {
      const optVotes = votes.filter(v => v.optionIndex === idx);
      const percent = totalVotes > 0 ? Math.round((optVotes.length / totalVotes) * 100) : 0;
      const hasMyVote = votes.some(v => v.optionIndex === idx && (v.user || '').toLowerCase() === (myName || '').toLowerCase());
      
      optionsHtml += `
        <div class="poll-option-row ${hasMyVote ? 'voted' : ''}" onclick="BestieChat.votePoll(${jsAttr(msg.id)}, ${idx})">
          <div class="poll-bar-fill" style="width:${percent}%;"></div>
          <div class="poll-option-content">
            <span>${escapeHtml(opt.text)}</span>
            <span style="font-size:12px; opacity:0.8;">${percent}% (${optVotes.length})</span>
          </div>
        </div>
      `;
    });

    return `
      <div class="poll-card" data-poll-id="${escapeHtml(msg.id)}">
        <div class="poll-question">📊 ${question}</div>
        <div class="poll-options">${optionsHtml}</div>
        <div class="poll-footer">
          <span>${totalVotes} vote${totalVotes === 1 ? '' : 's'}</span>
          <span>Tap option to vote</span>
        </div>
      </div>
    `;
  }

  function votePoll(messageId, optionIndex) {
    if (socket && messageId) {
      socket.emit('vote-poll', { messageId, optionIndex });
    }
  }

  // Scheduled Messages
  function openScheduleModal() {
    if (!els.msgInput || !els.msgInput.value.trim()) {
      showToast('Type a message in the input box first to schedule it');
      return;
    }
    const modal = document.getElementById('scheduleModal');
    if (modal) modal.style.display = 'flex';
  }

  function closeScheduleModal() {
    const modal = document.getElementById('scheduleModal');
    if (modal) modal.style.display = 'none';
  }

  function scheduleMessageIn(delayMs) {
    const text = els.msgInput ? els.msgInput.value.trim() : '';
    if (!text) return;
    const sendTime = Date.now() + delayMs;
    const targetRoom = myRoom;

    setTimeout(() => {
      if (socket && socket.connected) {
        const payload = {
          id: 'msg_sched_' + Date.now(),
          text,
          user: myName,
          room: targetRoom,
          time: Date.now(),
          type: 'text'
        };
        if (targetRoom === myRoom) {
          renderMessage(payload, true);
          scrollBottom();
        }
        socket.emit('message', payload);
        idbSaveMessages(targetRoom, [payload]);
        showToast('⏰ Scheduled message sent!');
      }
    }, delayMs);

    els.msgInput.value = '';
    closeScheduleModal();
    updateSendBtnIcon();
    showToast(`⏰ Message scheduled for ${new Date(sendTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
  }

  function scheduleMessageTomorrowMorning() {
    const now = new Date();
    const tomorrow9am = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0, 0);
    const delay = Math.max(tomorrow9am.getTime() - now.getTime(), 60000);
    scheduleMessageIn(delay);
  }

  // Reminders
  let targetReminderMsg = null;
  function openReminderModal(messageId, text) {
    targetReminderMsg = { id: messageId, text };
    const modal = document.getElementById('reminderModal');
    const preview = document.getElementById('reminderPreviewText');
    if (modal) {
      if (preview) preview.textContent = `Remind me about: "${text.slice(0, 30)}..."`;
      modal.style.display = 'flex';
    }
  }

  function closeReminderModal() {
    targetReminderMsg = null;
    const modal = document.getElementById('reminderModal');
    if (modal) modal.style.display = 'none';
  }

  function setReminderIn(delayMs) {
    if (!targetReminderMsg) return;
    const saved = { ...targetReminderMsg };
    setTimeout(() => {
      playNotificationTone();
      showToast(`🔔 Reminder: "${saved.text.slice(0, 35)}"`);
      if (saved.id) scrollToMessage(saved.id);
    }, delayMs);

    closeReminderModal();
    showToast(`🔔 Reminder set for ${new Date(Date.now() + delayMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
  }

  // Shared Files & Tasks Drawer
  let _currentSharedTab = 'docs';
  async function openSharedDrawer() {
    const drawer = document.getElementById('sharedDrawer');
    if (drawer) {
      drawer.style.display = 'flex';
      await renderSharedDrawerContent();
    }
  }

  function closeSharedDrawer() {
    const drawer = document.getElementById('sharedDrawer');
    if (drawer) drawer.style.display = 'none';
  }

  function switchSharedTab(tab) {
    _currentSharedTab = tab;
    ['sharedTabDocs', 'sharedTabMedia', 'sharedTabTasks'].forEach(id => {
      const btn = document.getElementById(id);
      if (btn) btn.classList.remove('active');
    });
    const activeBtn = document.getElementById('sharedTab' + tab.charAt(0).toUpperCase() + tab.slice(1));
    if (activeBtn) activeBtn.classList.add('active');

    const docsList = document.getElementById('sharedDocsList');
    const mediaGrid = document.getElementById('sharedMediaGrid');
    const tasksList = document.getElementById('sharedTasksList');

    if (docsList) docsList.style.display = tab === 'docs' ? 'flex' : 'none';
    if (mediaGrid) mediaGrid.style.display = tab === 'media' ? 'grid' : 'none';
    if (tasksList) tasksList.style.display = tab === 'tasks' ? 'flex' : 'none';
  }

  async function renderSharedDrawerContent() {
    if (!myRoom) return;
    const msgs = await idbGetMessages(myRoom);

    const docsList = document.getElementById('sharedDocsList');
    const mediaGrid = document.getElementById('sharedMediaGrid');
    const tasksList = document.getElementById('sharedTasksList');

    const docs = msgs.filter(m => m.type === 'document' && m.url);
    const photos = msgs.filter(m => m.type === 'image' && m.url);
    const taskMsgs = msgs.filter(m => m.text && /^-\s*\[([ xX])\]/.test(m.text));

    if (docsList) {
      if (!docs.length) docsList.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-muted); font-size:12.5px;">No documents shared yet</div>';
      else {
        docsList.innerHTML = docs.map(d => `
          <a href="${escapeHtml(d.url)}" download class="doc-card" style="text-decoration:none; color:inherit;">
            <div class="doc-icon">📄</div>
            <div style="flex:1; overflow:hidden;">
              <div class="doc-name" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(d.docName || 'Document')}</div>
              <div class="doc-size">${d.docSize ? Math.round(d.docSize / 1024) + ' KB' : 'Download'} · ${formatTimestamp(d.time)}</div>
            </div>
          </a>
        `).join('');
      }
    }

    if (mediaGrid) {
      if (!photos.length) mediaGrid.innerHTML = '<div style="grid-column:1/-1; padding:20px; text-align:center; color:var(--text-muted); font-size:12.5px;">No photos shared yet</div>';
      else {
        mediaGrid.innerHTML = photos.map(p => `
          <img src="${escapeHtml(p.url)}" style="width:100%; height:80px; object-fit:cover; border-radius:6px; cursor:pointer;" data-action="open-lightbox" data-url="${escapeHtml(p.url)}" loading="lazy" />
        `).join('');
      }
    }

    if (tasksList) {
      if (!taskMsgs.length) tasksList.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-muted); font-size:12.5px;">No tasks created in this chat. Type /todo to create one!</div>';
      else {
        tasksList.innerHTML = taskMsgs.map(t => `
          <div class="starred-item-card" onclick="BestieChat.closeSharedDrawer(); BestieChat.scrollToMessage(${jsAttr(t.id)});">
            <div class="starred-item-header">
              <span style="font-weight:700; color:#fff;">@${escapeHtml(t.user)}</span>
              <span>${formatTimestamp(t.time)}</span>
            </div>
            <div style="font-size:13px; color:#fff;">${formatMessageContent(t.text, t.id)}</div>
          </div>
        `).join('');
      }
    }
  }



  
  // ═══════════════════ 3-PANE NAVIGATION & CATEGORIZED CHAT LIST ═══════════════════
  function switchRail(tab) {
    currentActiveRailTab = tab;
    ['railBtnDirect', 'railBtnGroups'].forEach(id => {
      const btn = document.getElementById(id);
      if (btn) btn.classList.remove('active');
    });
    const activeBtn = document.getElementById('railBtn' + tab.charAt(0).toUpperCase() + tab.slice(1));
    if (activeBtn) activeBtn.classList.add('active');

    renderChatList(cachedUserRooms);
  }

  function toggleMoreMenu() {
    const menu = document.getElementById('chatMoreMenu');
    if (!menu) return;
    menu.style.display = menu.style.display === 'flex' ? 'none' : 'flex';
  }

  function closeMoreMenu() {
    const menu = document.getElementById('chatMoreMenu');
    if (menu) menu.style.display = 'none';
  }

  // Close more menu when clicking anywhere outside
  document.addEventListener('click', e => {
    const menu = document.getElementById('chatMoreMenu');
    if (menu && menu.style.display === 'flex') {
      if (!e.target.closest('#chatMoreMenu') && !e.target.closest('[title="More Options"]')) {
        menu.style.display = 'none';
      }
    }
  });

  // ═══════════════════ REAL-WORLD: GROUPS, FORWARDING, NOTIFICATIONS & PREVIEWS ═══════════════════
  let _unreadCount = 0;
  let ringtoneInterval = null;
  let targetForwardMsg = null;
  let currentLightboxImages = [];
  let currentLightboxIdx = 0;
  let _recordedAudioBlob = null;
  let audioPreviewObj = null;

  // Background Web Notifications
  function initNotifications() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    window.addEventListener('focus', () => {
      _unreadCount = 0;
      document.title = 'tahc';
    });
  }

  function triggerBackgroundNotification(msg) {
    if (!msg || (msg.user || '').toLowerCase() === (myName || '').toLowerCase()) return;
    if (document.hidden) {
      _unreadCount++;
      document.title = `(${_unreadCount}) tahc`;
      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification(`@${msg.user} in tahc`, {
            body: msg.text || (msg.type === 'image' ? '📷 Sent a photo' : '📄 Sent a document'),
            icon: '/icon-192.png'
          });
        } catch (_) { /* ignore */ }
      }
    }
  }

  // OpenGraph Link Previews
  const _linkPreviewCache = new Map();
  async function fetchAndAttachLinkPreview(url, msgEl) {
    if (!msgEl || !url) return;
    if (_linkPreviewCache.has(url)) {
      const cached = _linkPreviewCache.get(url);
      if (cached && !msgEl.querySelector('.link-preview-card')) {
        renderLinkPreviewInEl(cached, msgEl, url);
      }
      return;
    }

    try {
      const res = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data && (data.title || data.image)) {
        _linkPreviewCache.set(url, data);
        if (!msgEl.querySelector('.link-preview-card')) {
          renderLinkPreviewInEl(data, msgEl, url);
        }
      }
    } catch (_) { /* ignore */ }
  }

  function renderLinkPreviewInEl(data, msgEl, url) {
    const card = document.createElement('a');
    card.href = url;
    card.target = '_blank';
    card.rel = 'noopener noreferrer';
    card.className = 'link-preview-card';
    let domain = 'link';
    try { domain = new URL(url).hostname; } catch (_) { /* ignore */ }

    card.innerHTML = `
      ${data.image ? `<img src="${escapeHtml(data.image)}" class="link-preview-img" alt="thumbnail" loading="lazy" />` : ''}
      <div class="link-preview-body">
        <div class="link-preview-title">${escapeHtml(data.title || domain)}</div>
        ${data.description ? `<div class="link-preview-desc">${escapeHtml(data.description)}</div>` : ''}
        <div class="link-preview-domain">${escapeHtml(domain)}</div>
      </div>
    `;
    msgEl.appendChild(card);
  }

  // @Mentions Autocomplete
  function handleMentionInput() {
    const menu = document.getElementById('mentionMenu');
    if (!menu || !els.msgInput) return;
    const val = els.msgInput.value;
    const cursor = els.msgInput.selectionStart || val.length;
    const textBefore = val.slice(0, cursor);
    const match = textBefore.match(/@([a-zA-Z0-9_-]*)$/);

    if (match) {
      const query = match[1].toLowerCase();
      const users = currentOnlineUsers.filter(u => u.toLowerCase().includes(query) && u.toLowerCase() !== (myName || '').toLowerCase());
      if (users.length > 0) {
        menu.innerHTML = users.map(u => `
          <div class="mention-item" onclick="BestieChat.selectMention(${jsAttr(u)})">
            <div style="width:22px; height:22px; border-radius:50%; background:#fff; color:#000; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700;">${getInitial(u)}</div>
            <span>@${escapeHtml(u)}</span>
          </div>
        `).join('');
        menu.style.display = 'flex';
        return;
      }
    }
    menu.style.display = 'none';
  }

  function selectMention(username) {
    if (!els.msgInput) return;
    const val = els.msgInput.value;
    const cursor = els.msgInput.selectionStart || val.length;
    const textBefore = val.slice(0, cursor).replace(/@([a-zA-Z0-9_-]*)$/, `@${username} `);
    const textAfter = val.slice(cursor);
    els.msgInput.value = textBefore + textAfter;
    els.msgInput.focus();
    const menu = document.getElementById('mentionMenu');
    if (menu) menu.style.display = 'none';
  }

  // Group Chats
  function openNewGroupModal() {
    const modal = document.getElementById('newGroupModal');
    const picker = document.getElementById('groupMembersPickerList');
    if (modal) {
      modal.style.display = 'flex';
      if (picker) {
        const others = currentOnlineUsers.filter(u => u.toLowerCase() !== (myName || '').toLowerCase());
        if (!others.length) {
          picker.innerHTML = '<div style="padding:10px; color:var(--text-muted); font-size:12px;">No other users online right now</div>';
        } else {
          picker.innerHTML = others.map(u => `
            <label class="member-picker-row">
              <div style="display:flex; align-items:center; gap:8px;">
                <div style="width:24px; height:24px; border-radius:50%; background:#fff; color:#000; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700;">${getInitial(u)}</div>
                <span style="font-size:13px; color:#fff;">@${escapeHtml(u)}</span>
              </div>
              <input type="checkbox" value="${escapeHtml(u)}" class="group-member-checkbox" style="accent-color:#fff; width:16px; height:16px;" />
            </label>
          `).join('');
        }
      }
    }
  }

  function closeNewGroupModal() {
    const modal = document.getElementById('newGroupModal');
    if (modal) modal.style.display = 'none';
  }

  function submitCreateGroup() {
    const nameInput = document.getElementById('newGroupNameInput');
    const topicInput = document.getElementById('newGroupTopicInput');
    if (!nameInput || !nameInput.value.trim()) {
      showToast('Please enter a group name');
      return;
    }
    const groupName = nameInput.value.trim();
    const topic = topicInput ? topicInput.value.trim() : '';
    const checked = Array.from(document.querySelectorAll('.group-member-checkbox:checked')).map(cb => cb.value);

    if (socket && socket.connected) {
      socket.emit('create-group', { groupName, members: checked, topic });
      closeNewGroupModal();
      showToast(`Group "${groupName}" created!`);
    }
  }

  // Message Forwarding
  async function openForwardModal(msgId) {
    if (!myRoom) return;
    const msgs = await idbGetMessages(myRoom);
    const target = msgs.find(m => m.id === msgId);
    if (!target) return;
    targetForwardMsg = target;

    const modal = document.getElementById('forwardModal');
    const list = document.getElementById('forwardChatList');
    if (modal && list) {
      list.innerHTML = cachedUserRooms.map(r => {
        const isGroup = r.isGroup || (r.name || '').startsWith('group_');
        const displayName = r.displayName || (r.name.replace('dm_', '').replace(/_/g, ' ') || 'Chat');
        return `
          <div class="member-picker-row" onclick="BestieChat.forwardToRoom(${jsAttr(r.name)})">
            <div style="display:flex; align-items:center; gap:8px;">
              <div style="width:30px; height:30px; border-radius:50%; background:rgba(255,255,255,0.1); display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:700;">${isGroup ? '👥' : getInitial(displayName)}</div>
              <div>
                <div style="font-size:13px; font-weight:600; color:#fff;">${escapeHtml(displayName)}</div>
                <div style="font-size:11px; color:var(--text-muted);">${isGroup ? 'Group Chat' : 'Direct Message'}</div>
              </div>
            </div>
            <button type="button" class="filter-pill" style="padding:4px 10px; font-size:11px;">Send ↪️</button>
          </div>
        `;
      }).join('');
      modal.style.display = 'flex';
    }
  }

  function closeForwardModal() {
    targetForwardMsg = null;
    const modal = document.getElementById('forwardModal');
    if (modal) modal.style.display = 'none';
  }

  function forwardToRoom(targetRoom) {
    if (!targetForwardMsg || !targetRoom) return;
    const payload = {
      id: 'fwd_' + Date.now(),
      text: targetForwardMsg.text || '',
      url: targetForwardMsg.url || null,
      type: targetForwardMsg.type || 'text',
      user: myName,
      room: targetRoom,
      forwardedFrom: targetForwardMsg.user,
      time: Date.now()
    };

    if (socket && socket.connected) {
      socket.emit('message', payload);
    }
    idbSaveMessages(targetRoom, [payload]);
    if (targetRoom === myRoom) {
      renderMessage(payload, true);
      scrollBottom();
    }
    closeForwardModal();
    showToast('↪️ Message forwarded!');
  }

  // Call Ringtones & History
  let _callHistory = [];
  function startRingtoneLoop() {
    stopRingtoneLoop();
    try {
      const playTonePair = () => {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();
        osc1.frequency.setValueAtTime(440, ctx.currentTime);
        osc2.frequency.setValueAtTime(480, ctx.currentTime);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);
        osc1.start();
        osc2.start();
        osc1.stop(ctx.currentTime + 1.2);
        osc2.stop(ctx.currentTime + 1.2);
      };
      playTonePair();
      ringtoneInterval = setInterval(playTonePair, 3000);
    } catch (_) { /* ignore */ }
  }

  function stopRingtoneLoop() {
    if (ringtoneInterval) {
      clearInterval(ringtoneInterval);
      ringtoneInterval = null;
    }
  }

  function logCall(user, type, direction, status, duration = 0) {
    _callHistory.unshift({
      id: 'call_' + Date.now(),
      user,
      type,
      direction,
      status,
      duration,
      time: Date.now()
    });
  }

  function openCallHistoryModal() {
    const modal = document.getElementById('callHistoryModal');
    const list = document.getElementById('callHistoryList');
    if (modal && list) {
      if (!_callHistory.length) {
        list.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-muted); font-size:12.5px;">No recent calls</div>';
      } else {
        list.innerHTML = _callHistory.map(c => `
          <div class="call-history-row">
            <div style="display:flex; align-items:center; gap:10px;">
              <div style="font-size:16px;">${c.type === 'video' ? '📹' : '📞'}</div>
              <div>
                <div style="font-size:13px; font-weight:700; color:#fff;">@${escapeHtml(c.user)}</div>
                <div style="font-size:11px; color:var(--text-muted);">${c.direction === 'incoming' ? 'Incoming' : 'Outgoing'} · ${formatTimestamp(c.time)}</div>
              </div>
            </div>
            <div class="${c.status === 'missed' ? 'call-badge-missed' : 'call-badge-completed'}">${c.status.toUpperCase()} ${c.duration ? '(' + c.duration + 's)' : ''}</div>
          </div>
        `).join('');
      }
      modal.style.display = 'flex';
    }
  }

  function closeCallHistoryModal() {
    const modal = document.getElementById('callHistoryModal');
    if (modal) modal.style.display = 'none';
  }

  // Lightbox Slideshow
  function openLightboxSlideshow(src) {
    const modal = document.getElementById('lightbox');
    const img = document.getElementById('lightboxImg');
    const dl = document.getElementById('lightboxDownloadBtn');
    if (modal && img) {
      // Gather all images in chat
      const chatImgs = Array.from(document.querySelectorAll('.chat-photo-img')).map(el => el.src);
      currentLightboxImages = chatImgs.length ? chatImgs : [src];
      currentLightboxIdx = currentLightboxImages.indexOf(src);
      if (currentLightboxIdx === -1) currentLightboxIdx = 0;

      img.src = currentLightboxImages[currentLightboxIdx];
      if (dl) dl.href = currentLightboxImages[currentLightboxIdx];
      modal.style.display = 'flex';
    }
  }

  function prevLightboxImg() {
    if (!currentLightboxImages.length) return;
    currentLightboxIdx = (currentLightboxIdx - 1 + currentLightboxImages.length) % currentLightboxImages.length;
    const img = document.getElementById('lightboxImg');
    const dl = document.getElementById('lightboxDownloadBtn');
    if (img) img.src = currentLightboxImages[currentLightboxIdx];
    if (dl) dl.href = currentLightboxImages[currentLightboxIdx];
  }

  function nextLightboxImg() {
    if (!currentLightboxImages.length) return;
    currentLightboxIdx = (currentLightboxIdx + 1) % currentLightboxImages.length;
    const img = document.getElementById('lightboxImg');
    const dl = document.getElementById('lightboxDownloadBtn');
    if (img) img.src = currentLightboxImages[currentLightboxIdx];
    if (dl) dl.href = currentLightboxImages[currentLightboxIdx];
  }

  // Voice Studio Controls
  let _isRecordingPaused = false;
  function togglePauseRecording() {
    if (!mediaRecorder) return;
    const btn = document.getElementById('voicePauseResumeBtn');
    const status = document.getElementById('voiceStudioStatus');
    const previewBtn = document.getElementById('voicePreviewBtn');

    if (mediaRecorder.state === 'recording') {
      mediaRecorder.pause();
      _isRecordingPaused = true;
      if (btn) btn.textContent = '▶️ Resume';
      if (status) status.textContent = 'Recording paused';
      if (previewBtn) previewBtn.style.display = 'flex';
    } else if (mediaRecorder.state === 'paused') {
      mediaRecorder.resume();
      _isRecordingPaused = false;
      if (btn) btn.textContent = '⏸️ Pause';
      if (status) status.textContent = 'Recording voice note...';
      if (previewBtn) previewBtn.style.display = 'none';
    }
  }

  function previewRecording() {
    if (audioChunks.length) {
      const blob = new Blob(audioChunks, { type: 'audio/webm' });
      if (audioPreviewObj) audioPreviewObj.pause();
      audioPreviewObj = new Audio(URL.createObjectURL(blob));
      audioPreviewObj.play();
      showToast('🎧 Playing recording preview');
    }
  }

  function submitRecording() {
    if (mediaRecorder && (mediaRecorder.state === 'recording' || mediaRecorder.state === 'paused')) {
      toggleRecord();
    }
  }



  // ═══════════════════ ACTIVE NOW & DESKTOP INFO PANEL & MOBILE ═══════════════════

  function renderActiveNowRibbon() {
    const wrap = document.getElementById('activeNowWrap');
    const ribbon = document.getElementById('activeNowRibbon');
    if (!wrap || !ribbon) return;

    const others = currentOnlineUsers.filter(u => (u || '').toLowerCase() !== (myName || '').toLowerCase());
    if (!others.length) {
      wrap.style.display = 'none';
      return;
    }

    wrap.style.display = 'block';
    ribbon.innerHTML = others.map(u => `
      <div class="active-now-item" onclick="BestieChat.openDirectWithUser(${jsAttr(u)})" title="Chat with @${escapeHtml(u)}">
        <div class="active-now-avatar-wrap">
          <div class="active-now-avatar">${getInitial(u)}</div>
          <div class="active-now-pulse-ring"></div>
        </div>
        <span class="active-now-name">@${escapeHtml(u)}</span>
      </div>
    `).join('');
  }

  function openDirectWithUser(username) {
    if (!username) return;
    const pair = [myName.toLowerCase(), username.toLowerCase()].sort();
    const dmRoom = `dm_${pair[0]}_${pair[1]}`;
    switchRoom(dmRoom);
  }

  function openNoteToSelf() {
    if (!myName) return;
    const room = `dm_${myName.toLowerCase()}_${myName.toLowerCase()}`;
    switchRoom(room);
  }

  function backToChatList() {
    myRoom = null;
    const sidebar = document.getElementById('sidebar');
    const chatMain = document.getElementById('chatMain');
    const welcome = document.getElementById('welcomeDashboard');
    if (sidebar) sidebar.classList.remove('mobile-chat-open');
    if (chatMain) {
      chatMain.classList.remove('chat-active', 'mobile-chat-open');
    }
    document.body.classList.remove('mobile-chat-active');
    if (welcome) welcome.style.display = 'flex';
    renderChatList(cachedUserRooms);
  }

  function mobileSwitchTab(tab) {
    ['mobNavChats', 'mobNavGroups'].forEach(id => {
      const btn = document.getElementById(id);
      if (btn) btn.classList.remove('active');
    });
    if (tab === 'chats') {
      const btn = document.getElementById('mobNavChats');
      if (btn) btn.classList.add('active');
      switchRail('direct');
    } else if (tab === 'groups') {
      const btn = document.getElementById('mobNavGroups');
      if (btn) btn.classList.add('active');
      switchRail('groups');
    }
  }

  async function toggleChatInfoPanel() {
    const panel = document.getElementById('chatInfoPanel');
    if (!panel) return;
    if (panel.style.display === 'flex') {
      panel.style.display = 'none';
      return;
    }

    if (!myRoom) {
      showToast('Select a chat to view details');
      return;
    }

    const isSaved = myRoom === `dm_${myName.toLowerCase()}_${myName.toLowerCase()}`;
    const isGroup = (myRoom || '').startsWith('group_');
    const otherUser = isSaved ? 'Note to Self' : (myRoom.replace('dm_', '').split('_').find(p => p.toLowerCase() !== myName.toLowerCase()) || 'User');
    const avatarChar = isSaved ? 'N' : (isGroup ? '👥' : getInitial(otherUser));
    const title = isSaved ? 'Note to Self' : (isGroup ? myRoom.replace('group_', '').replace(/_/g, ' ') : `@${otherUser}`);

    const avatarEl = document.getElementById('infoAvatar');
    const nameEl = document.getElementById('infoName');
    const statusEl = document.getElementById('infoStatus');
    const bioEl = document.getElementById('infoBio');
    const mediaGrid = document.getElementById('infoMediaGrid');
    const docsList = document.getElementById('infoDocsList');

    if (avatarEl) avatarEl.textContent = avatarChar;
    if (nameEl) nameEl.textContent = title;
    if (statusEl) statusEl.textContent = isOnlineUser(otherUser) ? 'Online' : 'Offline';
    if (bioEl) bioEl.textContent = isSaved ? 'Private cloud notes' : 'Direct End-to-End Encrypted Session';

    // Populate media & docs
    const msgs = await idbGetMessages(myRoom);
    const media = msgs.filter(m => m.type === 'image' && m.url).slice(-6);
    const docs = msgs.filter(m => m.type === 'document' && m.url).slice(-3);

    if (mediaGrid) {
      if (!media.length) {
        mediaGrid.innerHTML = '<div style="grid-column:span 3; font-size:11.5px; color:var(--text-muted); padding:8px 0;">No photos shared yet</div>';
      } else {
        mediaGrid.innerHTML = media.map(m => `
          <img src="${escapeHtml(m.url)}" class="info-media-thumb" data-action="open-lightbox" data-url="${escapeHtml(m.url)}" alt="media" />
        `).join('');
      }
    }

    if (docsList) {
      if (!docs.length) {
        docsList.innerHTML = '<div style="font-size:11.5px; color:var(--text-muted); padding:4px 0;">No documents shared yet</div>';
      } else {
        docsList.innerHTML = docs.map(d => `
          <a href="${escapeHtml(d.url)}" target="_blank" download class="info-doc-row">
            <span>📄</span>
            <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1;">${escapeHtml(d.docName || 'Document')}</span>
          </a>
        `).join('');
      }
    }

    panel.style.display = 'flex';
  }

  function closeChatInfoPanel() {
    const panel = document.getElementById('chatInfoPanel');
    if (panel) panel.style.display = 'none';
  }

  function isOnlineUser(username) {
    if (!username) return false;
    return currentOnlineUsers.some(u => (u || '').toLowerCase() === username.toLowerCase());
  }

// ═══════════════════ EXPORTS ═══════════════════
  window.BestieChat = {
    switchAuthTab, handleSignIn, handleRegister, joinChat: handleAuthSubmit, logout,
    toggleSidebar, closeSidebar,
    loadChatList, filterChatList, handleSidebarSearch, clearSidebarSearch,
    openNewChatModal, closeNewChatModal, searchUsersForDM, startDMWith, switchRoom, openChatRoom: switchRoom, deleteRoom,
    sendMessage, handleSendBtnClick, toggleRecord, cancelRecording,
    sendPhoto, uploadDocumentFile, uploadCameraFile,
    toggleAttachMenu, toggleEmojiPicker, insertEmoji,
    openProfile, closeProfile, saveProfile,
    openLightbox, closeLightbox, replyToMessage, cancelReply,
    startCall, acceptCall, declineCall, endCall, toggleMuteAudio, toggleCamera, toggleScreenShare, cycleAudioSpeed, openEditModal, closeEditModal, submitEditMessage, openDisappearingModal, closeDisappearingModal, setDisappearingTimer, exportChatHistory,
    applySlashCommand, toggleTaskItem, votePoll,
    insertStarter, openScheduleModal,
    openNewGroupModal, closeNewGroupModal, submitCreateGroup,
    openForwardModal, closeForwardModal, forwardToRoom,
    openCallHistoryModal, closeCallHistoryModal,
    selectMention, prevLightboxImg, nextLightboxImg,
    togglePauseRecording, previewRecording, submitRecording,
    switchRail, toggleMoreMenu, closeMoreMenu,
    renderActiveNowRibbon, openDirectWithUser, openNoteToSelf,
    backToChatList, mobileSwitchTab, toggleChatInfoPanel, closeChatInfoPanel, closeScheduleModal, scheduleMessageIn, scheduleMessageTomorrowMorning,
    openReminderModal, closeReminderModal, setReminderIn,
    openSharedDrawer, closeSharedDrawer, switchSharedTab,
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
