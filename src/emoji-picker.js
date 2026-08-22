import { state } from './state.js';
import { insertEmoji } from './emoji-games-gif.js';

  // ═══════════════════ EMOJI PICKER INIT ═══════════════════
  export function buildEmojiPicker() {
    els.emojiPicker.innerHTML = EMOJIS.map((e) =>
      `<button type="button" onclick="BestieChat.insertEmoji('${e}')">${e}</button>`
    ).join('');
  }