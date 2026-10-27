// Terminal HUD DOM Renderer & UI Utilities
// Strict DOM manipulation: textContent for all user-controlled values (zero innerHTML injection)

import { loadAuthenticatedMedia, revokeMediaUrl } from './media.js';

let lastRenderedDate = '';
let currentAuthToken = '';

export function setAuthToken(token) {
  currentAuthToken = token;
}

function formatTime(timestamp) {
  const d = new Date(timestamp);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `[${hh}:${mm}:${ss}]`;
}

function formatDate(timestamp) {
  const d = new Date(timestamp);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `---- ${yyyy}-${mm}-${dd} ----`;
}

export function updateStatusBar({ state, latency, partnerName, isOnline, lastSeen }) {
  const linkEl = document.getElementById('link-state');
  const pingEl = document.getElementById('ping-display');
  const partnerEl = document.getElementById('partner-status');

  if (linkEl && state) {
    linkEl.textContent = state;
    linkEl.className = state === 'ESTABLISHED' ? 'status-online' : 'status-dim';
  }

  if (pingEl && typeof latency === 'number') {
    pingEl.textContent = `LAT ${latency}ms`;
  }

  if (partnerEl) {
    if (!partnerName) {
      partnerEl.textContent = '[PARTNER: NONE]';
    } else if (isOnline) {
      partnerEl.textContent = `[${partnerName}: ONLINE]`;
      partnerEl.className = 'status-online';
    } else if (lastSeen) {
      const d = new Date(lastSeen);
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      partnerEl.textContent = `[${partnerName}: SEEN ${hh}:${mm}]`;
      partnerEl.className = 'status-dim';
    } else {
      partnerEl.textContent = `[${partnerName}: OFFLINE]`;
      partnerEl.className = 'status-dim';
    }
  }
}

export function updateTypingIndicator(partnerName, isTyping) {
  const typingEl = document.getElementById('typing-indicator');
  if (!typingEl) return;
  if (isTyping && partnerName) {
    typingEl.textContent = `${partnerName} is typing`;
    const cursor = document.createElement('span');
    cursor.className = 'blinking-cursor';
    typingEl.appendChild(cursor);
  } else {
    typingEl.textContent = '';
  }
}

