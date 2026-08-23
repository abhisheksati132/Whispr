import { state } from './state.js';

  // ═══════════════════ HELPERS ═══════════════════
  export function getDisplayName(username) {
    const p = profiles[username] || {};
    return p.nickname || username;
  }
  export function getProfile(username) { return profiles[username] || myProfile; }

  export function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  export function formatDateLabel(ts) {
    const d = new Date(ts), today = new Date(), yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === today.toDateString())     return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  }

  export function formatLastSeen(ts) {
    if (!ts) return '';
    const diff = Date.now() - ts;
    if (diff < 60000)   return 'Active just now';
    if (diff < 3600000) return `Active ${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000)return `Active ${Math.floor(diff / 3600000)}h ago`;
    return `Active ${new Date(ts).toLocaleDateString()}`;
  }

  export function maybeAddDateDivider(ts) {
    const label = formatDateLabel(ts);
    if (label === lastDateLabel) return;
    lastDateLabel = label;
    const div = document.createElement('div');
    div.className = 'date-divider';
    div.textContent = label;
    els.messages.appendChild(div);
  }

  export function triggerHaptic(ms = 10) {
    if ('vibrate' in navigator) {
      try { navigator.vibrate(ms); } catch (_) {}
    }
  }

  let _scrollRaf = null;
  export function scrollBottom(smooth = false) {
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

  export function isMusicUrl(text) { return MUSIC_DOMAINS.test((text || '').trim()); }

  export function getMusicPlatform(url) {
    if (/spotify/i.test(url))   return { name: 'Spotify',      icon: '🎵', color: '#1db954' };
    if (/youtube|youtu\.be/i.test(url)) return { name: 'YouTube', icon: '▶️', color: '#ff0000' };
    if (/soundcloud/i.test(url))return { name: 'SoundCloud',   icon: '🔊', color: '#ff5500' };
    if (/apple/i.test(url))     return { name: 'Apple Music',  icon: '🎵', color: '#fa57c1' };
    return { name: 'Music', icon: '🎵', color: '#8b5cf6' };
  }