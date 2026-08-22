import { state } from './state.js';

  // ═══════════════════ RENDER HELPERS ═══════════════════
  export function renderReactionBar(msgId) {
    return REACTIONS.map((e) =>
      `<button class="reaction-btn" onclick="BestieChat.react('${msgId}','${e}')">${e}</button>`
    ).join('');
  }

  export function renderReactions(msg) {
    if (!msg.reactions || !Object.keys(msg.reactions).length) return '';
    return Object.entries(msg.reactions).map(([emoji, users]) => {
      const mine = users.includes(myName);
      return `<span class="reaction-pill${mine ? ' mine' : ''}" onclick="BestieChat.react('${msg.id}','${emoji}')">${emoji} ${users.length}</span>`;
    }).join('');
  }

  // ── OpenGraph Link Preview Fetcher ──
  const previewedLinks = new Set();
  export function fetchAndRenderLinkPreview(messageId, text) {
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

  export function renderEmptyWelcome() {
    if (!els.messages) return;
    const existing = els.messages.querySelector('.empty-chat-welcome');
    if (existing) return;
    const cleanMyName = (myName || '').toLowerCase();
    const isDm = myRoom && myRoom.startsWith('dm_');
    let title = 'Welcome to your Private Space ✨';
    let sub = 'Send a message below, start a game, or share your invite link with a bestie to start talking!';
    if (isDm) {
      const parts = myRoom.replace('dm_', '').split('_');
      const other = parts.find(p => p.toLowerCase() !== cleanMyName) || parts[0];
      title = `Direct Chat with @${other} 💬`;
      sub = `This is the start of your direct private conversation with @${other}. Say hello!`;
    }
    const welcomeDiv = document.createElement('div');
    welcomeDiv.className = 'empty-chat-welcome';
    welcomeDiv.style.cssText = 'display:flex; flex-direction:column; align-items:center; justify-content:center; padding:48px 20px; text-align:center; margin:auto;';
    welcomeDiv.innerHTML = `
      <div style="font-size:44px; margin-bottom:12px;">💭</div>
      <h3 style="font-size:17px; font-weight:700; margin-bottom:6px; color:var(--text);">${escapeHtml(title)}</h3>
      <p style="font-size:13px; color:var(--muted); max-width:340px; line-height:1.5; margin-bottom:16px;">${escapeHtml(sub)}</p>
      ${!isDm ? `<button onclick="BestieChat.copyInviteLink()" style="background:linear-gradient(135deg, #4338ca, #818cf8); color:#fff; border:none; border-radius:12px; padding:10px 18px; font-size:13px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:6px;">🔗 Copy 1-Click Invite Link</button>` : ''}
    `;
    els.messages.appendChild(welcomeDiv);
  }

  export function renderMessage(msg, skipSound) {
    if (!msg || !msg.id) return;
    const welcome = els.messages ? els.messages.querySelector('.empty-chat-welcome') : null;
    if (welcome) welcome.remove();
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

  export function startSecretCountdown(msgId, startTime) {
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

  export function startTimeCapsuleCountdown(msgId, unlockAt) {
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

  export function updateReactions(messageId, reactions) {
    const el = document.getElementById(`reactions-${messageId}`);
    if (!el) return;
    el.innerHTML = Object.entries(reactions || {}).map(([emoji, users]) => {
      const mine = users.includes(myName);
      return `<span class="reaction-pill${mine ? ' mine' : ''}" onclick="BestieChat.react('${messageId}','${emoji}')">${emoji} ${users.length}</span>`;
    }).join('');
  }

  export function renderSystem(text) {
    const div = document.createElement('div');
    div.className  = 'system';
    div.textContent = text;
    els.messages.appendChild(div);
    scrollBottom();
  }

  export function renderMilestone(data) {
    const div = document.createElement('div');
    div.className  = 'milestone-msg';
    div.textContent = data.text;
    els.messages.appendChild(div);
    scrollBottom();
    playSound('milestone');
    confetti();
  }

  export function renderGamePrompt(data) {
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