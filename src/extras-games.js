import { state } from './state.js';

  // ═══════════════════ EXTRAS & GAMES ═══════════════════
  export function toggleExtras()   { toggleModal('extrasPanel'); }
  export function openExtras(tab = 'vibe') {
    showModal('extrasPanel');
    if (tab) switchExtrasTab(tab);
  }
  export function openGamesHub()  { showModal('gamesHubModal'); }
  export function closeGamesHub() { hideModal('gamesHubModal'); }
  export function toggleFeelings() { els.feelingsPanel.classList.toggle('open'); }

  export function buildFeelingsGrid() {
    els.feelingsGrid.innerHTML = Object.entries(feelingsPalette).map(([key, f]) => `
      <button type="button" class="feeling-btn${key === myFeelingKey ? ' mine' : ''}" data-feeling="${key}" onclick="BestieChat.setFeeling('${key}')">
        <span class="fe-emoji">${f.emoji}</span>${escapeHtml(f.label)}
      </button>
    `).join('');
  }

  export function setFeeling(key) {
    if (!joined) return;
    myFeelingKey = key;
    socket.emit('set-feeling', key);
    buildFeelingsGrid();
  }

  export function renderTheirFeeling() {
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

  export function sendPulse() {
    if (!joined) return;
    socket.emit('empathy-pulse');
    playPulseAnimation('You');
  }

  export function playPulseAnimation(fromLabel) {
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

  export function toggleSound() {
    const on = localStorage.getItem('bestieSound') !== 'off';
    localStorage.setItem('bestieSound', on ? 'off' : 'on');
    if (els.soundBtn) els.soundBtn.classList.toggle('active', !on);
  }