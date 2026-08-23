import { state } from './state.js';

  // ═══════════════════ SECRET MODE ═══════════════════
  export function toggleSecretMode() {
    secretMode = !secretMode;
    if (els.secretToggle) els.secretToggle.classList.toggle('active', secretMode);
    els.secretIndicator.style.display = secretMode ? 'block' : 'none';
  }