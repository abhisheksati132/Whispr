import { state } from './state.js';

  // ═══════════════════ JOIN / LEAVE ═══════════════════
  let selectedLoginAvatar = '✨';
  export function selectLoginAvatar(emoji, btnEl) {
    selectedLoginAvatar = emoji;
    document.querySelectorAll('.login-avatar-btn').forEach(b => b.classList.remove('active'));
    const target = btnEl || (window.event && (window.event.currentTarget || window.event.target));
    if (target && target.classList) target.classList.add('active');
  }

  // ─── Auth Mode Toggle ───────────────────────────────────────────────────────
  export function setAuthMode(mode) {
    switchAuthTab(mode === 'register' ? 'register' : 'signin');
  }

  let selectedRegAvatar = '🐱';

  export function switchAuthTab(tab) {
    const signInSec = document.getElementById('signInSection');
    const regSec    = document.getElementById('registerSection');
    const tabSignIn = document.getElementById('tabBtnSignIn');
    const tabReg    = document.getElementById('tabBtnRegister');
    const loginErr  = document.getElementById('loginError');
    const regErr    = document.getElementById('regError');
    if (loginErr) loginErr.textContent = '';
    if (regErr)   regErr.textContent = '';

    if (tab === 'register') {
      if (signInSec) signInSec.style.display = 'none';
      if (regSec)    regSec.style.display = 'block';
      if (tabSignIn) { tabSignIn.style.background = 'none'; tabSignIn.style.color = 'var(--muted)'; }
      if (tabReg)    { tabReg.style.background = 'var(--accent)'; tabReg.style.color = '#fff'; }
      const regUser = document.getElementById('regUsernameInput');
      if (regUser) regUser.focus();
    } else {
      if (signInSec) signInSec.style.display = 'block';
      if (regSec)    regSec.style.display = 'none';
      if (tabSignIn) { tabSignIn.style.background = 'var(--accent)'; tabSignIn.style.color = '#fff'; }
      if (tabReg)    { tabReg.style.background = 'none'; tabReg.style.color = 'var(--muted)'; }
      const nameInput = document.getElementById('nameInput');
      if (nameInput) nameInput.focus();
    }
  }

  export function selectRegisterAvatar(emoji, btn) {
    selectedRegAvatar = emoji || '✨';
    document.querySelectorAll('.avatar-chip').forEach(c => {
      c.style.border = '1px solid var(--border)';
    });
    if (btn) {
      btn.style.border = '2px solid var(--accent)';
    }
  }

  export async function handleSignIn() {
    const nameEl = document.getElementById('nameInput');
    const passEl = document.getElementById('passwordInput');
    const errEl  = document.getElementById('loginError');
    if (errEl) errEl.textContent = '';

    let identifier = (nameEl ? nameEl.value.trim().toLowerCase() : '');
    if (identifier.startsWith('@')) identifier = identifier.slice(1);
    const rawPass = (passEl ? passEl.value : '');

    if (!identifier || identifier.length < 2) {
      if (errEl) errEl.textContent = 'Please enter your username or email.';
      if (nameEl) nameEl.focus();
      return;
    }
    if (!rawPass || rawPass.length < 1) {
      if (errEl) errEl.textContent = 'Please enter your password.';
      if (passEl) passEl.focus();
      return;
    }

    const joinBtn = document.getElementById('joinBtn');
    const textSpan = document.getElementById('joinBtnText');
    if (joinBtn) joinBtn.disabled = true;
    if (textSpan) textSpan.textContent = 'Signing in…';

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: identifier, password: rawPass })
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        if (errEl) errEl.textContent = data.error || 'Invalid username or password.';
        if (joinBtn) joinBtn.disabled = false;
        if (textSpan) textSpan.textContent = 'Sign In';
        return;
      }

      await completeUserLogin(data);
    } catch (err) {
      console.error('Sign in error:', err);
      if (errEl) errEl.textContent = 'Network error. Please try again.';
      if (joinBtn) joinBtn.disabled = false;
      if (textSpan) textSpan.textContent = 'Sign In';
    }
  }

  export async function handleRegister() {
    const userEl = document.getElementById('regUsernameInput');
    const nickEl = document.getElementById('regNicknameInput');
    const emailEl = document.getElementById('regEmailInput');
    const passEl = document.getElementById('regPasswordInput');
    const errEl  = document.getElementById('regError');
    if (errEl) errEl.textContent = '';

    const cleanName = (userEl ? userEl.value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '') : '');
    const displayName = (nickEl ? nickEl.value.trim() : '') || cleanName;
    const emailVal = (emailEl ? emailEl.value.trim() : '');
    const rawPass = (passEl ? passEl.value : '');

    if (!cleanName || cleanName.length < 2) {
      if (errEl) errEl.textContent = 'Username must be 2–25 letters/numbers.';
      if (userEl) userEl.focus();
      return;
    }
    if (!rawPass || rawPass.length < 3) {
      if (errEl) errEl.textContent = 'Password must be at least 3 characters.';
      if (passEl) passEl.focus();
      return;
    }

    const regBtn = document.getElementById('registerBtn');
    const textSpan = document.getElementById('registerBtnText');
    if (regBtn) regBtn.disabled = true;
    if (textSpan) textSpan.textContent = 'Creating account…';

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: cleanName,
          email: emailVal,
          password: rawPass,
          nickname: displayName,
          avatar: selectedRegAvatar || '🐱',
          bio: 'Available'
        })
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        if (errEl) errEl.textContent = data.error || 'Failed to create account.';
        if (regBtn) regBtn.disabled = false;
        if (textSpan) textSpan.textContent = 'Create Free Account';
        return;
      }

      await completeUserLogin(data);
    } catch (err) {
      console.error('Register error:', err);
      if (errEl) errEl.textContent = 'Network error. Please try again.';
      if (regBtn) regBtn.disabled = false;
      if (textSpan) textSpan.textContent = 'Create Free Account';
    }
  }

  export async function completeUserLogin(data) {
    authToken = data.token;
    myName = data.username;
    myProfile.avatar = data.avatar || '🐱';
    myProfile.nickname = data.nickname || data.username;
    myProfile.statusBio = data.statusBio || 'Available';
    myProfile.color = data.color || '#818cf8';

    // Default to Saved Messages or last active room
    myRoom = localStorage.getItem('bestieChatRoom') || `dm_${myName.toLowerCase()}_${myName.toLowerCase()}`;

    localStorage.setItem('bestieChatName', myName);
    localStorage.setItem('bestieChatToken', authToken);
    localStorage.setItem('bestieChatRoom', myRoom);
    localStorage.setItem('bestieChatProfile', JSON.stringify(myProfile));

    // Hide offline banner on login
    const banner = document.getElementById('offlineBanner');
    if (banner) banner.style.display = 'none';

    // Hide login and show chat space
    const loginDiv = document.getElementById('login');
    const chatDiv  = document.getElementById('chat');
    if (loginDiv) loginDiv.setAttribute('style', 'display:none !important');
    if (chatDiv)  chatDiv.setAttribute('style', 'display:flex !important');

    applyRoomTheme(myRoom);
    updateSidebarMyProfile();

    try {
      const res = await fetch('/api/rooms/blocks', { headers: { 'Authorization': `Bearer ${authToken}` } });
      if (res.ok) { blockedUsers = await res.json(); }
    } catch (_) {}

    await initOfflineDB();
    loadCachedMessagesFromOfflineDB(myRoom).then(msgs => {
      if (allMessagesCached.length === 0 && msgs.length > 0) {
        allMessagesCached = msgs;
        if (els.messages) els.messages.innerHTML = '';
        lastDateLabel = '';
        msgs.forEach(m => renderMessage(m, true));
      }
    });

    if (!socket || !socket.connected) initSocket();
    else doSocketJoin();

    setTimeout(loadChatList, 400);
  }

  export async function joinChat() {
    return handleSignIn();
  }

  export function leaveChat() {
    localStorage.removeItem('bestieChatToken');
    window.location.reload();
  }

  export function doSocketJoin() {
    if (!socket) return;
    const nameToJoin = myName || localStorage.getItem('bestieChatName') || 'Bestie';
    const roomToJoin = myRoom || localStorage.getItem('bestieChatRoom') || `dm_${nameToJoin.toLowerCase()}_${nameToJoin.toLowerCase()}`;
    myName = nameToJoin;
    myRoom = roomToJoin;
    socket.emit('join', {
      name: nameToJoin, room: roomToJoin,
      nickname: (myProfile && myProfile.nickname) || '',
      password: els.passwordInput ? els.passwordInput.value : ''
    });
  }

  export async function quickReentry() {
    const savedName = localStorage.getItem('bestieChatName');
    const savedToken = localStorage.getItem('bestieChatToken');
    if (!savedName) { showFullLoginForm(); return; }
    
    try {
      myName = savedName;
      authToken = savedToken || '';
      const profileStr = localStorage.getItem('bestieChatProfile');
      if (profileStr) {
        try { myProfile = { ...myProfile, ...JSON.parse(profileStr) }; } catch(e){}
      }
      
      myRoom = localStorage.getItem('bestieChatRoom') || `dm_${myName.toLowerCase()}_${myName.toLowerCase()}`;
      joined = true;
      
      if (els.login) els.login.setAttribute('style', 'display:none !important');
      if (els.chat)  els.chat.setAttribute('style', 'display:flex !important');
      
      updateSidebarMyProfile();
      applyRoomTheme(myRoom);

      await initOfflineDB();
      loadCachedMessagesFromOfflineDB(myRoom).then(msgs => {
        if (allMessagesCached.length === 0 && msgs.length > 0) {
          allMessagesCached = msgs;
          if (els.messages) els.messages.innerHTML = '';
          lastDateLabel = '';
          msgs.forEach(m => renderMessage(m, true));
        }
      });
      
      if (!socket || !socket.connected) initSocket();
      else doSocketJoin();
      
      setTimeout(loadChatList, 800);
    } catch (_) {
      showFullLoginForm();
    }
  }

  export function showFullLoginForm() {
    const reentry = document.getElementById('quickReentryContainer');
    const form = document.getElementById('loginForm');
    if (reentry) reentry.style.display = 'none';
    if (form) form.style.display = 'block';
  }

  export function copyInviteLink() {
    const roomInputEl = document.getElementById('roomInput');
    const room = (roomInputEl && roomInputEl.value.trim()) || myRoom || `dm_${(myName || localStorage.getItem('bestieChatName') || 'Bestie').toLowerCase()}_${(myName || localStorage.getItem('bestieChatName') || 'Bestie').toLowerCase()}`;
    const url = `${window.location.origin}?room=${encodeURIComponent(room)}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => {
        showToast('✨ 1-Click Invite Link copied!');
      }).catch(() => {
        showToast(`Invite Link: ${url}`);
      });
    } else {
      showToast(`Invite Link: ${url}`);
    }
  }

  export function togglePasswordVisibility() {
    const input = document.getElementById('passwordInput');
    if (input) {
      input.type = input.type === 'password' ? 'text' : 'password';
    }
  }

  export function logout() {
    localStorage.removeItem('bestieChatToken');
    localStorage.removeItem('bestieChatName');
    localStorage.removeItem('bestieChatRoom');
    localStorage.removeItem('bestieChatNickname');
    authToken = '';
    if (socket) { try { socket.disconnect(); } catch (_) {} socket = null; }
    myName = ''; myRoom = ''; joined = false;
    if (els.nameInput) els.nameInput.value = '';
    const pinInput = document.getElementById('pinInput');
    if (pinInput) pinInput.value = '';
    document.querySelectorAll('.modal-overlay').forEach(m => { m.classList.remove('open'); m.style.display = 'none'; });
    showFullLoginForm();
    if (els.chat)  els.chat.setAttribute('style', 'display:none !important');
    if (els.login) els.login.setAttribute('style', 'display:flex !important');
    showToast('\uD83D\uDC4B Logged out');
  }