export function renderMessage(msg, myUsername, onReply, onEdit, onDelete, onOpenPhoto) {
  const logEl = document.getElementById('chat-log');
  if (!logEl || !msg) return;

  const isOwn = String(msg.sender).toLowerCase() === String(myUsername).toLowerCase();
  const dateStr = formatDate(msg.createdAt);

  if (dateStr !== lastRenderedDate) {
    const divider = document.createElement('div');
    divider.className = 'day-divider';
    divider.textContent = dateStr;
    logEl.appendChild(divider);
    lastRenderedDate = dateStr;
  }

  // Check if message line already exists (deduplication or update)
  let lineEl = document.getElementById(`msg-${msg.id}`);
  const isNew = !lineEl;
  if (isNew) {
    lineEl = document.createElement('div');
    lineEl.id = `msg-${msg.id}`;
  } else {
    lineEl.replaceChildren(); // Clear existing content for fresh render
  }

  lineEl.className = `msg-line ${isOwn ? 'is-own' : 'is-partner'}`;

  // Reply preview bar
  if (msg.replyTo) {
    const replyBar = document.createElement('div');
    replyBar.className = 'msg-reply-bar';
    const parentEl = document.getElementById(`msg-${msg.replyTo}`);
    const parentText = parentEl ? parentEl.querySelector('.msg-text-own, .msg-text-partner')?.textContent : '';
    replyBar.textContent = parentText ? `  re: ${parentText.slice(0, 40)}` : `  re: [msg ${msg.replyTo.slice(0, 8)}]`;
    lineEl.appendChild(replyBar);
  }

  // Main row
  const row = document.createElement('div');
  row.className = 'msg-content-row';

  const timeSpan = document.createElement('span');
  timeSpan.className = 'msg-time';
  timeSpan.textContent = formatTime(msg.createdAt);
  row.appendChild(timeSpan);

  const prefixSpan = document.createElement('span');
  prefixSpan.className = isOwn ? 'msg-prefix-own' : 'msg-prefix-partner';
  prefixSpan.textContent = isOwn ? 'you>' : `${msg.sender}>`;
  row.appendChild(prefixSpan);

  if (msg.deletedAt) {
    const deletedSpan = document.createElement('span');
    deletedSpan.className = 'msg-meta-deleted';
    deletedSpan.textContent = '[deleted]';
    row.appendChild(deletedSpan);
    if (msg.mediaPath) {
      revokeMediaUrl(msg.mediaPath);
    }
  } else {
    if (msg.type === 'text') {
      const textSpan = document.createElement('span');
      textSpan.className = isOwn ? 'msg-text-own' : 'msg-text-partner';
      textSpan.textContent = msg.body || '';
      row.appendChild(textSpan);
    } else if (msg.type === 'image') {
      const frame = document.createElement('div');
      frame.className = 'photo-frame';
      const img = document.createElement('img');
      img.alt = 'Shared photo';
      img.loading = 'lazy';
      frame.appendChild(img);

      const cap = document.createElement('div');
      cap.className = 'photo-caption';
      cap.textContent = 'IMG [LOADING...]';
      frame.appendChild(cap);

      loadAuthenticatedMedia(msg.mediaPath, currentAuthToken)
        .then((blobUrl) => {
          img.src = blobUrl;
          cap.textContent = 'IMG [TAP TO VIEW]';
        })
        .catch(() => {
          cap.textContent = 'IMG [LOAD FAILED]';
        });

      frame.addEventListener('click', () => {
        if (onOpenPhoto && img.src) onOpenPhoto(img.src);
      });
      row.appendChild(frame);
    } else if (msg.type === 'voice') {
      const voiceBox = document.createElement('div');
      voiceBox.className = 'voice-row';

      const playBtn = document.createElement('button');
      playBtn.className = 'bracket-btn';
      playBtn.textContent = '[PLAY]';
      playBtn.style.minHeight = '32px';
      playBtn.style.minWidth = '54px';

      const waveform = document.createElement('span');
      waveform.className = 'voice-waveform';
      waveform.textContent = '▁▃▅▇▅▃▁';

      const durSpan = document.createElement('span');
      durSpan.className = 'voice-duration';
      const sec = Math.round((msg.durationMs || 0) / 1000);
      durSpan.textContent = `00:${String(sec).padStart(2, '0')}`;

      let audio = null;
      playBtn.addEventListener('click', async () => {
        try {
          if (!audio) {
            playBtn.textContent = '[...]';
            const blobUrl = await loadAuthenticatedMedia(msg.mediaPath, currentAuthToken);
            audio = new Audio(blobUrl);
            audio.addEventListener('ended', () => {
              playBtn.textContent = '[PLAY]';
            });
          }
          if (audio.paused) {
            await audio.play();
            playBtn.textContent = '[STOP]';
          } else {
            audio.pause();
            audio.currentTime = 0;
            playBtn.textContent = '[PLAY]';
          }
        } catch {
          playBtn.textContent = '[ERR]';
        }
      });

      voiceBox.appendChild(playBtn);
      voiceBox.appendChild(waveform);
      voiceBox.appendChild(durSpan);
      row.appendChild(voiceBox);
    }

    if (msg.editedAt) {
      const editedSpan = document.createElement('span');
      editedSpan.className = 'msg-meta-edited';
      editedSpan.textContent = '(edited)';
      row.appendChild(editedSpan);
    }

    // Inline action controls: [RE] for all, [EDIT] [DEL] for own messages
    const actionsSpan = document.createElement('span');
    actionsSpan.className = 'msg-actions';

    const replyBtn = document.createElement('button');
    replyBtn.className = 'msg-action-btn';
    replyBtn.textContent = '[RE]';
    replyBtn.title = 'Reply';
    replyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (onReply) onReply(msg);
    });
    actionsSpan.appendChild(replyBtn);

    if (isOwn) {
      if (msg.type === 'text') {
        const editBtn = document.createElement('button');
        editBtn.className = 'msg-action-btn';
        editBtn.textContent = '[EDIT]';
        editBtn.title = 'Edit';
        editBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (onEdit) onEdit(msg);
        });
        actionsSpan.appendChild(editBtn);
      }

      const delBtn = document.createElement('button');
      delBtn.className = 'msg-action-btn msg-action-del';
      delBtn.textContent = '[DEL]';
      delBtn.title = 'Delete';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (onDelete) onDelete(msg);
      });
      actionsSpan.appendChild(delBtn);
    }

    row.appendChild(actionsSpan);

    // Context actions on tap/click
    lineEl.addEventListener('click', (e) => {
      if (e.target.tagName === 'BUTTON' || e.target.tagName === 'IMG') return;
      if (onReply) onReply(msg);
    });
  }

  // Delivery / Read Receipts for own messages
  if (isOwn && !msg.deletedAt) {
    const receiptSpan = document.createElement('span');
    receiptSpan.className = 'msg-receipt';
    if (msg.readAt) {
      receiptSpan.textContent = '[READ]';
    } else if (msg.deliveredAt) {
      receiptSpan.textContent = '[DLVD]';
    } else {
      receiptSpan.textContent = '[SENT]';
    }
    row.appendChild(receiptSpan);
  }

  lineEl.appendChild(row);

  if (isNew) {
    logEl.appendChild(lineEl);
    logEl.scrollTop = logEl.scrollHeight;
  }
}

export function updateReceipts(type) {
  const receipts = document.querySelectorAll('.msg-line.is-own .msg-receipt');
  receipts.forEach(el => {
    if (type === 'read') {
      el.textContent = '[READ]';
    } else if (type === 'delivered' && el.textContent === '[SENT]') {
      el.textContent = '[DLVD]';
    }
  });
}

export function setupScanlinesToggle() {
  const btn = document.getElementById('btn-fx-toggle');
  if (!btn) return;
  const isEnabled = localStorage.getItem('whispr_fx_scanlines') === '1';
  if (isEnabled) {
    document.body.classList.add('scanlines');
    btn.classList.add('active');
  }

  btn.addEventListener('click', () => {
    document.body.classList.toggle('scanlines');
    const active = document.body.classList.contains('scanlines');
    btn.classList.toggle('active', active);
    localStorage.setItem('whispr_fx_scanlines', active ? '1' : '0');
  });
}

export function setupLightbox() {
  const lightbox = document.getElementById('lightbox');
  const img = document.getElementById('lightbox-img');
  if (!lightbox || !img) return;

  lightbox.addEventListener('click', () => {
    lightbox.classList.remove('active');
    img.src = '';
  });
}

export function openLightbox(url) {
  const lightbox = document.getElementById('lightbox');
  const img = document.getElementById('lightbox-img');
  if (lightbox && img && url) {
    img.src = url;
    lightbox.classList.add('active');
  }
}
