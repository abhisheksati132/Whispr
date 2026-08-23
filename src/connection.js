import { updateBestieHeaderState } from './ui-updates.js';

  // ═══════════════════ CONNECTION STATUS ═══════════════════
  export function setConnected(online) {
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