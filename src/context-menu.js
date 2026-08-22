import { state } from './state.js';

  // ═══════════════════ CONTEXT MENU ═══════════════════
  export function showContextMenu(e, msg) {
    contextTarget = msg.id;
    const mine = msg.user === myName;
    const isPinned = pinnedMsg && pinnedMsg.id === msg.id;
    const isStarred = msg.starredBy && msg.starredBy.includes(myName);
    const safeUser = escapeHtml((msg.user || '').replace(/'/g, "&#39;"));
    const safeText = escapeHtml((msg.text || '').replace(/'/g, "&#39;"));

    let html = `
      <div class="ctx-reactions-row">
        <button class="ctx-react-btn" onclick="BestieChat.quickReact('${msg.id}', '❤️'); BestieChat.hideContextMenu();">❤️</button>
        <button class="ctx-react-btn" onclick="BestieChat.quickReact('${msg.id}', '👍'); BestieChat.hideContextMenu();">👍</button>
        <button class="ctx-react-btn" onclick="BestieChat.quickReact('${msg.id}', '🔥'); BestieChat.hideContextMenu();">🔥</button>
        <button class="ctx-react-btn" onclick="BestieChat.quickReact('${msg.id}', '😂'); BestieChat.hideContextMenu();">😂</button>
        <button class="ctx-react-btn" onclick="BestieChat.quickReact('${msg.id}', '🥰'); BestieChat.hideContextMenu();">🥰</button>
        <button class="ctx-react-btn" onclick="BestieChat.quickReact('${msg.id}', '🎉'); BestieChat.hideContextMenu();">🎉</button>
      </div>
    `;

    if (!msg.deleted) {
      html += `<button class="ctx-item" onclick="BestieChat.replyToMessage('${msg.id}','${safeUser}','${safeText}','${msg.type||'text'}'); BestieChat.hideContextMenu();">↩ Reply</button>`;
      html += `<button class="ctx-item" onclick="BestieChat.openThread('${msg.id}'); BestieChat.hideContextMenu();">🧵 View Thread</button>`;
      if (msg.text) {
        html += `<button class="ctx-item" onclick="BestieChat.copyText('${safeText}'); BestieChat.hideContextMenu();">📋 Copy Text</button>`;
      }
      if (mine && (msg.type === 'text' || !msg.type)) {
        html += `<button class="ctx-item" onclick="BestieChat.startEditMessage('${msg.id}','${safeText}'); BestieChat.hideContextMenu();">✏️ Edit</button>`;
      }
      html += `<button class="ctx-item" onclick="BestieChat.${isPinned ? 'unpinMessage()' : `pinMessageById('${msg.id}')`}; BestieChat.hideContextMenu();">📌 ${isPinned ? 'Unpin' : 'Pin'}</button>`;
      html += `<button class="ctx-item" onclick="BestieChat.toggleStarMessage('${msg.id}', ${!isStarred}); BestieChat.hideContextMenu();">⭐ ${isStarred ? 'Unstar' : 'Star'}</button>`;
      html += `<button class="ctx-item" onclick="BestieChat.forwardMessage('${msg.id}', '${myRoom}'); BestieChat.hideContextMenu();">📨 Forward</button>`;
      html += `<button class="ctx-item" onclick="BestieChat.muteRoom('${myRoom}', 3600000); BestieChat.hideContextMenu();">🔕 Mute 1h</button>`;
      if (mine) {
        html += `<div class="ctx-divider"></div>`;
        html += `<button class="ctx-item danger" onclick="BestieChat.deleteMessage('${msg.id}'); BestieChat.hideContextMenu();">🗑️ Delete</button>`;
      }
    }

    els.contextMenu.innerHTML = html;
    els.contextMenu.classList.add('open');

    const x = e.clientX || (e.changedTouches && e.changedTouches[0] && e.changedTouches[0].clientX) || window.innerWidth / 2;
    const y = e.clientY || (e.changedTouches && e.changedTouches[0] && e.changedTouches[0].clientY) || window.innerHeight / 2;

    const menuW = 200;
    const menuH = els.contextMenu.scrollHeight || 240;
    const menuLeft = Math.max(10, Math.min(x - 50, window.innerWidth  - menuW - 12));
    const menuTop  = Math.max(10, Math.min(y - 80, window.innerHeight - menuH - 12));
    els.contextMenu.style.left = `${menuLeft}px`;
    els.contextMenu.style.top  = `${menuTop}px`;
  }

  export function hideContextMenu() {
    if (els.contextMenu) els.contextMenu.classList.remove('open');
    const picker = document.getElementById('reactionPicker');
    if (picker) picker.classList.remove('open');
  }