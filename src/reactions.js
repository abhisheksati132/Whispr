import { triggerHaptic } from './helpers.js';

  // ═══════════════════ REACTIONS ═══════════════════
  export function react(messageId, emoji) {
    if (!joined) return;
    triggerHaptic(8);
    const el   = document.getElementById(`reactions-${messageId}`);
    const pill = el && [...el.querySelectorAll('.reaction-pill')].find((p) => p.textContent.startsWith(emoji));
    const already = pill && pill.classList.contains('mine');
    socket.emit('react', { messageId, emoji, add: !already });
  }

  export function votePoll(messageId, option) { 
    triggerHaptic(8);
    socket.emit('poll-vote', { messageId, option }); 
  }