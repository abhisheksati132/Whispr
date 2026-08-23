import { state } from './state.js';

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
  export function getAudioContext() {
    if (!_sharedAudioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) _sharedAudioCtx = new AudioContextClass();
    }
    if (_sharedAudioCtx && _sharedAudioCtx.state === 'suspended') {
      _sharedAudioCtx.resume().catch(() => {});
    }
    return _sharedAudioCtx;
  }
  export function soundEnabled() { return localStorage.getItem('bestieSound') !== 'off' && currentSoundPack !== 'off'; }
  export function playTone(freq, dur, vol) {
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
  export function playSound(name) {
    if (!soundEnabled()) return;
    const pack = soundPacks[currentSoundPack] || soundPacks.cozy;
    if (pack[name]) pack[name]();
  }

  // ═══════════════════ AMBIENT ═══════════════════
  export function initAmbience() {
    // Keep clean, elegant workspace background without emoji clutter
  }

  export function confetti() {
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

  export function applyNightGlow() {
    const h = new Date().getHours();
    document.body.classList.toggle('night-glow', h >= 22 || h < 6);
  }

  export function applyRoomTheme(room) {
    document.body.classList.remove('theme-daily', 'theme-cute');
    const cls = ROOM_THEMES[room];
    if (cls) document.body.classList.add(cls);
  }
