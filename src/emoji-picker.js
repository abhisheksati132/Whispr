  // ═══════════════════ EMOJI PICKER INIT ═══════════════════
  export function buildEmojiPicker() {
    els.emojiPicker.innerHTML = EMOJIS.map((e) =>
      `<button type="button" onclick="BestieChat.insertEmoji('${e}')">${e}</button>`
    ).join('');
  }