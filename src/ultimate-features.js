import { state } from './state.js';

  // ═══════════════════ ULTIMATE FEATURES SET ═══════════════════

  // ── Tab Navigation ──
  let activeExtrasTab = 'vibe';
  export function switchExtrasTab(tabId) {
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

  export function changeAccent(accentKey) {
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
  export function updateSharedPad(text) {
    if (socket) socket.emit('update-pad', { text });
  }

  // ── App PIN Lock ──
  export function toggleAppPin() {
    const input = document.getElementById('appPinInput');
    const btn = document.getElementById('pinToggleBtn');
    const current = localStorage.getItem('bestieAppPin');
    if (current) {
      localStorage.removeItem('bestieAppPin');
      localStorage.removeItem('bestieBiometricEnabled');
      if (btn) btn.textContent = 'Enable';
      if (input) input.value = '';
      showToast('🔓 App Lock PIN disabled');
    } else if (input && input.value.length === 4) {
      localStorage.setItem('bestieAppPin', input.value);
      if (btn) btn.textContent = 'Disable';
      showToast('🔒 App Lock PIN enabled!');
      setTimeout(enableBiometricLock, 500);
    } else {
      showToast('⚠️ Please enter a 4-digit PIN');
    }
  }

  export function verifyPinLock(val) {
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

  export async function enableBiometricLock() {
    const pin = localStorage.getItem('bestieAppPin');
    if (!pin) { showToast('Set a 4-digit PIN first'); return; }
    try {
      if (!navigator.credentials || !navigator.credentials.create) {
        showToast('Biometrics not supported in this browser');
        return;
      }
      const credential = await navigator.credentials.create({
        password: {
          id: `whispr-biometric-${myName || 'user'}`,
          password: pin,
          icon: '/icon-192.png'
        }
      });
      if (credential) {
        localStorage.setItem('bestieBiometricEnabled', 'true');
        showToast('🔓 Biometric unlock enabled!');
        const btn = document.getElementById('biometricUnlockBtn');
        if (btn) btn.style.display = 'inline-block';
      }
    } catch (err) {
      console.error('Biometric enable error:', err);
      showToast('Could not enable biometrics');
    }
  }

  export async function verifyBiometricLock() {
    try {
      if (!navigator.credentials || !navigator.credentials.get) {
        showToast('Biometrics not supported');
        return;
      }
      const credential = await navigator.credentials.get({
        password: true,
        icon: '/icon-192.png'
      });
      if (credential && credential.password) {
        verifyPinLock(credential.password);
      }
    } catch (err) {
      console.error('Biometric verify error:', err);
      if (err.name !== 'NotAllowedError') showToast('Biometric unlock failed');
    }
  }

  export function checkPinLock() {
    const pin = localStorage.getItem('bestieAppPin');
    if (pin) {
      const modal = document.getElementById('passcodeLockModal');
      if (modal) modal.style.display = 'flex';
      const input = document.getElementById('pinLockInput');
      if (input) input.focus();
      const bioBtn = document.getElementById('biometricUnlockBtn');
      if (bioBtn && localStorage.getItem('bestieBiometricEnabled') === 'true') {
        bioBtn.style.display = 'inline-block';
      }
    }
  }

  export function toggleAudioSpeed(btn, audioId) {
    const audio = document.getElementById(audioId);
    if (!audio) return;
    const cur = audio.playbackRate || 1.0;
    const nxt = cur === 1.0 ? 1.5 : cur === 1.5 ? 2.0 : 1.0;
    audio.playbackRate = nxt;
    if (btn) btn.textContent = `${nxt}x`;
  }

  // ── Sound Packs ──
  export function changeSoundPack(pack) {
    currentSoundPack = pack;
    localStorage.setItem('bestieChatSoundPack', pack);
  }

  // ── End-to-End Encryption (E2EE) XOR ──
  export function updateE2EEKey() {
    const input = document.getElementById('e2eKeyInput');
    if (input) {
      e2eKey = input.value;
      localStorage.setItem('bestieChatE2EEKey', e2eKey);
      refreshMessagesLayout();
      updateE2EEFingerprint();
    }
  }

  export function toggleE2EE() {
    const btn = document.getElementById('e2eToggleBtn');
    if (!btn) return;
    e2eEnabled = !e2eEnabled;
    btn.textContent = e2eEnabled ? 'Disable' : 'Enable';
    btn.classList.toggle('active', e2eEnabled);
    localStorage.setItem('bestieChatE2EEActive', e2eEnabled ? 'true' : 'false');
    refreshMessagesLayout();
  }

  export function encryptE2EE(text) {
    if (!e2eEnabled || !e2eKey || typeof CryptoJS === 'undefined') return text;
    try {
      return '🔒:' + CryptoJS.AES.encrypt(text, e2eKey).toString();
    } catch {
      return text;
    }
  }

  export function decryptE2EE(text) {
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

  export function playWaveform(msgId, btn) {
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

  export function seekWaveform(event, msgId) {
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

  export function transcribeAudio(msgId, url) {
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
  export function addDiaryEntry() {
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

  export function deleteDiaryEntry(index) {
    sharedDiary.splice(index, 1);
    renderDiaryList(sharedDiary);
    socket.emit('update-diary', sharedDiary);
  }

  export function renderDiaryList(diary) {
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
  export function addCalendarEvent() {
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

  export function deleteCalendarEvent(index) {
    sharedCalendar.splice(index, 1);
    renderCalendarList(sharedCalendar);
    socket.emit('update-calendar', sharedCalendar);
  }

  export function renderCalendarList(cal) {
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
  export function addBucketItem() {
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

  export function toggleBucketItem(index) {
    const item = sharedBucketList[index];
    if (!item) return;
    item.done = !item.done;
    item.dateCompleted = item.done ? new Date().toLocaleDateString() : null;
    renderBucketList(sharedBucketList);
    socket.emit('update-bucketlist', sharedBucketList);
    if (item.done) confetti();
  }

  export function deleteBucketItem(index) {
    sharedBucketList.splice(index, 1);
    renderBucketList(sharedBucketList);
    socket.emit('update-bucketlist', sharedBucketList);
  }

  export function renderBucketList(list) {
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
  export function addGlossaryWord() {
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

  export function deleteGlossaryWord(index) {
    sharedGlossary.splice(index, 1);
    renderGlossaryList(sharedGlossary);
    refreshMessagesLayout();
    socket.emit('update-glossary', sharedGlossary);
  }

  export function renderGlossaryList(glossary) {
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

  export function highlightInsideJokes(text) {
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

  export function refreshMessagesLayout() {
    const container = els.messages;
    if (!container) return;
    container.innerHTML = '';
    lastDateLabel = '';
    allMessagesCached.forEach(m => renderMessage(m, true));
    scrollBottom();
  }

  // ── Conversation Heatmap ──
  export function renderHeatmap() {
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
  export function saveWeatherCity(city) {
    localStorage.setItem('bestieWeatherCity', city);
    fetchWeatherForCity(city);
    if (socket && joined) socket.emit('update-weather', city);
  }

  export function fetchWeatherForCity(city) {
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

  export function weatherCodeToEmoji(code) {
    if (code === 0) return '☀️';
    if (code <= 3) return '🌤️';
    if (code <= 48) return '🌫️';
    if (code <= 67) return '🌧️';
    if (code <= 77) return '❄️';
    if (code <= 82) return '🌦️';
    return '⛈️';
  }

  let bonsaiWateringCooldown = false;
  export function waterBonsai() {
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
  export function renderBonsai(state) {
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

  export function openCoDraw() {
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

  export function closeCoDraw() {
    hideModal('coDrawModal');
  }

  export function startCoDrawStroke(e) {
    coDrawingActive = true;
    const coords = getCoDrawCoords(e);
    coDrawLastX = coords.x;
    coDrawLastY = coords.y;
  }

  export function drawCoDrawStroke(e) {
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

  export function stopCoDrawStroke() { coDrawingActive = false; }

  export function getCoDrawCoords(e) {
    const canvas = document.getElementById('coDrawCanvas');
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  }

  export function drawCoDrawStrokeLocal(stroke) {
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

  export function clearCoDraw(isLocal) {
    const canvas = document.getElementById('coDrawCanvas');
    if (!canvas || !coDrawCtx) return;
    coDrawCtx.clearRect(0, 0, canvas.width, canvas.height);
    if (isLocal) socket.emit('draw-clear');
  }

  export function setCoDrawColor(color, btn) {
    coDrawColor = color;
    coDrawTool = 'brush';
    document.querySelectorAll('#coDrawModal .doodle-color').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }

  export function setCoDrawTool(tool, btn) {
    coDrawTool = tool;
    document.querySelectorAll('#coDrawModal .doodle-tool').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }

  export function setCoDrawSize(size) {
    coDrawSize = size;
  }

  // ── YouTube Watch Together syncer ──
  let watchPlayerFrame = null;

  export function openWatchTogether() {
    showModal('watchModal');
    if (els.attachMenu) els.attachMenu.style.display = 'none';
  }

  export function closeWatchTogether() {
    hideModal('watchModal');
  }

  export function loadWatchVideo(url) {
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

  export function syncWatchTogetherPlayer(data) {
    if (data.action === 'load') {
      loadWatchVideo(data.url);
    }
  }

  // ── Multiplayer Tic-Tac-Toe synced game ──
  let tttBoard = Array(9).fill(null);
  let tttMySymbol = 'X';
  let tttTurnSymbol = 'X';

  export function openTTT() {
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

  export function closeTTT() {
    hideModal('tttModal');
  }

  export function resetTTT(isLocal) {
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

  export function updateTTTStatus() {
    const turnEl = document.getElementById('tttTurn');
    if (!turnEl) return;
    if (tttTurnSymbol === tttMySymbol) {
      turnEl.textContent = `Your Turn (${tttMySymbol})`;
    } else {
      turnEl.textContent = `Bestie's Turn (${tttTurnSymbol})`;
    }
  }

  export function makeTTTMove(cellIndex) {
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

  export function handleTTTMoveLocal(data) {
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

  export function checkTTTWinner() {
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

  export function openHapticSync() {
    showModal('hapticModal');
    if (els.attachMenu) els.attachMenu.style.display = 'none';
  }

  export function closeHapticSync() {
    hideModal('hapticModal');
    stopHapticPulse();
  }

  export function startHapticPulse(e) {
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

  export function stopHapticPulse() {
    if (hapticPulseInterval) {
      clearInterval(hapticPulseInterval);
      hapticPulseInterval = null;
    }
    const heart = document.getElementById('hapticHeart');
    if (heart) heart.style.animationDuration = '1.6s';
    
    const status = document.getElementById('hapticStatus');
    if (status) status.textContent = 'Hold down heart to sync';
  }

  export function triggerHapticPulseLocal() {
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
  export function sendNudge() {
    if (!joined) return;
    socket.emit('nudge');
    triggerScreenNudge('You');
    if (els.attachMenu) els.attachMenu.style.display = 'none';
  }

  export function triggerScreenNudge(from) {
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

  export function toggleLofi() {
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

  export function startSynthesizedLofi() {
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

  export function stopSynthesizedLofi() {
    lofiOscillators.forEach(osc => {
      try { osc.stop(); osc.disconnect(); } catch(e){}
    });
    lofiOscillators = [];
  }

  export function setLofiVolume(vol) {
    const audio = document.getElementById('lofiAudio');
    if (audio) audio.volume = Number(vol);
    if (lofiGain && lofiAudioCtx) {
      lofiGain.gain.setValueAtTime(Number(vol) * 0.15, lofiAudioCtx.currentTime);
    }
  }

  // ── Message Reactions bursts ──
  export function triggerEmojiReactionBurst(messageId, emoji) {
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
  export function init() {
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
  export function showToast(msg) {
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

  export function applyAppTheme(themeName) {
    document.body.classList.remove('theme-dark', 'theme-ios');
    const valid = themeName === 'dark' ? 'dark' : 'light';
    if (valid === 'dark') {
      document.body.classList.add('theme-dark');
    }
    if (els.msgInput) els.msgInput.placeholder = 'Message…';
    localStorage.setItem('bestieChatTheme', valid);
    const select = document.getElementById('themeSelect');
    if (select) select.value = valid;
    const toggleBtn = document.getElementById('themeToggle');
    if (toggleBtn) {
      toggleBtn.textContent = valid === 'dark' ? '☀️' : '🌙';
      toggleBtn.title = valid === 'dark' ? 'Switch to Day Mode (☀️)' : 'Switch to Night Mode (🌙)';
    }
  }

  export function selectTheme(themeName) {
    const valid = themeName === 'dark' ? 'dark' : 'light';
    applyAppTheme(valid);
    showToast(`Switched to ${valid === 'dark' ? 'Night Mode 🌙' : 'Day Mode ☀️'}`);
  }

  export function toggleTheme() {
    const current = localStorage.getItem('bestieChatTheme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    applyAppTheme(next);
    showToast(`Theme: ${next === 'dark' ? 'Night Mode 🌙' : 'Day Mode ☀️'}`);
  }

  let currentDailyQuestionState = null;
  let dailyQuestionAutoDismissTimer = null;

  export function dismissDailyQuestion(manual = true) {
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

  export function renderDailyQuestionCard(state) {
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

  export function submitDailyAnswer() {
    const input = document.getElementById('dqAnswerInput');
    if (!input || !input.value.trim() || !joined || !socket) return;
    const answer = input.value.trim();
    socket.emit('submit-daily-answer', { answer });
    input.value = '';
    showToast('🔒 Answer locked! Waiting for Bestie…');
  }

  export async function fetchDailyQuestion() {
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

  export function updateScoreboardDisplay(scores) {
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

  export function updateE2EEFingerprint() {
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

  export function quickReact(emoji) {
    if (contextTarget) {
      react(contextTarget, emoji);
      const picker = document.getElementById('reactionPicker');
      if (picker) picker.classList.remove('open');
      hideContextMenu();
    }
  }

  export async function togglePushNotifications() {
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

  export function confirmClearHistory() {
    if (!joined) return;
    if (confirm('Are you sure you want to clear all chat history for both besties?')) {
      socket.emit('clear-history');
    }
  }

  export function exportChat() {
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

  export function setRoomPassword() {
    const input = document.getElementById('roomPasswordInput');
    if (!input || !joined) return;
    socket.emit('set-room-password', input.value.trim());
  }

  export function setDisappearingTimer(val) {
    if (!joined) return;
    socket.emit('set-disappearing-timer', parseInt(val, 10));
  }

  export function jumpToDate(dateStr) {
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

  export function updatePrefsProfileDisplay() {
    const profile = getProfile(myName);
    const prefsAvatar = document.getElementById('prefsProfileAvatar');
    const prefsName = document.getElementById('prefsProfileName');
    const prefsStatus = document.getElementById('prefsProfileStatus');
    if (prefsAvatar) prefsAvatar.textContent = profile.avatar || '✨';
    if (prefsName) prefsName.textContent = getDisplayName(myName);
    if (prefsStatus) prefsStatus.textContent = profile.statusBio || 'No status bio set';
  }

  export function openProfile() {
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

  export function saveNicknameFromProfile(nick) {
    const trimmed = String(nick || '').trim();
    if (trimmed) {
      localStorage.setItem('bestieChatNickname', trimmed);
      if (els.nicknameInputChat) els.nicknameInputChat.value = trimmed;
      if (joined) socket.emit('update-nickname', trimmed);
      showToast('Nickname updated! ✨');
    }
  }

  export function closeProfile() {
    hideModal('profileModal');
  }

  export function selectAvatar(emoji) {
    const avatarDisplay = document.getElementById('profileAvatarDisplay');
    if (avatarDisplay) avatarDisplay.textContent = emoji;
    socket.emit('update-profile-bio', { avatar: emoji });
    showToast(`Avatar updated: ${emoji}`);
    updatePrefsProfileDisplay();
    updateSidebarMyProfile();
  }

  export function saveProfileStatus(bio) {
    socket.emit('update-profile-bio', { statusBio: String(bio || '').trim() });
    showToast('Status saved! 💭');
    updatePrefsProfileDisplay();
    updateSidebarMyProfile();
  }

  export function saveProfileColor(color) {
    socket.emit('update-profile-bio', { color });
    showToast('Bubble accent updated! 🎨');
  }

  // ── Voice Note Speed Control ──────────────────────────────────────────
  export function toggleVoiceSpeed(btn, audioId) {
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

  export function openConnect4() {
    showModal('connect4Modal');
    c4BoardState = Array(6).fill(null).map(() => Array(7).fill(null));
    c4Turn = 'red';
    renderConnect4Board();
  }

  export function closeConnect4() {
    hideModal('connect4Modal');
  }

  export function renderConnect4Board() {
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

  export function checkConnect4Win(board, color) {
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

  export function dropConnect4Token(c, isLocal = true) {
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

  export function sendQuickReply(text) {
    if (!text) return;
    if (els.msgInput) {
      els.msgInput.value = text;
      sendMessage();
    }
  }

  export function uploadCameraFile(input) {
    if (!input || !input.files || !input.files[0]) return;
    const file = input.files[0];
    showToast('📸 Uploading camera photo...');
    (async () => {
      try {
        const result = await uploadFileWithProgress(file, 'image', (pct) => showToast(`📸 Uploading… ${pct}%`));
        if (result.url) {
          socket.emit('message', { user: myName, type: 'image', url: result.url });
          showToast('📸 Camera Moment sent!');
        }
      } catch (err) {
        showToast('Could not upload camera photo');
      }
    })();
  }

  export async function captureDualCamera() {
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