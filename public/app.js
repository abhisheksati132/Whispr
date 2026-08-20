/* global io */
(() => {
  // ═══════════════════ CONSTANTS ═══════════════════
  const ROOM_LABELS  = { 'just-us': 'Just Us 💜', daily: 'Daily Check-In ☀️', cute: 'Sweet Notes 💕' };
  const ROOM_THEMES  = { 'just-us': '', daily: 'theme-daily', cute: 'theme-cute' };
  const REACTIONS    = ['❤️', '😂', '🥺', '🔥', '👀', '✨'];
  const EMOJIS       = '😀😃😄😁😆🥹😂🤣🥲☺️😊😇🙂🙃😉😌😍🥰😘😗😙😚😋😛😝😜🤪🤨🧐🤓😎🥸🤩🥳😏😒😞😔😟😕🙁☹️😣😖😫😩🥺😢😭😤😠😡🤬🤯😳🥵🥶😱😨😰😥😓🤗🤔🫣🤭🫢🫡🤫🫠🤥😶😐😑😬🙄😯😦😧😮😲🥱😴🤤😪😵🤐🥴🤢🤮🤧😷🤒🤕🤑🤠😈👿👹👺🤡💩👻💀☠️👽👾🤖🎃😺😸😹😻😼😽🙀😿😾👋🤚🖐️✋🖖👌🤌🤌🤏✌️🤞🫰🤟🤘🤙👈👉👆🖕👇☝️👍👎✊👊🤛🤜👏🙌🫶👐🤲🤝🙏✍️💅🤳💪🦾🧠🗣️👤👥🫂❤️🧡💛💚💙💜🖤🤍🤎💔❣️💕💞💓💗💖💘💝❤️‍🔥❤️‍🩹✨🌟⭐💫💥🔥⚡🌈☀️🌙☁️🍕🌮🍔🍟🍦🍩🍰☕️🍺🍷🎉🎊🎁🎈🎈🎵🎤📸💭💬🦋🐱🐶🐰🐼🦊💖🌸🌺🌻'.match(/./gu) || [];
  const STICKERS     = [
    { tags: ['cute','love'],    url: 'https://media.giphy.com/media/26BRv0ThflsHCqDrG/giphy.gif' },
    { tags: ['happy','love'],   url: 'https://media.giphy.com/media/l0HlBO7eyXz4S3H4Y/giphy.gif' },
    { tags: ['hug','love'],     url: 'https://media.giphy.com/media/lrr9rH7bbQusE/giphy.gif' },
    { tags: ['cute','happy'],   url: 'https://media.giphy.com/media/3o7TKsQ8X3x8F2V2lC/giphy.gif' },
    { tags: ['love','sparkle'], url: 'https://media.giphy.com/media/26tn33aiTi1jkl6H6/giphy.gif' },
    { tags: ['cat','cute'],     url: 'https://media.giphy.com/media/jd7vPTz4h9k4/giphy.gif' },
    { tags: ['happy','dance'],  url: 'https://media.giphy.com/media/3o85xnoIXebk3xYx4Q/giphy.gif' },
    { tags: ['love','heart'],   url: 'https://media.giphy.com/media/l0NwHXQy3kUSfFF60/giphy.gif' },
    { tags: ['sparkle','magic'],url: 'https://media.giphy.com/media/xT0xeJpnrWC4XWblEk/giphy.gif' },
    { tags: ['kiss','love'],    url: 'https://media.giphy.com/media/l41K3tzVl3y5K/giphy.gif' },
    { tags: ['bye','wave'],     url: 'https://media.giphy.com/media/3o7TKSjRrfIPjeiVyM/giphy.gif' },
    { tags: ['meme','funny'],   url: 'https://media.giphy.com/media/26n6WywOy1rOmJSmQ/giphy.gif' },
    { tags: ['sad','cat'],      url: 'https://media.giphy.com/media/dzaUX7CAG0Ihi/giphy.gif' },
    { tags: ['angry','cat'],    url: 'https://media.giphy.com/media/mlvseq9yvZhba/giphy.gif' },
    { tags: ['dance','funny'],  url: 'https://media.giphy.com/media/vFKqnCdLPNOKc/giphy.gif' },
    { tags: ['dog','funny'],    url: 'https://media.giphy.com/media/13Hgw8T855x5a8/giphy.gif' },
    { tags: ['cat','vibe'],     url: 'https://media.giphy.com/media/Bcfb1FhZ1xY1/giphy.gif' },
    { tags: ['heart','love'],   url: 'https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif' },
    { tags: ['cheers','party'], url: 'https://media.giphy.com/media/g9582DNuQppxC/giphy.gif' },
    { tags: ['surprised','cat'],url: 'https://media.giphy.com/media/Cmr1OMJ2FN0B2/giphy.gif' }
  ];
  const VIBE_SUGGESTIONS = [
    'tired but happy 😴✨', 'need coffee ☕️', 'missing you 💭',
    'feeling grateful 🙏', 'daydreaming about us 🌈',
    'current mood: chaotic 🎭', 'sending good vibes ✨', "can't stop smiling 😊"
  ];
  const REMINDER_HOUR = 20;
  const MUSIC_DOMAINS = /^https?:\/\/(open\.spotify\.com|music\.apple\.com|soundcloud\.com|www\.youtube\.com|youtu\.be|spotify\.link)/i;

  // ═══════════════════ STATE ═══════════════════
  let myName = localStorage.getItem('bestieChatName') || '';
  let myRoom = localStorage.getItem('bestieChatRoom') || 'our-private-space';
  let authToken = localStorage.getItem('bestieChatToken') || '';
  let joined = Boolean(myName && authToken);
  let socket, lastDateLabel = '';
  let myProfile = {}, profiles = {}, unreadCount = 0;
  let authMode = 'login'; // 'login' | 'register'
  let offlineDB = null; // IndexedDB for offline message queue
  let mediaRecorder = null, recordChunks = [], recordStartTime = 0;
  let typingTimeout, heartbeatInterval, reminderInterval, countdownInterval;
  let lastTapTime = 0;
  let feelingsPalette = {}, feelings = {}, myFeelingKey = null;

  // Feature state
  let replyingTo      = null;   // { id, user, text, type }
  let editingMessageId= null;
  let secretMode      = false;
  let giphyApiKey     = '';
  let pinnedMsg       = null;
  let readBy          = {};
  let allImageMessages= [];     // { id, url, user, time }
  let searchActive    = false;
  let contextTarget   = null;
  let longPressTimer  = null;
  let currentStreakDays = 0;

  // E2EE state
  let e2eEnabled = localStorage.getItem('bestieChatE2EEActive') === 'true';
  let e2eKey = localStorage.getItem('bestieChatE2EEKey') || '';

  // Doodle state
  let doodleCtx      = null;
  let doodleDrawing  = false;
  let doodleColor    = '#ff6fae';
  let doodleTool     = 'brush';
  let doodleSize     = 6;
  let doodleLastX    = 0;
  let doodleLastY    = 0;

  // ═══════════════════ DYNAMIC ELEMENT CACHE ═══════════════════
  const elsCache = {};
  const els = new Proxy({}, {
    get(_target, prop) {
      if (typeof prop !== 'string') return undefined;
      if (!elsCache[prop] || !elsCache[prop].isConnected) {
        elsCache[prop] = document.getElementById(prop);
      }
      return elsCache[prop];
    }
  });

  // State caches
  let allMessagesCached = [];
  let sharedDiary = [];
  let sharedBucketList = [];
  let sharedCalendar = [];
  let sharedGlossary = [];
  let sharedBonsai = { growth: 0, lastWatered: null };

  // ═══════════════════ OFFLINE OUTBOX & UTILS ═══════════════════
  let outboxQueue = [];

  function loadOutboxQueue() {
    try {
      const raw = localStorage.getItem('bestieOutboxQueue');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) outboxQueue = parsed;
        else outboxQueue = [];
      }
    } catch (e) {
      outboxQueue = [];
    }
  }
  function saveOutboxQueue() {
    try {
      localStorage.setItem('bestieOutboxQueue', JSON.stringify(outboxQueue));
    } catch (e) {}
  }
  function flushOutboxQueue() {
    if (!socket || !socket.connected) return;
    loadOutboxQueue();
    if (!outboxQueue || !outboxQueue.length) return;
    const queue = [...outboxQueue];
    queue.forEach(item => {
      if (item) socket.emit('message', item);
    });
  }

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  async function compressImage(file, maxWidth = 1280, maxHeight = 1280, quality = 0.8) {
    return new Promise((resolve) => {
      if (file.type === 'image/gif' || file.type === 'image/svg+xml') {
        const reader = new FileReader();
        reader.onload = () => resolve({ dataUrl: reader.result, mime: file.type });
        reader.readAsDataURL(file);
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
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
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve({ dataUrl, mime: 'image/jpeg' });
        };
        img.onerror = () => {
          resolve({ dataUrl: e.target.result, mime: file.type || 'image/jpeg' });
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // WebRTC State variables
  let webrtcConn = null;
  let localStreamStream = null;
  let webrtcCallOffer = null;
  let audioMuted = false;
  let cameraOff = false;
  let callType = null;

  const rtcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  };

  // ═══════════════════ SOUND ═══════════════════
  let currentSoundPack = localStorage.getItem('bestieChatSoundPack') || 'cozy';
  const soundPacks = {
    cozy: {
      send:      () => playTone(520, 0.08, 0.05),
      receive:   () => playTone(660, 0.10, 0.07),
      hug:       () => { playTone(440, 0.06, 0.04); setTimeout(() => playTone(554, 0.08, 0.05), 80); },
      milestone: () => { playTone(523, 0.10, 0.06); setTimeout(() => playTone(659, 0.12, 0.07), 100); }
    },
    arcade: {
      send:      () => { playTone(200, 0.05, 0.04); setTimeout(() => playTone(400, 0.05, 0.04), 50); setTimeout(() => playTone(600, 0.05, 0.04), 100); },
      receive:   () => { playTone(600, 0.05, 0.04); setTimeout(() => playTone(400, 0.05, 0.04), 50); setTimeout(() => playTone(200, 0.05, 0.04), 100); },
      hug:       () => { playTone(300, 0.04, 0.03); setTimeout(() => playTone(500, 0.04, 0.03), 40); },
      milestone: () => { playTone(150, 0.05, 0.04); setTimeout(() => playTone(300, 0.05, 0.04), 50); setTimeout(() => playTone(600, 0.15, 0.06), 100); }
    },
    minimal: {
      send:      () => playTone(900, 0.02, 0.03),
      receive:   () => playTone(750, 0.02, 0.03),
      hug:       () => playTone(800, 0.02, 0.03),
      milestone: () => { playTone(800, 0.02, 0.03); setTimeout(() => playTone(1000, 0.03, 0.03), 30); }
    }
  };
  let _sharedAudioCtx = null;
  function getAudioContext() {
    if (!_sharedAudioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) _sharedAudioCtx = new AudioContextClass();
    }
    if (_sharedAudioCtx && _sharedAudioCtx.state === 'suspended') {
      _sharedAudioCtx.resume().catch(() => {});
    }
    return _sharedAudioCtx;
  }
  function soundEnabled() { return localStorage.getItem('bestieSound') !== 'off' && currentSoundPack !== 'off'; }
  function playTone(freq, dur, vol) {
    if (!soundEnabled()) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = freq; gain.gain.value = vol;
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.stop(ctx.currentTime + dur);
    } catch (_) { /* ignore */ }
  }
  function playSound(name) {
    if (!soundEnabled()) return;
    const pack = soundPacks[currentSoundPack] || soundPacks.cozy;
    if (pack[name]) pack[name]();
  }

  // ═══════════════════ AMBIENT ═══════════════════
  function initAmbience() {
    // Keep clean, elegant workspace background without emoji clutter
  }

  function confetti() {
    if (!els.ambience) return;
    const colors = ['#ff6fae','#8b5cf6','#f59e0b','#06b6d4','#84cc16','#fb7185','#a78bfa','#fcd34d','#38bdf8','#ec4899'];
    for (let i = 0; i < 45; i++) {
      const piece = document.createElement('div');
      piece.className = 'confetti-piece';
      piece.style.left = `${5 + Math.random() * 90}%`;
      piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
      piece.style.animationDelay = `${Math.random() * 0.3}s`;
      piece.style.animationDuration = `${1.6 + Math.random() * 1.4}s`;
      piece.style.width = `${6 + Math.random() * 6}px`;
      piece.style.height = `${10 + Math.random() * 10}px`;
      const drift = (Math.random() - 0.5) * 120;
      piece.style.setProperty('--drift', `${drift}px`);
      els.ambience.appendChild(piece);
      setTimeout(() => piece.remove(), 3200);
    }
  }

  function applyNightGlow() {
    const h = new Date().getHours();
    document.body.classList.toggle('night-glow', h >= 22 || h < 6);
  }

  function applyRoomTheme(room) {
    document.body.classList.remove('theme-daily', 'theme-cute');
    const cls = ROOM_THEMES[room];
    if (cls) document.body.classList.add(cls);
  }

  // ═══════════════════ HELPERS ═══════════════════
  function getDisplayName(username) {
    const p = profiles[username] || {};
    return p.nickname || username;
  }
  function getProfile(username) { return profiles[username] || myProfile; }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function formatDateLabel(ts) {
    const d = new Date(ts), today = new Date(), yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === today.toDateString())     return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function formatLastSeen(ts) {
    if (!ts) return '';
    const diff = Date.now() - ts;
    if (diff < 60000)   return 'Active just now';
    if (diff < 3600000) return `Active ${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000)return `Active ${Math.floor(diff / 3600000)}h ago`;
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

  function triggerHaptic(ms = 10) {
    if ('vibrate' in navigator) {
      try { navigator.vibrate(ms); } catch (_) {}
    }
  }

  let _scrollRaf = null;
  function scrollBottom(smooth = false) {
    if (_scrollRaf) cancelAnimationFrame(_scrollRaf);
    _scrollRaf = requestAnimationFrame(() => {
      if (!els.messages) return;
      if (smooth) {
        els.messages.scrollTo({ top: els.messages.scrollHeight, behavior: 'smooth' });
      } else {
        els.messages.scrollTop = els.messages.scrollHeight;
      }
    });
  }

  function isMusicUrl(text) { return MUSIC_DOMAINS.test((text || '').trim()); }

  function getMusicPlatform(url) {
    if (/spotify/i.test(url))   return { name: 'Spotify',      icon: '🎵', color: '#1db954' };
    if (/youtube|youtu\.be/i.test(url)) return { name: 'YouTube', icon: '▶️', color: '#ff0000' };
    if (/soundcloud/i.test(url))return { name: 'SoundCloud',   icon: '🔊', color: '#ff5500' };
    if (/apple/i.test(url))     return { name: 'Apple Music',  icon: '🎵', color: '#fa57c1' };
    return { name: 'Music', icon: '🎵', color: '#8b5cf6' };
  }

  // ═══════════════════ RENDER HELPERS ═══════════════════
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

  // ── OpenGraph Link Preview Fetcher ──
  const previewedLinks = new Set();
  function fetchAndRenderLinkPreview(messageId, text) {
    if (!text || previewedLinks.has(messageId)) return;
    const urlMatch = text.match(/https?:\/\/[^\s<>'"]+/i);
    if (!urlMatch) return;
    const url = urlMatch[0];
    previewedLinks.add(messageId);
    
    fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
      .then(r => r.json())
      .then(data => {
        if (!data || !data.title || data.error) return;
        const wrap = document.querySelector(`.msg-wrap[data-id="${messageId}"]`);
        if (!wrap) return;
        if (wrap.querySelector('.link-preview-card')) return;

        const card = document.createElement('a');
        card.className = 'link-preview-card';
        card.href = data.url;
        card.target = '_blank';
        card.rel = 'noopener noreferrer';

        card.innerHTML = `
          ${data.image ? `<div class="link-preview-img-wrap"><img src="${escapeHtml(data.image)}" alt="preview" loading="lazy" decoding="async" /></div>` : ''}
          <div class="link-preview-info">
            <div class="link-preview-site">
              ${data.favicon ? `<img src="${escapeHtml(data.favicon)}" class="link-preview-fav" alt="" loading="lazy" decoding="async" />` : ''}
              <span>${escapeHtml(data.siteName || '')}</span>
            </div>
            <div class="link-preview-title">${escapeHtml(data.title)}</div>
            ${data.description ? `<div class="link-preview-desc">${escapeHtml(data.description)}</div>` : ''}
          </div>
        `;

        const msgBody = wrap.querySelector('.msg');
        if (msgBody) {
          msgBody.appendChild(card);
          scrollBottom();
        }
      })
      .catch(() => {});
  }

  // ── Viewport IntersectionObserver for Read Receipts ──
  let pendingReadIds = new Set();
  let readDebounceTimer = null;
  const msgObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const id = entry.target.dataset.id;
        if (id && entry.target.classList.contains('them')) {
          pendingReadIds.add(id);
          msgObserver.unobserve(entry.target);
        }
      }
    });
    if (pendingReadIds.size > 0) {
      clearTimeout(readDebounceTimer);
      readDebounceTimer = setTimeout(() => {
        if (socket && socket.connected && pendingReadIds.size > 0) {
          const ids = Array.from(pendingReadIds);
          pendingReadIds.clear();
          socket.emit('mark-read', { messageIds: ids });
        }
      }, 300);
    }
  }, { threshold: 0.5 });

  function renderMessage(msg, skipSound) {
    if (!msg || !msg.id) return;
    maybeAddDateDivider(msg.time || Date.now());

    const mine    = msg.user === myName;
    const profile = getProfile(msg.user);
    const display = getDisplayName(msg.user);
    const time    = new Date(msg.time || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const wrap = document.createElement('div');
    wrap.className  = `msg-wrap ${mine ? 'me' : 'them'}${msg.isPending ? ' is-pending' : ''}`;
    wrap.dataset.id = msg.id;

    // Reply quote snippet
    const replyQuote = msg.replyTo
      ? `<div class="reply-quote" onclick="BestieChat.scrollToMessage('${msg.replyTo.id}')">
           <span class="reply-author">${escapeHtml(msg.replyTo.user)}</span>
           ${escapeHtml((msg.replyTo.text || '').slice(0, 60))}${(msg.replyTo.text || '').length > 60 ? '…' : ''}
         </div>`
      : '';

    const editedTag = msg.editedAt ? `<div class="edited-tag">edited</div>` : '';
    const isRead = msg.readByUsers && msg.readByUsers.length > 0 && !msg.readByUsers.every(u => u === myName);
    const isDelivered = msg.deliveredTo && msg.deliveredTo.length > 0 && !msg.deliveredTo.every(u => u === myName);
    const tickState = isRead ? 'read' : (isDelivered ? 'delivered' : 'sent');
    const tickSvg = isRead
      ? `<svg viewBox="0 0 16 15" width="14" height="13" fill="none"><path d="M15.01 3.316l-7.92 8.56a.91.91 0 01-.67.3.91.91 0 01-.67-.3L2.3 8.35a.96.96 0 010-1.34.93.93 0 011.33 0l2.79 2.99 7.26-7.85a.93.93 0 011.33 0 .96.96 0 010 1.166z" fill="currentColor"/><path d="M10.87 3.316l-7.92 8.56a.91.91 0 01-.67.3.91.91 0 01-.67-.3L.16 10.35a.96.96 0 010-1.34.93.93 0 011.33 0l1.19 1.28 7.26-7.85a.93.93 0 011.33 0 .96.96 0 010 1.166z" fill="currentColor"/></svg>`
      : (isDelivered
        ? `<svg viewBox="0 0 16 15" width="14" height="13" fill="none"><path d="M15.01 3.316l-7.92 8.56a.91.91 0 01-.67.3.91.91 0 01-.67-.3L2.3 8.35a.96.96 0 010-1.34.93.93 0 011.33 0l2.79 2.99 7.26-7.85a.93.93 0 011.33 0 .96.96 0 010 1.166z" fill="currentColor"/><path d="M10.87 3.316l-7.92 8.56a.91.91 0 01-.67.3.91.91 0 01-.67-.3L.16 10.35a.96.96 0 010-1.34.93.93 0 011.33 0l1.19 1.28 7.26-7.85a.93.93 0 011.33 0 .96.96 0 010 1.166z" fill="currentColor"/></svg>`
        : `<svg viewBox="0 0 16 15" width="14" height="13" fill="none"><path d="M12.01 3.316l-7.92 8.56a.91.91 0 01-.67.3.91.91 0 01-.67-.3L.3 8.35a.96.96 0 010-1.34.93.93 0 011.33 0l2.79 2.99 7.26-7.85a.93.93 0 011.33 0 .96.96 0 010 1.166z" fill="currentColor"/></svg>`);
    const starHtml = (msg.starredBy && msg.starredBy.includes(myName)) ? `<span class="msg-star-badge" title="Starred">⭐</span>` : '';
    const tickHtml = mine ? (msg.isPending ? `<span class="msg-status-ticks pending" id="tick-${msg.id}">🕒</span>` : `<span class="msg-status-ticks ${tickState}" id="tick-${msg.id}">${tickSvg}</span>`) : '';
    const bubbleMeta = `<span class="bubble-meta">${starHtml}<span class="bubble-time">${time}</span>${tickHtml}</span>`;

    let body = '';

    if (msg.deleted) {
      body = `<div class="msg deleted ${mine ? 'me' : 'them'}">🗑️ Message deleted ${bubbleMeta}</div>`;

    } else if (msg.type === 'hug') {
      body = `<div class="msg hug ${mine ? 'me' : 'them'}">${profile.avatar || '💌'} ${escapeHtml(display)} sent a hug 💌 ${bubbleMeta}</div>`;

    } else if (msg.type === 'image') {
      if (msg.viewOnce) {
        if (msg.opened) {
          body = `<div class="msg ${mine ? 'me' : 'them'}">
            ${replyQuote}
            <div class="view-once-capsule opened">
              <span class="view-once-num">1</span>
              <span>Photo (Opened)</span>
            </div>
            ${editedTag}
            ${bubbleMeta}
          </div>`;
        } else {
          body = `<div class="msg ${mine ? 'me' : 'them'}">
            ${replyQuote}
            <div class="view-once-capsule" onclick="BestieChat.openViewOnceMedia('${msg.id}', '${escapeHtml(msg.url)}')">
              <span class="view-once-num">1</span>
              <span>Photo (View once)</span>
            </div>
            ${editedTag}
            ${bubbleMeta}
          </div>`;
        }
      } else {
        body = `<div class="msg ${mine ? 'me' : 'them'}">
          ${replyQuote}
          ${msg.text ? `<div>${escapeHtml(msg.text)}</div>` : ''}
          <img class="chat-img" src="${escapeHtml(msg.url)}" alt="shared image" onclick="BestieChat.openLightbox('${escapeHtml(msg.url)}')" loading="lazy" decoding="async" />
          ${editedTag}
          ${bubbleMeta}
        </div>`;
        if (!allImageMessages.find((m) => m.id === msg.id)) {
          allImageMessages.push({ id: msg.id, url: msg.url, user: msg.user, time: msg.time });
        }
      }

    } else if (msg.type === 'media-group') {
      const items = msg.items || [];
      const gridClass = `grid-${Math.min(4, Math.max(1, items.length))}`;
      body = `<div class="msg ${mine ? 'me' : 'them'}">
        ${replyQuote}
        ${msg.text ? `<div>${escapeHtml(msg.text)}</div>` : ''}
        <div class="media-collage-grid ${gridClass}">
          ${items.map(item => `<img class="collage-item" src="${escapeHtml(item.url)}" alt="photo" onclick="BestieChat.openLightbox('${escapeHtml(item.url)}')" loading="lazy" decoding="async" />`).join('')}
        </div>
        ${editedTag}
        ${bubbleMeta}
      </div>`;

    } else if (msg.type === 'document') {
      body = `<div class="msg ${mine ? 'me' : 'them'}">
        ${replyQuote}
        <a class="doc-msg-card" href="${escapeHtml(msg.url)}" download="${escapeHtml(msg.docName || 'document')}" target="_blank" rel="noopener noreferrer">
          <div class="doc-msg-icon">📄</div>
          <div class="doc-msg-info">
            <div class="doc-msg-name">${escapeHtml(msg.docName || 'Document')}</div>
            <div class="doc-msg-size">${formatBytes(msg.docSize || 0)}</div>
          </div>
          <div class="doc-msg-dl">⬇️</div>
        </a>
        ${editedTag}
        ${bubbleMeta}
      </div>`;

    } else if (msg.type === 'voice') {
      const dur = msg.duration ? `${Math.floor(msg.duration / 60)}:${String(msg.duration % 60).padStart(2, '0')}` : '';
      body = `<div class="msg ${mine ? 'me' : 'them'}">
        ${replyQuote}
        <div class="custom-audio-player" data-url="${escapeHtml(msg.url)}" data-id="${msg.id}">
          <button class="wave-play-btn" onclick="BestieChat.playWaveform('${msg.id}', this)">
            <svg class="play-svg" width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            <svg class="pause-svg" width="16" height="16" fill="currentColor" viewBox="0 0 24 24" style="display:none"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
          </button>
          <div class="audio-waveform" onclick="BestieChat.seekWaveform(event, '${msg.id}')">
            ${Array.from({length: 25}).map(() => {
              const h = Math.floor(Math.random() * 60) + 30;
              return `<div class="waveform-bar" style="height:${h}%"></div>`;
            }).join('')}
          </div>
          <div class="audio-duration" id="wave-dur-${msg.id}">${dur}</div>
          <button class="audio-speed-btn" onclick="BestieChat.cycleAudioSpeed('${msg.id}', this)" title="Playback Speed">1x</button>
          <button class="transcribe-btn" onclick="BestieChat.transcribeAudio('${msg.id}', '${escapeHtml(msg.url)}')" title="Transcribe to Text" style="background:none; border:none; color:var(--muted); cursor:pointer; padding:4px;">🗣️</button>
        </div>
        <div class="transcription-box" id="transcription-${msg.id}" style="display:none; font-size:0.82rem; color:var(--muted); margin-top:6px; font-style:italic;"></div>
        ${editedTag}
        ${bubbleMeta}
      </div>`;

    } else if (msg.type === 'video-note') {
      body = `<div class="msg ${mine ? 'me' : 'them'}">
        ${replyQuote}
        <div class="video-circle-wrap" onclick="BestieChat.toggleVideoNoteAudio(this)">
          <video src="${escapeHtml(msg.url)}" autoplay loop muted playsinline></video>
          <div class="video-circle-mute-badge">🔇</div>
        </div>
        ${editedTag}
        ${bubbleMeta}
      </div>`;

    } else if (msg.type === 'music') {
      const platform = getMusicPlatform(msg.url || '');
      const decMusicText = decryptE2EE(msg.text || msg.url);
      body = `<div class="msg ${mine ? 'me' : 'them'}">
        ${replyQuote}
        <a class="music-card" href="${escapeHtml(msg.url)}" target="_blank" rel="noopener noreferrer">
          <div class="music-icon" style="background:${platform.color}">${platform.icon}</div>
          <div class="music-info">
            <div class="music-platform">${escapeHtml(platform.name)}</div>
            <span class="music-link">${escapeHtml(decMusicText)}</span>
          </div>
        </a>
        ${editedTag}
        ${bubbleMeta}
      </div>`;

    } else if (msg.type === 'secret') {
      const decSecret = decryptE2EE(msg.text);
      body = `<div class="msg secret ${mine ? 'me' : 'them'}">
        <div class="secret-content" onclick="this.classList.toggle('revealed')">🤫 ${escapeHtml(decSecret)}</div>
        <div class="secret-timer" id="stimer-${msg.id}">Vanishes in 30s</div>
        ${bubbleMeta}
      </div>`;
      setTimeout(() => startSecretCountdown(msg.id, msg.time), 0);

    } else if (msg.type === 'time-capsule') {
      const isUnlocked = Date.now() >= (msg.unlockAt || 0);
      const unlockDateStr = new Date(msg.unlockAt || Date.now()).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      const decCapsule = decryptE2EE(msg.text);

      if (isUnlocked) {
        body = `<div class="msg ${mine ? 'me' : 'them'} time-capsule-unlocked">
          <div style="font-size:11px; font-weight:700; color:#d97706; margin-bottom:4px;">🎁 TIME CAPSULE UNLOCKED!</div>
          <div class="msg-text">${escapeHtml(decCapsule)}</div>
          ${editedTag}
          ${bubbleMeta}
        </div>`;
      } else {
        body = `<div class="msg ${mine ? 'me' : 'them'}">
          <div class="time-capsule-card">
            <div class="time-capsule-icon">🎁</div>
            <div class="time-capsule-title">Time Capsule Locked</div>
            <div class="time-capsule-timer" id="capsule-timer-${msg.id}">Opens: ${escapeHtml(unlockDateStr)}</div>
          </div>
          ${bubbleMeta}
        </div>`;
        setTimeout(() => startTimeCapsuleCountdown(msg.id, msg.unlockAt), 0);
      }

    } else if (msg.type === 'poll') {
      const opts = (msg.options || []).map((o) => {
        const voted = msg.votes && msg.votes[myName] === o;
        return `<button class="poll-opt${voted ? ' voted' : ''}" data-option="${escapeHtml(o)}">${escapeHtml(o)}</button>`;
      }).join('');
      body = `<div class="msg ${mine ? 'me' : 'them'}">
        📊 ${escapeHtml(msg.text)}
        <div class="poll-options">${opts}</div>
        ${editedTag}
        ${bubbleMeta}
      </div>`;

    } else {
      const decText = decryptE2EE(msg.text);
      const highlightedText = highlightInsideJokes(decText);

      body = `<div class="msg ${mine ? 'me' : 'them'}">
        ${replyQuote}
        <span class="msg-text">${highlightedText}</span>
        ${editedTag}
        ${bubbleMeta}
      </div>`;

      // Auto-fetch OpenGraph preview if message contains URL
      setTimeout(() => fetchAndRenderLinkPreview(msg.id, decText), 50);
    }

    wrap.innerHTML = `
      <div class="swipe-reply-hint">↩</div>
      ${body}
      <div class="react-bar">${renderReactionBar(msg.id)}</div>
      <div class="reactions" id="reactions-${msg.id}">${renderReactions(msg)}</div>
    `;

    // Observe unread incoming messages
    if (!mine) {
      msgObserver.observe(wrap);
    }

    // Poll vote listeners
    wrap.querySelectorAll('.poll-opt').forEach((btn) => {
      btn.addEventListener('click', () => votePoll(msg.id, btn.dataset.option));
    });

    // Double-click to react with ❤️
    wrap.addEventListener('dblclick', (e) => {
      e.preventDefault();
      triggerDoubleTapHeart(wrap, msg.id);
    });

    // Touch double-tap
    let _lastTapTime = 0;
    wrap.addEventListener('touchstart', (e) => {
      if (e.touches.length > 1) return;
      const now = Date.now();
      if (now - _lastTapTime < 300) {
        triggerDoubleTapHeart(wrap, msg.id);
      }
      _lastTapTime = now;
    }, { passive: true });

    // Long-press context menu
    wrap.addEventListener('pointerdown', (e) => {
      if (e.button && e.button !== 0) return;
      longPressTimer = setTimeout(() => showContextMenu(e, msg), 550);
    });
    wrap.addEventListener('pointerup',   () => clearTimeout(longPressTimer));
    wrap.addEventListener('pointermove', () => clearTimeout(longPressTimer));

    // Right-click context menu
    wrap.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showContextMenu(e, msg);
    });

    // Swipe right to reply
    let _swipeStartX = 0;
    let _swipeStartY = 0;
    let _swiping = false;
    let _swipeTriggered = false;

    wrap.addEventListener('touchstart', (e) => {
      _swipeStartX = e.touches[0].clientX;
      _swipeStartY = e.touches[0].clientY;
      _swiping = false;
      _swipeTriggered = false;
      wrap.style.transition = 'none';
    }, { passive: true });

    wrap.addEventListener('touchmove', (e) => {
      const dx = e.touches[0].clientX - _swipeStartX;
      const dy = Math.abs(e.touches[0].clientY - _swipeStartY);
      if (dx > 15 && dy < 30) {
        _swiping = true;
        wrap.classList.add('swiping-active');
        const springOffset = Math.min(68, dx * 0.62);
        wrap.style.transform = `translateX(${springOffset}px)`;
        if (springOffset > 42 && !_swipeTriggered) {
          _swipeTriggered = true;
          wrap.classList.add('swipe-ready');
          triggerHaptic(12);
        } else if (springOffset <= 42 && _swipeTriggered) {
          _swipeTriggered = false;
          wrap.classList.remove('swipe-ready');
        }
      }
    }, { passive: true });

    wrap.addEventListener('touchend', () => {
      wrap.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)';
      wrap.style.transform = '';
      wrap.classList.remove('swiping-active', 'swipe-ready');
      if (_swiping && _swipeTriggered) {
        triggerHaptic(20);
        replyToMessage(msg.id, escapeHtml(msg.user || ''), escapeHtml(msg.text || ''), msg.type || 'text');
      }
      _swiping = false;
      _swipeTriggered = false;
    });

    // Tap to show react bar on touch
    if ('ontouchstart' in window) {
      wrap.addEventListener('click', (e) => {
        if (e.target.closest('.reaction-pill,.reaction-btn,.poll-opt,.reply-quote,.chat-img,.music-card')) return;
        wrap.classList.toggle('touched');
        document.querySelectorAll('.msg-wrap.touched').forEach((el) => {
          if (el !== wrap) el.classList.remove('touched');
        });
      });
    }

    els.messages.appendChild(wrap);
    // Slide-up animation for new (not history) messages
    if (!skipSound) {
      wrap.classList.add('msg-new');
      wrap.addEventListener('animationend', () => wrap.classList.remove('msg-new'), { once: true });
    }
    scrollBottom();

    if (!skipSound && !mine && !['poll'].includes(msg.type)) playSound('receive');

    // Update read tick if other person has already read past this
    updateReadTickForMessage(msg.id);

    // Emit read receipt if visible
    if (!document.hidden && msg.user !== myName) {
      emitReadReceipt(msg.id);
    }
  }

  function startSecretCountdown(msgId, startTime) {
    const endTime = (startTime || Date.now()) + 30000;
    const timerEl = document.getElementById(`stimer-${msgId}`);
    if (!timerEl) return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
      if (timerEl && timerEl.isConnected) {
        if (remaining > 0) {
          timerEl.textContent = `Vanishes in ${remaining}s`;
        } else {
          timerEl.textContent = 'Vanished 💨';
          const wrap = timerEl.closest('.msg-wrap');
          const content = wrap ? wrap.querySelector('.secret-content') : null;
          if (content) {
            content.textContent = '🤫 [Message expired]';
            content.style.opacity = '0.5';
            content.style.filter = 'none';
          }
        }
      }
      if (remaining > 0) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function startTimeCapsuleCountdown(msgId, unlockAt) {
    const timerEl = document.getElementById(`capsule-timer-${msgId}`);
    if (!timerEl) return;
    const tick = () => {
      const remaining = (unlockAt || 0) - Date.now();
      if (remaining <= 0) {
        refreshMessagesLayout();
        confetti();
        playSound('milestone');
        showToast('🎁 A Time Capsule has unlocked!');
        return;
      }
      if (timerEl && timerEl.isConnected) {
        const d = Math.floor(remaining / (1000 * 60 * 60 * 24));
        const h = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const m = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((remaining % (1000 * 60)) / 1000);
        let timeStr = '';
        if (d > 0) timeStr = `${d}d ${h}h ${m}m`;
        else if (h > 0) timeStr = `${h}h ${m}m ${s}s`;
        else timeStr = `${m}m ${s}s`;
        timerEl.textContent = `Unlocks in: ${timeStr} ⏳`;
        setTimeout(tick, 1000);
      }
    };
    tick();
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
    div.className  = 'system';
    div.textContent = text;
    els.messages.appendChild(div);
    scrollBottom();
  }

  function renderMilestone(data) {
    const div = document.createElement('div');
    div.className  = 'milestone-msg';
    div.textContent = data.text;
    els.messages.appendChild(div);
    scrollBottom();
    playSound('milestone');
    confetti();
  }

  function renderGamePrompt(data) {
    const div = document.createElement('div');
    div.className = 'game-card';
    let inner = `<div class="game-from">🎮 ${escapeHtml(data.from)} started a game</div><div class="game-q">${escapeHtml(data.question)}</div>`;
    if (data.options && data.options.length) {
      inner += `<div class="game-options-row" style="display:flex; flex-direction:column; gap:6px; margin-top:8px;">`;
      inner += data.options.map((o) => `<button class="smart-pill" style="text-align:left; width:100%;" onclick="BestieChat.sendQuickReply('${escapeHtml(o.replace(/'/g, "\\'"))}')">👉 ${escapeHtml(o)}</button>`).join('');
      inner += `</div>`;
    }
    div.innerHTML = inner;
    els.messages.appendChild(div);
    scrollBottom();
    playSound('receive');
  }

  // ═══════════════════ READ RECEIPTS ═══════════════════
  function emitReadReceipt(msgId) {
    if (!joined || !socket || !msgId) return;
    socket.emit('read-receipt', { messageId: msgId });
  }

  function emitReadReceiptForLastVisible() {
    const wraps = els.messages.querySelectorAll('.msg-wrap');
    let lastOtherMsgId = null;
    wraps.forEach((w) => {
      const msg = w.querySelector('.msg');
      if (msg && !w.classList.contains('me')) lastOtherMsgId = w.dataset.id;
    });
    if (lastOtherMsgId) emitReadReceipt(lastOtherMsgId);
  }

  function getMessageIndex(msgId) {
    return allMessagesCached.findIndex((m) => m.id === msgId);
  }

  function updateReadTickForMessage(msgId) {
    const tick = document.getElementById(`tick-${msgId}`);
    if (!tick) return;
    const others = Object.entries(readBy).filter(([name]) => name !== myName);
    if (!others.length) return;
    
    const targetIdx = getMessageIndex(msgId);
    if (targetIdx === -1) return;
    
    let hasBeenRead = false;
    let readReceiptTime = null;
    
    for (const [name, readMsgId] of others) {
      const readIdx = getMessageIndex(readMsgId);
      if (readIdx >= targetIdx) {
        hasBeenRead = true;
        if (readMsgId === msgId) {
          const msgObj = allMessagesCached[readIdx];
          if (msgObj) readReceiptTime = msgObj.time;
        }
      }
    }
    
    if (hasBeenRead) {
      tick.className = 'read-tick';
      if (readReceiptTime) {
        tick.innerHTML = `✓✓ <span class="receipt-time">Seen</span>`;
      } else {
        tick.textContent = '✓✓';
      }
    }
  }

  function applyReadReceipts(rb) {
    readBy = rb || {};
    els.messages.querySelectorAll('.msg-wrap.me').forEach((wrap) => {
      updateReadTickForMessage(wrap.dataset.id);
    });
  }

  // ═══════════════════ CONTEXT MENU ═══════════════════
  function showContextMenu(e, msg) {
    contextTarget = msg.id;
    const mine = msg.user === myName;
    const isPinned = pinnedMsg && pinnedMsg.id === msg.id;
    const isStarred = msg.starredBy && msg.starredBy.includes(myName);
    const safeUser = escapeHtml((msg.user || '').replace(/'/g, "&#39;"));
    const safeText = escapeHtml((msg.text || '').replace(/'/g, "&#39;"));

    let html = `
      <div class="ctx-reactions-row">
        <button class="ctx-react-btn" onclick="BestieChat.quickReact('${msg.id}', '❤️'); BestieChat.hideContextMenu();">❤️</button>
        <button class="ctx-react-btn" onclick="BestieChat.quickReact('${msg.id}', '👍'); BestieChat.hideContextMenu();">👍</button>
        <button class="ctx-react-btn" onclick="BestieChat.quickReact('${msg.id}', '🔥'); BestieChat.hideContextMenu();">🔥</button>
        <button class="ctx-react-btn" onclick="BestieChat.quickReact('${msg.id}', '😂'); BestieChat.hideContextMenu();">😂</button>
        <button class="ctx-react-btn" onclick="BestieChat.quickReact('${msg.id}', '🥰'); BestieChat.hideContextMenu();">🥰</button>
        <button class="ctx-react-btn" onclick="BestieChat.quickReact('${msg.id}', '🎉'); BestieChat.hideContextMenu();">🎉</button>
      </div>
    `;

    if (!msg.deleted) {
      html += `<button class="ctx-item" onclick="BestieChat.replyToMessage('${msg.id}','${safeUser}','${safeText}','${msg.type||'text'}'); BestieChat.hideContextMenu();">↩ Reply</button>`;
      if (msg.text) {
        html += `<button class="ctx-item" onclick="BestieChat.copyText('${safeText}'); BestieChat.hideContextMenu();">📋 Copy Text</button>`;
      }
      if (mine && (msg.type === 'text' || !msg.type)) {
        html += `<button class="ctx-item" onclick="BestieChat.startEditMessage('${msg.id}','${safeText}'); BestieChat.hideContextMenu();">✏️ Edit</button>`;
      }
      html += `<button class="ctx-item" onclick="BestieChat.${isPinned ? 'unpinMessage()' : `pinMessageById('${msg.id}')`}; BestieChat.hideContextMenu();">📌 ${isPinned ? 'Unpin' : 'Pin'}</button>`;
      html += `<button class="ctx-item" onclick="BestieChat.toggleStarMessage('${msg.id}', ${!isStarred}); BestieChat.hideContextMenu();">⭐ ${isStarred ? 'Unstar' : 'Star'}</button>`;
      if (mine) {
        html += `<div class="ctx-divider"></div>`;
        html += `<button class="ctx-item danger" onclick="BestieChat.deleteMessage('${msg.id}'); BestieChat.hideContextMenu();">🗑️ Delete</button>`;
      }
    }

    els.contextMenu.innerHTML = html;
    els.contextMenu.classList.add('open');

    const x = e.clientX || (e.changedTouches && e.changedTouches[0] && e.changedTouches[0].clientX) || window.innerWidth / 2;
    const y = e.clientY || (e.changedTouches && e.changedTouches[0] && e.changedTouches[0].clientY) || window.innerHeight / 2;

    const menuW = 200;
    const menuH = els.contextMenu.scrollHeight || 240;
    const menuLeft = Math.max(10, Math.min(x - 50, window.innerWidth  - menuW - 12));
    const menuTop  = Math.max(10, Math.min(y - 80, window.innerHeight - menuH - 12));
    els.contextMenu.style.left = `${menuLeft}px`;
    els.contextMenu.style.top  = `${menuTop}px`;
  }

  function hideContextMenu() {
    if (els.contextMenu) els.contextMenu.classList.remove('open');
    const picker = document.getElementById('reactionPicker');
    if (picker) picker.classList.remove('open');
  }

  // ═══════════════════ CONNECTION STATUS ═══════════════════
  function setConnected(online) {
    if (els.bestieStatus) {
      els.bestieStatus.textContent = online ? 'Connected' : 'Reconnecting…';
    }
    const hStatusEl = document.getElementById('headerBestieStatus');
    if (hStatusEl) {
      if (online) {
        updateBestieHeaderState();
      } else {
        hStatusEl.textContent = 'Connecting…';
        hStatusEl.className = 'header-bestie-status';
      }
    }
    document.body.classList.toggle('reconnecting', !online);
  }

  // ═══════════════════ UI UPDATES ═══════════════════
  let lastSeenData = {};
  let currentOnlineUsers = [];

  function updateBestieHeaderState(users, lastSeen) {
    if (users) currentOnlineUsers = users;
    if (lastSeen) lastSeenData = lastSeen;

    const others = currentOnlineUsers.filter((u) => u !== myName);

    // Elements: sidebar bestie card (legacy IDs still used)
    const avatarEl    = els.bestieAvatar;
    const nameEl      = els.bestieName;
    const statusEl    = els.bestieStatus;
    // New header elements
    const hAvatarEl   = document.getElementById('headerBestieAvatar');
    const hNameEl     = document.getElementById('headerBestieName');
    const hStatusEl   = document.getElementById('headerBestieStatus');

    let bestieDisplay = 'Chat';
    let bestieAvatar  = '✨';
    let bestieStatus  = 'Offline';
    let isOnline      = false;

    if (others.length) {
      const bestie = others[0];
      const p = getProfile(bestie);
      bestieAvatar  = p.avatar || '🐱';
      bestieDisplay = p.nickname || bestie;
      bestieStatus  = 'Online';
      isOnline      = true;
    } else {
      const allOthers = Object.keys(lastSeenData || {}).filter((u) => u !== myName);
      if (allOthers.length) {
        const sorted = allOthers.sort((a, b) => (lastSeenData[b] || 0) - (lastSeenData[a] || 0));
        const lastBestie = sorted[0];
        const p = getProfile(lastBestie);
        bestieAvatar  = p.avatar || '🐱';
        bestieDisplay = p.nickname || lastBestie;
        const ts = lastSeenData[lastBestie];
        bestieStatus = ts ? formatLastSeen(ts) : 'Offline';
      }
    }

    // Update sidebar bestie card
    if (avatarEl) { avatarEl.textContent = bestieAvatar; avatarEl.classList.toggle('online', isOnline); }
    if (nameEl)   nameEl.textContent = bestieDisplay;
    if (statusEl) { statusEl.textContent = bestieStatus; statusEl.className = isOnline ? 'bestie-status online' : 'bestie-status'; }

    // Update header bestie info
    if (hAvatarEl) { hAvatarEl.textContent = bestieAvatar; hAvatarEl.classList.toggle('online', isOnline); }
    if (hNameEl)   hNameEl.textContent = bestieDisplay;
    if (hStatusEl) { hStatusEl.textContent = bestieStatus; hStatusEl.className = isOnline ? 'header-bestie-status online' : 'header-bestie-status'; }
  }

  function updateStreak(streak) {
    if (!streak) return;
    const days = streak.days || 0;
    els.streakBadge.textContent = days > 0 ? `🔥 ${days} day streak` : '🔥 Start a streak!';
  }

  function updateLastSeen(lastSeen) {
    if (lastSeen) lastSeenData = lastSeen;
    updateBestieHeaderState();
  }

  function updateUnreadBadge() {
    if (els.unreadBadge) {
      if (unreadCount > 0 && document.hidden) {
        els.unreadBadge.style.display = 'inline';
        els.unreadBadge.textContent   = unreadCount > 99 ? '99+' : unreadCount;
      } else {
        els.unreadBadge.style.display = 'none';
      }
    }
    if (unreadCount > 0 && document.hidden) {
      document.title = `(${unreadCount}) chat ✨`;
    } else {
      document.title = 'chat ✨';
    }
  }

  function clearUnread() { unreadCount = 0; updateUnreadBadge(); }

  function updateCountdown(countdown) {
    if (!countdown || !countdown.date) { els.countdownDisplay.textContent = ''; return; }
    const diff = new Date(countdown.date).getTime() - Date.now();
    if (diff <= 0) { els.countdownDisplay.textContent = `${countdown.label || "It's here!"} 🎉`; return; }
    const days = Math.floor(diff / 86400000);
    const hrs  = Math.floor((diff % 86400000) / 3600000);
    const mins = Math.floor((diff % 3600000)  / 60000);
    els.countdownDisplay.textContent = `${countdown.label || 'Countdown'}: ${days}d ${hrs}h ${mins}m`;
  }

  function sendDesktopNotification(title, options = {}) {
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.ready.then((reg) => {
            reg.showNotification(title, options);
          }).catch(() => {
            try { new Notification(title, options); } catch {}
          });
        } else {
          try { new Notification(title, options); } catch {}
        }
      }
    } catch (err) {
      console.warn('Notification ignored:', err);
    }
  }

  function checkDailyReminder() {
    reminderInterval = setInterval(() => {
      if (!joined) return;
      const hour = new Date().getHours();
      if (hour !== REMINDER_HOUR) return;
      const key  = `reminder-${new Date().toISOString().slice(0, 10)}`;
      if (localStorage.getItem(key)) return;
      const lastMsg = localStorage.getItem('bestieLastMsgDate');
      if (lastMsg === new Date().toISOString().slice(0, 10)) return;
      sendDesktopNotification('Bestie check-in 👀', {
        body: "You haven't chatted with your bestie today!",
        icon: '/icon-192.png'
      });
      localStorage.setItem(key, '1');
    }, 3600000);
  }

  function updatePinnedBanner(msg) {
    pinnedMsg = msg;
    if (!msg) {
      els.pinnedBanner.classList.remove('visible');
      return;
    }
    const display = getDisplayName(msg.user);
    const preview = msg.type === 'image' ? '📸 Photo' :
                    msg.type === 'voice' ? '🎤 Voice note' :
                    (msg.text || '').slice(0, 60);
    els.pinnedText.textContent = `${display}: ${preview}`;
    els.pinnedBanner.classList.add('visible');
  }

  function startIntervals() {
    clearInterval(heartbeatInterval);
    clearInterval(reminderInterval);
    clearInterval(countdownInterval);

    heartbeatInterval = setInterval(() => socket && socket.emit('heartbeat'), 30000);
    applyNightGlow();
    setInterval(applyNightGlow, 60000);

    reminderInterval = setInterval(() => {
      if (!joined) return;
      const hour = new Date().getHours();
      if (hour !== REMINDER_HOUR) return;
      const key  = `reminder-${new Date().toISOString().slice(0, 10)}`;
      if (localStorage.getItem(key)) return;
      const lastMsg = localStorage.getItem('bestieLastMsgDate');
      if (lastMsg === new Date().toISOString().slice(0, 10)) return;
      sendDesktopNotification('Bestie check-in 👀', {
        body: "You haven't chatted with your bestie today!",
        icon: '/icon-192.png'
      });
      localStorage.setItem(key, '1');
    }, 3600000);

    countdownInterval = setInterval(() => {
      const label = els.countdownLabel ? els.countdownLabel.value : '';
      const date  = els.countdownDate  ? els.countdownDate.value  : '';
      if (date) updateCountdown({ label, date });
    }, 60000);
  }

  // ═══════════════════ FILE UPLOAD ═══════════════════
  async function uploadFile(base64, mime, kind) {
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: base64, mime, kind })
    });
    if (!res.ok) throw new Error('Upload failed');
    return res.json();
  }

  // ═══════════════════ SIDEBAR ═══════════════════
  function toggleSidebar() {
    const sidebar  = document.getElementById('sidebar');
    const overlay  = document.getElementById('sidebarOverlay');
    if (!sidebar) return;
    const isOpen = sidebar.classList.toggle('open');
    if (overlay) overlay.classList.toggle('active', isOpen);
  }

  function closeSidebar() {
    const sidebar  = document.getElementById('sidebar');
    const overlay  = document.getElementById('sidebarOverlay');
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('active');
  }

  function sidebarNavTo(tab) {
    // Update active nav item
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    const navBtn = document.getElementById(`navItem${tab.charAt(0).toUpperCase() + tab.slice(1)}`);
    if (navBtn) navBtn.classList.add('active');

    // Close sidebar on mobile after nav
    if (window.innerWidth < 768) closeSidebar();

    if (tab === 'chat') {
      // Hide extras modal, show messages
      hideModal('extrasPanel');
      if (els.feelingsPanel) els.feelingsPanel.classList.remove('open');
    } else if (tab === 'space') {
      openExtras('vibe');
    } else if (tab === 'games') {
      openGamesHub();
    } else if (tab === 'settings') {
      openExtras('prefs');
    }
  }

  function updateSidebarMyProfile() {
    const profile = getProfile(myName);
    const avatarEl = document.getElementById('sidebarMyAvatar');
    const nameEl   = document.getElementById('sidebarMyName');
    const bioEl    = document.getElementById('sidebarMyBio');
    const displayName = getDisplayName(myName);
    if (avatarEl) avatarEl.textContent = profile.avatar || '✨';
    if (nameEl)   nameEl.textContent   = displayName || myName;
    if (bioEl)    bioEl.textContent    = profile.statusBio || 'tap to edit profile';
  }

  // ═══════════════════ JOIN / LEAVE ═══════════════════
  let selectedLoginAvatar = '✨';
  function selectLoginAvatar(emoji, btnEl) {
    selectedLoginAvatar = emoji;
    document.querySelectorAll('.login-avatar-btn').forEach(b => b.classList.remove('active'));
    const target = btnEl || (window.event && (window.event.currentTarget || window.event.target));
    if (target && target.classList) target.classList.add('active');
  }

  // ─── Auth Mode Toggle ───────────────────────────────────────────────────────
  function setAuthMode(mode) {
    authMode = mode;
    const loginBtn    = document.getElementById('authTabLogin');
    const registerBtn = document.getElementById('authTabRegister');
    const joinBtnText = document.getElementById('joinBtnText');
    const avatarField = document.getElementById('avatarPickerField');
    if (mode === 'register') {
      if (loginBtn)    { loginBtn.style.background = 'transparent'; loginBtn.style.color = 'var(--muted)'; }
      if (registerBtn) { registerBtn.style.background = 'var(--accent)'; registerBtn.style.color = '#fff'; }
      if (joinBtnText) joinBtnText.textContent = '✨ Create Account';
      if (avatarField) avatarField.style.display = 'block';
    } else {
      if (loginBtn)    { loginBtn.style.background = 'var(--accent)'; loginBtn.style.color = '#fff'; }
      if (registerBtn) { registerBtn.style.background = 'transparent'; registerBtn.style.color = 'var(--muted)'; }
      if (joinBtnText) joinBtnText.textContent = '🔑 Login';
      if (avatarField) avatarField.style.display = 'none';
    }
  }

  // ─── Join / Auth ─────────────────────────────────────────────────────────────
  async function joinChat() {
    const nameEl = document.getElementById('nameInput');
    const passEl = document.getElementById('passwordInput');
    const errEl  = document.getElementById('loginError');
    if (errEl) errEl.textContent = '';

    const rawName = (nameEl ? nameEl.value.trim() : '');
    const cleanName = (rawName.toLowerCase().replace(/[^a-z0-9_]/g, ''));
    const rawPass = (passEl ? passEl.value : '');

    if (!cleanName || cleanName.length < 2) {
      if (errEl) errEl.textContent = 'Please enter a valid username (at least 2 letters/numbers).';
      if (nameEl) nameEl.focus();
      return;
    }
    if (!rawPass || rawPass.length < 3) {
      if (errEl) errEl.textContent = 'Please enter your password (at least 3 characters).';
      if (passEl) passEl.focus();
      return;
    }

    const joinBtn = document.getElementById('joinBtn');
    if (joinBtn) {
      joinBtn.disabled = true;
      const textSpan = document.getElementById('joinBtnText');
      if (textSpan) textSpan.textContent = 'Signing in...';
    }

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: cleanName, password: rawPass, avatar: myProfile.avatar || '✨' })
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        if (errEl) errEl.textContent = data.error || 'Login failed. Please check password.';
        if (joinBtn) {
          joinBtn.disabled = false;
          const textSpan = document.getElementById('joinBtnText');
          if (textSpan) textSpan.textContent = 'Enter Space';
        }
        return;
      }

      authToken = data.token;
      myName = data.username || cleanName;
      myRoom = 'our-private-space';
      if (data.avatar) myProfile.avatar = data.avatar;
      if (data.nickname) myProfile.nickname = data.nickname;
      if (data.statusBio) myProfile.statusBio = data.statusBio;

      localStorage.setItem('bestieChatName', myName);
      localStorage.setItem('bestieChatToken', authToken);
      localStorage.setItem('bestieChatRoom', myRoom);
      localStorage.setItem('bestieChatProfile', JSON.stringify(myProfile));

      // Hide login and show chat space
      const loginDiv = document.getElementById('login');
      const chatDiv  = document.getElementById('chat');
      if (loginDiv) loginDiv.setAttribute('style', 'display:none !important');
      if (chatDiv)  chatDiv.setAttribute('style', 'display:flex !important');

      applyRoomTheme(myRoom);
      updateSidebarMyProfile();

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
    } catch (err) {
      console.error('Auth error:', err);
      if (errEl) errEl.textContent = 'Connection error. Please try again.';
      if (joinBtn) {
        joinBtn.disabled = false;
        const textSpan = document.getElementById('joinBtnText');
        if (textSpan) textSpan.textContent = 'Enter Space';
      }
    }
  }

  function leaveChat() {
    localStorage.removeItem('bestieChatToken');
    window.location.reload();
  }

  function doSocketJoin() {
    if (!socket) return;
    const nameToJoin = myName || localStorage.getItem('bestieChatName') || 'Bestie';
    const roomToJoin = myRoom || localStorage.getItem('bestieChatRoom') || 'our-private-space';
    myName = nameToJoin;
    myRoom = roomToJoin;
    socket.emit('join', {
      name: nameToJoin, room: roomToJoin,
      nickname: (myProfile && myProfile.nickname) || '',
      password: els.passwordInput ? els.passwordInput.value : ''
    });
  }

  async function quickReentry() {
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
      
      myRoom = 'our-private-space';
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

  function showFullLoginForm() {
    const reentry = document.getElementById('quickReentryContainer');
    const form = document.getElementById('loginForm');
    if (reentry) reentry.style.display = 'none';
    if (form) form.style.display = 'block';
  }

  function copyInviteLink() {
    const roomInputEl = document.getElementById('roomInput');
    const room = (roomInputEl && roomInputEl.value.trim()) || 'our-private-space';
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

  function togglePasswordVisibility() {
    const input = document.getElementById('passwordInput');
    if (input) {
      input.type = input.type === 'password' ? 'text' : 'password';
    }
  }

  function logout() {
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

  // ═══════════════════ SEND MESSAGE ═══════════════════
  function findUrl(text) {
    const match = text.match(/https?:\/\/[^\s]+/i);
    return match ? match[0] : null;
  }

  function autoExpandMsgInput() {
    if (!els.msgInput) return;
    els.msgInput.style.height = '36px';
    els.msgInput.style.height = Math.min(els.msgInput.scrollHeight, 120) + 'px';
    saveDraft();
  }

  function saveDraft() {
    if (!myRoom || !els.msgInput) return;
    localStorage.setItem(`bestieDraft_${myRoom}`, els.msgInput.value);
  }

  function restoreDraft() {
    if (!myRoom || !els.msgInput) return;
    const draft = localStorage.getItem(`bestieDraft_${myRoom}`) || '';
    els.msgInput.value = draft;
  }

  function sendMessagePayload(payload) {
    if (!payload) return;
    joined = true;
    const clientMsgId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    payload.clientMsgId = clientMsgId;
    payload.user = myName || localStorage.getItem('bestieChatName') || 'Bestie';
    payload.room = myRoom || localStorage.getItem('bestieChatRoom') || 'our-private-space';

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

  function sendMessage() {
    const rawText = els.msgInput.value.trim();
    if (!rawText) {
      toggleRecord();
      return;
    }
    if (!myName) myName = localStorage.getItem('bestieChatName') || 'Bestie';
    if (!myRoom) myRoom = localStorage.getItem('bestieChatRoom') || 'our-private-space';
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

  function sendHug() {
    if (!joined) return;
    socket.emit('message', { type: 'hug' });
    playSound('hug'); confetti();
    localStorage.setItem('bestieLastMsgDate', new Date().toISOString().slice(0, 10));
  }

  async function sendPhoto(filesInput) {
    if (!filesInput || !joined) return;
    const files = Array.isArray(filesInput) ? filesInput : (filesInput.length !== undefined ? Array.from(filesInput) : [filesInput]);
    if (!files.length) return;

    if (files.length === 1) {
      const file = files[0];
      if (!file.type.startsWith('image/')) return;
      showToast('Compressing & sending photo… 📸');
      try {
        const { dataUrl, mime } = await compressImage(file);
        const { url } = await uploadFile(dataUrl, mime, 'image');
        sendMessagePayload({ type: 'image', url, replyTo: replyingTo });
        cancelReply();
      } catch (err) {
        showToast('Could not upload photo');
      }
    } else {
      showToast(`Sending ${files.length} photos collage… 📸`);
      try {
        const uploadPromises = files.slice(0, 4).map(async (f) => {
          const { dataUrl, mime } = await compressImage(f);
          const { url } = await uploadFile(dataUrl, mime, 'image');
          return { url, name: f.name };
        });
        const items = await Promise.all(uploadPromises);
        sendMessagePayload({ type: 'media-group', items, replyTo: replyingTo });
        cancelReply();
      } catch (err) {
        showToast('Could not upload photo group');
      }
    }
  }

  async function uploadDocumentFile(input) {
    const file = input && input.files && input.files[0];
    if (!file || !joined) return;
    input.value = '';
    if (els.attachMenu) els.attachMenu.style.display = 'none';

    if (file.size > 25 * 1024 * 1024) {
      showToast('File too large (Max 25MB)');
      return;
    }
    showToast(`Uploading ${file.name}… 📄`);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const mime = file.type || 'application/octet-stream';
        const { url } = await uploadFile(reader.result, mime, 'document', file.name);
        sendMessagePayload({
          type: 'document',
          url,
          docName: file.name,
          docSize: file.size,
          replyTo: replyingTo
        });
        cancelReply();
      } catch (err) {
        showToast('Could not upload document');
      }
    };
    reader.readAsDataURL(file);
  }

  function openViewOnceMedia(messageId, url) {
    if (!url) {
      showToast('This view-once media was already opened');
      return;
    }
    openLightbox(url);
    if (socket) {
      socket.emit('view-once-opened', { messageId });
    }
  }

  // ═══════════════════ REPLY ═══════════════════
  function replyToMessage(msgId, user, text, type) {
    replyingTo = { id: msgId, user, text, type };
    const preview = type === 'image' ? '📸 Photo' : type === 'voice' ? '🎤 Voice note' : text;
    els.replyPreview.innerHTML = `<strong>${escapeHtml(user)}</strong>${escapeHtml(preview.slice(0, 80))}${preview.length > 80 ? '…' : ''}`;
    els.replyBar.style.display = 'flex';
    els.replyBar.classList.add('open');
    els.msgInput.focus();
    hideContextMenu();
  }

  function cancelReply() {
    replyingTo = null;
    els.replyBar.style.display = 'none';
    els.replyBar.classList.remove('open');
    els.replyPreview.innerHTML = '';
  }

  function scrollToMessage(msgId) {
    const el = els.messages.querySelector(`[data-id="${msgId}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('pinned-msg-highlight');
    setTimeout(() => el.classList.remove('pinned-msg-highlight'), 1300);
  }

  // ═══════════════════ EDIT / DELETE ═══════════════════
  function startEditMessage(msgId, text) {
    editingMessageId = msgId;
    els.msgInput.value = decryptE2EE(text);
    els.msgInput.focus();
    toggleSendMicIcons();
    hideContextMenu();
  }

  function deleteMessage(msgId) {
    if (!joined) return;
    socket.emit('delete-message', { messageId: msgId });
    hideContextMenu();
  }

  // ═══════════════════ PIN ═══════════════════
  function pinMessageById(msgId) {
    if (!joined) return;
    socket.emit('pin-message', { messageId: msgId });
    hideContextMenu();
  }

  function unpinMessage() {
    if (!joined) return;
    socket.emit('unpin-message');
    hideContextMenu();
  }

  function scrollToPinned() {
    if (pinnedMsg) scrollToMessage(pinnedMsg.id);
  }

  // ═══════════════════ COPY ═══════════════════
  function copyText(text) {
    navigator.clipboard.writeText(text).catch(() => {});
    hideContextMenu();
  }

  // ── Live Voice Visualizer & Recorder ──
  let recAudioCtx = null;
  let recAnalyser = null;
  let recAnimId = null;
  let recTimerInterval = null;
  let recStream = null;

  function cancelRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      recordChunks = [];
      mediaRecorder.stop();
    }
    stopLiveVisualizer();
    if (els.sendBtn) els.sendBtn.classList.remove('recording');
    if (els.recordingWaveformBar) els.recordingWaveformBar.style.display = 'none';
  }

  function startLiveVisualizer(stream) {
    try {
      recStream = stream;
      recAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
      recAnalyser = recAudioCtx.createAnalyser();
      recAnalyser.fftSize = 64;
      const source = recAudioCtx.createMediaStreamSource(stream);
      source.connect(recAnalyser);

      const canvas = els.recordingCanvas;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const bufferLength = recAnalyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      function draw() {
        recAnimId = requestAnimationFrame(draw);
        recAnalyser.getByteFrequencyData(dataArray);
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const barWidth = (canvas.width / bufferLength) * 2;
        let x = 0;
        for (let i = 0; i < bufferLength; i++) {
          const barHeight = Math.max(3, (dataArray[i] / 255) * canvas.height);
          ctx.fillStyle = '#ef4444';
          ctx.beginPath();
          ctx.roundRect(x, (canvas.height - barHeight) / 2, barWidth - 1, barHeight, 2);
          ctx.fill();
          x += barWidth;
        }
      }
      draw();
    } catch (_) {}
  }

  function stopLiveVisualizer() {
    if (recAnimId) cancelAnimationFrame(recAnimId);
    if (recAudioCtx) { recAudioCtx.close().catch(()=>{}); recAudioCtx = null; }
    if (recTimerInterval) { clearInterval(recTimerInterval); recTimerInterval = null; }
  }

  async function toggleRecord() {
    const btn = els.sendBtn;
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      if (btn) btn.classList.remove('recording');
      if (els.recordingWaveformBar) els.recordingWaveformBar.style.display = 'none';
      stopLiveVisualizer();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordChunks = [];
      const recorderOpts = { audioBitsPerSecond: 128000 };
      let chosenMime = '';
      if (typeof MediaRecorder.isTypeSupported === 'function') {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          chosenMime = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          chosenMime = 'audio/mp4';
        } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
          chosenMime = 'audio/ogg;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
          chosenMime = 'audio/webm';
        }
      }
      if (chosenMime) recorderOpts.mimeType = chosenMime;

      try {
        mediaRecorder = new MediaRecorder(stream, recorderOpts);
      } catch (_) {
        mediaRecorder = new MediaRecorder(stream);
      }

      recordStartTime = Date.now();
      
      if (els.recordingWaveformBar) {
        els.recordingWaveformBar.style.display = 'flex';
        if (els.recordingTimer) els.recordingTimer.textContent = '0:00';
      }
      startLiveVisualizer(stream);

      recTimerInterval = setInterval(() => {
        const sec = Math.floor((Date.now() - recordStartTime) / 1000);
        if (els.recordingTimer) {
          els.recordingTimer.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
        }
      }, 500);

      mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) recordChunks.push(e.data); };
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        stopLiveVisualizer();
        if (els.recordingWaveformBar) els.recordingWaveformBar.style.display = 'none';
        if (!recordChunks.length) return;

        const duration = Math.max(1, Math.round((Date.now() - recordStartTime) / 1000));
        const mimeType = (recordChunks[0] && recordChunks[0].type) || chosenMime || 'audio/webm';
        const blob = new Blob(recordChunks, { type: mimeType });
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            showToast('Sending voice note… 🎙️');
            const { url } = await uploadFile(reader.result, mimeType, 'voice');
            socket.emit('message', { type: 'voice', url, duration, replyTo: replyingTo });
            cancelReply();
            playSound('send');
          } catch (err) {
            console.error('Voice send error:', err);
            renderSystem('Could not send voice note');
            showToast('Voice note failed to upload');
          }
        };
        reader.readAsDataURL(blob);
      };

      mediaRecorder.start();
      if (btn) btn.classList.add('recording');
      showToast('🎙️ Recording voice note… Tap again to send');
      setTimeout(() => {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
          if (btn) btn.classList.remove('recording');
        }
      }, 60000);
    } catch (err) {
      console.warn('Microphone access failed:', err);
      renderSystem('🔒 Microphone access needed for voice notes');
      showToast('🔒 Mic blocked! Allow mic access in browser settings to send voice notes.');
    }
  }

  function cycleAudioSpeed(msgId, btn) {
    const player = btn.closest('.custom-audio-player');
    if (!player) return;
    const rates = [1, 1.5, 2];
    const currentText = btn.textContent.trim();
    let nextIdx = 0;
    if (currentText === '1x') nextIdx = 1;
    else if (currentText === '1.5x') nextIdx = 2;
    else nextIdx = 0;

    const rate = rates[nextIdx];
    btn.textContent = `${rate}x`;
    if (activeAudio) {
      activeAudio.playbackRate = rate;
    }
  }

  function spawnFloatingEmoji(emoji, targetEl) {
    if (!emoji) return;
    const floating = document.createElement('div');
    floating.className = 'floating-emoji';
    floating.textContent = emoji;
    if (targetEl) {
      const rect = targetEl.getBoundingClientRect();
      floating.style.left = `${rect.left + rect.width / 2 + (Math.random() * 20 - 10)}px`;
      floating.style.top = `${rect.top}px`;
    } else {
      floating.style.left = `${window.innerWidth / 2 + (Math.random() * 60 - 30)}px`;
      floating.style.top = `${window.innerHeight * 0.7}px`;
    }
    document.body.appendChild(floating);
    setTimeout(() => floating.remove(), 1200);
  }

  // ═══════════════════ REACTIONS ═══════════════════
  function react(messageId, emoji) {
    if (!joined) return;
    triggerHaptic(8);
    const el   = document.getElementById(`reactions-${messageId}`);
    const pill = el && [...el.querySelectorAll('.reaction-pill')].find((p) => p.textContent.startsWith(emoji));
    const already = pill && pill.classList.contains('mine');
    socket.emit('react', { messageId, emoji, add: !already });
  }

  function votePoll(messageId, option) { 
    triggerHaptic(8);
    socket.emit('poll-vote', { messageId, option }); 
  }

  // ═══════════════════ EMOJI / GAMES / GIF ═══════════════════
  function toggleEmojiPicker() {
    if (!els.emojiPicker.children.length) buildEmojiPicker();
    els.emojiPicker.classList.toggle('open');
    if (els.gameMenu) els.gameMenu.classList.remove('open');
    if (els.gifPanel) els.gifPanel.classList.remove('open');
    if (els.attachMenu) els.attachMenu.style.display = 'none';
    const sPanel = document.getElementById('stickerPanel');
    if (sPanel) sPanel.style.display = 'none';
  }
  function toggleGameMenu() {
    els.gameMenu.classList.toggle('open');
    els.emojiPicker.classList.remove('open');
    els.gifPanel.classList.remove('open');
    if (els.attachMenu) els.attachMenu.style.display = 'none';
  }
  function insertEmoji(emoji) { els.msgInput.value += emoji; els.msgInput.focus(); toggleSendMicIcons(); spawnFloatingEmoji(emoji, els.msgInput); }
  function startGame(type) { socket.emit('start-game', type); els.gameMenu.classList.remove('open'); }

  function toggleGifPanel() {
    const isOpen = els.gifPanel.classList.toggle('open');
    if (isOpen) {
      els.emojiPicker.classList.remove('open');
      els.gameMenu.classList.remove('open');
      if (els.attachMenu) els.attachMenu.style.display = 'none';
      if (!els.gifGrid.children.length) renderGifGrid(STICKERS);
    }
  }

  function renderGifGrid(stickers) {
    els.gifGrid.innerHTML = stickers.map((s) =>
      `<img src="${escapeHtml(s.url)}" loading="lazy" alt="sticker" onclick="BestieChat.sendSticker('${escapeHtml(s.url)}')" />`
    ).join('');
  }

  let gifSearchDebounce = null;

  async function searchGifs() {
    clearTimeout(gifSearchDebounce);
    gifSearchDebounce = setTimeout(async () => {
      const q = (els.gifSearch && els.gifSearch.value ? els.gifSearch.value.trim() : '');
      try {
        const endpoint = q ? `/api/gifs?q=${encodeURIComponent(q)}` : '/api/gifs?q=cute%20love';
        const res = await fetch(endpoint);
        if (res.ok) {
          const data = await res.json();
          if (data.results && data.results.length) {
            renderGifGrid(data.results);
            return;
          }
        }
      } catch (err) {
        console.warn('GIF search error:', err);
      }
      const filtered = STICKERS.filter((s) => !q || s.tags.some((t) => t.includes(q.toLowerCase())));
      renderGifGrid(filtered.length ? filtered : STICKERS);
    }, 200);
  }

  function sendSticker(url) {
    if (!joined) return;
    socket.emit('message', { type: 'image', url, text: '' });
    playSound('send');
    els.gifPanel.classList.remove('open');
    const panel = document.getElementById('stickerPanel');
    if (panel) panel.style.display = 'none';
  }

  // ═══════════════════ EXTRAS & GAMES ═══════════════════
  function toggleExtras()   { toggleModal('extrasPanel'); }
  function openExtras(tab = 'vibe') {
    showModal('extrasPanel');
    if (tab) switchExtrasTab(tab);
  }
  function openGamesHub()  { showModal('gamesHubModal'); }
  function closeGamesHub() { hideModal('gamesHubModal'); }
  function toggleFeelings() { els.feelingsPanel.classList.toggle('open'); }

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

  function renderTheirFeeling() {
    const others = Object.keys(feelings).filter((name) => name !== myName);
    if (!others.length) {
      els.theirFeeling.innerHTML = '';
      els.feelingGlow.classList.remove('active');
      return;
    }
    const [name, f] = others.map((n) => [n, feelings[n]]).sort((a, b) => b[1].updatedAt - a[1].updatedAt)[0];
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
    label.className  = 'pulse-label';
    label.textContent = fromLabel === 'You' ? '💓 Pulse sent' : `💓 ${fromLabel} is thinking of you`;
    els.pulseOverlay.appendChild(label);
    playSound('hug');
    setTimeout(() => { els.pulseOverlay.innerHTML = ''; }, 2500);
  }

  function toggleSound() {
    const on = localStorage.getItem('bestieSound') !== 'off';
    localStorage.setItem('bestieSound', on ? 'off' : 'on');
    if (els.soundBtn) els.soundBtn.classList.toggle('active', !on);
  }

  // ═══════════════════ ROOM META ═══════════════════
  function saveMood()     { socket.emit('update-mood', els.moodInput.value); }
  function saveJokes()    { if (els.jokesInput) socket.emit('update-jokes', els.jokesInput.value.split('\n').filter(Boolean)); }
  function saveCountdown(){ socket.emit('update-countdown', { label: els.countdownLabel.value, date: els.countdownDate.value || null }); updateCountdown({ label: els.countdownLabel.value, date: els.countdownDate.value }); }
  function saveNickname() {
    const nick = (els.nicknameInputChat ? els.nicknameInputChat.value : '').trim();
    if (nick) localStorage.setItem('bestieChatNickname', nick);
    if (nick && joined) socket.emit('update-nickname', nick);
  }

  // ═══════════════════ SEARCH ═══════════════════
  function toggleSearch() {
    searchActive = !searchActive;
    if (els.searchBar) els.searchBar.classList.toggle('open', searchActive);
    if (searchActive && els.searchInput) { els.searchInput.focus(); }
    else { clearSearch(); }
    const btn = document.getElementById('searchToggleBtn');
    if (btn) btn.classList.toggle('active', searchActive);
  }

  let searchMatches = [];
  let currentSearchMatchIndex = -1;

  function performSearch() {
    const q = (els.searchInput ? els.searchInput.value : '').toLowerCase().trim();
    const matchCountEl = document.getElementById('searchMatchCount');
    const prevBtn = document.getElementById('searchPrevBtn');
    const nextBtn = document.getElementById('searchNextBtn');
    
    searchMatches = [];
    currentSearchMatchIndex = -1;

    els.messages.querySelectorAll('.msg-wrap').forEach((wrap) => {
      const msgEl = wrap.querySelector('.msg');
      if (!msgEl) return;
      if (!q) {
        wrap.style.display = '';
        msgEl.querySelectorAll('mark.search-highlight').forEach((m) => {
          m.outerHTML = m.textContent;
        });
        return;
      }
      const textDivs = msgEl.querySelectorAll('div');
      let found = false;
      textDivs.forEach((div) => {
        if (div.querySelector('img,audio,video,canvas')) return;
        const raw = div.textContent || '';
        if (raw.toLowerCase().includes(q)) {
          found = true;
          const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
          div.innerHTML = div.innerHTML.replace(re, (m) => `<mark class="search-highlight">${m}</mark>`);
        }
      });
      if (found || (msgEl.textContent || '').toLowerCase().includes(q)) {
        wrap.style.display = '';
        searchMatches.push(wrap);
      } else {
        wrap.style.display = 'none';
      }
    });

    if (!q || !searchMatches.length) {
      if (matchCountEl) matchCountEl.style.display = 'none';
      if (prevBtn) prevBtn.style.display = 'none';
      if (nextBtn) nextBtn.style.display = 'none';
    } else {
      if (matchCountEl) {
        matchCountEl.textContent = `${searchMatches.length} match${searchMatches.length === 1 ? '' : 'es'}`;
        matchCountEl.style.display = 'inline';
      }
      if (prevBtn) prevBtn.style.display = 'inline-block';
      if (nextBtn) nextBtn.style.display = 'inline-block';
      navigateSearch(1);
    }
  }

  function navigateSearch(direction) {
    if (!searchMatches.length) return;
    currentSearchMatchIndex = (currentSearchMatchIndex + direction + searchMatches.length) % searchMatches.length;
    const targetWrap = searchMatches[currentSearchMatchIndex];
    if (targetWrap) {
      targetWrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
      targetWrap.classList.remove('nudge-shake');
      void targetWrap.offsetWidth;
      targetWrap.classList.add('nudge-shake');
      const matchCountEl = document.getElementById('searchMatchCount');
      if (matchCountEl) {
        matchCountEl.textContent = `${currentSearchMatchIndex + 1} / ${searchMatches.length}`;
      }
    }
  }

  function clearSearch() {
    if (els.searchInput) els.searchInput.value = '';
    searchMatches = [];
    currentSearchMatchIndex = -1;
    const matchCountEl = document.getElementById('searchMatchCount');
    const prevBtn = document.getElementById('searchPrevBtn');
    const nextBtn = document.getElementById('searchNextBtn');
    if (matchCountEl) matchCountEl.style.display = 'none';
    if (prevBtn) prevBtn.style.display = 'none';
    if (nextBtn) nextBtn.style.display = 'none';
    if (els.messages) {
      els.messages.querySelectorAll('.msg-wrap').forEach((w) => {
        w.style.display = '';
        w.querySelectorAll('mark.search-highlight').forEach((m) => {
          m.outerHTML = m.textContent;
        });
      });
    }
    if (els.searchBar) els.searchBar.classList.remove('open');
    searchActive = false;
    const btn = document.getElementById('searchToggleBtn');
    if (btn) btn.classList.remove('active');
  }

  // ═══════════════════ MODAL CONTROLLER HELPERS ═══════════════════
  function showModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.add('open');
    modal.style.display = 'flex';
  }

  function hideModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.remove('open');
    modal.style.display = 'none';
  }

  function toggleModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    if (modal.classList.contains('open') || modal.style.display === 'flex') {
      hideModal(id);
    } else {
      showModal(id);
    }
  }

  // ═══════════════════ CATEGORIZED MEDIA VAULT ═══════════════════
  let activeVaultTab = 'photos';

  function openGallery() {
    showModal('galleryModal');
    const firstTabBtn = document.querySelector('.vault-tab-btn');
    filterGallery('photos', firstTabBtn);
  }

  function closeGallery() {
    hideModal('galleryModal');
  }

  function filterGallery(type, btn) {
    activeVaultTab = type || 'photos';
    if (btn) {
      document.querySelectorAll('.vault-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    }
    const grid = document.getElementById('galleryGrid');
    const empty = document.getElementById('galleryEmpty');
    if (!grid) return;
    grid.innerHTML = '';

    let items = [];
    if (type === 'photos') {
      items = allMessagesCached.filter(m => !m.deleted && (m.type === 'image' || m.type === 'media-group' || (m.url && m.url.match(/\.(jpg|jpeg|png|webp|gif)/i))));
      if (!items.length) {
        if (empty) empty.style.display = 'block';
        return;
      }
      if (empty) empty.style.display = 'none';
      grid.style.display = 'grid';
      grid.style.gridTemplateColumns = 'repeat(3, 1fr)';
      grid.style.gap = '8px';
      
      const photoUrls = [];
      items.forEach(m => {
        if (m.type === 'media-group' && Array.isArray(m.items)) {
          m.items.forEach(it => { if (it.url) photoUrls.push(it.url); });
        } else if (m.url) {
          photoUrls.push(m.url);
        }
      });
      grid.innerHTML = photoUrls.map(url => `
        <img src="${escapeHtml(url)}" loading="lazy" alt="photo" style="width:100%; aspect-ratio:1; object-fit:cover; border-radius:12px; cursor:pointer;" onclick="BestieChat.openLightbox('${escapeHtml(url)}')" />
      `).join('');
    } else if (type === 'docs') {
      items = allMessagesCached.filter(m => !m.deleted && (m.type === 'document' || (m.url && m.url.match(/\.(pdf|doc|docx|xls|xlsx|txt|csv|zip)/i))));
      if (!items.length) { if (empty) empty.style.display = 'block'; return; }
      if (empty) empty.style.display = 'none';
      grid.style.display = 'flex';
      grid.style.flexDirection = 'column';
      grid.style.gap = '8px';
      grid.innerHTML = items.map(m => `
        <a class="doc-msg-card" href="${escapeHtml(m.url)}" download="${escapeHtml(m.docName || 'document')}" target="_blank" rel="noopener noreferrer" style="width:100%; max-width:none; background:var(--surface);">
          <div class="doc-msg-icon">📄</div>
          <div class="doc-msg-info">
            <div class="doc-msg-name">${escapeHtml(m.docName || 'Document')}</div>
            <div class="doc-msg-size">${formatBytes(m.docSize || 0)} · ${new Date(m.time).toLocaleDateString()}</div>
          </div>
          <div class="doc-msg-dl">⬇️</div>
        </a>
      `).join('');
    } else if (type === 'voice') {
      items = allMessagesCached.filter(m => !m.deleted && m.type === 'voice');
      if (!items.length) { if (empty) empty.style.display = 'block'; return; }
      if (empty) empty.style.display = 'none';
      grid.style.display = 'flex';
      grid.style.flexDirection = 'column';
      grid.style.gap = '8px';
      grid.innerHTML = items.map(m => `
        <div style="background:var(--surface); border:1px solid var(--border-soft); border-radius:14px; padding:10px 14px; display:flex; align-items:center; justify-content:space-between;">
          <div style="display:flex; align-items:center; gap:8px;">
            <button onclick="new Audio('${escapeHtml(m.url)}').play()" style="background:var(--accent-glow); border:none; color:var(--accent); width:32px; height:32px; border-radius:50%; cursor:pointer;">▶</button>
            <span style="font-size:13px; font-weight:600;">🎤 Voice Note (${m.duration || '0'}s)</span>
          </div>
          <span style="font-size:11px; color:var(--muted);">${new Date(m.time).toLocaleDateString()}</span>
        </div>
      `).join('');
    } else if (type === 'videos') {
      items = allMessagesCached.filter(m => !m.deleted && m.type === 'video-note');
      if (!items.length) { if (empty) empty.style.display = 'block'; return; }
      if (empty) empty.style.display = 'none';
      grid.style.display = 'grid';
      grid.style.gridTemplateColumns = 'repeat(3, 1fr)';
      grid.style.gap = '8px';
      grid.innerHTML = items.map(m => `
        <div style="position:relative; width:100%; aspect-ratio:1; border-radius:50%; overflow:hidden; border:2px solid var(--accent);">
          <video src="${escapeHtml(m.url)}" autoplay loop muted playsinline style="width:100%; height:100%; object-fit:cover;"></video>
        </div>
      `).join('');
    } else if (type === 'links') {
      items = allMessagesCached.filter(m => !m.deleted && m.text && m.text.match(/https?:\/\/[^\s]+/i));
      if (!items.length) { if (empty) empty.style.display = 'block'; return; }
      if (empty) empty.style.display = 'none';
      grid.style.display = 'flex';
      grid.style.flexDirection = 'column';
      grid.style.gap = '8px';
      grid.innerHTML = items.map(m => {
        const urlMatch = m.text.match(/https?:\/\/[^\s]+/i);
        const url = urlMatch ? urlMatch[0] : '';
        return `
          <a class="vault-link-item" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">
            <span style="font-size:20px;">🔗</span>
            <div style="flex:1; overflow:hidden;">
              <div style="font-size:13px; font-weight:600; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${escapeHtml(url)}</div>
              <div style="font-size:11px; color:var(--muted);">${escapeHtml(getDisplayName(m.user))} · ${new Date(m.time).toLocaleDateString()}</div>
            </div>
          </a>
        `;
      }).join('');
    } else if (type === 'starred') {
      items = allMessagesCached.filter(m => !m.deleted && m.starredBy && m.starredBy.includes(myName));
      if (!items.length) { if (empty) empty.style.display = 'block'; return; }
      if (empty) empty.style.display = 'none';
      grid.style.display = 'flex';
      grid.style.flexDirection = 'column';
      grid.style.gap = '8px';
      grid.innerHTML = items.map(m => {
        const label = m.type === 'image' ? '📸 Photo' : (m.type === 'voice' ? '🎤 Voice note' : (m.type === 'video-note' ? '⭕ Video note' : decryptE2EE(m.text || '')));
        return `
          <div class="starred-card" onclick="BestieChat.closeGallery(); BestieChat.scrollToMessage('${m.id}')">
            <div class="starred-card-meta">
              <span>${escapeHtml(getDisplayName(m.user))}</span>
              <span>${new Date(m.time).toLocaleDateString()}</span>
            </div>
            <div class="starred-card-text">${escapeHtml(label)}</div>
          </div>
        `;
      }).join('');
    }
  }

  // ═══════════════════ TIME CAPSULE ═══════════════════
  function openTimeCapsuleModal() {
    if (els.attachMenu) els.attachMenu.style.display = 'none';
    setCapsulePreset(1);
    showModal('timeCapsuleModal');
  }

  function closeTimeCapsuleModal() {
    hideModal('timeCapsuleModal');
  }

  function setCapsulePreset(days) {
    const d = new Date();
    d.setDate(d.getDate() + Number(days || 1));
    const input = document.getElementById('capsuleDateInput');
    if (input) {
      const pad = (n) => String(n).padStart(2, '0');
      input.value = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
  }

  function sendTimeCapsule() {
    const textInput = document.getElementById('capsuleTextInput');
    const dateInput = document.getElementById('capsuleDateInput');
    if (!textInput || !textInput.value.trim()) {
      showToast('Please write a capsule message!');
      return;
    }
    const unlockTime = dateInput && dateInput.value ? new Date(dateInput.value).getTime() : (Date.now() + 86400000);
    if (unlockTime <= Date.now()) {
      showToast('Please pick a future unlock date!');
      return;
    }
    socket.emit('message', {
      type: 'time-capsule',
      text: textInput.value.trim(),
      unlockAt: unlockTime
    });
    closeTimeCapsuleModal();
    textInput.value = '';
    showToast('⏳ Time Capsule sealed and sent!');
    playSound('send');
  }

  function openLightbox(url) {
    if (!els.lightboxImg || !els.lightbox) return;
    els.lightboxImg.src = url;
    if (els.lightboxDownloadBtn) els.lightboxDownloadBtn.href = url;
    els.lightbox.style.display = 'flex';
  }

  function closeLightbox() {
    if (els.lightbox) els.lightbox.style.display = 'none';
    if (els.lightboxImg) els.lightboxImg.src = '';
  }

  // ═══════════════════ SECRET MODE ═══════════════════
  function toggleSecretMode() {
    secretMode = !secretMode;
    if (els.secretToggle) els.secretToggle.classList.toggle('active', secretMode);
    els.secretIndicator.style.display = secretMode ? 'block' : 'none';
  }

  // ═══════════════════ DOODLE PAD ═══════════════════
  function openDoodle() {
    showModal('doodleModal');
    if (!doodleCtx) initDoodleCanvas();
  }

  function closeDoodle() {
    hideModal('doodleModal');
  }

  function initDoodleCanvas() {
    const canvas = els.doodleCanvas;
    const dpr = window.devicePixelRatio || 1;
    const w   = canvas.parentElement.clientWidth - 0;
    const h   = Math.min(300, window.innerHeight * 0.35);
    canvas.width  = w * dpr;
    canvas.height = h * dpr;
    canvas.style.height = `${h}px`;
    doodleCtx = canvas.getContext('2d');
    doodleCtx.scale(dpr, dpr);
    doodleCtx.lineCap     = 'round';
    doodleCtx.lineJoin    = 'round';
    doodleCtx.strokeStyle = doodleColor;
    doodleCtx.lineWidth   = doodleSize;

    function getPos(e) {
      const rect = canvas.getBoundingClientRect();
      const src  = e.touches ? e.touches[0] : e;
      return { x: src.clientX - rect.left, y: src.clientY - rect.top };
    }

    function startDraw(e) {
      e.preventDefault();
      doodleDrawing = true;
      const { x, y } = getPos(e);
      doodleLastX = x; doodleLastY = y;
      doodleCtx.beginPath();
      doodleCtx.arc(x, y, doodleCtx.lineWidth / 2, 0, Math.PI * 2);
      doodleCtx.fillStyle = doodleTool === 'eraser' ? '#1a1a2e' : doodleColor;
      doodleCtx.fill();
    }

    function draw(e) {
      e.preventDefault();
      if (!doodleDrawing) return;
      const { x, y } = getPos(e);
      doodleCtx.strokeStyle = doodleTool === 'eraser' ? '#1a1a2e' : doodleColor;
      doodleCtx.lineWidth   = doodleTool === 'eraser' ? doodleSize * 3 : doodleSize;
      doodleCtx.beginPath();
      const midX = (doodleLastX + x) / 2;
      const midY = (doodleLastY + y) / 2;
      doodleCtx.moveTo(doodleLastX, doodleLastY);
      doodleCtx.quadraticCurveTo(doodleLastX, doodleLastY, midX, midY);
      doodleCtx.lineTo(x, y);
      doodleCtx.stroke();
      doodleLastX = x; doodleLastY = y;
    }

    function endDraw() { doodleDrawing = false; }

    canvas.addEventListener('mousedown',  startDraw);
    canvas.addEventListener('mousemove',  draw);
    canvas.addEventListener('mouseup',    endDraw);
    canvas.addEventListener('mouseleave', endDraw);
    canvas.addEventListener('touchstart', startDraw, { passive: false });
    canvas.addEventListener('touchmove',  draw,      { passive: false });
    canvas.addEventListener('touchend',   endDraw);
  }

  function setDoodleColor(color, btn) {
    doodleColor = color;
    document.querySelectorAll('.doodle-color').forEach((b) => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    if (doodleCtx) { doodleCtx.strokeStyle = color; doodleTool = 'brush'; }
    const brushBtn = document.getElementById('doodleBrushBtn');
    const eraserBtn = document.getElementById('doodleEraserBtn');
    if (brushBtn) brushBtn.classList.add('active');
    if (eraserBtn) eraserBtn.classList.remove('active');
  }

  function setDoodleTool(tool, btn) {
    doodleTool = tool;
    document.querySelectorAll('.doodle-tool').forEach((b) => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
  }

  function setDoodleSize(val) { doodleSize = parseInt(val, 10); }

  function clearDoodle() {
    if (!doodleCtx) return;
    const canvas = els.doodleCanvas;
    doodleCtx.clearRect(0, 0, canvas.width, canvas.height);
  }

  async function sendDoodle() {
    if (!joined || !doodleCtx) return;
    const canvas = els.doodleCanvas;
    // Check if canvas is blank
    const data = doodleCtx.getImageData(0, 0, canvas.width, canvas.height).data;
    const blank = !data.some((v) => v !== 0);
    if (blank) { renderSystem('Draw something first! ✏️'); return; }

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const { url } = await uploadFile(reader.result, 'image/png', 'image');
          socket.emit('message', { type: 'image', url, text: '✏️ Doodle', replyTo: replyingTo });
          cancelReply();
          closeDoodle();
          clearDoodle();
          playSound('send');
        } catch { renderSystem('Could not send doodle — try again'); }
      };
      reader.readAsDataURL(blob);
    }, 'image/png');
  }

  // ═══════════════════ EMOJI PICKER INIT ═══════════════════
  function buildEmojiPicker() {
    els.emojiPicker.innerHTML = EMOJIS.map((e) =>
      `<button type="button" onclick="BestieChat.insertEmoji('${e}')">${e}</button>`
    ).join('');
  }

  // ═══════════════════ SOCKET.IO ═══════════════════
  function initSocket() {
    if (socket) return;
    if (typeof io === 'undefined') {
      console.error('Socket.io library not loaded. Is the server running?');
      setConnected(false);
      els.loginError.textContent = 'Cannot connect to server. Is the server running?';
      return;
    }
    socket = io({ 
      reconnection: true, reconnectionAttempts: Infinity,
      auth: { token: authToken }
    });
    let _reconnectDelay = 1000;
    socket.io.on('reconnect_attempt', () => {
      _reconnectDelay = Math.min(_reconnectDelay * 2, 16000);
      socket.io.opts.reconnectionDelay = _reconnectDelay;
    });
    socket.io.on('reconnect', () => { _reconnectDelay = 1000; });

    socket.on('connect', () => {
      setConnected(true);
      const banner = document.getElementById('offlineBanner');
      if (banner) banner.style.display = 'none';
      if (joined || (myName && myRoom)) doSocketJoin();
      flushOfflineQueue();
      flushOutboxQueue();
    });

    socket.on('connect_error', (err) => {
      console.warn('Socket connect_error:', err && err.message);
      setConnected(false);
    });

    socket.on('disconnect', () => {
      setConnected(false);
      const banner = document.getElementById('offlineBanner');
      if (banner) banner.style.display = 'flex';
    });

    socket.on('join-error', (msg) => {
      if (els.loginError) els.loginError.textContent = msg;
      joined = false;
      // Override !important inline styles via setAttribute
      if (els.chat) els.chat.setAttribute('style', 'display:none !important');
      if (els.login) els.login.setAttribute('style', 'display:flex !important; flex-direction:column; align-items:center;');
    });

    socket.on('joined', (payload) => {
      joined = true;
      myProfile = payload.profile || {};
      allImageMessages = [];
      if (els.login) els.login.setAttribute('style', 'display:none !important;');
      if (els.chat) els.chat.setAttribute('style', 'display:flex !important;');
      if (els.motdBanner) {
        if (payload.motd && payload.motd.trim()) {
          els.motdBanner.textContent = `✨ ${payload.motd.trim()}`;
          els.motdBanner.style.display = 'block';
        } else {
          els.motdBanner.textContent = '';
          els.motdBanner.style.display = 'none';
        }
      }
      if (els.moodInput) els.moodInput.value  = payload.mood  || '';
      if (els.jokesInput) els.jokesInput.value = (payload.jokes || []).join('\n');
      if (payload.weatherCity) {
        localStorage.setItem('bestieWeatherCity', payload.weatherCity);
        const cityInput = document.getElementById('weatherCityInput');
        if (cityInput) cityInput.value = payload.weatherCity;
        fetchWeatherForCity(payload.weatherCity);
      }
      if (payload.countdown) {
        if (els.countdownLabel) els.countdownLabel.value = payload.countdown.label || '';
        if (els.countdownDate) els.countdownDate.value  = payload.countdown.date ? payload.countdown.date.slice(0, 16) : '';
        updateCountdown(payload.countdown);
      }
      currentStreakDays = (payload.streak && payload.streak.days) || 0;
      updateStreak(payload.streak);
      updateBestieHeaderState(null, payload.lastSeen);

      feelingsPalette = payload.feelingsPalette || {};
      feelings        = payload.feelings        || {};
      myFeelingKey    = feelings[myName] ? feelings[myName].key : null;
      buildFeelingsGrid();
      renderTheirFeeling();

      // Pre-populate profiles
      (payload.history || []).forEach((m) => { if (m.user) profiles[m.user] = profiles[m.user] || {}; });

      allMessagesCached = payload.history || [];
      clearRoomHistoryInOfflineDB(myRoom).then(() => {
        saveMessagesHistoryToOfflineDB(allMessagesCached);
      });
      if (els.messages) els.messages.innerHTML = '';
      lastDateLabel = '';
      allMessagesCached.forEach((m) => renderMessage(m, true));
      if (els.msgInput) els.msgInput.focus();
      restoreDraft();
      startIntervals();
      clearUnread();
      setTimeout(confetti, 300);

      // Restore pinned message
      updatePinnedBanner(payload.pinnedMsg || null);

      // Restore read receipts
      applyReadReceipts(payload.readBy || {});

      // Restore nickname in chat extras panel
      const savedNick = localStorage.getItem('bestieChatNickname') || '';
      if (els.nicknameInputChat) els.nicknameInputChat.value = savedNick;

      // Restore notebook states
      sharedDiary = payload.diary || [];
      renderDiaryList(sharedDiary);
      sharedBucketList = payload.bucketList || [];
      renderBucketList(sharedBucketList);
      sharedCalendar = payload.calendar || [];
      renderCalendarList(sharedCalendar);
      sharedGlossary = payload.glossary || [];
      renderGlossaryList(sharedGlossary);
      sharedBonsai = payload.bonsai || { growth: 0, lastWatered: null };
      renderBonsai(sharedBonsai);
      renderHeatmap();

      // Premium dashboard features
      if (payload.dailyQuestionState) renderDailyQuestionCard(payload.dailyQuestionState);
      else fetchDailyQuestion();
      updateScoreboardDisplay(payload.gameScores || { wins: {}, losses: {} });
      updateE2EEFingerprint();
      flushOutboxQueue();
    });

    socket.on('daily-answer-update', (state) => {
      renderDailyQuestionCard(state);
      if (state && state.revealed) {
        confetti();
        playSound('milestone');
      }
    });

    socket.on('message', (msg) => {
      if (msg.clientMsgId) {
        const pendingWrap = document.querySelector(`.msg-wrap[data-id="${msg.clientMsgId}"]`);
        if (pendingWrap) {
          pendingWrap.dataset.id = msg.id;
          pendingWrap.classList.remove('is-pending');
          const pendingTick = pendingWrap.querySelector('.msg-status-ticks');
          if (pendingTick) {
            pendingTick.id = `tick-${msg.id}`;
            pendingTick.className = 'msg-status-ticks sent';
            pendingTick.innerHTML = `<svg viewBox="0 0 16 15" width="14" height="13" fill="none"><path d="M12.01 3.316l-7.92 8.56a.91.91 0 01-.67.3.91.91 0 01-.67-.3L.3 8.35a.96.96 0 010-1.34.93.93 0 011.33 0l2.79 2.99 7.26-7.85a.93.93 0 011.33 0 .96.96 0 010 1.166z" fill="currentColor"/></svg>`;
          }
          outboxQueue = outboxQueue.filter(item => item.clientMsgId !== msg.clientMsgId);
          saveOutboxQueue();
          allMessagesCached.push(msg);
          saveMessageToOfflineDB(msg);
          renderHeatmap();
          return;
        }
      }

      allMessagesCached.push(msg);
      saveMessageToOfflineDB(msg);
      renderMessage(msg);
      renderHeatmap();
      if (msg.user !== myName) {
        if (document.hidden) {
          unreadCount++;
          updateUnreadBadge();
          sendDesktopNotification(getDisplayName(msg.user), {
            body: msg.type === 'hug'   ? 'sent you a hug 💌'   :
                  msg.type === 'image' ? 'sent a photo 📸'      :
                  msg.type === 'media-group' ? 'sent photos 📸' :
                  msg.type === 'document' ? `sent a document: ${msg.docName || ''} 📄` :
                  msg.type === 'voice' ? 'sent a voice note 🎤' :
                  (msg.text || 'New message'),
            icon: '/icon-192.png'
          });
          socket.emit('mark-delivered', { messageId: msg.id });
        }
      } else {
        localStorage.setItem('bestieLastMsgDate', new Date().toISOString().slice(0, 10));
      }
    });

    socket.on('message-ack', ({ clientMsgId, id }) => {
      if (clientMsgId) {
        const pendingWrap = document.querySelector(`.msg-wrap[data-id="${clientMsgId}"]`);
        if (pendingWrap) {
          pendingWrap.dataset.id = id;
          pendingWrap.classList.remove('is-pending');
          const pendingTick = pendingWrap.querySelector('.msg-status-ticks');
          if (pendingTick) {
            pendingTick.id = `tick-${id}`;
            pendingTick.className = 'msg-status-ticks sent';
            pendingTick.innerHTML = `<svg viewBox="0 0 16 15" width="14" height="13" fill="none"><path d="M12.01 3.316l-7.92 8.56a.91.91 0 01-.67.3.91.91 0 01-.67-.3L.3 8.35a.96.96 0 010-1.34.93.93 0 011.33 0l2.79 2.99 7.26-7.85a.93.93 0 011.33 0 .96.96 0 010 1.166z" fill="currentColor"/></svg>`;
          }
        }
        outboxQueue = outboxQueue.filter(item => item.clientMsgId !== clientMsgId);
        saveOutboxQueue();
      }
    });

    socket.on('view-once-opened', ({ messageId }) => {
      const capsule = document.querySelector(`.msg-wrap[data-id="${messageId}"] .view-once-capsule`);
      if (capsule) {
        capsule.classList.add('opened');
        capsule.onclick = null;
        capsule.innerHTML = `<span class="view-once-num">1</span><span>Photo (Opened)</span>`;
      }
      const m = allMessagesCached.find(item => item.id === messageId);
      if (m) { m.opened = true; m.url = ''; }
    });

    socket.on('messages-read', ({ messageIds }) => {
      (messageIds || []).forEach(id => {
        const tick = document.getElementById(`tick-${id}`);
        if (tick) {
          tick.textContent = '✓✓';
          tick.className = 'read-tick read';
        }
      });
    });

    socket.on('message-delivered', ({ messageId }) => {
      const tick = document.getElementById(`tick-${messageId}`);
      if (tick && !tick.classList.contains('read')) {
        tick.textContent = '✓✓';
        tick.className = 'read-tick delivered';
      }
    });

    socket.on('message-edited', ({ messageId, text, editedAt }) => {
      const msg = allMessagesCached.find(m => m.id === messageId);
      if (msg) {
        msg.text = text;
        msg.editedAt = editedAt;
        saveMessageToOfflineDB(msg);
      }
      const wrap = els.messages.querySelector(`[data-id="${messageId}"]`);
      if (!wrap) return;
      const msgEl = wrap.querySelector('.msg');
      if (!msgEl) return;
      const textEl = msgEl.querySelector('.msg-text') || null;
      if (textEl) { textEl.textContent = text; }
      let editTag = msgEl.querySelector('.edited-tag');
      if (!editTag) { editTag = document.createElement('div'); editTag.className = 'edited-tag'; msgEl.appendChild(editTag); }
      editTag.textContent = 'edited';
    });

    socket.on('message-deleted', ({ messageId }) => {
      const msg = allMessagesCached.find(m => m.id === messageId);
      if (msg) {
        msg.deleted = true;
        saveMessageToOfflineDB(msg);
      }
      const wrap = els.messages.querySelector(`[data-id="${messageId}"]`);
      if (!wrap) return;
      const msgEl = wrap.querySelector('.msg');
      if (!msgEl) return;
      msgEl.className = `msg deleted ${msgEl.classList.contains('me') ? 'me' : 'them'}`;
      msgEl.innerHTML = '🗑️ Message deleted';
      wrap.querySelector('.react-bar')?.remove();
      wrap.querySelector('.reactions')?.remove();
    });

    socket.on('system',       renderSystem);
    socket.on('milestone',    renderMilestone);
    socket.on('game-prompt',  renderGamePrompt);

    socket.on('reaction-update', ({ messageId, reactions }) => updateReactions(messageId, reactions));

    socket.on('poll-update', ({ messageId, votes }) => {
      const wrap = els.messages.querySelector(`[data-id="${messageId}"]`);
      if (!wrap) return;
      wrap.querySelectorAll('.poll-opt').forEach((btn) => {
        btn.classList.toggle('voted', votes[myName] === btn.dataset.option);
      });
    });

    socket.on('streak-update', (streak) => { currentStreakDays = (streak && streak.days) || 0; updateStreak(streak); confetti(); });

    socket.on('presence', ({ users, profiles: profs, lastSeen }) => {
      (profs || []).forEach((p) => { profiles[p.name] = p; });
      updateBestieHeaderState(users, lastSeen);
    });

    socket.on('presence-status-update', ({ user, status }) => {
      if (user === myName) return;
      const hStatusEl = document.getElementById('headerBestieStatus');
      const bStatusEl = els.bestieStatus;
      if (!hStatusEl && !bStatusEl) return;
      
      let text = 'Online';
      if (status === 'typing') text = 'typing…';
      else if (status === 'recording-audio') text = 'recording audio…';
      else if (status === 'recording-video') text = 'recording video note…';
      else if (status === 'uploading-media') text = 'sending photo…';
      
      if (hStatusEl) {
        hStatusEl.textContent = text;
        hStatusEl.classList.add('online');
      }
      if (bStatusEl) {
        bStatusEl.textContent = text;
        bStatusEl.classList.add('online');
      }
    });

    socket.on('message-starred', ({ messageId, starredBy }) => {
      const msg = allMessagesCached.find(m => m.id === messageId);
      if (msg) {
        msg.starredBy = starredBy || [];
        saveMessageToOfflineDB(msg);
      }
      const wrap = els.messages.querySelector(`[data-id="${messageId}"]`);
      if (wrap) {
        let badge = wrap.querySelector('.msg-star-badge');
        const isStarred = (starredBy || []).includes(myName);
        if (isStarred && !badge) {
          badge = document.createElement('span');
          badge.className = 'msg-star-badge';
          badge.title = 'Starred';
          badge.textContent = '⭐';
          const tickContainer = wrap.querySelector('div:last-child');
          if (tickContainer) tickContainer.prepend(badge);
        } else if (!isStarred && badge) {
          badge.remove();
        }
      }
    });

    socket.on('typing', (name) => {
      if (name === getDisplayName(myName) || name === myName) return;
      // Show animated typing bubble
      let bubble = document.getElementById('typingBubble');
      if (!bubble) {
        bubble = document.createElement('div');
        bubble.id = 'typingBubble';
        bubble.className = 'typing-bubble';
        bubble.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
        els.messages.appendChild(bubble);
      }
      bubble.style.display = 'flex';
      scrollBottom();
      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => {
        if (bubble) bubble.style.display = 'none';
        updateBestieHeaderState();
      }, 2500);
    });

    socket.on('feelings-update', (updated) => {
      feelings = updated || {};
      myFeelingKey = feelings[myName] ? feelings[myName].key : myFeelingKey;
      buildFeelingsGrid();
      renderTheirFeeling();
    });

    socket.on('empathy-pulse', (data) => {
      if (!data) return;
      if (data.from === getDisplayName(myName) || data.from === myName) return;
      playPulseAnimation(data.from);
      sendDesktopNotification(`${data.from} 💓`, { body: 'sent you an empathy pulse', icon: '/icon-192.png' });
    });

    socket.on('mood-update',      (mood)  => { if (els.moodInput) els.moodInput.value = mood || ''; });
    socket.on('jokes-update',     (jokes) => { if (els.jokesInput) els.jokesInput.value = (jokes || []).join('\n'); });
    socket.on('weather-update',   (city)  => {
      localStorage.setItem('bestieWeatherCity', city);
      const cityInput = document.getElementById('weatherCityInput');
      if (cityInput) cityInput.value = city || '';
      if (city) fetchWeatherForCity(city);
    });
    socket.on('countdown-update', (cd)    => {
      if (!cd) return;
      if (els.countdownLabel) els.countdownLabel.value = cd.label || '';
      if (els.countdownDate)  els.countdownDate.value  = cd.date ? cd.date.slice(0, 16) : '';
      updateCountdown(cd);
    });

    socket.on('pinned-update', ({ messageId, msg }) => {
      updatePinnedBanner(msg || null);
    });

    socket.on('pad-updated', ({ text }) => {
      const pad = document.getElementById('sharedPadInput');
      if (pad && document.activeElement !== pad) pad.value = text || '';
    });

    socket.on('receipt-update', (rb) => { applyReadReceipts(rb); });

    // WebRTC calling signaling listeners
    socket.on('call-invite', ({ from, offer, type }) => {
      webrtcCallOffer = offer;
      callType = type;
      
      const overlay = document.getElementById('callOverlay');
      const incomingControls = document.getElementById('incomingControls');
      const activeControls = document.getElementById('activeCallControls');
      const statusText = document.getElementById('callStatusText');
      const callAvatar = document.getElementById('callAvatar');
      const callName = document.getElementById('callName');
      const audioView = document.getElementById('callAudioView');
      const videoGrid = document.getElementById('videoGrid');
      const flipCamBtn = document.getElementById('flipCamBtn');
      const audioWaves = document.getElementById('callAudioWaves');
      
      if (overlay) overlay.style.display = 'flex';
      if (incomingControls) incomingControls.style.display = 'flex';
      if (activeControls) activeControls.style.display = 'none';
      if (statusText) statusText.textContent = `Incoming ${type === 'video' ? 'Video' : 'Voice'} Call…`;
      if (audioWaves) audioWaves.style.display = 'none';
      
      const p = getProfile(from);
      if (callAvatar) callAvatar.textContent = p.avatar || '🐱';
      if (callName) callName.textContent = p.nickname || from;
      
      if (type === 'video') {
        if (audioView) audioView.style.display = 'none';
        if (videoGrid) videoGrid.style.display = 'block';
        if (flipCamBtn) flipCamBtn.style.display = 'flex';
      } else {
        if (audioView) audioView.style.display = 'flex';
        if (videoGrid) videoGrid.style.display = 'none';
        if (flipCamBtn) flipCamBtn.style.display = 'none';
      }
      
      if (navigator.vibrate) navigator.vibrate([300, 500, 300, 500, 300]);
      playSound('receive');
    });

    socket.on('call-accept', ({ answer }) => {
      if (webrtcConn) {
        webrtcConn.setRemoteDescription(new RTCSessionDescription(answer)).catch(console.error);
        const statusText = document.getElementById('callStatusText');
        const audioWaves = document.getElementById('callAudioWaves');
        if (statusText) statusText.textContent = 'Connected 🟢';
        if (audioWaves) audioWaves.style.display = 'flex';
        startCallTimer();
      }
    });

    socket.on('call-decline', () => {
      renderSystem('Call declined by bestie');
      endCall(true);
    });

    socket.on('call-candidate', ({ candidate }) => {
      if (webrtcConn) {
        webrtcConn.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.error);
      }
    });

    socket.on('call-hangup', () => {
      renderSystem('Call ended');
      endCall(true);
    });

    socket.on('diary-update', (diary) => {
      sharedDiary = diary;
      renderDiaryList(diary);
    });

    socket.on('bucketlist-update', (list) => {
      sharedBucketList = list;
      renderBucketList(list);
    });

    socket.on('glossary-update', (words) => {
      sharedGlossary = words;
      renderGlossaryList(words);
      refreshMessagesLayout();
    });

    socket.on('bonsai-update', (state) => {
      sharedBonsai = state;
      renderBonsai(state);
    });

    socket.on('draw-stroke', (data) => {
      drawCoDrawStrokeLocal(data);
    });

    socket.on('draw-clear', () => {
      clearCoDraw(false);
    });

    socket.on('watch-sync', (data) => {
      syncWatchTogetherPlayer(data);
    });

    socket.on('game-move', (data) => {
      handleTTTMoveLocal(data);
    });

    socket.on('nudge', (data) => {
      triggerScreenNudge(data.from);
    });

    socket.on('haptic-touch', (data) => {
      if (data.from !== myName) {
        triggerHapticPulseLocal();
      }
    });

    socket.on('reaction-update', ({ messageId, reactions }) => {
      const msg = allMessagesCached.find(m => m.id === messageId);
      if (msg) {
        msg.reactions = reactions;
        const lastReact = Object.keys(reactions).pop();
        if (lastReact) {
          triggerEmojiReactionBurst(messageId, lastReact);
        }
      }
      const el = document.getElementById(`reactions-${messageId}`);
      if (el) el.innerHTML = renderReactions({ id: messageId, reactions });
    });

    socket.on('rate-limited', (data) => {
      showToast(data.message || 'Slow down! 🌿');
    });

    socket.on('score-update', (scores) => {
      updateScoreboardDisplay(scores);
    });

    socket.on('pictionary-start', (data) => {
      openCoDraw();
      showToast(`🎨 Pictionary: ${data.drawer} is drawing!`);
    });

    socket.on('pictionary-word', (data) => {
      showToast(`✏️ Secret Word: "${data.word}" — Start drawing!`);
    });

    socket.on('pictionary-correct', (data) => {
      confetti();
      playSound('milestone');
      showToast(`🏆 ${data.winner} guessed the word: "${data.word}"!`);
      closeCoDraw();
    });

    socket.on('history-cleared', () => {
      allMessagesCached = [];
      clearRoomHistoryInOfflineDB(myRoom);
      if (els.messages) els.messages.innerHTML = '';
      showToast('🧹 Chat history was cleared');
    });

    socket.on('password-updated', (data) => {
      showToast(data.hasPassword ? '🔒 Room password saved' : '🔓 Password removed');
    });

    socket.on('disappearing-updated', (data) => {
      const label = data.durationMs === 3600000 ? '1 Hour' : data.durationMs === 86400000 ? '24 Hours' : data.durationMs === 604800000 ? '7 Days' : 'Off';
      showToast(`⏱️ Disappearing messages set to: ${label}`);
    });

    socket.on('c4-move', (data) => {
      if (data && typeof data.col === 'number') {
        dropConnect4Token(data.col, false);
      }
    });

    socket.on('profile-updated', ({ username, profile }) => {
      if (username) {
        profiles[username] = Object.assign(profiles[username] || {}, profile);
        updateBestieHeaderState();
        refreshMessagesLayout();
      }
    });

    socket.on('calendar-update', (cal) => {
      sharedCalendar = cal || [];
      renderCalendarList(sharedCalendar);
    });
  }

  // ═══════════════════ WEBRTC CALLING ═══════════════════
  async function getUserMediaStream(type) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Camera/Microphone is not supported in this browser or origin (requires HTTPS).');
    }
    const audioConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: 48000
    };
    if (type === 'video') {
      try {
        return await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } });
      } catch (e1) {
        try {
          return await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: true });
        } catch (e2) {
          showToast('📹 Camera permission denied or unavailable. Continuing with Voice Call.');
          return await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false });
        }
      }
    } else {
      return await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false });
    }
  }

  let callTimerInterval = null;
  let callStartTime = 0;
  let currentFacingMode = 'user';

  function startCallTimer() {
    stopCallTimer();
    callStartTime = Date.now();
    const timerEl = document.getElementById('callTimer');
    if (timerEl) {
      timerEl.style.display = 'block';
      timerEl.textContent = '00:00';
    }
    callTimerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
      const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
      const s = String(elapsed % 60).padStart(2, '0');
      if (timerEl) timerEl.textContent = `${m}:${s}`;
    }, 1000);
  }

  function stopCallTimer() {
    if (callTimerInterval) {
      clearInterval(callTimerInterval);
      callTimerInterval = null;
    }
    const timerEl = document.getElementById('callTimer');
    if (timerEl) {
      timerEl.style.display = 'none';
      timerEl.textContent = '00:00';
    }
  }

  async function startCall(type) {
    if (!joined) return;
    callType = type;
    
    const overlay = document.getElementById('callOverlay');
    const incomingControls = document.getElementById('incomingControls');
    const activeControls = document.getElementById('activeCallControls');
    const statusText = document.getElementById('callStatusText');
    const audioView = document.getElementById('callAudioView');
    const videoGrid = document.getElementById('videoGrid');
    const flipCamBtn = document.getElementById('flipCamBtn');
    const audioWaves = document.getElementById('callAudioWaves');
    
    if (overlay) overlay.style.display = 'flex';
    if (incomingControls) incomingControls.style.display = 'none';
    if (activeControls) activeControls.style.display = 'flex';
    if (statusText) statusText.textContent = 'Calling…';
    if (audioWaves) audioWaves.style.display = 'none';
    
    const others = currentOnlineUsers.filter(u => u !== myName);
    const bestie = others[0] || 'Bestie';
    const p = getProfile(bestie);
    
    const callAvatar = document.getElementById('callAvatar');
    const callName = document.getElementById('callName');
    if (callAvatar) callAvatar.textContent = p.avatar || '🐱';
    if (callName) callName.textContent = p.nickname || bestie;
    
    if (type === 'video') {
      if (audioView) audioView.style.display = 'none';
      if (videoGrid) videoGrid.style.display = 'block';
      if (flipCamBtn) flipCamBtn.style.display = 'flex';
    } else {
      if (audioView) audioView.style.display = 'flex';
      if (videoGrid) videoGrid.style.display = 'none';
      if (flipCamBtn) flipCamBtn.style.display = 'none';
    }
    
    try {
      const stream = await getUserMediaStream(type);
      localStreamStream = stream;
      
      const localVideo = document.getElementById('localVideo');
      if (localVideo) {
        localVideo.srcObject = stream;
      }
      
      initPeerConnection(type);
      
      stream.getTracks().forEach((track) => {
        webrtcConn.addTrack(track, stream);
      });
      
      const offer = await webrtcConn.createOffer();
      await webrtcConn.setLocalDescription(offer);
      
      socket.emit('call-invite', { offer, type });
      playSound('send');
      
    } catch (err) {
      console.error('Call failed to start:', err);
      renderSystem('🔒 Could not access microphone/camera');
      showToast('🔒 Mic/Camera permission blocked. Please allow mic & camera in browser settings.');
      endCall(true);
    }
  }

  function initPeerConnection(type) {
    webrtcConn = new RTCPeerConnection(rtcConfig);
    
    webrtcConn.onicecandidate = (e) => {
      if (e.candidate && socket) {
        socket.emit('call-candidate', { candidate: e.candidate });
      }
    };
    
    webrtcConn.ontrack = (e) => {
      const remoteVideo = document.getElementById('remoteVideo');
      if (remoteVideo && e.streams[0]) {
        remoteVideo.srcObject = e.streams[0];
        remoteVideo.style.display = type === 'video' ? 'block' : 'none';
      }
    };
  }

  async function acceptCall() {
    if (!webrtcCallOffer) return;
    
    if (navigator.vibrate) navigator.vibrate(0);
    
    const statusText = document.getElementById('callStatusText');
    if (statusText) statusText.textContent = 'Connecting…';
    
    const incomingControls = document.getElementById('incomingControls');
    const activeControls = document.getElementById('activeCallControls');
    const audioView = document.getElementById('callAudioView');
    const videoGrid = document.getElementById('videoGrid');
    const flipCamBtn = document.getElementById('flipCamBtn');
    const audioWaves = document.getElementById('callAudioWaves');
    
    if (incomingControls) incomingControls.style.display = 'none';
    if (activeControls) activeControls.style.display = 'flex';
    
    if (callType === 'video') {
      if (audioView) audioView.style.display = 'none';
      if (videoGrid) videoGrid.style.display = 'block';
      if (flipCamBtn) flipCamBtn.style.display = 'flex';
    } else {
      if (audioView) audioView.style.display = 'flex';
      if (videoGrid) videoGrid.style.display = 'none';
      if (flipCamBtn) flipCamBtn.style.display = 'none';
    }
    
    try {
      const stream = await getUserMediaStream(callType);
      localStreamStream = stream;
      
      const localVideo = document.getElementById('localVideo');
      if (localVideo) {
        localVideo.srcObject = stream;
      }
      
      initPeerConnection(callType);
      
      stream.getTracks().forEach((track) => {
        webrtcConn.addTrack(track, stream);
      });
      
      await webrtcConn.setRemoteDescription(new RTCSessionDescription(webrtcCallOffer));
      const answer = await webrtcConn.createAnswer();
      await webrtcConn.setLocalDescription(answer);
      
      socket.emit('call-accept', { answer });
      if (statusText) statusText.textContent = 'Connected 🟢';
      if (audioWaves) audioWaves.style.display = 'flex';
      startCallTimer();
      
    } catch (err) {
      console.error('Failed to accept call:', err);
      socket.emit('call-decline');
      endCall(true);
    }
  }

  function endCall(silent) {
    if (!silent && socket) {
      socket.emit('call-hangup');
    }
    if (navigator.vibrate) navigator.vibrate(0);
    stopCallTimer();
    
    if (localStreamStream) {
      localStreamStream.getTracks().forEach((t) => t.stop());
      localStreamStream = null;
    }
    
    if (webrtcConn) {
      webrtcConn.close();
      webrtcConn = null;
    }
    
    webrtcCallOffer = null;
    audioMuted = false;
    cameraOff = false;
    
    const muteBtn = document.getElementById('muteAudioBtn');
    const camBtn = document.getElementById('toggleCamBtn');
    if (muteBtn) {
      muteBtn.classList.remove('active-muted');
      const onIcon = muteBtn.querySelector('.mic-on-icon');
      const offIcon = muteBtn.querySelector('.mic-off-icon');
      if (onIcon) onIcon.style.display = 'block';
      if (offIcon) offIcon.style.display = 'none';
    }
    if (camBtn) {
      camBtn.classList.remove('active-muted');
      const onIcon = camBtn.querySelector('.cam-on-icon');
      const offIcon = camBtn.querySelector('.cam-off-icon');
      if (onIcon) onIcon.style.display = 'block';
      if (offIcon) offIcon.style.display = 'none';
    }
    
    const overlay = document.getElementById('callOverlay');
    if (overlay) overlay.style.display = 'none';
    
    const pip = document.getElementById('pipCallContainer');
    const pipRemoteVideo = document.getElementById('pipRemoteVideo');
    if (pip) pip.style.display = 'none';
    if (pipRemoteVideo) pipRemoteVideo.srcObject = null;
    
    const localVideo = document.getElementById('localVideo');
    const remoteVideo = document.getElementById('remoteVideo');
    if (localVideo) localVideo.srcObject = null;
    if (remoteVideo) remoteVideo.srcObject = null;
  }

  function minimizeCall() {
    const overlay = document.getElementById('callOverlay');
    const pip = document.getElementById('pipCallContainer');
    const remoteVideo = document.getElementById('remoteVideo');
    const pipRemoteVideo = document.getElementById('pipRemoteVideo');
    const pipAvatar = document.getElementById('pipAvatar');
    const callAvatar = document.getElementById('callAvatar');

    if (!pip || !overlay) return;
    overlay.style.display = 'none';
    pip.style.display = 'block';

    if (remoteVideo && pipRemoteVideo && remoteVideo.srcObject) {
      pipRemoteVideo.srcObject = remoteVideo.srcObject;
      pipRemoteVideo.style.display = callType === 'video' ? 'block' : 'none';
      if (pipAvatar) pipAvatar.style.display = callType === 'video' ? 'none' : 'flex';
    } else if (pipAvatar && callAvatar) {
      pipAvatar.textContent = callAvatar.textContent;
      pipAvatar.style.display = 'flex';
    }
    makeDraggable(pip);
    showToast('🗗 Call minimized to corner');
  }

  function restoreCall() {
    const overlay = document.getElementById('callOverlay');
    const pip = document.getElementById('pipCallContainer');
    const remoteVideo = document.getElementById('remoteVideo');
    const pipRemoteVideo = document.getElementById('pipRemoteVideo');

    if (pip) pip.style.display = 'none';
    if (overlay) overlay.style.display = 'flex';

    if (pipRemoteVideo && remoteVideo && pipRemoteVideo.srcObject) {
      remoteVideo.srcObject = pipRemoteVideo.srcObject;
    }
  }

  function makeDraggable(el) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    el.onmousedown = dragMouseDown;
    el.ontouchstart = dragTouchStart;

    function dragMouseDown(e) {
      if (e.target.closest('.pip-controls')) return;
      e.preventDefault();
      pos3 = e.clientX;
      pos4 = e.clientY;
      document.onmouseup = closeDragElement;
      document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
      e.preventDefault();
      pos1 = pos3 - e.clientX;
      pos2 = pos4 - e.clientY;
      pos3 = e.clientX;
      pos4 = e.clientY;
      el.style.top = (el.offsetTop - pos2) + "px";
      el.style.left = (el.offsetLeft - pos1) + "px";
      el.style.bottom = 'auto';
      el.style.right = 'auto';
    }

    function closeDragElement() {
      document.onmouseup = null;
      document.onmousemove = null;
    }

    function dragTouchStart(e) {
      if (e.target.closest('.pip-controls')) return;
      pos3 = e.touches[0].clientX;
      pos4 = e.touches[0].clientY;
      document.ontouchend = closeDragTouch;
      document.ontouchmove = elementTouchDrag;
    }

    function elementTouchDrag(e) {
      pos1 = pos3 - e.touches[0].clientX;
      pos2 = pos4 - e.touches[0].clientY;
      pos3 = e.touches[0].clientX;
      pos4 = e.touches[0].clientY;
      el.style.top = (el.offsetTop - pos2) + "px";
      el.style.left = (el.offsetLeft - pos1) + "px";
      el.style.bottom = 'auto';
      el.style.right = 'auto';
    }

    function closeDragTouch() {
      document.ontouchend = null;
      document.ontouchmove = null;
    }
  }

  function toggleMuteAudio() {
    if (!localStreamStream) return;
    audioMuted = !audioMuted;
    localStreamStream.getAudioTracks().forEach((t) => t.enabled = !audioMuted);
    const muteBtn = document.getElementById('muteAudioBtn');
    if (muteBtn) {
      muteBtn.classList.toggle('active-muted', audioMuted);
      const onIcon = muteBtn.querySelector('.mic-on-icon');
      const offIcon = muteBtn.querySelector('.mic-off-icon');
      if (onIcon) onIcon.style.display = audioMuted ? 'none' : 'block';
      if (offIcon) offIcon.style.display = audioMuted ? 'block' : 'none';
    }
    showToast(audioMuted ? 'Microphone muted 🔇' : 'Microphone unmuted 🎙️');
  }

  function toggleCamera() {
    if (!localStreamStream || callType !== 'video') return;
    cameraOff = !cameraOff;
    localStreamStream.getVideoTracks().forEach((t) => t.enabled = !cameraOff);
    const camBtn = document.getElementById('toggleCamBtn');
    if (camBtn) {
      camBtn.classList.toggle('active-muted', cameraOff);
      const onIcon = camBtn.querySelector('.cam-on-icon');
      const offIcon = camBtn.querySelector('.cam-off-icon');
      if (onIcon) onIcon.style.display = cameraOff ? 'none' : 'block';
      if (offIcon) offIcon.style.display = cameraOff ? 'block' : 'none';
    }
    showToast(cameraOff ? 'Camera turned off 🚫' : 'Camera turned on 📹');
  }

  async function flipCamera() {
    if (!localStreamStream || callType !== 'video') return;
    currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: currentFacingMode },
        audio: false
      });
      const newVideoTrack = newStream.getVideoTracks()[0];
      const oldVideoTrack = localStreamStream.getVideoTracks()[0];
      if (oldVideoTrack) {
        localStreamStream.removeTrack(oldVideoTrack);
        oldVideoTrack.stop();
      }
      localStreamStream.addTrack(newVideoTrack);
      const localVideo = document.getElementById('localVideo');
      if (localVideo) localVideo.srcObject = localStreamStream;
      if (webrtcConn) {
        const sender = webrtcConn.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) sender.replaceTrack(newVideoTrack);
      }
      showToast(`Switched to ${currentFacingMode === 'user' ? 'Front' : 'Back'} Camera 🔄`);
    } catch (err) {
      showToast('Could not flip camera');
    }
  }

  function toggleSpeaker() {
    showToast('🔊 Audio routed to Loudspeaker');
  }

  // ═══════════════════ CHAT WALLPAPER ═══════════════════
  function changeWallpaper(type, customUrl) {
    const messagesEl = document.getElementById('messages') || els.messages;
    const selectEl = document.getElementById('wallpaperSelect');
    const customInputEl = document.getElementById('wallpaperUrlInput');
    const selected = type !== undefined ? type : (selectEl ? selectEl.value : '');

    if (selectEl && selected !== undefined) selectEl.value = selected;
    if (customInputEl) customInputEl.style.display = selected === 'custom' ? 'block' : 'none';

    if (!messagesEl) return;

    messagesEl.style.backgroundImage = '';
    messagesEl.style.backgroundColor = '';
    messagesEl.style.background = '';

    if (selected === 'custom') {
      const url = customUrl || (customInputEl ? customInputEl.value.trim() : '');
      if (url) {
        messagesEl.style.backgroundImage = `url('${url}')`;
        messagesEl.style.backgroundSize = 'cover';
        messagesEl.style.backgroundPosition = 'center';
        messagesEl.style.backgroundRepeat = 'no-repeat';
        localStorage.setItem('bestieChatWallpaper', 'custom');
        localStorage.setItem('bestieChatWallpaperUrl', url);
        showToast('Custom wallpaper applied! 🖼️');
      }
    } else if (selected === 'gradient-lavender') {
      messagesEl.style.background = 'linear-gradient(135deg, #efedf7 0%, #f7f6fb 50%, #e2dff0 100%)';
      localStorage.setItem('bestieChatWallpaper', selected);
      showToast('Lavender Mist wallpaper applied! 🖼️');
    } else if (selected === 'gradient-frost-violet') {
      messagesEl.style.background = 'linear-gradient(135deg, #f3eff9 0%, #ffffff 50%, #ebdffd 100%)';
      localStorage.setItem('bestieChatWallpaper', selected);
      showToast('Frost Violet wallpaper applied! 🖼️');
    } else if (selected === 'gradient-pearl-rose') {
      messagesEl.style.background = 'linear-gradient(135deg, #fff2f5 0%, #ffffff 50%, #f5eefc 100%)';
      localStorage.setItem('bestieChatWallpaper', selected);
      showToast('Pearl Rose wallpaper applied! 🖼️');
    } else if (selected && selected.startsWith('#')) {
      messagesEl.style.backgroundColor = selected;
      localStorage.setItem('bestieChatWallpaper', selected);
      showToast('Solid color wallpaper applied! 🖼️');
    } else {
      localStorage.removeItem('bestieChatWallpaper');
      localStorage.removeItem('bestieChatWallpaperUrl');
      if (type !== undefined) showToast('Default wallpaper restored');
    }
  }

  // ═══════════════════ BESTIE PROFILE VIEWER ═══════════════════
  function openBestieProfile(targetUser) {
    const friendName = targetUser || bestieName || 'Bestie';
    const profile = getProfile(friendName);

    const titleEl = document.getElementById('bestieProfileCardTitle');
    const avatarEl = document.getElementById('bestieProfileAvatarDisplay');
    const nameEl = document.getElementById('bestieProfileNameDisplay');
    const statusEl = document.getElementById('bestieProfileStatusDisplay');
    const feelingRow = document.getElementById('bestieProfileFeelingRow');
    const feelingText = document.getElementById('bestieProfileFeelingText');
    const dotEl = document.getElementById('bestieProfileOnlineDot');
    const msgsEl = document.getElementById('bestieStatMsgs');
    const streakEl = document.getElementById('bestieStatStreak');

    if (titleEl) titleEl.textContent = `${friendName}'s Profile 👤`;
    if (avatarEl) avatarEl.textContent = profile.avatar || '✨';
    if (nameEl) nameEl.textContent = friendName;
    if (statusEl) statusEl.textContent = profile.statusBio ? `"${profile.statusBio}"` : '"No bio set yet ✨"';
    
    const theirFeel = feelings[friendName];
    if (feelingRow && feelingText) {
      if (theirFeel && theirFeel.label) {
        feelingRow.style.display = 'flex';
        feelingText.textContent = `${theirFeel.emoji || ''} ${theirFeel.label}`;
      } else {
        feelingRow.style.display = 'none';
      }
    }

    if (dotEl) {
      const isOnline = Boolean(presenceUsers && presenceUsers.find(u => u.name === friendName));
      dotEl.style.background = isOnline ? '#388E3C' : '#8e8e93';
    }

    if (msgsEl) {
      const count = allMessagesCached.filter(m => m.user === friendName).length;
      msgsEl.textContent = count;
    }
    if (streakEl) {
      streakEl.textContent = `🔥 ${currentStreakDays || 0}`;
    }

    showModal('bestieProfileModal');
  }

  function closeBestieProfile() {
    hideModal('bestieProfileModal');
  }

  // ═══════════════════ UI HELPERS ═══════════════════
  let inputSendMode = 'voice'; // 'voice' or 'video'

  function toggleSendMicIcons() {
    const hasText = els.msgInput && els.msgInput.value.trim().length > 0;
    const sendIcon = els.sendIcon;
    const micIcon = els.micIcon;
    const videoCamIcon = document.getElementById('videoCamIcon');
    
    if (sendIcon && micIcon) {
      if (hasText || editingMessageId) {
        sendIcon.style.display = 'block';
        micIcon.style.display = 'none';
        if (videoCamIcon) videoCamIcon.style.display = 'none';
      } else {
        sendIcon.style.display = 'none';
        if (inputSendMode === 'video') {
          micIcon.style.display = 'none';
          if (videoCamIcon) videoCamIcon.style.display = 'block';
        } else {
          micIcon.style.display = 'block';
          if (videoCamIcon) videoCamIcon.style.display = 'none';
        }
      }
    }
  }

  function handleSendBtnClick() {
    const hasText = els.msgInput && els.msgInput.value.trim().length > 0;
    if (hasText || editingMessageId) {
      sendMessage();
      return;
    }
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      toggleRecord();
      return;
    }
    if (inputSendMode === 'video') {
      startVideoNote();
    } else {
      toggleRecord();
    }
  }

  function toggleAttachMenu() {
    const menu = els.attachMenu;
    if (!menu) return;
    const isShowing = menu.style.display === 'grid';
    menu.style.display = isShowing ? 'none' : 'grid';
    
    // Auto-close other panels
    els.emojiPicker.classList.remove('open');
    els.gameMenu.classList.remove('open');
    els.gifPanel.classList.remove('open');
  }

  function triggerPhotoUpload() {
    const input = document.getElementById('photoInput');
    if (input) input.click();
    if (els.attachMenu) els.attachMenu.style.display = 'none';
  }

  // ═══════════════════ ULTIMATE FEATURES SET ═══════════════════

  // ── Tab Navigation ──
  let activeExtrasTab = 'vibe';
  function switchExtrasTab(tabId) {
    activeExtrasTab = tabId;
    document.querySelectorAll('#extrasPanel .tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('#extrasPanel .tab-content').forEach(content => content.classList.remove('active'));
    const btn = [...document.querySelectorAll('#extrasPanel .tab-btn')].find(b => b.getAttribute('onclick').includes(tabId));
    if (btn) btn.classList.add('active');
    const content = document.getElementById(`tab${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`);
    if (content) content.classList.add('active');
  }

  // ── Accent Theme Switcher ──
  const ACCENT_PRESETS = {
    indigo:   { accent: '#6366f1', accent2: '#818cf8', glow: 'rgba(99, 102, 241, 0.22)' },
    rose:     { accent: '#f43f5e', accent2: '#fb7185', glow: 'rgba(244, 63, 94, 0.22)' },
    emerald:  { accent: '#10b981', accent2: '#34d399', glow: 'rgba(16, 185, 129, 0.22)' },
    amber:    { accent: '#f59e0b', accent2: '#fbbf24', glow: 'rgba(245, 158, 11, 0.22)' },
    cyan:     { accent: '#06b6d4', accent2: '#22d3ee', glow: 'rgba(6, 182, 212, 0.22)' },
    sunset:   { accent: '#f97316', accent2: '#ec4899', glow: 'rgba(249, 115, 22, 0.22)' },
    purple:   { accent: '#8b5cf6', accent2: '#a78bfa', glow: 'rgba(139, 92, 246, 0.22)' }
  };

  function changeAccent(accentKey) {
    const root = document.body;
    const select = document.getElementById('accentSelect');
    if (select && accentKey !== undefined) select.value = accentKey || '';

    if (accentKey && ACCENT_PRESETS[accentKey]) {
      const p = ACCENT_PRESETS[accentKey];
      root.style.setProperty('--accent', p.accent);
      root.style.setProperty('--accent2', p.accent2);
      root.style.setProperty('--accent-glow', p.glow);
      root.style.setProperty('--mb-accent', p.accent);
      root.style.setProperty('--mb-accent2', p.accent2);
      root.style.setProperty('--mb-accent-glow', p.glow);
      localStorage.setItem('bestieChatAccent', accentKey);
      showToast(`Accent updated to ${accentKey.toUpperCase()} ✨`);
    } else {
      root.style.removeProperty('--accent');
      root.style.removeProperty('--accent2');
      root.style.removeProperty('--accent-glow');
      root.style.removeProperty('--mb-accent');
      root.style.removeProperty('--mb-accent2');
      root.style.removeProperty('--mb-accent-glow');
      localStorage.removeItem('bestieChatAccent');
      if (accentKey === '') showToast('Reset to default classic accent');
    }
  }

  // ── Shared Notepad Sync ──
  function updateSharedPad(text) {
    if (socket) socket.emit('update-pad', { text });
  }

  // ── App PIN Lock ──
  function toggleAppPin() {
    const input = document.getElementById('appPinInput');
    const btn = document.getElementById('pinToggleBtn');
    const current = localStorage.getItem('bestieAppPin');
    if (current) {
      localStorage.removeItem('bestieAppPin');
      if (btn) btn.textContent = 'Enable';
      if (input) input.value = '';
      showToast('🔓 App Lock PIN disabled');
    } else if (input && input.value.length === 4) {
      localStorage.setItem('bestieAppPin', input.value);
      if (btn) btn.textContent = 'Disable';
      showToast('🔒 App Lock PIN enabled!');
    } else {
      showToast('⚠️ Please enter a 4-digit PIN');
    }
  }

  function verifyPinLock(val) {
    const pin = localStorage.getItem('bestieAppPin');
    const err = document.getElementById('pinLockError');
    const modal = document.getElementById('passcodeLockModal');
    if (val === pin) {
      if (modal) modal.style.display = 'none';
      if (err) err.style.display = 'none';
      const input = document.getElementById('pinLockInput');
      if (input) input.value = '';
    } else {
      if (err) err.style.display = 'block';
    }
  }

  function checkPinLock() {
    const pin = localStorage.getItem('bestieAppPin');
    if (pin) {
      const modal = document.getElementById('passcodeLockModal');
      if (modal) modal.style.display = 'flex';
      const input = document.getElementById('pinLockInput');
      if (input) input.focus();
    }
  }

  function toggleAudioSpeed(btn, audioId) {
    const audio = document.getElementById(audioId);
    if (!audio) return;
    const cur = audio.playbackRate || 1.0;
    const nxt = cur === 1.0 ? 1.5 : cur === 1.5 ? 2.0 : 1.0;
    audio.playbackRate = nxt;
    if (btn) btn.textContent = `${nxt}x`;
  }

  // ── Sound Packs ──
  function changeSoundPack(pack) {
    currentSoundPack = pack;
    localStorage.setItem('bestieChatSoundPack', pack);
  }

  // ── End-to-End Encryption (E2EE) XOR ──
  function updateE2EEKey() {
    const input = document.getElementById('e2eKeyInput');
    if (input) {
      e2eKey = input.value;
      localStorage.setItem('bestieChatE2EEKey', e2eKey);
      refreshMessagesLayout();
      updateE2EEFingerprint();
    }
  }

  function toggleE2EE() {
    const btn = document.getElementById('e2eToggleBtn');
    if (!btn) return;
    e2eEnabled = !e2eEnabled;
    btn.textContent = e2eEnabled ? 'Disable' : 'Enable';
    btn.classList.toggle('active', e2eEnabled);
    localStorage.setItem('bestieChatE2EEActive', e2eEnabled ? 'true' : 'false');
    refreshMessagesLayout();
  }

  function encryptE2EE(text) {
    if (!e2eEnabled || !e2eKey || typeof CryptoJS === 'undefined') return text;
    try {
      return '🔒:' + CryptoJS.AES.encrypt(text, e2eKey).toString();
    } catch {
      return text;
    }
  }

  function decryptE2EE(text) {
    if (!text || !text.startsWith('🔒:')) return text;
    if (!e2eKey) return '🔒 [Encrypted — Enter Secret Key to View]';
    if (typeof CryptoJS === 'undefined') return '🔒 [Crypto Library Offline]';
    try {
      const ciphertext = text.replace(/^🔒:/, '');
      const bytes = CryptoJS.AES.decrypt(ciphertext, e2eKey);
      const dec = bytes.toString(CryptoJS.enc.Utf8);
      if (!dec) throw new Error('Decryption empty');
      return dec;
    } catch {
      return '🔒 [Decryption Failed]';
    }
  }

  // ── Audio Waveform Controller ──
  let activeAudio = null;
  let activeAudioBtn = null;

  function playWaveform(msgId, btn) {
    const player = btn.closest('.custom-audio-player');
    if (!player) return;
    const url = player.dataset.url;
    
    if (activeAudio && activeAudio.src === url) {
      if (activeAudio.paused) {
        activeAudio.play();
        btn.querySelector('.play-svg').style.display = 'none';
        btn.querySelector('.pause-svg').style.display = 'block';
      } else {
        activeAudio.pause();
        btn.querySelector('.play-svg').style.display = 'block';
        btn.querySelector('.pause-svg').style.display = 'none';
      }
      return;
    }
    
    // Stop old
    if (activeAudio) {
      activeAudio.pause();
      if (activeAudioBtn) {
        activeAudioBtn.querySelector('.play-svg').style.display = 'block';
        activeAudioBtn.querySelector('.pause-svg').style.display = 'none';
      }
    }
    
    activeAudio = new Audio(url);
    activeAudioBtn = btn;
    activeAudio.play();
    btn.querySelector('.play-svg').style.display = 'none';
    btn.querySelector('.pause-svg').style.display = 'block';
    
    activeAudio.addEventListener('timeupdate', () => {
      const pct = (activeAudio.currentTime / activeAudio.duration) * 100;
      const bars = player.querySelectorAll('.waveform-bar');
      const activeCount = Math.floor((pct / 100) * bars.length);
      bars.forEach((bar, idx) => {
        bar.classList.toggle('played', idx < activeCount);
      });
      // Update duration text with current position
      const curSec = Math.floor(activeAudio.currentTime);
      const totalSec = Math.floor(activeAudio.duration) || 0;
      const durText = document.getElementById(`wave-dur-${msgId}`);
      if (durText) {
        durText.textContent = `${Math.floor(curSec / 60)}:${String(curSec % 60).padStart(2, '0')} / ${Math.floor(totalSec / 60)}:${String(totalSec % 60).padStart(2, '0')}`;
      }
    });
    
    activeAudio.addEventListener('ended', () => {
      btn.querySelector('.play-svg').style.display = 'block';
      btn.querySelector('.pause-svg').style.display = 'none';
      player.querySelectorAll('.waveform-bar').forEach(bar => bar.classList.remove('played'));
      activeAudio = null;
      activeAudioBtn = null;
    });
  }

  function seekWaveform(event, msgId) {
    const wave = event.currentTarget;
    if (!wave) return;
    const player = wave.closest('.custom-audio-player');
    if (!player) return;
    const btn = player.querySelector('.wave-play-btn');
    if (!activeAudio || activeAudioBtn !== btn) {
      if (btn) playWaveform(msgId, btn);
    }
    if (activeAudio && activeAudio.duration) {
      const rect = wave.getBoundingClientRect();
      const clickX = Math.max(0, Math.min(event.clientX - rect.left, rect.width));
      const pct = clickX / rect.width;
      activeAudio.currentTime = activeAudio.duration * pct;
    }
  }

  function transcribeAudio(msgId, url) {
    const box = document.getElementById(`transcription-${msgId}`);
    if (!box) return;
    box.style.display = 'block';
    box.textContent = 'Transcribing voice note... 🎙️';
    
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Speech) {
      box.textContent = 'Speech transcription not supported in this browser (Chrome recommended).';
      return;
    }
    box.textContent = 'Speech transcribing is only available for live microphone input on web platforms.';
  }

  // ── Scrapbook Diary List ──
  function addDiaryEntry() {
    const input = document.getElementById('diaryTextInput');
    if (!input || !input.value.trim()) return;
    const entry = {
      date: new Date().toLocaleDateString(),
      text: input.value.trim(),
      image: ''
    };
    sharedDiary.unshift(entry);
    renderDiaryList(sharedDiary);
    socket.emit('update-diary', sharedDiary);
    input.value = '';
    showToast('📖 Scrapbook memory added!');
  }

  function deleteDiaryEntry(index) {
    sharedDiary.splice(index, 1);
    renderDiaryList(sharedDiary);
    socket.emit('update-diary', sharedDiary);
  }

  function renderDiaryList(diary) {
    const list = document.getElementById('diaryList');
    if (!list) return;
    list.innerHTML = (diary || []).map((d, idx) => `
      <div class="diary-item">
        <div class="diary-item-text">
          <span class="diary-date">${escapeHtml(d.date)}</span>
          <span>${escapeHtml(d.text)}</span>
        </div>
        <button class="delete-item-btn" onclick="BestieChat.deleteDiaryEntry(${idx})">✕</button>
      </div>
    `).join('');
  }

  // ── Shared Calendar & Dates ──
  function addCalendarEvent() {
    const labelEl = document.getElementById('calLabelInput');
    const dateEl = document.getElementById('calDateInput');
    if (!labelEl || !dateEl || !labelEl.value.trim() || !dateEl.value) return;
    sharedCalendar.push({ label: labelEl.value.trim(), date: dateEl.value });
    renderCalendarList(sharedCalendar);
    socket.emit('update-calendar', sharedCalendar);
    labelEl.value = '';
    dateEl.value = '';
    showToast('📅 Date saved to Calendar!');
  }

  function deleteCalendarEvent(index) {
    sharedCalendar.splice(index, 1);
    renderCalendarList(sharedCalendar);
    socket.emit('update-calendar', sharedCalendar);
  }

  function renderCalendarList(cal) {
    const container = document.getElementById('calendarList');
    if (!container) return;
    container.innerHTML = (cal || []).map((c, idx) => `
      <div class="diary-item">
        <div class="diary-item-text">
          <span class="diary-date">📅 ${new Date(c.date).toLocaleDateString()}</span>
          <span>${escapeHtml(c.label)}</span>
        </div>
        <button class="delete-item-btn" onclick="BestieChat.deleteCalendarEvent(${idx})">✕</button>
      </div>
    `).join('');
  }

  // ── Bucket List ──
  function addBucketItem() {
    const input = document.getElementById('bucketTextInput');
    if (!input || !input.value.trim()) return;
    const item = {
      text: input.value.trim(),
      done: false,
      dateCompleted: null
    };
    sharedBucketList.unshift(item);
    renderBucketList(sharedBucketList);
    socket.emit('update-bucketlist', sharedBucketList);
    input.value = '';
    showToast('✨ Goal added to Bucket List!');
  }

  function toggleBucketItem(index) {
    const item = sharedBucketList[index];
    if (!item) return;
    item.done = !item.done;
    item.dateCompleted = item.done ? new Date().toLocaleDateString() : null;
    renderBucketList(sharedBucketList);
    socket.emit('update-bucketlist', sharedBucketList);
    if (item.done) confetti();
  }

  function deleteBucketItem(index) {
    sharedBucketList.splice(index, 1);
    renderBucketList(sharedBucketList);
    socket.emit('update-bucketlist', sharedBucketList);
  }

  function renderBucketList(list) {
    const container = document.getElementById('bucketList');
    if (!container) return;
    container.innerHTML = (list || []).map((b, idx) => `
      <div class="bucket-item ${b.done ? 'done' : ''}">
        <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
          <input type="checkbox" ${b.done ? 'checked' : ''} onchange="BestieChat.toggleBucketItem(${idx})" />
          <span>${escapeHtml(b.text)} ${b.dateCompleted ? `(Completed ${b.dateCompleted})` : ''}</span>
        </label>
        <button class="delete-item-btn" onclick="BestieChat.deleteBucketItem(${idx})">✕</button>
      </div>
    `).join('');
  }

  // ── Inside Joke Glossary Wiki ──
  function addGlossaryWord() {
    const wordEl = document.getElementById('glossaryWord');
    const meaningEl = document.getElementById('glossaryMeaning');
    if (!wordEl || !meaningEl || !wordEl.value.trim() || !meaningEl.value.trim()) return;
    
    const word = wordEl.value.trim().toLowerCase();
    const meaning = meaningEl.value.trim();
    
    // Check if word exists, if so update it
    const existingIdx = sharedGlossary.findIndex(g => g.word === word);
    if (existingIdx !== -1) {
      sharedGlossary[existingIdx].meaning = meaning;
    } else {
      sharedGlossary.unshift({ word, meaning });
    }
    
    renderGlossaryList(sharedGlossary);
    refreshMessagesLayout();
    socket.emit('update-glossary', sharedGlossary);
    wordEl.value = '';
    meaningEl.value = '';
    showToast('💬 Inside Joke added to Wiki!');
  }

  function deleteGlossaryWord(index) {
    sharedGlossary.splice(index, 1);
    renderGlossaryList(sharedGlossary);
    refreshMessagesLayout();
    socket.emit('update-glossary', sharedGlossary);
  }

  function renderGlossaryList(glossary) {
    const list = document.getElementById('glossaryList');
    if (!list) return;
    list.innerHTML = (glossary || []).map((g, idx) => `
      <div class="glossary-item">
        <div class="glossary-item-text">
          <b>${escapeHtml(g.word)}</b>: ${escapeHtml(g.meaning)}
        </div>
        <button class="delete-item-btn" onclick="BestieChat.deleteGlossaryWord(${idx})">✕</button>
      </div>
    `).join('');
  }

  function highlightInsideJokes(text) {
    if (!sharedGlossary || !sharedGlossary.length || !text) return escapeHtml(text);
    let escaped = escapeHtml(text);
    // Sort glossary words by length descending so longer matching phrases take priority
    const sorted = [...sharedGlossary].sort((a,b) => b.word.length - a.word.length);
    sorted.forEach(g => {
      const word = escapeHtml(g.word);
      const safeWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = new RegExp(`\\b(${safeWord})\\b`, 'gi');
      escaped = escaped.replace(rx, `<span class="glossary-word-highlight" title="${escapeHtml(g.meaning)}" onclick="alert('${escapeHtml(g.word)}: ${escapeHtml(g.meaning)}')">$1</span>`);
    });
    return escaped;
  }

  function refreshMessagesLayout() {
    const container = els.messages;
    if (!container) return;
    container.innerHTML = '';
    lastDateLabel = '';
    allMessagesCached.forEach(m => renderMessage(m, true));
    scrollBottom();
  }

  // ── Conversation Heatmap ──
  function renderHeatmap() {
    const container = document.getElementById('heatmapContainer');
    const totalEl = document.getElementById('statsTotalMsgs');
    if (totalEl) totalEl.textContent = `Total messages sent: ${allMessagesCached.length}`;
    if (!container) return;
    container.innerHTML = '';
    
    const counts = {};
    const now = new Date();
    allMessagesCached.forEach(m => {
      const dStr = new Date(m.time).toISOString().slice(0, 10);
      counts[dStr] = (counts[dStr] || 0) + 1;
    });
    
    // Draw past 105 days (15 columns x 7 rows)
    for (let i = 104; i >= 0; i--) {
      const date = new Date();
      date.setDate(now.getDate() - i);
      const dStr = date.toISOString().slice(0, 10);
      const count = counts[dStr] || 0;
      
      let lvl = 0;
      if (count > 0 && count <= 2) lvl = 1;
      else if (count <= 6) lvl = 2;
      else if (count <= 15) lvl = 3;
      else if (count > 15) lvl = 4;
      
      const block = document.createElement('div');
      block.className = `heatmap-cell level-${lvl}`;
      block.title = `${date.toLocaleDateString()}: ${count} messages`;
      container.appendChild(block);
    }
  }

  // ── Weather Geolocation Sync ──
  function saveWeatherCity(city) {
    localStorage.setItem('bestieWeatherCity', city);
    fetchWeatherForCity(city);
    if (socket && joined) socket.emit('update-weather', city);
  }

  function fetchWeatherForCity(city) {
    const display = document.getElementById('weatherDisplay');
    if (!display || !city) return;
    display.textContent = 'Loading weather... 🌦️';
    
    fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`)
      .then(r => r.json())
      .then(data => {
        const result = data.results && data.results[0];
        if (!result) { display.textContent = 'City not found'; return; }
        const { latitude, longitude, name } = result;
        fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`)
          .then(r => r.json())
          .then(weather => {
            const curr = weather.current_weather;
            if (!curr) { display.textContent = 'Weather unavailable'; return; }
            const emoji = weatherCodeToEmoji(curr.weathercode);
            display.textContent = `${name}: ${emoji} ${curr.temperature}°C`;
          })
          .catch(() => display.textContent = 'Weather check failed');
      })
      .catch(() => display.textContent = 'Weather lookup failed');
  }

  function weatherCodeToEmoji(code) {
    if (code === 0) return '☀️';
    if (code <= 3) return '🌤️';
    if (code <= 48) return '🌫️';
    if (code <= 67) return '🌧️';
    if (code <= 77) return '❄️';
    if (code <= 82) return '🌦️';
    return '⛈️';
  }

  let bonsaiWateringCooldown = false;
  function waterBonsai() {
    if (bonsaiWateringCooldown) {
      showToast('🌱 The tree is hydrated! Give it a second.');
      return;
    }
    bonsaiWateringCooldown = true;
    const btn = document.getElementById('waterBonsaiBtn');
    if (btn) {
      btn.disabled = true;
      btn.classList.add('cooldown');
    }
    
    // Water drop splash visual effect
    const container = document.querySelector('.bonsai-visual');
    if (container) {
      const drop = document.createElement('div');
      drop.className = 'bonsai-drop-anim';
      drop.textContent = '💧';
      container.appendChild(drop);
      setTimeout(() => drop.remove(), 900);
    }
    
    if (!sharedBonsai) sharedBonsai = { growth: 0, lastWatered: null };
    sharedBonsai.growth += 1;
    sharedBonsai.lastWatered = Date.now();
    socket.emit('update-bonsai', sharedBonsai);

    setTimeout(() => {
      bonsaiWateringCooldown = false;
      if (btn) {
        btn.disabled = false;
        btn.classList.remove('cooldown');
      }
    }, 1500);
  }

  let lastBonsaiLvl = -1;
  function renderBonsai(state) {
    const lvlText = document.getElementById('bonsaiLevel');
    const trunk = document.getElementById('bonsaiTrunk');
    const leaf1 = document.getElementById('leaf1');
    const leaf2 = document.getElementById('leaf2');
    const leaf3 = document.getElementById('leaf3');
    if (!lvlText) return;
    
    const growth = state.growth || 0;
    const lvl = Math.floor(growth / 5);
    
    lvlText.textContent = `Bonsai Tree (Lvl ${lvl})`;
    
    if (trunk) {
      trunk.setAttribute('stroke-width', String(Math.min(12, 6 + lvl)));
    }
    
    if (leaf1) leaf1.setAttribute('r', String(Math.min(22, 11 + lvl)));
    if (leaf2) leaf2.setAttribute('r', String(Math.min(18, 8 + lvl)));
    if (leaf3) leaf3.setAttribute('r', String(Math.min(15, 7 + lvl)));

    if (lastBonsaiLvl !== -1 && lvl > lastBonsaiLvl) {
      confetti();
      showToast(`🌳 Your Bonsai Tree leveled up to Level ${lvl}!`);
      playSound('milestone');
      const container = document.querySelector('.bonsai-container');
      if (container) {
        container.classList.add('bonsai-levelup');
        container.addEventListener('animationend', () => container.classList.remove('bonsai-levelup'), { once: true });
      }
    }
    lastBonsaiLvl = lvl;
  }

  // ── Co-Draw live shared canvas ──
  let coDrawingActive = false;
  let coDrawCtx = null;
  let coDrawColor = '#ff6fae';
  let coDrawTool = 'brush';
  let coDrawSize = 6;
  let coDrawLastX = 0;
  let coDrawLastY = 0;

  function openCoDraw() {
    showModal('coDrawModal');
    if (els.attachMenu) els.attachMenu.style.display = 'none';
    
    const canvas = document.getElementById('coDrawCanvas');
    if (!canvas) return;
    
    // Set internal size
    canvas.width = canvas.parentElement.clientWidth || 500;
    canvas.height = 400;
    coDrawCtx = canvas.getContext('2d');
    coDrawCtx.lineCap = 'round';
    coDrawCtx.lineJoin = 'round';
    
    // Remove old listeners first to prevent duplicates on reopen
    canvas.removeEventListener('mousedown', startCoDrawStroke);
    canvas.removeEventListener('mousemove', drawCoDrawStroke);
    canvas.removeEventListener('mouseup', stopCoDrawStroke);
    canvas.removeEventListener('mouseleave', stopCoDrawStroke);
    canvas.removeEventListener('touchstart', startCoDrawStroke);
    canvas.removeEventListener('touchmove', drawCoDrawStroke);
    canvas.removeEventListener('touchend', stopCoDrawStroke);
    
    // Canvas events
    canvas.addEventListener('mousedown', startCoDrawStroke);
    canvas.addEventListener('mousemove', drawCoDrawStroke);
    canvas.addEventListener('mouseup', stopCoDrawStroke);
    canvas.addEventListener('mouseleave', stopCoDrawStroke);
    
    canvas.addEventListener('touchstart', startCoDrawStroke, { passive: true });
    canvas.addEventListener('touchmove', drawCoDrawStroke, { passive: true });
    canvas.addEventListener('touchend', stopCoDrawStroke);
  }

  function closeCoDraw() {
    hideModal('coDrawModal');
  }

  function startCoDrawStroke(e) {
    coDrawingActive = true;
    const coords = getCoDrawCoords(e);
    coDrawLastX = coords.x;
    coDrawLastY = coords.y;
  }

  function drawCoDrawStroke(e) {
    if (!coDrawingActive || !coDrawCtx) return;
    const coords = getCoDrawCoords(e);
    
    const strokeData = {
      lastX: coDrawLastX,
      lastY: coDrawLastY,
      x: coords.x,
      y: coords.y,
      color: coDrawTool === 'eraser' ? '#111124' : coDrawColor,
      size: coDrawSize
    };
    
    drawCoDrawStrokeLocal(strokeData);
    socket.emit('draw-stroke', strokeData);
    
    coDrawLastX = coords.x;
    coDrawLastY = coords.y;
  }

  function stopCoDrawStroke() { coDrawingActive = false; }

  function getCoDrawCoords(e) {
    const canvas = document.getElementById('coDrawCanvas');
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  }

  function drawCoDrawStrokeLocal(stroke) {
    if (!coDrawCtx) return;
    coDrawCtx.beginPath();
    const midX = (stroke.lastX + stroke.x) / 2;
    const midY = (stroke.lastY + stroke.y) / 2;
    coDrawCtx.moveTo(stroke.lastX, stroke.lastY);
    coDrawCtx.quadraticCurveTo(stroke.lastX, stroke.lastY, midX, midY);
    coDrawCtx.lineTo(stroke.x, stroke.y);
    coDrawCtx.strokeStyle = stroke.color;
    coDrawCtx.lineWidth = stroke.size;
    coDrawCtx.stroke();
  }

  function clearCoDraw(isLocal) {
    const canvas = document.getElementById('coDrawCanvas');
    if (!canvas || !coDrawCtx) return;
    coDrawCtx.clearRect(0, 0, canvas.width, canvas.height);
    if (isLocal) socket.emit('draw-clear');
  }

  function setCoDrawColor(color, btn) {
    coDrawColor = color;
    coDrawTool = 'brush';
    document.querySelectorAll('#coDrawModal .doodle-color').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }

  function setCoDrawTool(tool, btn) {
    coDrawTool = tool;
    document.querySelectorAll('#coDrawModal .doodle-tool').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }

  function setCoDrawSize(size) {
    coDrawSize = size;
  }

  // ── YouTube Watch Together syncer ──
  let watchPlayerFrame = null;

  function openWatchTogether() {
    showModal('watchModal');
    if (els.attachMenu) els.attachMenu.style.display = 'none';
  }

  function closeWatchTogether() {
    hideModal('watchModal');
  }

  function loadWatchVideo(url) {
    const input = document.getElementById('watchUrlInput');
    const val = url || (input ? input.value : '');
    if (!val) return;
    
    // Parse Video ID from YouTube link
    let vidId = '';
    const reg = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = val.match(reg);
    if (match && match[2].length === 11) vidId = match[2];
    else vidId = val;
    
    const container = document.getElementById('watchPlayerContainer');
    if (container) {
      container.innerHTML = `<iframe id="watchIframe" width="100%" height="100%" src="https://www.youtube.com/embed/${vidId}?enablejsapi=1&autoplay=1" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
    }
    
    if (!url) {
      socket.emit('watch-sync', { action: 'load', url: vidId });
    }
  }

  function syncWatchTogetherPlayer(data) {
    if (data.action === 'load') {
      loadWatchVideo(data.url);
    }
  }

  // ── Multiplayer Tic-Tac-Toe synced game ──
  let tttBoard = Array(9).fill(null);
  let tttMySymbol = 'X';
  let tttTurnSymbol = 'X';

  function openTTT() {
    showModal('tttModal');
    if (els.attachMenu) els.attachMenu.style.display = 'none';
    
    // Determine Symbol: Name hash comparison resolves A as X, B as O
    const otherUser = [...document.querySelectorAll('.presence-user')].map(u => u.textContent).find(n => n !== myName) || '';
    if (myName.localeCompare(otherUser) > 0) {
      tttMySymbol = 'O';
    } else {
      tttMySymbol = 'X';
    }
    resetTTT(false);
  }

  function closeTTT() {
    hideModal('tttModal');
  }

  function resetTTT(isLocal) {
    tttBoard = Array(9).fill(null);
    tttTurnSymbol = 'X';
    
    const cells = document.querySelectorAll('.ttt-cell');
    cells.forEach(c => {
      c.textContent = '';
      c.disabled = false;
    });
    
    updateTTTStatus();
    if (isLocal) socket.emit('game-move', { reset: true });
  }

  function updateTTTStatus() {
    const turnEl = document.getElementById('tttTurn');
    if (!turnEl) return;
    if (tttTurnSymbol === tttMySymbol) {
      turnEl.textContent = `Your Turn (${tttMySymbol})`;
    } else {
      turnEl.textContent = `Bestie's Turn (${tttTurnSymbol})`;
    }
  }

  function makeTTTMove(cellIndex) {
    if (tttTurnSymbol !== tttMySymbol) return;
    if (tttBoard[cellIndex]) return;
    
    tttBoard[cellIndex] = tttMySymbol;
    const cells = document.querySelectorAll('.ttt-cell');
    if (cells[cellIndex]) cells[cellIndex].textContent = tttMySymbol;
    
    socket.emit('game-move', { cellIndex, symbol: tttMySymbol });
    
    if (checkTTTWinner()) return;
    
    tttTurnSymbol = tttMySymbol === 'X' ? 'O' : 'X';
    updateTTTStatus();
  }

  function handleTTTMoveLocal(data) {
    if (data.reset) {
      resetTTT(false);
      return;
    }
    
    const idx = data.cellIndex;
    const sym = data.symbol;
    
    tttBoard[idx] = sym;
    const cells = document.querySelectorAll('.ttt-cell');
    if (cells[idx]) cells[idx].textContent = sym;
    
    if (checkTTTWinner()) return;
    
    tttTurnSymbol = sym === 'X' ? 'O' : 'X';
    updateTTTStatus();
  }

  function checkTTTWinner() {
    const wins = [
      [0,1,2], [3,4,5], [6,7,8], // rows
      [0,3,6], [1,4,7], [2,5,8], // cols
      [0,4,8], [2,4,6]           // diagonals
    ];
    
    const turnEl = document.getElementById('tttTurn');
    
    for (const w of wins) {
      const [a,b,c] = w;
      if (tttBoard[a] && tttBoard[a] === tttBoard[b] && tttBoard[a] === tttBoard[c]) {
        document.querySelectorAll('.ttt-cell').forEach(cell => cell.disabled = true);
        const won = tttBoard[a] === tttMySymbol;
        if (turnEl) {
          turnEl.textContent = won ? '🏆 You Win!' : '💀 Bestie Wins!';
        }
        if (won) {
          socket.emit('game-result', { winner: myName });
        }
        confetti();
        return true;
      }
    }
    
    if (!tttBoard.includes(null)) {
      if (turnEl) turnEl.textContent = '🤝 It\'s a Draw!';
      // Emit draw so score is calculated or broadcast if needed
      socket.emit('game-result', { winner: null });
      return true;
    }
    return false;
  }

  // ── Touch Sync Pulse Haptics ──
  let hapticPulseInterval = null;

  function openHapticSync() {
    showModal('hapticModal');
    if (els.attachMenu) els.attachMenu.style.display = 'none';
  }

  function closeHapticSync() {
    hideModal('hapticModal');
    stopHapticPulse();
  }

  function startHapticPulse(e) {
    if (e) e.preventDefault();
    if (hapticPulseInterval) clearInterval(hapticPulseInterval);
    
    hapticPulseInterval = setInterval(() => {
      socket.emit('haptic-touch', { from: myName });
    }, 250);
    
    const heart = document.getElementById('hapticHeart');
    if (heart) heart.style.animationDuration = '0.5s';
    
    const status = document.getElementById('hapticStatus');
    if (status) status.textContent = 'Holding Pulse... 💓';
  }

  function stopHapticPulse() {
    if (hapticPulseInterval) {
      clearInterval(hapticPulseInterval);
      hapticPulseInterval = null;
    }
    const heart = document.getElementById('hapticHeart');
    if (heart) heart.style.animationDuration = '1.6s';
    
    const status = document.getElementById('hapticStatus');
    if (status) status.textContent = 'Hold down heart to sync';
  }

  function triggerHapticPulseLocal() {
    const heart = document.getElementById('hapticHeart');
    if (heart) {
      heart.style.transform = 'scale(1.3)';
      setTimeout(() => heart.style.transform = 'scale(1)', 150);
    }
    
    if ('vibrate' in navigator) {
      navigator.vibrate(100);
    }
    
    const status = document.getElementById('hapticStatus');
    if (status) status.textContent = '💓 Feel their touch!';
  }

  // ── Screen Nudges ──
  function sendNudge() {
    if (!joined) return;
    socket.emit('nudge');
    triggerScreenNudge('You');
    if (els.attachMenu) els.attachMenu.style.display = 'none';
  }

  function triggerScreenNudge(from) {
    const chatEl = els.chat;
    if (!chatEl) return;
    
    chatEl.classList.remove('nudge-shake');
    void chatEl.offsetWidth; // Trigger reflow to restart animation
    chatEl.classList.add('nudge-shake');
    
    playTone(280, 0.35, 0.08);
    
    setTimeout(() => {
      chatEl.classList.remove('nudge-shake');
    }, 450);
  }

  // ── Background Lo-Fi Player ──
  let lofiAudioCtx = null;
  let lofiOscillators = [];
  let lofiGain = null;
  let lofiPlaying = false;

  function toggleLofi() {
    const audio = document.getElementById('lofiAudio');
    const btn = document.getElementById('lofiPlayBtn');
    
    if (lofiPlaying) {
      if (audio) audio.pause();
      stopSynthesizedLofi();
      lofiPlaying = false;
      if (btn) {
        const span = btn.querySelector('span');
        const svg = btn.querySelector('svg');
        if (span) span.textContent = 'Play Lo-Fi';
        if (svg) svg.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
      }
      showToast('🔇 Lo-Fi paused');
    } else {
      lofiPlaying = true;
      let streamStarted = false;
      if (audio) {
        audio.play().then(() => {
          streamStarted = true;
        }).catch(() => {
          startSynthesizedLofi();
        });
      } else {
        startSynthesizedLofi();
      }
      if (btn) {
        const span = btn.querySelector('span');
        const svg = btn.querySelector('svg');
        if (span) span.textContent = 'Pause Lo-Fi';
        if (svg) svg.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
      }
      showToast('🎧 Cozy Lo-Fi playing');
    }
  }

  function startSynthesizedLofi() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!lofiAudioCtx) lofiAudioCtx = new AudioCtx();
      if (lofiAudioCtx.state === 'suspended') lofiAudioCtx.resume();
      
      stopSynthesizedLofi();
      lofiGain = lofiAudioCtx.createGain();
      lofiGain.gain.setValueAtTime(0.08, lofiAudioCtx.currentTime);
      lofiGain.connect(lofiAudioCtx.destination);

      const freqs = [130.81, 164.81, 196.00, 246.94, 329.63];
      lofiOscillators = freqs.map(freq => {
        const osc = lofiAudioCtx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, lofiAudioCtx.currentTime);
        osc.connect(lofiGain);
        osc.start();
        return osc;
      });
    } catch (e) {
      console.warn('Lofi synth error:', e);
    }
  }

  function stopSynthesizedLofi() {
    lofiOscillators.forEach(osc => {
      try { osc.stop(); osc.disconnect(); } catch(e){}
    });
    lofiOscillators = [];
  }

  function setLofiVolume(vol) {
    const audio = document.getElementById('lofiAudio');
    if (audio) audio.volume = Number(vol);
    if (lofiGain && lofiAudioCtx) {
      lofiGain.gain.setValueAtTime(Number(vol) * 0.15, lofiAudioCtx.currentTime);
    }
  }

  // ── Message Reactions bursts ──
  function triggerEmojiReactionBurst(messageId, emoji) {
    const wrap = document.querySelector(`.msg-wrap[data-id="${messageId}"]`);
    if (!wrap) return;
    
    const rect = wrap.getBoundingClientRect();
    const colors = ['#ff6fae', '#8b5cf6', '#f59e0b', '#06b6d4'];
    
    for (let i = 0; i < 7; i++) {
      const p = document.createElement('div');
      p.className = 'reaction-particle';
      p.textContent = emoji;
      
      // Random directions
      const dx = (Math.random() - 0.5) * 120;
      const dy = -40 - Math.random() * 80;
      const rot = (Math.random() - 0.5) * 360;
      
      p.style.setProperty('--dx', `${dx}px`);
      p.style.setProperty('--dy', `${dy}px`);
      p.style.setProperty('--rot', `${rot}deg`);
      
      p.style.left = `${rect.left + rect.width / 2}px`;
      p.style.top = `${rect.top}px`;
      
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 850);
    }
  }
  function init() {
    try {
      initAmbience();
      applyNightGlow();
      buildEmojiPicker();

      fetch('/api/config')
        .then((r) => r.json())
        .then((cfg) => {
          if (cfg.passwordRequired) els.passwordField.style.display = 'block';
          giphyApiKey = cfg.giphyKey || '';
        })
        .catch(() => {});

      // Restore Accent Theme
      const savedAccent = localStorage.getItem('bestieChatAccent') || 'telegram';
      const accentEl = document.getElementById('accentSelect');
      if (accentEl) accentEl.value = savedAccent;
      changeAccent(savedAccent);

      // Restore Sound Pack
      const savedPack = localStorage.getItem('bestieChatSoundPack') || 'cozy';
      const packEl = document.getElementById('soundPackSelect');
      if (packEl) packEl.value = savedPack;
      changeSoundPack(savedPack);

      // Restore E2EE Key
      const savedE2EE = localStorage.getItem('bestieChatE2EEKey') || '';
      const e2eInput = document.getElementById('e2eKeyInput');
      if (e2eInput) e2eInput.value = savedE2EE;
      e2eKey = savedE2EE;
      updateE2EEFingerprint();
      
      const e2eActive = localStorage.getItem('bestieChatE2EEActive') === 'true';
      e2eEnabled = e2eActive;
      const e2eBtn = document.getElementById('e2eToggleBtn');
      if (e2eBtn) {
        e2eBtn.textContent = e2eEnabled ? 'Disable' : 'Enable';
        e2eBtn.classList.toggle('active', e2eEnabled);
      }

      // Restore Weather City
      const savedCity = localStorage.getItem('bestieWeatherCity') || '';
      const cityInput = document.getElementById('weatherCityInput');
      if (cityInput) cityInput.value = savedCity;
      if (savedCity) fetchWeatherForCity(savedCity);

      // Restore wallpaper setting
      const savedWallpaper = localStorage.getItem('bestieChatWallpaper');
      const savedWallpaperUrl = localStorage.getItem('bestieChatWallpaperUrl');
      const selectEl = els.wallpaperSelect;
      const customInputEl = els.wallpaperUrlInput;
      
      if (savedWallpaper) {
        if (selectEl) selectEl.value = savedWallpaper;
        if (savedWallpaper === 'custom') {
          if (customInputEl) {
            customInputEl.value = savedWallpaperUrl || '';
            customInputEl.style.display = 'block';
          }
          changeWallpaper('custom', savedWallpaperUrl);
        } else {
          changeWallpaper(savedWallpaper);
        }
      }

      // Input events
      if (els.nameInput) els.nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { if (els.passwordInput) els.passwordInput.focus(); else joinChat(); } });
      if (els.passwordInput) els.passwordInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinChat(); });
      if (els.msgInput) {
        els.msgInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
          }
        });
        els.msgInput.addEventListener('input', () => {
          if (joined && socket) socket.emit('typing');
          autoExpandMsgInput();
          const len = els.msgInput.value.length;
          if (els.charCount) els.charCount.textContent = len > 1800 ? `${len}/2000` : '';
          toggleSendMicIcons();
        });
      }

      // Search
      if (els.searchInput) {
        els.searchInput.addEventListener('input', performSearch);
        els.searchInput.addEventListener('keydown', (e) => { if (e.key === 'Escape') clearSearch(); });
      }

      // Room meta
      if (els.moodInput) {
        els.moodInput.addEventListener('change', saveMood);
        els.moodInput.addEventListener('focus',  () => {
          if (!els.moodInput.value) {
            els.moodInput.placeholder = `Try: ${VIBE_SUGGESTIONS[Math.floor(Math.random() * VIBE_SUGGESTIONS.length)]}`;
          }
        });
      }
      if (els.jokesInput)       els.jokesInput.addEventListener('blur',   saveJokes);
      if (els.countdownLabel)   els.countdownLabel.addEventListener('change', saveCountdown);
      if (els.countdownDate)    els.countdownDate.addEventListener('change',  saveCountdown);
      if (els.nicknameInputChat) els.nicknameInputChat.addEventListener('input', saveNickname);

      if (els.photoInput) els.photoInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length) sendPhoto(e.target.files);
        e.target.value = '';
      });

      // Tab visibility
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
          clearUnread();
          emitReadReceiptForLastVisible();
        }
      });

      // Scroll to bottom button toggle & read receipt
      els.messages.addEventListener('scroll', () => {
        const { scrollTop, scrollHeight, clientHeight } = els.messages;
        const distFromBottom = scrollHeight - scrollTop - clientHeight;
        const btn = document.getElementById('scrollBottomBtn');
        if (btn) {
          btn.style.display = distFromBottom > 140 ? 'flex' : 'none';
        }
        if (distFromBottom < 80) {
          emitReadReceiptForLastVisible();
        }
      });

      // Global click → close menus / context menu
      document.addEventListener('click', (e) => {
        if (!e.target.closest('#emojiPicker')  && !e.target.closest('[data-emoji-toggle]')) { if (els.emojiPicker) els.emojiPicker.classList.remove('open'); }
        if (!e.target.closest('#gameMenu')     && !e.target.closest('[data-game-toggle]'))  { if (els.gameMenu) els.gameMenu.classList.remove('open'); }
        if (!e.target.closest('#gifPanel')     && !e.target.closest('.attach-item'))        { if (els.gifPanel) els.gifPanel.classList.remove('open'); }
        if (!e.target.closest('#feelingsPanel')&& !e.target.closest('[title="Feelings"]'))  { if (els.feelingsPanel) els.feelingsPanel.classList.remove('open'); }
        if (!e.target.closest('#stickerPanel') && !e.target.closest('[title="Stickers"]'))  { const sP = document.getElementById('stickerPanel'); if (sP) sP.style.display = 'none'; }
        if (!e.target.closest('#contextMenu')  && !e.target.closest('.msg-wrap'))           hideContextMenu();
        if (!e.target.closest('#attachMenu')   && !e.target.closest('#attachBtn'))          { if (els.attachMenu) els.attachMenu.style.display = 'none'; }
        if (!e.target.closest('.msg-wrap'))    document.querySelectorAll('.msg-wrap.touched').forEach((el) => el.classList.remove('touched'));
      });

      // Network Online / Offline Detection
      window.addEventListener('online', () => {
        showToast('📶 Back online! Reconnecting...');
        if (socket && !socket.connected) socket.connect();
      });
      window.addEventListener('offline', () => {
        showToast('⚠️ Network connection lost. Waiting for internet...');
      });

      // Keyboard shortcuts
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          hideContextMenu();
          if (searchActive) clearSearch();
          if (editingMessageId) {
            editingMessageId = null;
            els.msgInput.value = '';
            toggleSendMicIcons();
          }
          cancelReply();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'f' && joined) {
          e.preventDefault();
          toggleSearch();
        }
      });

      // Notifications
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }

      initSocket();
      toggleSendMicIcons();
      const savedName = localStorage.getItem('bestieChatName') || '';
      const savedToken = localStorage.getItem('bestieChatToken') || '';
      if (savedName && savedToken) {
        quickReentry();
      } else if (savedName) {
        const reentryContainer = document.getElementById('quickReentryContainer');
        const reentryText = document.getElementById('quickReentryText');
        const loginForm = document.getElementById('loginForm');
        if (reentryContainer && reentryText) {
          reentryText.textContent = `✨ Continue as ${savedName}`;
          reentryContainer.style.display = 'flex';
          if (loginForm) loginForm.style.display = 'none';
        }
      }

      updateSidebarMyProfile();
      checkPinLock();

      // Load saved theme
      const savedTheme = localStorage.getItem('bestieChatTheme') || 'light';
      applyAppTheme(savedTheme);

      // Parse PWA Share Target URL params
      const params = new URLSearchParams(window.location.search);
      const sharedTitle = params.get('title') || '';
      const sharedText = params.get('text') || '';
      const sharedUrl = params.get('url') || '';
      const sharedPayload = [sharedTitle, sharedText, sharedUrl].filter(Boolean).join(' ');
      if (sharedPayload && els.msgInput) {
        els.msgInput.value = sharedPayload;
        toggleSendMicIcons();
      }
    } catch (err) {
      console.error('Init crash:', err);
      const boundary = document.getElementById('errorBoundary');
      if (boundary) boundary.classList.add('visible');
    }
  }

  // ── Premium Additional Functions ──
  function showToast(msg) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('hiding');
      toast.addEventListener('animationend', () => toast.remove());
    }, 3000);
  }

  function applyAppTheme(themeName) {
    document.body.classList.remove('theme-dark', 'theme-ios');
    if (themeName === 'ios') {
      document.body.classList.add('theme-ios');
      if (els.msgInput) els.msgInput.placeholder = 'iMessage…';
    } else if (themeName === 'dark') {
      document.body.classList.add('theme-dark');
      if (els.msgInput) els.msgInput.placeholder = 'Message…';
    } else {
      if (els.msgInput) els.msgInput.placeholder = 'Message…';
    }
    localStorage.setItem('bestieChatTheme', themeName);
    const select = document.getElementById('themeSelect');
    if (select) select.value = themeName;
    const toggleBtn = document.getElementById('themeToggle');
    if (toggleBtn) {
      toggleBtn.textContent = themeName === 'ios' ? '📱' : (themeName === 'dark' ? '☀️' : '🌙');
    }
  }

  function selectTheme(themeName) {
    applyAppTheme(themeName);
    showToast(`Switched to ${themeName === 'ios' ? 'Apple iMessage (iOS)' : themeName.toUpperCase()} theme ✨`);
  }

  function toggleTheme() {
    const current = localStorage.getItem('bestieChatTheme') || 'light';
    const themes = ['light', 'dark', 'ios'];
    const nextIdx = (themes.indexOf(current) + 1) % themes.length;
    applyAppTheme(themes[nextIdx]);
    showToast(`Theme: ${themes[nextIdx] === 'ios' ? 'Apple iMessage 📱' : (themes[nextIdx] === 'dark' ? 'Dark Mode 🌙' : 'Warm Paper ☀️')}`);
  }

  let currentDailyQuestionState = null;
  let dailyQuestionAutoDismissTimer = null;

  function dismissDailyQuestion(manual = true) {
    if (dailyQuestionAutoDismissTimer) {
      clearTimeout(dailyQuestionAutoDismissTimer);
      dailyQuestionAutoDismissTimer = null;
    }
    const card = document.getElementById('dailyQuestion');
    if (card) {
      card.style.opacity = '0';
      card.style.transform = 'translateY(-8px)';
      setTimeout(() => {
        card.style.display = 'none';
        card.style.opacity = '';
        card.style.transform = '';
      }, 350);
    }
    if (manual) {
      const today = new Date().toISOString().slice(0, 10);
      localStorage.setItem('dismissedDailyQuestionDate', today);
    }
  }

  function renderDailyQuestionCard(state) {
    if (!state) return;
    currentDailyQuestionState = state;
    const card = document.getElementById('dailyQuestion');
    const textEl = document.getElementById('dailyQuestionText');
    const inputArea = document.getElementById('dqInputArea');
    const waitingArea = document.getElementById('dqWaitingArea');
    const revealedArea = document.getElementById('dqRevealedArea');
    const answersList = document.getElementById('dqAnswersList');
    const input = document.getElementById('dqAnswerInput');
    if (!card || !textEl) return;

    textEl.textContent = state.question || 'What made you smile today?';
    card.style.display = 'block';
    card.style.opacity = '1';
    card.style.transform = 'none';

    const myAnswerObj = state.answers && state.answers[myName];
    const isAnsweredByMe = Boolean(myAnswerObj && !myAnswerObj.locked);

    if (state.revealed) {
      if (inputArea) inputArea.style.display = 'none';
      if (waitingArea) waitingArea.style.display = 'none';
      if (revealedArea) {
        revealedArea.style.display = 'block';
        if (answersList) {
          answersList.innerHTML = Object.entries(state.answers || {}).map(([user, val]) => `
            <div class="dq-answer-row">
              <span class="dq-answer-user">${escapeHtml(getDisplayName(user))}:</span>
              <span>"${escapeHtml(val.text || '')}"</span>
            </div>
          `).join('');
        }
      }
    } else if (isAnsweredByMe) {
      if (inputArea) inputArea.style.display = 'none';
      if (revealedArea) revealedArea.style.display = 'none';
      if (waitingArea) waitingArea.style.display = 'block';
    } else {
      if (waitingArea) waitingArea.style.display = 'none';
      if (revealedArea) revealedArea.style.display = 'none';
      if (inputArea) inputArea.style.display = 'flex';
    }
  }

  function submitDailyAnswer() {
    const input = document.getElementById('dqAnswerInput');
    if (!input || !input.value.trim() || !joined || !socket) return;
    const answer = input.value.trim();
    socket.emit('submit-daily-answer', { answer });
    input.value = '';
    showToast('🔒 Answer locked! Waiting for Bestie…');
  }

  async function fetchDailyQuestion() {
    if (socket && joined) {
      socket.emit('get-daily-answer-state');
    }
    try {
      const res = await fetch('/api/daily-question');
      if (res.ok) {
        const data = await res.json();
        if (data.question && !currentDailyQuestionState) {
          renderDailyQuestionCard({ question: data.question, answers: {}, revealed: false });
        }
      }
    } catch (_) {}
  }

  function updateScoreboardDisplay(scores) {
    const container = document.getElementById('scoreboardRows');
    if (!container) return;
    if (!scores || (!scores.wins && !scores.losses)) {
      container.innerHTML = '<p style="opacity:0.5;font-size:0.82rem">No games played yet!</p>';
      return;
    }
    const wins = scores.wins || {};
    const players = Array.from(new Set([...Object.keys(wins)]));
    if (players.length === 0) {
      container.innerHTML = '<p style="opacity:0.5;font-size:0.82rem">No games won yet!</p>';
      return;
    }
    let html = '';
    players.forEach((player) => {
      const wCount = wins[player] || 0;
      html += `
        <div class="score-row">
          <span>${escapeHtml(getDisplayName(player))}</span>
          <span class="score-wins">${wCount} Win${wCount !== 1 ? 's' : ''} 🏆</span>
        </div>
      `;
    });
    container.innerHTML = html;
  }

  function updateE2EEFingerprint() {
    const el = document.getElementById('e2eeFingerprint');
    if (!el) return;
    if (!e2eKey) {
      el.classList.remove('visible');
      return;
    }
    let h1 = 5381, h2 = 52711;
    for (let i = 0; i < e2eKey.length; i++) {
      const char = e2eKey.charCodeAt(i);
      h1 = ((h1 << 5) + h1) ^ char;
      h2 = ((h2 << 5) + h2) ^ char;
    }
    const fp = `${(h1 >>> 0).toString(16).toUpperCase()}-${(h2 >>> 0).toString(16).toUpperCase()}`;
    el.textContent = `🔒 Fingerprint: ${fp}`;
    el.classList.add('visible');
  }

  function quickReact(emoji) {
    if (contextTarget) {
      react(contextTarget, emoji);
      const picker = document.getElementById('reactionPicker');
      if (picker) picker.classList.remove('open');
      hideContextMenu();
    }
  }

  async function togglePushNotifications() {
    const statusText = document.getElementById('pushStatusText');
    const btn = document.getElementById('pushToggleBtn');
    
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      showToast('Push Notifications not supported in this browser.');
      return;
    }
    
    try {
      const reg = await navigator.serviceWorker.ready;
      const existingSub = await reg.pushManager.getSubscription();
      
      if (existingSub) {
        await existingSub.unsubscribe();
        await fetch('/api/push-unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: existingSub.endpoint })
        });
        if (statusText) statusText.textContent = 'Disabled';
        if (btn) btn.textContent = 'Enable Notifications';
        showToast('Push notifications disabled');
        return;
      }
      
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        showToast('Notification permission denied.');
        return;
      }
      
      const res = await fetch('/api/push-vapid-key');
      const { publicKey } = await res.json();
      
      const convertedKey = urlBase64ToUint8Array(publicKey);
      const newSub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedKey
      });
      
      await fetch('/api/push-subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: myName, subscription: newSub })
      });
      
      if (statusText) statusText.textContent = 'Active 🔔';
      if (btn) btn.textContent = 'Disable Notifications';
      showToast('🔔 Push notifications enabled!');
    } catch (err) {
      console.error('Push setup error:', err);
      showToast('Could not set up notifications');
    }
  }

  function confirmClearHistory() {
    if (!joined) return;
    if (confirm('Are you sure you want to clear all chat history for both besties?')) {
      socket.emit('clear-history');
    }
  }

  function exportChat() {
    if (!allMessagesCached || !allMessagesCached.length) {
      showToast('No messages to export yet!');
      return;
    }
    const lines = allMessagesCached.map((m) => {
      const date = new Date(m.time).toLocaleString();
      const user = getDisplayName(m.user);
      const text = m.type === 'hug' ? 'sent a hug 💌' : m.type === 'image' ? `[Photo: ${m.url}]` : m.type === 'voice' ? `[Voice note: ${m.url}]` : decryptE2EE(m.text || '');
      return `[${date}] ${user}: ${text}`;
    });
    const header = `=======================================\n  WHISPR TRANSCRIPT EXPORT  \n=======================================\nExport Date: ${new Date().toLocaleString()}\nTotal Messages: ${allMessagesCached.length}\n---------------------------------------\n\n`;
    const blob = new Blob([header + lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `whispr-export-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    showToast('📥 Chat transcript exported!');
  }

  function setRoomPassword() {
    const input = document.getElementById('roomPasswordInput');
    if (!input || !joined) return;
    socket.emit('set-room-password', input.value.trim());
  }

  function setDisappearingTimer(val) {
    if (!joined) return;
    socket.emit('set-disappearing-timer', parseInt(val, 10));
  }

  function jumpToDate(dateStr) {
    if (!dateStr || !els.messages) return;
    const parts = dateStr.split('-');
    if (parts.length < 3) return;
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const d = parseInt(parts[2], 10);

    const msgs = els.messages.querySelectorAll('.msg-wrap');
    for (const msgEl of msgs) {
      const id = msgEl.dataset.id;
      const item = allMessagesCached.find((msg) => msg.id === id);
      if (item && item.time) {
        const dt = new Date(item.time);
        if (dt.getFullYear() === y && (dt.getMonth() + 1) === m && dt.getDate() === d) {
          msgEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          msgEl.classList.add('pinned-msg-highlight');
          setTimeout(() => msgEl.classList.remove('pinned-msg-highlight'), 1600);
          showToast(`📅 Jumped to ${dateStr}`);
          return;
        }
      }
    }
    showToast(`No messages found on ${dateStr}`);
  }

  function updatePrefsProfileDisplay() {
    const profile = getProfile(myName);
    const prefsAvatar = document.getElementById('prefsProfileAvatar');
    const prefsName = document.getElementById('prefsProfileName');
    const prefsStatus = document.getElementById('prefsProfileStatus');
    if (prefsAvatar) prefsAvatar.textContent = profile.avatar || '✨';
    if (prefsName) prefsName.textContent = getDisplayName(myName);
    if (prefsStatus) prefsStatus.textContent = profile.statusBio || 'No status bio set';
  }

  function openProfile() {
    hideModal('extrasPanel');
    showModal('profileModal');
    const profile = getProfile(myName) || {};
    const avatarDisplay  = document.getElementById('profileAvatarDisplay');
    const statusInput    = document.getElementById('profileStatusInput');
    const nicknameInput  = document.getElementById('profileNicknameInput');
    const statMsgs       = document.getElementById('statMsgs');
    const statStreak     = document.getElementById('statStreak');
    if (avatarDisplay) avatarDisplay.textContent = profile.avatar || '✨';
    if (statusInput)   statusInput.value = profile.statusBio || '';
    if (nicknameInput) nicknameInput.value = localStorage.getItem('bestieChatNickname') || '';
    if (statMsgs)      statMsgs.textContent = Array.isArray(allMessagesCached) ? allMessagesCached.filter(m => m.user === myName).length : 0;
    if (statStreak)    statStreak.textContent = currentStreakDays || 1;
    updatePrefsProfileDisplay();
    updateSidebarMyProfile();
  }

  function saveNicknameFromProfile(nick) {
    const trimmed = String(nick || '').trim();
    if (trimmed) {
      localStorage.setItem('bestieChatNickname', trimmed);
      if (els.nicknameInputChat) els.nicknameInputChat.value = trimmed;
      if (joined) socket.emit('update-nickname', trimmed);
      showToast('Nickname updated! ✨');
    }
  }

  function closeProfile() {
    hideModal('profileModal');
  }

  function selectAvatar(emoji) {
    const avatarDisplay = document.getElementById('profileAvatarDisplay');
    if (avatarDisplay) avatarDisplay.textContent = emoji;
    socket.emit('update-profile-bio', { avatar: emoji });
    showToast(`Avatar updated: ${emoji}`);
    updatePrefsProfileDisplay();
    updateSidebarMyProfile();
  }

  function saveProfileStatus(bio) {
    socket.emit('update-profile-bio', { statusBio: String(bio || '').trim() });
    showToast('Status saved! 💭');
    updatePrefsProfileDisplay();
    updateSidebarMyProfile();
  }

  function saveProfileColor(color) {
    socket.emit('update-profile-bio', { color });
    showToast('Bubble accent updated! 🎨');
  }

  // ── Voice Note Speed Control ──────────────────────────────────────────
  function toggleVoiceSpeed(btn, audioId) {
    const audio = document.getElementById(audioId);
    if (!audio) return;
    const current = audio.playbackRate || 1;
    let next = 1;
    if (current === 1) next = 1.5;
    else if (current === 1.5) next = 2;
    else next = 1;
    audio.playbackRate = next;
    if (btn) btn.textContent = `${next}x`;
  }

  // ── Connect 4 Mini Game ───────────────────────────────────────────────
  let c4BoardState = Array(6).fill(null).map(() => Array(7).fill(null));
  let c4Turn = 'red';

  function openConnect4() {
    showModal('connect4Modal');
    c4BoardState = Array(6).fill(null).map(() => Array(7).fill(null));
    c4Turn = 'red';
    renderConnect4Board();
  }

  function closeConnect4() {
    hideModal('connect4Modal');
  }

  function renderConnect4Board() {
    const boardEl = document.getElementById('c4Board');
    if (!boardEl) return;
    boardEl.innerHTML = '';
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 7; c++) {
        const cell = document.createElement('button');
        cell.className = 'c4-cell';
        cell.style.cssText = 'aspect-ratio:1; border-radius:50%; border:none; cursor:pointer; font-size:1.2rem; transition:transform 0.1s;';
        const val = c4BoardState[r][c];
        cell.style.background = val === 'red' ? '#ef4444' : val === 'yellow' ? '#f59e0b' : 'rgba(255,255,255,0.12)';
        cell.onclick = () => dropConnect4Token(c, true);
        boardEl.appendChild(cell);
      }
    }
  }

  function checkConnect4Win(board, color) {
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 4; c++) {
        if (board[r][c] === color && board[r][c+1] === color && board[r][c+2] === color && board[r][c+3] === color) return true;
      }
    }
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 7; c++) {
        if (board[r][c] === color && board[r+1][c] === color && board[r+2][c] === color && board[r+3][c] === color) return true;
      }
    }
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 4; c++) {
        if (board[r][c] === color && board[r+1][c+1] === color && board[r+2][c+2] === color && board[r+3][c+3] === color) return true;
      }
    }
    for (let r = 3; r < 6; r++) {
      for (let c = 0; c < 4; c++) {
        if (board[r][c] === color && board[r-1][c+1] === color && board[r-2][c+2] === color && board[r-3][c+3] === color) return true;
      }
    }
    return false;
  }

  function dropConnect4Token(c, isLocal = true) {
    showModal('connect4Modal');
    for (let r = 5; r >= 0; r--) {
      if (!c4BoardState[r][c]) {
        const activeColor = c4Turn;
        c4BoardState[r][c] = activeColor;
        renderConnect4Board();
        
        const statusEl = document.getElementById('c4Status');
        if (checkConnect4Win(c4BoardState, activeColor)) {
          if (statusEl) statusEl.textContent = `🏆 ${activeColor === 'red' ? '🔴 Red' : '🟡 Yellow'} Wins!`;
          confetti();
          playSound('milestone');
          if (isLocal) {
            socket.emit('game-result', { winner: myName });
          }
          return;
        }

        c4Turn = c4Turn === 'red' ? 'yellow' : 'red';
        if (statusEl) statusEl.textContent = `Turn: ${c4Turn === 'red' ? '🔴 Red' : '🟡 Yellow'}`;
        if (isLocal && socket) {
          socket.emit('c4-move', { col: c, color: activeColor });
        }
        return;
      }
    }
  }

  function sendQuickReply(text) {
    if (!text) return;
    if (els.msgInput) {
      els.msgInput.value = text;
      sendMessage();
    }
  }

  function uploadCameraFile(input) {
    if (!input || !input.files || !input.files[0]) return;
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target.result;
      const mime = file.type || 'image/jpeg';
      try {
        showToast('📸 Uploading camera photo...');
        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: dataUrl, mime, kind: 'image' })
        });
        const json = await res.json();
        if (json.url) {
          socket.emit('message', { user: myName, type: 'image', url: json.url });
          showToast('📸 Camera Moment sent!');
        }
      } catch (err) {
        showToast('Could not upload photo');
      }
    };
    reader.readAsDataURL(file);
  }

  async function captureDualCamera() {
    if (!joined) return;
    const cameraInput = document.getElementById('cameraFileInput');
    
    // First try WebRTC MediaDevices getUserMedia
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        showToast('📸 Opening camera...');
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'user' } }, audio: false });
        const video = document.createElement('video');
        video.srcObject = stream;
        await video.play();
        
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 480;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, 640, 480);
        
        stream.getTracks().forEach((t) => t.stop());
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        
        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: dataUrl, mime: 'image/jpeg', kind: 'image' })
        });
        const json = await res.json();
        if (json.url) {
          socket.emit('message', { user: myName, type: 'image', url: json.url });
          showToast('📸 Camera Moment sent!');
          return;
        }
      } catch (err) {
        console.warn('getUserMedia failed, falling back to native file picker', err);
      }
    }
    
    // Fallback for mobile devices: click the native camera file input
    if (cameraInput) {
      cameraInput.click();
    } else {
      showToast('Camera not supported');
    }
  }

  // ═══════════════════ DM CHAT LIST ═══════════════════
  async function loadChatList() {
    if (!authToken) return;
    try {
      const resp = await fetch('/api/rooms/list', { headers: { 'Authorization': `Bearer ${authToken}` } });
      if (!resp.ok) return;
      const rooms = await resp.json();
      renderChatList(rooms);
    } catch (err) { console.error('loadChatList:', err); }
  }

  function renderChatList(rooms) {
    const list = document.getElementById('dmList');
    if (!list) return;
    if (!rooms || !rooms.length) {
      list.innerHTML = '<div class="dm-list-empty">No chats yet</div>';
      return;
    }
    list.innerHTML = rooms.map(room => {
      const name    = room.otherParticipant || room.name.replace('dm_', '').replace(/_/g, ', ');
      const preview = room.lastMessage
        ? `${room.lastMessage.user === myName ? 'You: ' : ''}${room.lastMessage.text || (room.lastMessage.type === 'image' ? '\uD83D\uDCF7 Photo' : room.lastMessage.type === 'voice' ? '\uD83C\uDFA4 Voice' : '\uD83D\uDCAC')}`.slice(0, 38)
        : 'No messages yet';
      const timeStr = room.lastActivity ? formatTimestamp(room.lastActivity) : '';
      const badge   = room.unread > 0 ? `<div class="dm-row-badge">${room.unread}</div>` : '';
      const active  = room.name === myRoom ? 'active' : '';
      return `<div class="dm-row ${active}" onclick="BestieChat.switchRoom('${escapeHtml(room.name)}')">
        <div class="dm-row-avatar">\u2728</div>
        <div class="dm-row-info"><div class="dm-row-name">@${escapeHtml(name)}</div><div class="dm-row-preview">${escapeHtml(preview)}</div></div>
        ${badge}
        <div style="font-size:0.67rem;color:var(--muted);flex-shrink:0;">${timeStr}</div>
      </div>`;
    }).join('');
  }

  function formatTimestamp(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  async function switchRoom(roomName) {
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

  function openNewChatModal() {
    const modal = document.getElementById('newChatModal');
    if (modal) { modal.style.display = 'flex'; modal.classList.add('open'); }
    const search = document.getElementById('newChatSearch');
    if (search) { search.value = ''; setTimeout(() => search.focus(), 100); }
    const results = document.getElementById('newChatResults');
    if (results) results.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:0.82rem;padding:20px 0;">Type a username to search</div>';
  }

  function closeNewChatModal() {
    const modal = document.getElementById('newChatModal');
    if (modal) { modal.style.display = 'none'; modal.classList.remove('open'); }
  }

  let _dmSearchTimeout;
  async function searchUsersForDM(query) {
    clearTimeout(_dmSearchTimeout);
    const results = document.getElementById('newChatResults');
    if (!results) return;
    if (!query || query.length < 2) {
      results.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:0.82rem;padding:16px 0;">Type at least 2 characters</div>';
      return;
    }
    _dmSearchTimeout = setTimeout(async () => {
      try {
        const resp = await fetch(`/api/rooms/users/search?q=${encodeURIComponent(query)}`, { headers: { 'Authorization': `Bearer ${authToken}` } });
        if (!resp.ok) return;
        const users = await resp.json();
        if (!users.length) { results.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:0.82rem;padding:16px 0;">No users found</div>'; return; }
        results.innerHTML = users.map(u =>
          `<div class="user-result-row">
            <div class="user-result-avatar">${u.avatar || '\u2728'}</div>
            <div class="user-result-name">@${escapeHtml(u.username)}</div>
            <button class="user-result-btn" onclick="BestieChat.startDMWith('${escapeHtml(u.username)}')">Message</button>
          </div>`
        ).join('');
      } catch (err) { console.error('search error:', err); }
    }, 300);
  }

  async function startDMWith(username) {
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

  // ═══════════════════ OFFLINE QUEUE & CACHE ═══════════════════
  async function initOfflineDB() {
    if (!window.indexedDB) return;
    return new Promise(resolve => {
      const req = indexedDB.open('bestie-store-v2', 1);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        try { db.createObjectStore('queue', { autoIncrement: true }); } catch(_) {}
        try {
          const msgStore = db.createObjectStore('messages', { keyPath: 'id' });
          msgStore.createIndex('room', 'room', { unique: false });
        } catch(_) {}
      };
      req.onsuccess = e => { offlineDB = e.target.result; resolve(); };
      req.onerror  = () => resolve();
    });
  }

  async function saveMessageToOfflineDB(msg) {
    if (!offlineDB || !msg || !msg.id) return;
    msg.room = myRoom;
    return new Promise(resolve => {
      try {
        const tx = offlineDB.transaction('messages', 'readwrite');
        tx.objectStore('messages').put(msg);
        tx.oncomplete = resolve; tx.onerror = resolve;
      } catch(_) { resolve(); }
    });
  }

  async function saveMessagesHistoryToOfflineDB(history) {
    if (!offlineDB || !history) return;
    return new Promise(resolve => {
      try {
        const tx = offlineDB.transaction('messages', 'readwrite');
        const store = tx.objectStore('messages');
        history.forEach(msg => {
          if (msg && msg.id) {
            msg.room = myRoom;
            store.put(msg);
          }
        });
        tx.oncomplete = resolve; tx.onerror = resolve;
      } catch(_) { resolve(); }
    });
  }

  async function deleteMessageFromOfflineDB(messageId) {
    if (!offlineDB) return;
    return new Promise(resolve => {
      try {
        const tx = offlineDB.transaction('messages', 'readwrite');
        tx.objectStore('messages').delete(messageId);
        tx.oncomplete = resolve; tx.onerror = resolve;
      } catch(_) { resolve(); }
    });
  }

  async function clearRoomHistoryInOfflineDB(room) {
    if (!offlineDB) return;
    return new Promise(resolve => {
      try {
        const tx = offlineDB.transaction('messages', 'readwrite');
        const store = tx.objectStore('messages');
        const index = store.index('room');
        const req = index.openCursor(IDBKeyRange.only(room));
        req.onsuccess = e => {
          const cursor = e.target.result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          } else {
            resolve();
          }
        };
        req.onerror = () => resolve();
      } catch(_) { resolve(); }
    });
  }

  async function loadCachedMessagesFromOfflineDB(room) {
    if (!offlineDB) return [];
    return new Promise(resolve => {
      try {
        const tx = offlineDB.transaction('messages', 'readonly');
        const store = tx.objectStore('messages');
        const index = store.index('room');
        const req = index.getAll(IDBKeyRange.only(room));
        req.onsuccess = e => {
          const msgs = e.target.result || [];
          msgs.sort((a, b) => (a.time || 0) - (b.time || 0));
          resolve(msgs);
        };
        req.onerror = () => resolve([]);
      } catch(_) { resolve([]); }
    });
  }

  async function queueOfflineMessage(msg) {
    if (!offlineDB) return;
    return new Promise(resolve => {
      try {
        const tx = offlineDB.transaction('queue', 'readwrite');
        tx.objectStore('queue').add(msg);
        tx.oncomplete = resolve; tx.onerror = resolve;
      } catch(_) { resolve(); }
    });
  }

  async function flushOfflineQueue() {
    if (!offlineDB || !socket || !socket.connected) return;
    return new Promise(resolve => {
      try {
        const tx   = offlineDB.transaction('queue', 'readwrite');
        const store = tx.objectStore('queue');
        const req   = store.openCursor();
        req.onsuccess = e => {
          const cursor = e.target.result;
          if (!cursor) { resolve(); return; }
          socket.emit('message', cursor.value);
          cursor.delete();
          cursor.continue();
        };
        req.onerror = () => resolve();
      } catch(_) { resolve(); }
    });
  }

  // ═══════════════════ PUSH NOTIFICATIONS ═══════════════════
  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    return new Uint8Array([...rawData].map(c => c.charCodeAt(0)));
  }

  async function togglePushNotifications() {
    const statusText = document.getElementById('pushStatusText');
    const toggleBtn  = document.getElementById('pushToggleBtn');
    if (!('Notification' in window)) { showToast('Push notifications not supported'); return; }
    if (Notification.permission === 'denied') { showToast('\u26D4 Notifications blocked. Enable in browser settings.'); return; }
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { showToast('Notifications permission denied'); return; }
      const reg = await navigator.serviceWorker.ready;
      const vapidResp = await fetch('/api/push-vapid-key');
      const { publicKey } = await vapidResp.json();
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
      await fetch('/api/push-subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: myName, subscription: sub.toJSON() })
      });
      if (statusText) statusText.textContent = '\u2705 Enabled';
      if (toggleBtn)  toggleBtn.textContent = 'Disable';
      localStorage.setItem('bestiePushEnabled', 'true');
      showToast('\uD83D\uDD14 Push notifications enabled!');
    } catch (err) {
      showToast('Could not enable: ' + err.message);
    }
  }

  function openChatsModal() {
    loadChatList();
    showModal('chatsModal');
  }

  function closeChatsModal() {
    hideModal('chatsModal');
  }

  function toggleStickerPanel() {
    const panel = document.getElementById('stickerPanel');
    if (!panel) return;
    const isVisible = panel.style.display !== 'none';
    panel.style.display = isVisible ? 'none' : 'block';
  }

  function toggleQuickMenu() {
    toggleModal('quickMenu');
  }

  // ═══════════════════ TELEGRAM & WHATSAPP SUITE ═══════════════════
  function triggerDoubleTapHeart(wrap, msgId) {
    const bubble = document.createElement('div');
    bubble.className = 'heart-pop-bubble';
    bubble.textContent = '❤️';
    wrap.appendChild(bubble);
    setTimeout(() => bubble.remove(), 800);
    react(msgId, '❤️');
    if ('vibrate' in navigator) { try { navigator.vibrate(30); } catch(e){} }
  }

  // ── Starred Messages ──
  function toggleStarMessage(messageId, starred) {
    if (!joined || !socket) return;
    socket.emit('star-message', { messageId, starred: Boolean(starred) });
    showToast(starred ? '⭐ Message starred' : '🌟 Message unstarred');
    hideContextMenu();
  }

  function openStarredModal() {
    const modal = document.getElementById('starredModal');
    const listEl = document.getElementById('starredList');
    const emptyEl = document.getElementById('starredEmpty');
    if (!modal || !listEl) return;
    modal.style.display = 'flex';
    listEl.innerHTML = '';

    const starred = allMessagesCached.filter(m => !m.deleted && m.starredBy && m.starredBy.includes(myName));
    if (starred.length === 0) {
      if (emptyEl) emptyEl.style.display = 'block';
    } else {
      if (emptyEl) emptyEl.style.display = 'none';
      starred.forEach(m => {
        const card = document.createElement('div');
        card.className = 'starred-card';
        card.onclick = () => { closeStarredModal(); scrollToMessage(m.id); };
        const label = m.type === 'image' ? '📸 Photo' : (m.type === 'voice' ? '🎤 Voice note' : (m.type === 'video-note' ? '⭕ Video note' : decryptE2EE(m.text || '')));
        card.innerHTML = `
          <div class="starred-card-meta">
            <span>${escapeHtml(getDisplayName(m.user))}</span>
            <span>${new Date(m.time).toLocaleDateString()}</span>
          </div>
          <div class="starred-card-text">${escapeHtml(label)}</div>
        `;
        listEl.appendChild(card);
      });
    }
  }

  function closeStarredModal() {
    const modal = document.getElementById('starredModal');
    if (modal) modal.style.display = 'none';
  }

  // ── Telegram Circular Video Note Recorder ──
  let videoNoteStream = null;
  let videoNoteRecorder = null;
  let videoNoteChunks = [];
  let videoNoteTimerInterval = null;
  let videoNoteStartTime = 0;

  async function startVideoNote() {
    try {
      const modal = document.getElementById('videoNoteModal');
      const preview = document.getElementById('videoNotePreview');
      const timer = document.getElementById('videoNoteTimer');
      if (!modal || !preview) return;

      if (els.attachMenu) els.attachMenu.style.display = 'none';

      videoNoteStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 480 }, aspectRatio: 1 },
        audio: true
      });
      preview.srcObject = videoNoteStream;
      modal.style.display = 'flex';

      videoNoteChunks = [];
      let mimeType = '';
      if (typeof MediaRecorder.isTypeSupported === 'function') {
        if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) mimeType = 'video/webm;codecs=vp8,opus';
        else if (MediaRecorder.isTypeSupported('video/mp4')) mimeType = 'video/mp4';
        else if (MediaRecorder.isTypeSupported('video/webm')) mimeType = 'video/webm';
      }

      try {
        videoNoteRecorder = mimeType ? new MediaRecorder(videoNoteStream, { mimeType }) : new MediaRecorder(videoNoteStream);
      } catch (_) {
        videoNoteRecorder = new MediaRecorder(videoNoteStream);
      }

      videoNoteRecorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) videoNoteChunks.push(e.data); };
      videoNoteRecorder.onstop = async () => {
        if (videoNoteStream) {
          videoNoteStream.getTracks().forEach(t => t.stop());
          videoNoteStream = null;
        }
        if (preview) preview.srcObject = null;
        modal.style.display = 'none';
        if (!videoNoteChunks.length) return;

        const dur = Math.max(1, Math.round((Date.now() - videoNoteStartTime) / 1000));
        const finalMime = (videoNoteChunks[0] && videoNoteChunks[0].type) || mimeType || 'video/mp4';
        const blob = new Blob(videoNoteChunks, { type: finalMime });
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            showToast('Sending circular video note… 🚀');
            const { url } = await uploadFile(reader.result, finalMime, 'video');
            socket.emit('message', { type: 'video-note', url, duration: dur, replyTo: replyingTo });
            cancelReply();
            playSound('send');
          } catch (err) {
            console.error('Video note send error:', err);
            showToast('Failed to send video note');
          }
        };
        reader.readAsDataURL(blob);
      };

      videoNoteRecorder.start();
      videoNoteStartTime = Date.now();
      if (socket) socket.emit('presence-status', { status: 'recording-video' });

      if (videoNoteTimerInterval) clearInterval(videoNoteTimerInterval);
      videoNoteTimerInterval = setInterval(() => {
        const sec = Math.floor((Date.now() - videoNoteStartTime) / 1000);
        if (timer) timer.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
        if (sec >= 60) stopAndSendVideoNote();
      }, 500);
    } catch (err) {
      console.warn('Video note access error:', err);
      showToast('Camera/Mic permission needed for video notes');
    }
  }

  function stopAndSendVideoNote() {
    if (videoNoteTimerInterval) { clearInterval(videoNoteTimerInterval); videoNoteTimerInterval = null; }
    if (videoNoteRecorder && videoNoteRecorder.state === 'recording') {
      videoNoteRecorder.stop();
    }
    if (socket) socket.emit('presence-status', { status: 'idle' });
  }

  function cancelVideoNote() {
    if (videoNoteTimerInterval) { clearInterval(videoNoteTimerInterval); videoNoteTimerInterval = null; }
    if (videoNoteStream) {
      videoNoteStream.getTracks().forEach(t => t.stop());
      videoNoteStream = null;
    }
    videoNoteChunks = [];
    const modal = document.getElementById('videoNoteModal');
    if (modal) modal.style.display = 'none';
    if (socket) socket.emit('presence-status', { status: 'idle' });
  }

  function toggleVideoNoteAudio(wrap) {
    const vid = wrap.querySelector('video');
    const badge = wrap.querySelector('.video-circle-mute-badge');
    if (!vid) return;
    vid.muted = !vid.muted;
    if (badge) badge.textContent = vid.muted ? '🔇' : '🔊';
  }

  // ═══════════════════ PUBLIC API ═══════════════════
  window.BestieChat = {
    joinChat, leaveChat, sendMessage, sendHug,
    toggleRecord, react, votePoll,
    toggleEmojiPicker, toggleGameMenu, insertEmoji, startGame,
    toggleExtras, toggleFeelings, setFeeling, sendPulse,
    toggleSound, saveMood, saveJokes, saveCountdown, saveNickname,
    toggleGifPanel, searchGifs, sendSticker,
    toggleSearch, clearSearch, navigateSearch,
    openGallery, closeGallery, openLightbox, closeLightbox,
    openDoodle, closeDoodle, clearDoodle, sendDoodle,
    setDoodleColor, setDoodleTool, setDoodleSize,
    toggleSecretMode,
    replyToMessage, cancelReply, scrollToMessage,
    startEditMessage, deleteMessage,
    pinMessageById, unpinMessage, scrollToPinned,
    copyText,
    startCall, acceptCall, endCall, toggleMuteAudio, toggleCamera, flipCamera, toggleSpeaker,
    changeWallpaper,
    toggleAttachMenu, triggerPhotoUpload,
    toggleSidebar, closeSidebar, sidebarNavTo, openGamesHub, closeGamesHub,
    switchExtrasTab, changeAccent, changeSoundPack, updateE2EEKey, toggleE2EE,
    updateSharedPad, toggleAppPin, verifyPinLock, checkPinLock, toggleAudioSpeed,
    playWaveform, seekWaveform, transcribeAudio, cycleAudioSpeed, cancelRecording,
    addDiaryEntry, deleteDiaryEntry, addBucketItem, toggleBucketItem, deleteBucketItem,
    addCalendarEvent, deleteCalendarEvent,
    addGlossaryWord, deleteGlossaryWord,
    saveWeatherCity, waterBonsai,
    openCoDraw, closeCoDraw, clearCoDraw, setCoDrawColor, setCoDrawTool, setCoDrawSize,
    openWatchTogether, closeWatchTogether, loadWatchVideo,
    openTTT, closeTTT, makeTTTMove, resetTTT,
    openHapticSync, closeHapticSync, startHapticPulse, stopHapticPulse,
    sendNudge, toggleLofi, setLofiVolume,
    toggleTheme, selectTheme, applyAppTheme, dismissDailyQuestion, quickReact,
    togglePushNotifications,
    confirmClearHistory, exportChat, setRoomPassword, setDisappearingTimer, jumpToDate,
    openProfile, closeProfile, openBestieProfile, closeBestieProfile, selectAvatar, saveProfileStatus, saveProfileColor, saveNicknameFromProfile,
    toggleVoiceSpeed, openConnect4, closeConnect4, dropConnect4Token,
    sendQuickReply, captureDualCamera, uploadCameraFile, toggleQuickMenu,
    // WhatsApp & Telegram Suite
    triggerDoubleTapHeart, toggleStarMessage, openStarredModal, closeStarredModal,
    startVideoNote, stopAndSendVideoNote, cancelVideoNote, toggleVideoNoteAudio,
    handleSendBtnClick, hideContextMenu, uploadDocumentFile, openViewOnceMedia,
    // Auth
    setAuthMode, selectLoginAvatar, quickReentry, showFullLoginForm, copyInviteLink, togglePasswordVisibility, logout,
    // Multi-chat DMs
    loadChatList, switchRoom, openNewChatModal, closeNewChatModal, searchUsersForDM, startDMWith, openChatsModal, closeChatsModal, toggleStickerPanel,
    // Next-Gen Suite
    submitDailyAnswer, openTimeCapsuleModal, closeTimeCapsuleModal, setCapsulePreset, sendTimeCapsule, filterGallery, minimizeCall, restoreCall,
    scrollToBottom: scrollBottom
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
