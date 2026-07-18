/* global io */
(() => {
  const ROOM_LABELS = { 'just-us': 'Just Us 💜', daily: 'Daily Check-In ☀️', cute: 'Sweet Notes 💕' };
  const ROOM_THEMES = { 'just-us': '', daily: 'theme-daily', cute: 'theme-cute' };
  const REACTIONS = ['❤️', '😂', '🥺', '🔥', '👀', '✨'];
  const EMOJIS = '😀😂🥰😭💀✨💖👀🫶😊🥺💕🔥👋🎉💬🌙☀️🍕🌮🎵📸💭🦋🐱🌸'.match(/./gu) || [];
  const STICKERS = [
    { tags: ['cute', 'love'], url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjEx/MDJ9bX4Q5K3yA/giphy.gif' },
    { tags: ['happy', 'love'], url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjEx/26BRv0ThflsHCqDrG/giphy.gif' },
    { tags: ['hug', 'love'], url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjEx/lrr9rH7bbQusE/giphy.gif' },
    { tags: ['cute', 'happy'], url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjEx/3o7TKsQ8X3x8F2V2lC/giphy.gif' },
    { tags: ['love', 'sparkle'], url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjEx/26tn33aiTi1jkl6H6/giphy.gif' },
    { tags: ['happy', 'dance'], url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjEx/l0HlBO7eyXz4S3H4Y/giphy.gif' },
    { tags: ['cat', 'cute'], url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjEx/jd7vPTz4h9k4/giphy.gif' },
    { tags: ['bunny', 'cute'], url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjEx/26BRv0ThflsHCqDrG/giphy.gif' },
    { tags: ['love', 'heart'], url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjEx/26tn33aiTi1jkl6H6/giphy.gif' },
    { tags: ['sparkle', 'magic'], url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjEx/3o7TKsQ8X3x8F2V2lC/giphy.gif' }
  ];
  const VIBE_SUGGESTIONS = [
    'tired but happy 😴✨',
    'need coffee ☕️',
    'missing you 💭',
    'feeling grateful 🙏',
    'daydreaming about us 🌈',
    'current mood: chaotic 🎭',
    'sending good vibes ✨',
    'can’t stop smiling 😊'
  ];
  const REMINDER_HOUR = 20;

  let socket, myName = '', myRoom = '', joined = false, lastDateLabel = '';
  let myProfile = {}, profiles = {}, unreadCount = 0, mediaRecorder = null, recordChunks = [];
  let typingTimeout, heartbeatInterval, reminderInterval, countdownInterval;
  let recordStartTime = 0;
  let lastTapTime = 0;
  let feelingsPalette = {}, feelings = {}, myFeelingKey = null;

  const els = {
    login: document.getElementById('login'),
    chat: document.getElementById('chat'),
    messages: document.getElementById('messages'),
    nameInput: document.getElementById('nameInput'),
    nicknameInput: document.getElementById('nicknameInput'),
    roomSelect: document.getElementById('roomSelect'),
    passwordField: document.getElementById('passwordField'),
    passwordInput: document.getElementById('passwordInput'),
    loginError: document.getElementById('loginError'),
    msgInput: document.getElementById('msgInput'),
    sendBtn: document.getElementById('sendBtn'),
    presence: document.getElementById('presence'),
    statusDot: document.getElementById('statusDot'),
    statusText: document.getElementById('statusText'),
    roomLabel: document.getElementById('roomLabel'),
    typing: document.getElementById('typing'),
    motdBanner: document.getElementById('motdBanner'),
    streakBadge: document.getElementById('streakBadge'),
    lastSeenEl: document.getElementById('lastSeenEl'),
    unreadBadge: document.getElementById('unreadBadge'),
    extrasPanel: document.getElementById('extrasPanel'),
    moodInput: document.getElementById('moodInput'),
    jokesInput: document.getElementById('jokesInput'),
    countdownLabel: document.getElementById('countdownLabel'),
    countdownDate: document.getElementById('countdownDate'),
    countdownDisplay: document.getElementById('countdownDisplay'),
    emojiPicker: document.getElementById('emojiPicker'),
    gameMenu: document.getElementById('gameMenu'),
    gifPanel: document.getElementById('gifPanel'),
    gifGrid: document.getElementById('gifGrid'),
    gifSearch: document.getElementById('gifSearch'),
    ambience: document.getElementById('ambience'),
    soundBtn: document.getElementById('soundBtn'),
    photoInput: document.getElementById('photoInput'),
    feelingsPanel: document.getElementById('feelingsPanel'),
    feelingsGrid: document.getElementById('feelingsGrid'),
    theirFeeling: document.getElementById('theirFeeling'),
    feelingGlow: document.getElementById('feelingGlow'),
    pulseOverlay: document.getElementById('pulseOverlay')
  };

  const sounds = {
    send: () => playTone(520, 0.08, 0.05),
    receive: () => playTone(660, 0.1, 0.07),
    hug: () => { playTone(440, 0.06, 0.04); setTimeout(() => playTone(554, 0.08, 0.05), 80); },
    milestone: () => { playTone(523, 0.1, 0.06); setTimeout(() => playTone(659, 0.12, 0.07), 100); }
  };

  function soundEnabled() {
    return localStorage.getItem('bestieSound') !== 'off';
  }

  function playTone(freq, dur, vol) {
    if (!soundEnabled()) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      gain.gain.value = vol;
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.stop(ctx.currentTime + dur);
    } catch (_) { /* ignore */ }
  }

  function playSound(name) {
    if (sounds[name]) sounds[name]();
  }

  function initAmbience() {
    const symbols = ['✨', '💕', '⭐', '🌸', '💫'];
    for (let i = 0; i < 12; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      p.textContent = symbols[i % symbols.length];
      p.style.left = `${Math.random() * 100}%`;
      p.style.animationDuration = `${12 + Math.random() * 18}s`;
      p.style.animationDelay = `${Math.random() * 10}s`;
      els.ambience.appendChild(p);
    }
  }

  function confetti() {
    const colors = ['#ff6fae', '#8b5cf6', '#f59e0b', '#06b6d4', '#84cc16', '#fb7185', '#a78bfa', '#fcd34d'];
    for (let i = 0; i < 40; i++) {
      const piece = document.createElement('div');
      piece.className = 'confetti-piece';
      piece.style.left = `${10 + Math.random() * 80}%`;
      piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
      piece.style.animationDelay = `${Math.random() * 0.4}s`;
      piece.style.animationDuration = `${1.2 + Math.random() * 1.8}s`;
      piece.style.width = `${6 + Math.random() * 6}px`;
      piece.style.height = `${8 + Math.random() * 10}px`;
      els.ambience.appendChild(piece);
      setTimeout(() => piece.remove(), 3500);
    }
  }

  function applyNightGlow() {
    const hour = new Date().getHours();
    document.body.classList.toggle('night-glow', hour >= 22 || hour < 6);
  }

  function applyRoomTheme(room) {
    document.body.classList.remove('theme-daily', 'theme-cute');
    const cls = ROOM_THEMES[room];
    if (cls) document.body.classList.add(cls);
  }

  function getDisplayName(username) {
    const p = profiles[username] || {};
    return p.nickname || username;
  }

  function getProfile(username) {
    return profiles[username] || myProfile;
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function formatDateLabel(ts) {
    const d = new Date(ts);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function formatLastSeen(ts) {
    if (!ts) return '';
    const diff = Date.now() - ts;
    if (diff < 60000) return 'Active just now';
    if (diff < 3600000) return `Active ${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `Active ${Math.floor(diff / 3600000)}h ago`;
    return `Active ${new Date(ts).toLocaleDateString()}`;
  }

  function maybeAddDateDivider(ts) {
    const label = formatDateLabel(ts);
    if (label === lastDateLabel) return;
    lastDateLabel = label;
    const div = document.createElement('div');
    div.className = 'date-divider';
    div.textContent = label;
    els.messages.appendChild(div);
  }

  function scrollBottom() {
    els.messages.scrollTop = els.messages.scrollHeight;
  }

  function renderReactionBar(msgId) {
    return REACTIONS.map((e) =>
      `<button class="reaction-btn" onclick="BestieChat.react('${msgId}','${e}')">${e}</button>`
    ).join('');
  }

  function renderReactions(msg) {
    if (!msg.reactions || !Object.keys(msg.reactions).length) return '';
    return Object.entries(msg.reactions).map(([emoji, users]) => {
      const mine = users.includes(myName);
      return `<span class="reaction-pill${mine ? ' mine' : ''}" onclick="BestieChat.react('${msg.id}','${emoji}')">${emoji} ${users.length}</span>`;
    }).join('');
  }

  function renderMessage(msg, skipSound) {
    maybeAddDateDivider(msg.time);
    const mine = msg.user === myName;
    const profile = getProfile(msg.user);
    const display = getDisplayName(msg.user);
    const time = new Date(msg.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const wrap = document.createElement('div');
    wrap.className = `msg-wrap ${mine ? 'me' : 'them'}`;
    wrap.dataset.id = msg.id;

    let body = '';
    if (msg.type === 'hug') {
      body = `<div class="msg hug ${mine ? 'me' : 'them'}">${profile.avatar || '💌'} ${escapeHtml(display)} ${escapeHtml(msg.text)}</div>`;
    } else if (msg.type === 'image') {
      body = `<div class="msg ${mine ? 'me' : 'them'}">
        <div class="meta"><span class="nick-dot" style="background:${profile.color || '#888'}"></span>${mine ? 'You' : escapeHtml(display)} · ${time}</div>
        ${msg.text ? escapeHtml(msg.text) : ''}
        <img class="chat-img" src="${escapeHtml(msg.url)}" alt="shared image" onclick="window.open(this.src)" />
      </div>`;
    } else if (msg.type === 'voice') {
      const dur = msg.duration ? `${Math.floor(msg.duration / 60)}:${String(msg.duration % 60).padStart(2, '0')}` : '';
      body = `<div class="msg ${mine ? 'me' : 'them'}">
        <div class="meta"><span class="nick-dot" style="background:${profile.color || '#888'}"></span>${mine ? 'You' : escapeHtml(display)} · ${time}</div>
        🎤 Voice note
        <audio controls src="${escapeHtml(msg.url)}"></audio>
        ${dur ? `<div class="voice-duration">${dur}</div>` : ''}
      </div>`;
    } else if (msg.type === 'poll') {
      const opts = (msg.options || []).map((o) => {
        const voted = msg.votes && msg.votes[myName] === o;
        return `<button class="poll-opt${voted ? ' voted' : ''}" data-option="${escapeHtml(o)}">${escapeHtml(o)}</button>`;
      }).join('');
      body = `<div class="msg ${mine ? 'me' : 'them'}">
        <div class="meta">${mine ? 'You' : escapeHtml(display)} · ${time}</div>
        📊 ${escapeHtml(msg.text)}
        <div class="poll-options">${opts}</div>
      </div>`;
    } else {
      body = `<div class="msg ${mine ? 'me' : 'them'}">
        <div class="meta"><span class="nick-dot" style="background:${profile.color || '#888'}"></span>${mine ? 'You' : escapeHtml(display)} · ${time}</div>
        ${escapeHtml(msg.text)}
      </div>`;
    }

    wrap.innerHTML = `
      ${!mine ? `<div class="msg-avatar">${profile.avatar || '✨'}</div>` : ''}
      ${body}
      <div class="react-bar">${renderReactionBar(msg.id)}</div>
      <div class="reactions" id="reactions-${msg.id}">${renderReactions(msg)}</div>
    `;
    wrap.querySelectorAll('.poll-opt').forEach((btn) => {
      btn.addEventListener('click', () => votePoll(msg.id, btn.dataset.option));
    });

    wrap.addEventListener('dblclick', (e) => {
      e.preventDefault();
      if (!mine) react(msg.id, '❤️');
    });

    wrap.addEventListener('touchstart', (e) => {
      if (e.touches.length > 1) return;
      const now = Date.now();
      if (now - lastTapTime < 300) {
        if (!mine) react(msg.id, '❤️');
      }
      lastTapTime = now;
    });

    if ('ontouchstart' in window) {
      wrap.addEventListener('click', (e) => {
        if (e.target.closest('.reaction-pill') || e.target.closest('.reaction-btn') || e.target.closest('.poll-opt')) return;
        wrap.classList.toggle('touched');
        document.querySelectorAll('.msg-wrap.touched').forEach((el) => {
          if (el !== wrap) el.classList.remove('touched');
        });
      });
    }

    els.messages.appendChild(wrap);
    scrollBottom();

    if (!skipSound && !mine && msg.type !== 'poll') playSound('receive');
  }

  function updateReactions(messageId, reactions) {
    const el = document.getElementById(`reactions-${messageId}`);
    if (!el) return;
    el.innerHTML = Object.entries(reactions || {}).map(([emoji, users]) => {
      const mine = users.includes(myName);
      return `<span class="reaction-pill${mine ? ' mine' : ''}" onclick="BestieChat.react('${messageId}','${emoji}')">${emoji} ${users.length}</span>`;
    }).join('');
  }

  function renderSystem(text) {
    const div = document.createElement('div');
    div.className = 'system';
    div.textContent = text;
    els.messages.appendChild(div);
    scrollBottom();
  }

  function renderMilestone(data) {
    const div = document.createElement('div');
    div.className = 'milestone-msg';
    div.textContent = data.text;
    els.messages.appendChild(div);
    scrollBottom();
    playSound('milestone');
    confetti();
  }

  function renderGamePrompt(data) {
    const div = document.createElement('div');
    div.className = 'game-card';
    let inner = `<div class="game-from">${escapeHtml(data.from)} started a game</div><div class="game-q">${escapeHtml(data.question)}</div>`;
    if (data.options) {
      inner += data.options.map((o) => `<div>• ${escapeHtml(o)}</div>`).join('');
    }
    div.innerHTML = inner;
    els.messages.appendChild(div);
    scrollBottom();
  }

  function setConnected(online) {
    els.statusDot.classList.toggle('online', online);
    els.statusText.textContent = online ? 'Connected' : 'Reconnecting...';
    els.msgInput.disabled = !online;
    els.sendBtn.disabled = !online;
    document.body.classList.toggle('reconnecting', !online);
  }

  function updateStreak(streak) {
    if (!streak) return;
    const days = streak.days || 0;
    els.streakBadge.textContent = days > 0 ? `🔥 ${days} day streak` : '🔥 Start a streak!';
  }

  function updateLastSeen(lastSeen) {
    const others = Object.entries(lastSeen || {}).filter(([name]) => name !== myName);
    if (!others.length) {
      els.lastSeenEl.textContent = '';
      return;
    }
    const [name, ts] = others.sort((a, b) => b[1] - a[1])[0];
    els.lastSeenEl.textContent = `${getDisplayName(name)}: ${formatLastSeen(ts)}`;
  }

  function updateUnreadBadge() {
    if (unreadCount > 0 && document.hidden) {
      els.unreadBadge.style.display = 'inline';
      els.unreadBadge.textContent = unreadCount > 99 ? '99+' : unreadCount;
      document.title = `(${unreadCount}) Bestie Chat 💬`;
    } else {
      els.unreadBadge.style.display = 'none';
      document.title = 'Bestie Chat 💬';
    }
  }

  function clearUnread() {
    unreadCount = 0;
    updateUnreadBadge();
  }

  function updateCountdown(countdown) {
    if (!countdown || !countdown.date) {
      els.countdownDisplay.textContent = '';
      return;
    }
    const target = new Date(countdown.date).getTime();
    const diff = target - Date.now();
    if (diff <= 0) {
      els.countdownDisplay.textContent = `${countdown.label || 'It\'s here!'} 🎉`;
      return;
    }
    const days = Math.floor(diff / 86400000);
    const hrs = Math.floor((diff % 86400000) / 3600000);
    els.countdownDisplay.textContent = `${countdown.label || 'Countdown'}: ${days}d ${hrs}h`;
  }

  function startIntervals() {
    clearInterval(heartbeatInterval);
    clearInterval(reminderInterval);
    clearInterval(countdownInterval);

    heartbeatInterval = setInterval(() => socket.emit('heartbeat'), 30000);
    applyNightGlow();
    setInterval(applyNightGlow, 60000);

    reminderInterval = setInterval(() => {
      if (!joined) return;
      const hour = new Date().getHours();
      if (hour !== REMINDER_HOUR) return;
      const key = `reminder-${new Date().toISOString().slice(0, 10)}`;
      if (localStorage.getItem(key)) return;
      const lastMsg = localStorage.getItem('bestieLastMsgDate');
      const today = new Date().toISOString().slice(0, 10);
      if (lastMsg === today) return;
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Bestie check-in 👀', {
          body: 'You haven\'t chatted with your bestie today!',
          icon: '/icon-192.png'
        });
        localStorage.setItem(key, '1');
      }
    }, 3600000);

    countdownInterval = setInterval(() => {
      const label = els.countdownLabel.value;
      const date = els.countdownDate.value;
      if (date) updateCountdown({ label, date });
    }, 60000);
  }

  async function uploadFile(base64, mime, kind) {
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: base64, mime, kind })
    });
    if (!res.ok) throw new Error('Upload failed');
    return res.json();
  }

  function joinChat() {
    const name = els.nameInput.value.trim();
    const room = els.roomSelect.value.trim();
    const nickname = els.nicknameInput.value.trim();
    if (!name) {
      els.loginError.textContent = 'Enter your name first';
      return;
    }
    els.loginError.textContent = '';
    if (!socket) {
      els.loginError.textContent = 'Not connected to server — is the server running?';
      return;
    }
    myName = name;
    myRoom = room;
    localStorage.setItem('bestieChatName', name);
    localStorage.setItem('bestieChatRoom', room);
    if (nickname) localStorage.setItem('bestieChatNickname', nickname);
    applyRoomTheme(room);
    socket.emit('join', { name, room, nickname, password: els.passwordInput.value });
  }

  function leaveChat() {
    joined = false;
    lastDateLabel = '';
    clearInterval(heartbeatInterval);
    clearInterval(reminderInterval);
    clearInterval(countdownInterval);
    if (socket) {
      socket.disconnect();
      socket.connect();
    }
    els.messages.innerHTML = '';
    els.typing.innerHTML = '';
    els.chat.style.display = 'none';
    els.login.style.display = 'block';
    els.loginError.textContent = '';
    els.extrasPanel.classList.remove('open');
    els.feelingsPanel.classList.remove('open');
    els.feelingGlow.classList.remove('active');
    feelings = {};
    myFeelingKey = null;
    clearUnread();
  }

  function sendMessage() {
    const text = els.msgInput.value;
    if (!text.trim() || !joined) return;
    socket.emit('message', text);
    els.msgInput.value = '';
    playSound('send');
    localStorage.setItem('bestieLastMsgDate', new Date().toISOString().slice(0, 10));
  }

  function sendHug() {
    if (!joined) return;
    socket.emit('message', { type: 'hug' });
    playSound('hug');
    confetti();
    localStorage.setItem('bestieLastMsgDate', new Date().toISOString().slice(0, 10));
  }

  async function sendPhoto(file) {
    if (!file || !joined) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const { url } = await uploadFile(reader.result, file.type, 'image');
        socket.emit('message', { type: 'image', url });
        playSound('send');
      } catch {
        renderSystem('Could not upload photo — try a smaller image');
      }
    };
    reader.readAsDataURL(file);
  }

  async function toggleRecord() {
    const btn = document.getElementById('recordBtn');
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      btn.classList.remove('recording');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordChunks = [];
      mediaRecorder = new MediaRecorder(stream);
      recordStartTime = Date.now();
      mediaRecorder.ondataavailable = (e) => recordChunks.push(e.data);
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const duration = Math.round((Date.now() - recordStartTime) / 1000);
        const blob = new Blob(recordChunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const { url } = await uploadFile(reader.result, 'audio/webm', 'voice');
            socket.emit('message', { type: 'voice', url, duration });
            playSound('send');
          } catch {
            renderSystem('Could not send voice note');
          }
        };
        reader.readAsDataURL(blob);
      };
      mediaRecorder.start();
      btn.classList.add('recording');
      setTimeout(() => {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
          btn.classList.remove('recording');
        }
      }, 15000);
    } catch {
      renderSystem('Microphone access needed for voice notes');
    }
  }

  function react(messageId, emoji) {
    if (!joined) return;
    const el = document.getElementById(`reactions-${messageId}`);
    const pill = el && [...el.querySelectorAll('.reaction-pill')].find((p) => p.textContent.startsWith(emoji));
    const already = pill && pill.classList.contains('mine');
    socket.emit('react', { messageId, emoji, add: !already });
  }

  function votePoll(messageId, option) {
    socket.emit('poll-vote', { messageId, option });
  }

  function toggleEmojiPicker() {
    els.emojiPicker.classList.toggle('open');
    els.gameMenu.classList.remove('open');
  }

  function toggleGameMenu() {
    els.gameMenu.classList.toggle('open');
    els.emojiPicker.classList.remove('open');
  }

  function insertEmoji(emoji) {
    els.msgInput.value += emoji;
    els.msgInput.focus();
  }

  function startGame(type) {
    socket.emit('start-game', type);
    els.gameMenu.classList.remove('open');
  }

  function toggleGifPanel() {
    const isOpen = els.gifPanel.classList.toggle('open');
    if (isOpen) {
      els.emojiPicker.classList.remove('open');
      els.gameMenu.classList.remove('open');
      if (!els.gifGrid.children.length) renderGifGrid(STICKERS);
    }
  }

  function renderGifGrid(stickers) {
    els.gifGrid.innerHTML = stickers.map((s) =>
      `<img src="${escapeHtml(s.url)}" loading="lazy" onclick="BestieChat.sendSticker('${escapeHtml(s.url)}')" />`
    ).join('');
  }

  function searchGifs() {
    const q = els.gifSearch.value.trim().toLowerCase();
    if (!q) {
      renderGifGrid(STICKERS);
      return;
    }
    const filtered = STICKERS.filter((s) => s.tags.some((t) => t.includes(q)));
    renderGifGrid(filtered.length ? filtered : STICKERS);
  }

  function sendSticker(url) {
    if (!joined) return;
    socket.emit('message', { type: 'image', url, text: '' });
    playSound('send');
    els.gifPanel.classList.remove('open');
  }

  function toggleExtras() {
    els.extrasPanel.classList.toggle('open');
  }

  function toggleFeelings() {
    els.feelingsPanel.classList.toggle('open');
  }

  function buildFeelingsGrid() {
    els.feelingsGrid.innerHTML = Object.entries(feelingsPalette).map(([key, f]) => `
      <button type="button" class="feeling-btn${key === myFeelingKey ? ' mine' : ''}" data-feeling="${key}" onclick="BestieChat.setFeeling('${key}')">
        <span class="fe-emoji">${f.emoji}</span>${escapeHtml(f.label)}
      </button>
    `).join('');
  }

  function setFeeling(key) {
    if (!joined) return;
    myFeelingKey = key;
    socket.emit('set-feeling', key);
    buildFeelingsGrid();
  }

  // Renders your bestie's current feeling as a badge, and tints the whole
  // screen with a soft glow in that feeling's color — the "feel what they feel" effect.
  function renderTheirFeeling() {
    const others = Object.keys(feelings).filter((name) => name !== myName);
    if (!others.length) {
      els.theirFeeling.innerHTML = '';
      els.feelingGlow.classList.remove('active');
      return;
    }
    // Most recently-updated other feeling wins if there happen to be several
    const [name, f] = others
      .map((n) => [n, feelings[n]])
      .sort((a, b) => b[1].updatedAt - a[1].updatedAt)[0];
    const info = feelingsPalette[f.key];
    if (!info) return;
    els.theirFeeling.innerHTML = `<span class="feeling-pill">${info.emoji} ${escapeHtml(getDisplayName(name))} is feeling ${escapeHtml(info.label.toLowerCase())}</span>`;
    els.feelingGlow.style.setProperty('--feeling-color', info.color);
    els.feelingGlow.classList.add('active');
  }

  function sendPulse() {
    if (!joined) return;
    socket.emit('empathy-pulse');
    playPulseAnimation('You');
  }

  function playPulseAnimation(fromLabel) {
    els.pulseOverlay.innerHTML = '';
    for (let i = 0; i < 3; i++) {
      const ring = document.createElement('div');
      ring.className = 'pulse-ring';
      ring.style.animationDelay = `${i * 0.25}s`;
      els.pulseOverlay.appendChild(ring);
    }
    const label = document.createElement('div');
    label.className = 'pulse-label';
    label.textContent = fromLabel === 'You' ? '💓 Pulse sent' : `💓 ${fromLabel} is thinking of you`;
    els.pulseOverlay.appendChild(label);
    playSound('hug');
    setTimeout(() => { els.pulseOverlay.innerHTML = ''; }, 2500);
  }

  function toggleSound() {
    const on = localStorage.getItem('bestieSound') !== 'off';
    localStorage.setItem('bestieSound', on ? 'off' : 'on');
    els.soundBtn.classList.toggle('active', !on);
    els.soundBtn.textContent = on ? '🔇' : '🔊';
  }

  function saveMood() {
    socket.emit('update-mood', els.moodInput.value);
  }

  function saveJokes() {
    const lines = els.jokesInput.value.split('\n').filter(Boolean);
    socket.emit('update-jokes', lines);
  }

  function saveCountdown() {
    socket.emit('update-countdown', {
      label: els.countdownLabel.value,
      date: els.countdownDate.value || null
    });
    updateCountdown({ label: els.countdownLabel.value, date: els.countdownDate.value });
  }

  function saveNickname() {
    const nick = els.nicknameInput.value.trim();
    if (nick) localStorage.setItem('bestieChatNickname', nick);
    if (nick && joined) socket.emit('update-nickname', nick);
  }

  function buildEmojiPicker() {
    els.emojiPicker.innerHTML = EMOJIS.map((e) =>
      `<button type="button" onclick="BestieChat.insertEmoji('${e}')">${e}</button>`
    ).join('');
  }

  function initSocket() {
    if (typeof io === 'undefined') {
      console.error('Socket.io library not loaded. Is the server running?');
      setConnected(false);
      els.loginError.textContent = 'Cannot connect to server. Is the server running?';
      return;
    }
    socket = io({ reconnection: true, reconnectionAttempts: Infinity });

    socket.on('connect', () => {
      setConnected(true);
      if (joined) {
        socket.emit('join', {
          name: myName,
          room: myRoom,
          nickname: els.nicknameInput.value.trim(),
          password: els.passwordInput.value
        });
      }
    });

    socket.on('disconnect', () => setConnected(false));

    socket.on('join-error', (msg) => {
      els.loginError.textContent = msg;
      joined = false;
      els.chat.style.display = 'none';
      els.login.style.display = 'block';
    });

    socket.on('joined', (payload) => {
      joined = true;
      myProfile = payload.profile || {};
      els.login.style.display = 'none';
      els.chat.style.display = 'flex';
      els.roomLabel.textContent = ROOM_LABELS[myRoom] || myRoom;
      els.motdBanner.textContent = `✨ Message of the day: ${payload.motd}`;
      els.moodInput.value = payload.mood || '';
      els.jokesInput.value = (payload.jokes || []).join('\n');
      if (payload.countdown) {
        els.countdownLabel.value = payload.countdown.label || '';
        els.countdownDate.value = payload.countdown.date ? payload.countdown.date.slice(0, 16) : '';
        updateCountdown(payload.countdown);
      }
      updateStreak(payload.streak);
      updateLastSeen(payload.lastSeen);

      feelingsPalette = payload.feelingsPalette || {};
      feelings = payload.feelings || {};
      myFeelingKey = feelings[myName] ? feelings[myName].key : null;
      buildFeelingsGrid();
      renderTheirFeeling();

      (payload.history || []).forEach((m) => {
        if (m.user) profiles[m.user] = profiles[m.user] || {};
      });

      els.messages.innerHTML = '';
      lastDateLabel = '';
      (payload.history || []).forEach((m) => renderMessage(m, true));
      els.msgInput.focus();
      startIntervals();
      clearUnread();
      setTimeout(confetti, 300);
    });

    socket.on('message', (msg) => {
      renderMessage(msg);
      if (msg.user !== myName) {
        if (document.hidden) {
          unreadCount++;
          updateUnreadBadge();
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(getDisplayName(msg.user), {
              body: msg.type === 'hug' ? 'sent you a hug 💌' : (msg.text || 'New message'),
              icon: '/icon-192.png'
            });
          }
        }
      } else {
        localStorage.setItem('bestieLastMsgDate', new Date().toISOString().slice(0, 10));
      }
    });

    socket.on('system', renderSystem);
    socket.on('milestone', renderMilestone);
    socket.on('game-prompt', renderGamePrompt);
    socket.on('reaction-update', ({ messageId, reactions }) => updateReactions(messageId, reactions));
    socket.on('poll-update', ({ messageId, votes }) => {
      const wrap = els.messages.querySelector(`[data-id="${messageId}"]`);
      if (!wrap) return;
      wrap.querySelectorAll('.poll-opt').forEach((btn) => {
        btn.classList.toggle('voted', votes[myName] === btn.dataset.option);
      });
    });

    socket.on('streak-update', (streak) => {
      updateStreak(streak);
      confetti();
    });

    socket.on('presence', ({ users, profiles: profs, lastSeen }) => {
      (profs || []).forEach((p) => { profiles[p.name] = p; });
      const others = users.filter((u) => u !== myName);
      if (others.length) {
        els.presence.innerHTML = others.map((u) => {
          const p = profiles[u] || {};
          const avatar = p.avatar || '✨';
          const display = getDisplayName(u);
          return `<span class="presence-user"><span class="presence-avatar">${avatar}</span>${escapeHtml(display)}</span>`;
        }).join('<span style="margin:0 4px;opacity:0.4">·</span>');
      } else {
        els.presence.textContent = 'Just you — waiting for your bestie';
      }
      updateLastSeen(lastSeen);
    });

    socket.on('typing', (name) => {
      if (name === getDisplayName(myName) || name === myName) return;
      els.typing.innerHTML = `<span class="typing-dots"><span></span><span></span><span></span></span> ${escapeHtml(name)} is scribbling…`;
      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => { els.typing.innerHTML = ''; }, 1800);
    });

    socket.on('feelings-update', (updated) => {
      feelings = updated || {};
      myFeelingKey = feelings[myName] ? feelings[myName].key : myFeelingKey;
      buildFeelingsGrid();
      renderTheirFeeling();
    });

    socket.on('empathy-pulse', (data) => {
      if (data.from === getDisplayName(myName) || data.from === myName) return;
      playPulseAnimation(data.from);
      if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
        new Notification(`${data.from} 💓`, { body: 'sent you an empathy pulse', icon: '/icon-192.png' });
      }
    });

    socket.on('mood-update', (mood) => { els.moodInput.value = mood; });
    socket.on('jokes-update', (jokes) => { els.jokesInput.value = (jokes || []).join('\n'); });
    socket.on('countdown-update', (cd) => {
      els.countdownLabel.value = cd.label || '';
      els.countdownDate.value = cd.date ? cd.date.slice(0, 16) : '';
      updateCountdown(cd);
    });
  }

  function init() {
    initAmbience();
    applyNightGlow();
    buildEmojiPicker();

    const savedName = localStorage.getItem('bestieChatName') || '';
    const savedRoom = localStorage.getItem('bestieChatRoom') || 'just-us';
    const savedNick = localStorage.getItem('bestieChatNickname') || '';
    if (savedName) els.nameInput.value = savedName;
    if (savedRoom) els.roomSelect.value = savedRoom;
    if (savedNick) els.nicknameInput.value = savedNick;

    els.soundBtn.classList.toggle('active', soundEnabled());
    els.soundBtn.textContent = soundEnabled() ? '🔊' : '🔇';

    fetch('/api/config')
      .then((r) => r.json())
      .then((cfg) => { if (cfg.passwordRequired) els.passwordField.style.display = 'block'; })
      .catch(() => {});

    els.nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinChat(); });
    els.passwordInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinChat(); });
    els.msgInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMessage(); });
    els.msgInput.addEventListener('input', () => { if (joined) socket.emit('typing'); });
    els.moodInput.addEventListener('change', saveMood);
    els.moodInput.addEventListener('focus', () => {
      if (!els.moodInput.value) {
        const suggestion = VIBE_SUGGESTIONS[Math.floor(Math.random() * VIBE_SUGGESTIONS.length)];
        els.moodInput.dataset.original = els.moodInput.placeholder;
        els.moodInput.placeholder = `Try: ${suggestion}`;
      }
    });
    els.moodInput.addEventListener('blur', () => {
      if (els.moodInput.dataset.original) {
        els.moodInput.placeholder = els.moodInput.dataset.original;
        delete els.moodInput.dataset.original;
      }
    });
    els.jokesInput.addEventListener('blur', saveJokes);
    els.countdownLabel.addEventListener('change', saveCountdown);
    els.countdownDate.addEventListener('change', saveCountdown);
    els.nicknameInput.addEventListener('input', saveNickname);
    els.photoInput.addEventListener('change', (e) => {
      if (e.target.files[0]) sendPhoto(e.target.files[0]);
      e.target.value = '';
    });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) clearUnread();
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('#emojiPicker') && !e.target.closest('[data-emoji-toggle]')) {
        els.emojiPicker.classList.remove('open');
      }
      if (!e.target.closest('#gameMenu') && !e.target.closest('[data-game-toggle]')) {
        els.gameMenu.classList.remove('open');
      }
      if (!e.target.closest('#gifPanel') && !e.target.closest('[title="Stickers"]')) {
        els.gifPanel.classList.remove('open');
      }
      if (!e.target.closest('#feelingsPanel') && !e.target.closest('[title="How are you feeling?"]')) {
        els.feelingsPanel.classList.remove('open');
      }
      if (!e.target.closest('.msg-wrap')) {
        document.querySelectorAll('.msg-wrap.touched').forEach((el) => el.classList.remove('touched'));
      }
    });

    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    initSocket();

    if (savedName) joinChat();
  }

  window.BestieChat = {
    joinChat, leaveChat, sendMessage, sendHug, toggleRecord, react, votePoll,
    toggleEmojiPicker, toggleGameMenu, insertEmoji, startGame, toggleExtras,
    toggleSound, saveMood, saveJokes, saveCountdown, saveNickname,
    toggleGifPanel, searchGifs, sendSticker,
    toggleFeelings, setFeeling, sendPulse
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
