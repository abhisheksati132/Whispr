import { state } from './state.js';

  // ═══════════════════ EMOJI / GAMES / GIF ═══════════════════
  export function toggleEmojiPicker() {
    if (!els.emojiPicker.children.length) buildEmojiPicker();
    els.emojiPicker.classList.toggle('open');
    if (els.gameMenu) els.gameMenu.classList.remove('open');
    if (els.gifPanel) els.gifPanel.classList.remove('open');
    if (els.attachMenu) els.attachMenu.style.display = 'none';
    const sPanel = document.getElementById('stickerPanel');
    if (sPanel) sPanel.style.display = 'none';
  }
  export function toggleGameMenu() {
    els.gameMenu.classList.toggle('open');
    els.emojiPicker.classList.remove('open');
    els.gifPanel.classList.remove('open');
    if (els.attachMenu) els.attachMenu.style.display = 'none';
  }
  export function insertEmoji(emoji) { els.msgInput.value += emoji; els.msgInput.focus(); toggleSendMicIcons(); spawnFloatingEmoji(emoji, els.msgInput); }
  export function startGame(type) { socket.emit('start-game', type); els.gameMenu.classList.remove('open'); }

  export function toggleGifPanel() {
    const isOpen = els.gifPanel.classList.toggle('open');
    if (isOpen) {
      els.emojiPicker.classList.remove('open');
      els.gameMenu.classList.remove('open');
      if (els.attachMenu) els.attachMenu.style.display = 'none';
      if (!els.gifGrid.children.length) renderGifGrid(STICKERS);
    }
  }

  export function renderGifGrid(stickers) {
    els.gifGrid.innerHTML = stickers.map((s) =>
      `<img src="${escapeHtml(s.url)}" loading="lazy" alt="sticker" onclick="BestieChat.sendSticker('${escapeHtml(s.url)}')" />`
    ).join('');
  }

  let gifSearchDebounce = null;

  export async function searchGifs() {
    clearTimeout(gifSearchDebounce);
    gifSearchDebounce = setTimeout(async () => {
      const q = (els.gifSearch && els.gifSearch.value ? els.gifSearch.value.trim() : '');
      try {
        const endpoint = q ? `/api/gifs?q=${encodeURIComponent(q)}` : '/api/gifs?q=cute%20love';
        const res = await fetch(endpoint);
        if (res.ok) {
          const data = await res.json();
          if (data.results && data.results.length) {
            renderGifGrid(data.results);
            return;
          }
        }
      } catch (err) {
        console.warn('GIF search error:', err);
      }
      const filtered = STICKERS.filter((s) => !q || s.tags.some((t) => t.includes(q.toLowerCase())));
      renderGifGrid(filtered.length ? filtered : STICKERS);
    }, 200);
  }

  export function sendSticker(url) {
    if (!joined) return;
    socket.emit('message', { type: 'image', url, text: '' });
    playSound('send');
    els.gifPanel.classList.remove('open');
    const panel = document.getElementById('stickerPanel');
    if (panel) panel.style.display = 'none';
  }