import { getProfile } from './helpers.js';
import { showModal, hideModal } from './modals.js';
import { showToast } from './ultimate-features.js';

  // ═══════════════════ BESTIE PROFILE VIEWER ═══════════════════
  export function openBestieProfile(targetUser) {
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

  export function closeBestieProfile() {
    hideModal('bestieProfileModal');
  }

  let bestieProfileTarget = null;

  export async function blockUser(targetUser) {
    const user = targetUser || bestieProfileTarget;
    if (!user || user.toLowerCase() === (myName || '').toLowerCase()) return;
    try {
      const res = await fetch('/api/rooms/blocks', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ blockedUsername: user })
      });
      if (res.ok) {
        if (!blockedUsers.includes(user.toLowerCase())) blockedUsers.push(user.toLowerCase());
        showToast(`🚫 ${user} blocked`);
        const blockBtn = document.getElementById('blockUserBtn');
        if (blockBtn) blockBtn.textContent = '✅ Unblock User';
      }
    } catch (_) { showToast('Failed to block user'); }
  }

  export async function unblockUser(targetUser) {
    const user = targetUser || bestieProfileTarget;
    if (!user) return;
    try {
      const res = await fetch(`/api/rooms/blocks/${encodeURIComponent(user)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (res.ok) {
        blockedUsers = blockedUsers.filter(u => u !== user.toLowerCase());
        showToast(`✅ ${user} unblocked`);
        const blockBtn = document.getElementById('blockUserBtn');
        if (blockBtn) blockBtn.textContent = '🚫 Block User';
      }
    } catch (_) { showToast('Failed to unblock user'); }
  }

  export async function muteRoom(roomName, durationMs) {
    try {
      const res = await fetch(`/api/rooms/${encodeURIComponent(roomName)}/mute`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ muteUntil: Date.now() + (durationMs || 3600000) })
      });
      if (res.ok) {
        mutedRooms[roomName] = Date.now() + (durationMs || 3600000);
        showToast('🔕 Chat muted');
      }
    } catch (_) { showToast('Failed to mute chat'); }
  }

  export async function unmuteRoom(roomName) {
    try {
      const res = await fetch(`/api/rooms/${encodeURIComponent(roomName)}/mute`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (res.ok) {
        delete mutedRooms[roomName];
        showToast('🔔 Chat unmuted');
      }
    } catch (_) { showToast('Failed to unmute chat'); }
  }