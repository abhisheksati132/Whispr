import { getProfile, getDisplayName, formatLastSeen } from './helpers.js';
import { applyNightGlow } from './sounds.js';

  // ═══════════════════ UI UPDATES ═══════════════════
  let lastSeenData = {};
  let currentOnlineUsers = [];

  export function updateBestieHeaderState(users, lastSeen) {
    if (users) currentOnlineUsers = users;
    if (lastSeen) lastSeenData = lastSeen;

    const avatarEl    = els.bestieAvatar;
    const nameEl      = els.bestieName;
    const statusEl    = els.bestieStatus;
    const hAvatarEl   = document.getElementById('headerBestieAvatar');
    const hNameEl     = document.getElementById('headerBestieName');
    const hStatusEl   = document.getElementById('headerBestieStatus');

    let bestieDisplay;
    let bestieAvatar;
    let bestieStatus;
    let isOnline = false;

    const cleanMyName = (myName || '').toLowerCase();

    // 1. If currently in a DM room (e.g. dm_alex_sam or dm_alex_alex)
    if (myRoom && myRoom.startsWith('dm_')) {
      const parts = myRoom.replace('dm_', '').split('_');
      const isSaved = (parts.length === 2 && parts[0].toLowerCase() === cleanMyName && parts[1].toLowerCase() === cleanMyName);

      if (isSaved) {
        bestieAvatar = '🔖';
        bestieDisplay = 'Saved Messages';
        bestieStatus = 'Your personal cloud storage & notes';
        isOnline = true;
      } else {
        const otherUsername = parts.find(p => p.toLowerCase() !== cleanMyName) || parts[0] || 'bestie';
        const p = getProfile(otherUsername);
        bestieAvatar = p.avatar || '✨';
        bestieDisplay = p.nickname ? `${p.nickname} (@${otherUsername})` : `@${otherUsername}`;

        const isOtherOnline = currentOnlineUsers.some(u => (u || '').toLowerCase() === otherUsername.toLowerCase());
        if (isOtherOnline) {
          bestieStatus = 'Online 🟢';
          isOnline = true;
        } else {
          const ts = lastSeenData[otherUsername] || lastSeenData[otherUsername.toLowerCase()];
          bestieStatus = ts ? formatLastSeen(ts) : 'Offline';
        }
      }
    } else {
      // 2. In shared space (our-private-space or custom room)
      const others = currentOnlineUsers.filter((u) => (u || '').toLowerCase() !== cleanMyName);

      if (others.length === 1) {
        const bestie = others[0];
        const p = getProfile(bestie);
        bestieAvatar  = p.avatar || '🐱';
        bestieDisplay = p.nickname ? `${p.nickname} (@${bestie})` : `@${bestie}`;
        bestieStatus  = 'Online 🟢';
        isOnline      = true;
      } else if (others.length > 1) {
        bestieAvatar  = '👥';
        bestieDisplay = `${others.length} Besties Online`;
        bestieStatus  = others.map(u => getDisplayName(u)).join(', ');
        isOnline      = true;
      } else {
        const allOthers = Object.keys(lastSeenData || {}).filter((u) => (u || '').toLowerCase() !== cleanMyName);
        if (allOthers.length) {
          const sorted = allOthers.sort((a, b) => (lastSeenData[b] || 0) - (lastSeenData[a] || 0));
          const lastBestie = sorted[0];
          const p = getProfile(lastBestie);
          bestieAvatar  = p.avatar || '🐱';
          bestieDisplay = p.nickname ? `${p.nickname} (@${lastBestie})` : `@${lastBestie}`;
          const ts = lastSeenData[lastBestie];
          bestieStatus = ts ? formatLastSeen(ts) : 'Offline';
        } else {
          bestieDisplay = myRoom === 'our-private-space' ? 'Our Private Space' : `#${myRoom}`;
          bestieAvatar  = '💭';
          bestieStatus  = 'Share invite link to connect 🔗';
        }
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

  export function updateStreak(streak) {
    if (!streak) return;
    const days = streak.days || 0;
    els.streakBadge.textContent = days > 0 ? `🔥 ${days} day streak` : '🔥 Start a streak!';
  }

  export function updateLastSeen(lastSeen) {
    if (lastSeen) lastSeenData = lastSeen;
    updateBestieHeaderState();
  }

  export function updateUnreadBadge() {
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

  export function clearUnread() { unreadCount = 0; updateUnreadBadge(); }

  export function updateCountdown(countdown) {
    if (!countdown || !countdown.date) { els.countdownDisplay.textContent = ''; return; }
    const diff = new Date(countdown.date).getTime() - Date.now();
    if (diff <= 0) { els.countdownDisplay.textContent = `${countdown.label || "It's here!"} 🎉`; return; }
    const days = Math.floor(diff / 86400000);
    const hrs  = Math.floor((diff % 86400000) / 3600000);
    const mins = Math.floor((diff % 3600000)  / 60000);
    els.countdownDisplay.textContent = `${countdown.label || 'Countdown'}: ${days}d ${hrs}h ${mins}m`;
  }

  export function sendDesktopNotification(title, options = {}) {
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.ready.then((reg) => {
            reg.showNotification(title, options);
          }).catch(() => {
            try { new Notification(title, options); } catch { /* ignore */ }
          });
        } else {
          try { new Notification(title, options); } catch { /* ignore */ }
        }
      }
    } catch (err) {
      console.warn('Notification ignored:', err);
    }
  }

  export function checkDailyReminder() {
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

  export function updatePinnedBanner(msg) {
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

  export function startIntervals() {
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