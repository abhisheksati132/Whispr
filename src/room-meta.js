import { state } from './state.js';
import { updateCountdown } from './ui-updates.js';

  // ═══════════════════ ROOM META ═══════════════════
  export function saveMood()     { socket.emit('update-mood', els.moodInput.value); }
  export function saveJokes()    { if (els.jokesInput) socket.emit('update-jokes', els.jokesInput.value.split('\n').filter(Boolean)); }
  export function saveCountdown(){ socket.emit('update-countdown', { label: els.countdownLabel.value, date: els.countdownDate.value || null }); updateCountdown({ label: els.countdownLabel.value, date: els.countdownDate.value }); }
  export function saveNickname() {
    const nick = (els.nicknameInputChat ? els.nicknameInputChat.value : '').trim();
    if (nick) localStorage.setItem('bestieChatNickname', nick);
    if (nick && joined) socket.emit('update-nickname', nick);
  }