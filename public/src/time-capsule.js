import { state } from './state.js';
import { playSound } from './sounds.js';
import { showModal, hideModal } from './modals.js';
import { showToast } from './ultimate-features.js';

  // ═══════════════════ TIME CAPSULE ═══════════════════
  export function openTimeCapsuleModal() {
    if (els.attachMenu) els.attachMenu.style.display = 'none';
    setCapsulePreset(1);
    showModal('timeCapsuleModal');
  }

  export function closeTimeCapsuleModal() {
    hideModal('timeCapsuleModal');
  }

  export function setCapsulePreset(days) {
    const d = new Date();
    d.setDate(d.getDate() + Number(days || 1));
    const input = document.getElementById('capsuleDateInput');
    if (input) {
      const pad = (n) => String(n).padStart(2, '0');
      input.value = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
  }

  export function sendTimeCapsule() {
    const textInput = document.getElementById('capsuleTextInput');
    const dateInput = document.getElementById('capsuleDateInput');
    if (!textInput || !textInput.value.trim()) {
      showToast('Please write a capsule message!');
      return;
    }
    const unlockTime = dateInput && dateInput.value ? new Date(dateInput.value).getTime() : (Date.now() + 86400000);
    if (unlockTime <= Date.now()) {
      showToast('Please pick a future unlock date!');
      return;
    }
    socket.emit('message', {
      type: 'time-capsule',
      text: textInput.value.trim(),
      unlockAt: unlockTime
    });
    closeTimeCapsuleModal();
    textInput.value = '';
    showToast('⏳ Time Capsule sealed and sent!');
    playSound('send');
  }

  export function openLightbox(url) {
    if (!els.lightboxImg || !els.lightbox) return;
    els.lightboxImg.src = url;
    if (els.lightboxDownloadBtn) els.lightboxDownloadBtn.href = url;
    els.lightbox.style.display = 'flex';
  }

  export function closeLightbox() {
    if (els.lightbox) els.lightbox.style.display = 'none';
    if (els.lightboxImg) els.lightboxImg.src = '';
  }