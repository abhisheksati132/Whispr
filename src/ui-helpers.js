import { state } from './state.js';

  // ═══════════════════ UI HELPERS ═══════════════════
  let inputSendMode = 'voice'; // 'voice' or 'video'

  export function toggleSendMicIcons() {
    const hasText = els.msgInput && els.msgInput.value.trim().length > 0;
    const sendIcon = els.sendIcon;
    const micIcon = els.micIcon;
    const videoCamIcon = document.getElementById('videoCamIcon');
    
    if (sendIcon && micIcon) {
      if (hasText || editingMessageId) {
        sendIcon.style.display = 'block';
        micIcon.style.display = 'none';
        if (videoCamIcon) videoCamIcon.style.display = 'none';
      } else {
        sendIcon.style.display = 'none';
        if (inputSendMode === 'video') {
          micIcon.style.display = 'none';
          if (videoCamIcon) videoCamIcon.style.display = 'block';
        } else {
          micIcon.style.display = 'block';
          if (videoCamIcon) videoCamIcon.style.display = 'none';
        }
      }
    }
  }

  export function handleSendBtnClick() {
    const hasText = els.msgInput && els.msgInput.value.trim().length > 0;
    if (hasText || editingMessageId) {
      sendMessage();
      return;
    }
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      toggleRecord();
      return;
    }
    if (inputSendMode === 'video') {
      startVideoNote();
    } else {
      toggleRecord();
    }
  }

  export function toggleAttachMenu() {
    const menu = els.attachMenu;
    if (!menu) return;
    const isShowing = menu.style.display === 'grid';
    menu.style.display = isShowing ? 'none' : 'grid';
    
    // Auto-close other panels
    els.emojiPicker.classList.remove('open');
    els.gameMenu.classList.remove('open');
    els.gifPanel.classList.remove('open');
  }

  export function triggerPhotoUpload() {
    const input = document.getElementById('photoInput');
    if (input) input.click();
    if (els.attachMenu) els.attachMenu.style.display = 'none';
  }