import { state } from './state.js';

  // ═══════════════════ CHAT WALLPAPER ═══════════════════
  export function changeWallpaper(type, customUrl) {
    const messagesEl = document.getElementById('messages') || els.messages;
    const selectEl = document.getElementById('wallpaperSelect');
    const customInputEl = document.getElementById('wallpaperUrlInput');
    const selected = type !== undefined ? type : (selectEl ? selectEl.value : '');

    if (selectEl && selected !== undefined) selectEl.value = selected;
    if (customInputEl) customInputEl.style.display = selected === 'custom' ? 'block' : 'none';

    if (!messagesEl) return;

    messagesEl.style.backgroundImage = '';
    messagesEl.style.backgroundColor = '';
    messagesEl.style.background = '';

    if (selected === 'custom') {
      const url = customUrl || (customInputEl ? customInputEl.value.trim() : '');
      if (url) {
        messagesEl.style.backgroundImage = `url('${url}')`;
        messagesEl.style.backgroundSize = 'cover';
        messagesEl.style.backgroundPosition = 'center';
        messagesEl.style.backgroundRepeat = 'no-repeat';
        localStorage.setItem('bestieChatWallpaper', 'custom');
        localStorage.setItem('bestieChatWallpaperUrl', url);
        showToast('Custom wallpaper applied! 🖼️');
      }
    } else if (selected === 'gradient-lavender') {
      messagesEl.style.background = 'linear-gradient(135deg, #efedf7 0%, #f7f6fb 50%, #e2dff0 100%)';
      localStorage.setItem('bestieChatWallpaper', selected);
      showToast('Lavender Mist wallpaper applied! 🖼️');
    } else if (selected === 'gradient-frost-violet') {
      messagesEl.style.background = 'linear-gradient(135deg, #f3eff9 0%, #ffffff 50%, #ebdffd 100%)';
      localStorage.setItem('bestieChatWallpaper', selected);
      showToast('Frost Violet wallpaper applied! 🖼️');
    } else if (selected === 'gradient-pearl-rose') {
      messagesEl.style.background = 'linear-gradient(135deg, #fff2f5 0%, #ffffff 50%, #f5eefc 100%)';
      localStorage.setItem('bestieChatWallpaper', selected);
      showToast('Pearl Rose wallpaper applied! 🖼️');
    } else if (selected && selected.startsWith('#')) {
      messagesEl.style.backgroundColor = selected;
      localStorage.setItem('bestieChatWallpaper', selected);
      showToast('Solid color wallpaper applied! 🖼️');
    } else {
      localStorage.removeItem('bestieChatWallpaper');
      localStorage.removeItem('bestieChatWallpaperUrl');
      if (type !== undefined) showToast('Default wallpaper restored');
    }
  }