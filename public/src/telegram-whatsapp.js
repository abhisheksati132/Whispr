import { state } from './state.js';
import { playSound } from './sounds.js';
import { cancelReply, scrollToMessage } from './reply.js';
import { hideContextMenu } from './context-menu.js';
import { getDisplayName } from './helpers.js';
import { uploadFileWithProgress } from './media.js';
import { react } from './reactions.js';
import { decryptE2EE, showToast } from './ultimate-features.js';
import { escapeHtml } from './utils.js';

  // ═══════════════════ TELEGRAM & WHATSAPP SUITE ═══════════════════
  export function triggerDoubleTapHeart(wrap, msgId) {
    const bubble = document.createElement('div');
    bubble.className = 'heart-pop-bubble';
    bubble.textContent = '❤️';
    wrap.appendChild(bubble);
    setTimeout(() => bubble.remove(), 800);
    react(msgId, '❤️');
    if ('vibrate' in navigator) { try { navigator.vibrate(30); } catch(e){} }
  }

  // ── Starred Messages ──
  export function toggleStarMessage(messageId, starred) {
    if (!joined || !socket) return;
    socket.emit('star-message', { messageId, starred: Boolean(starred) });
    showToast(starred ? '⭐ Message starred' : '🌟 Message unstarred');
    hideContextMenu();
  }

  export function openStarredModal() {
    const modal = document.getElementById('starredModal');
    const listEl = document.getElementById('starredList');
    const emptyEl = document.getElementById('starredEmpty');
    if (!modal || !listEl) return;
    modal.style.display = 'flex';
    listEl.innerHTML = '';

    const starred = allMessagesCached.filter(m => !m.deleted && m.starredBy && m.starredBy.includes(myName));
    if (starred.length === 0) {
      if (emptyEl) emptyEl.style.display = 'block';
    } else {
      if (emptyEl) emptyEl.style.display = 'none';
      starred.forEach(m => {
        const card = document.createElement('div');
        card.className = 'starred-card';
        card.onclick = () => { closeStarredModal(); scrollToMessage(m.id); };
        const label = m.type === 'image' ? '📸 Photo' : (m.type === 'voice' ? '🎤 Voice note' : (m.type === 'video-note' ? '⭕ Video note' : decryptE2EE(m.text || '')));
        card.innerHTML = `
          <div class="starred-card-meta">
            <span>${escapeHtml(getDisplayName(m.user))}</span>
            <span>${new Date(m.time).toLocaleDateString()}</span>
          </div>
          <div class="starred-card-text">${escapeHtml(label)}</div>
        `;
        listEl.appendChild(card);
      });
    }
  }

  export function closeStarredModal() {
    const modal = document.getElementById('starredModal');
    if (modal) modal.style.display = 'none';
  }

  // ── Telegram Circular Video Note Recorder ──
  let videoNoteStream = null;
  let videoNoteRecorder = null;
  let videoNoteChunks = [];
  let videoNoteTimerInterval = null;
  let videoNoteStartTime = 0;

  export async function startVideoNote() {
    try {
      const modal = document.getElementById('videoNoteModal');
      const preview = document.getElementById('videoNotePreview');
      const timer = document.getElementById('videoNoteTimer');
      if (!modal || !preview) return;

      if (els.attachMenu) els.attachMenu.style.display = 'none';

      videoNoteStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 480 }, aspectRatio: 1 },
        audio: true
      });
      preview.srcObject = videoNoteStream;
      modal.style.display = 'flex';

      videoNoteChunks = [];
      let mimeType = '';
      if (typeof MediaRecorder.isTypeSupported === 'function') {
        if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) mimeType = 'video/webm;codecs=vp8,opus';
        else if (MediaRecorder.isTypeSupported('video/mp4')) mimeType = 'video/mp4';
        else if (MediaRecorder.isTypeSupported('video/webm')) mimeType = 'video/webm';
      }

      try {
        videoNoteRecorder = mimeType ? new MediaRecorder(videoNoteStream, { mimeType }) : new MediaRecorder(videoNoteStream);
      } catch (_) {
        videoNoteRecorder = new MediaRecorder(videoNoteStream);
      }

      videoNoteRecorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) videoNoteChunks.push(e.data); };
      videoNoteRecorder.onstop = async () => {
        if (videoNoteStream) {
          videoNoteStream.getTracks().forEach(t => t.stop());
          videoNoteStream = null;
        }
        if (preview) preview.srcObject = null;
        modal.style.display = 'none';
        if (!videoNoteChunks.length) return;

        const dur = Math.max(1, Math.round((Date.now() - videoNoteStartTime) / 1000));
        const finalMime = (videoNoteChunks[0] && videoNoteChunks[0].type) || mimeType || 'video/mp4';
        const blob = new Blob(videoNoteChunks, { type: finalMime });
        try {
          showToast('Sending circular video note… 🚀');
          const result = await uploadFileWithProgress(blob, 'video', (pct) => showToast(`Sending video… ${pct}%`));
          socket.emit('message', { type: 'video-note', url: result.url, duration: dur, replyTo: replyingTo });
          cancelReply();
          playSound('send');
        } catch (err) {
          console.error('Video note send error:', err);
          showToast('Failed to send video note');
        }
      };

      videoNoteRecorder.start();
      videoNoteStartTime = Date.now();
      if (socket) socket.emit('presence-status', { status: 'recording-video' });

      if (videoNoteTimerInterval) clearInterval(videoNoteTimerInterval);
      videoNoteTimerInterval = setInterval(() => {
        const sec = Math.floor((Date.now() - videoNoteStartTime) / 1000);
        if (timer) timer.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
        if (sec >= 60) stopAndSendVideoNote();
      }, 500);
    } catch (err) {
      console.warn('Video note access error:', err);
      showToast('Camera/Mic permission needed for video notes');
    }
  }

  export function stopAndSendVideoNote() {
    if (videoNoteTimerInterval) { clearInterval(videoNoteTimerInterval); videoNoteTimerInterval = null; }
    if (videoNoteRecorder && videoNoteRecorder.state === 'recording') {
      videoNoteRecorder.stop();
    }
    if (socket) socket.emit('presence-status', { status: 'idle' });
  }

  export function cancelVideoNote() {
    if (videoNoteTimerInterval) { clearInterval(videoNoteTimerInterval); videoNoteTimerInterval = null; }
    if (videoNoteStream) {
      videoNoteStream.getTracks().forEach(t => t.stop());
      videoNoteStream = null;
    }
    videoNoteChunks = [];
    const modal = document.getElementById('videoNoteModal');
    if (modal) modal.style.display = 'none';
    if (socket) socket.emit('presence-status', { status: 'idle' });
  }

  export function toggleVideoNoteAudio(wrap) {
    const vid = wrap.querySelector('video');
    const badge = wrap.querySelector('.video-circle-mute-badge');
    if (!vid) return;
    vid.muted = !vid.muted;
    if (badge) badge.textContent = vid.muted ? '🔇' : '🔊';
  }