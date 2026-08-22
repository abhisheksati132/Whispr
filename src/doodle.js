import { state } from './state.js';
import { playSound } from './sounds.js';
import { cancelReply } from './reply.js';
import { uploadFileWithProgress } from './media.js';
import { showModal, hideModal } from './modals.js';
import { renderSystem } from './ui.js';
import { showToast } from './ultimate-features.js';

  // ═══════════════════ DOODLE PAD ═══════════════════
  export function openDoodle() {
    showModal('doodleModal');
    if (!doodleCtx) initDoodleCanvas();
  }

  export function closeDoodle() {
    hideModal('doodleModal');
  }

  export function initDoodleCanvas() {
    const canvas = els.doodleCanvas;
    const dpr = window.devicePixelRatio || 1;
    const w   = canvas.parentElement.clientWidth - 0;
    const h   = Math.min(300, window.innerHeight * 0.35);
    canvas.width  = w * dpr;
    canvas.height = h * dpr;
    canvas.style.height = `${h}px`;
    doodleCtx = canvas.getContext('2d');
    doodleCtx.scale(dpr, dpr);
    doodleCtx.lineCap     = 'round';
    doodleCtx.lineJoin    = 'round';
    doodleCtx.strokeStyle = doodleColor;
    doodleCtx.lineWidth   = doodleSize;

    function getPos(e) {
      const rect = canvas.getBoundingClientRect();
      const src  = e.touches ? e.touches[0] : e;
      return { x: src.clientX - rect.left, y: src.clientY - rect.top };
    }

    function startDraw(e) {
      e.preventDefault();
      doodleDrawing = true;
      const { x, y } = getPos(e);
      doodleLastX = x; doodleLastY = y;
      doodleCtx.beginPath();
      doodleCtx.arc(x, y, doodleCtx.lineWidth / 2, 0, Math.PI * 2);
      doodleCtx.fillStyle = doodleTool === 'eraser' ? '#1a1a2e' : doodleColor;
      doodleCtx.fill();
    }

    function draw(e) {
      e.preventDefault();
      if (!doodleDrawing) return;
      const { x, y } = getPos(e);
      doodleCtx.strokeStyle = doodleTool === 'eraser' ? '#1a1a2e' : doodleColor;
      doodleCtx.lineWidth   = doodleTool === 'eraser' ? doodleSize * 3 : doodleSize;
      doodleCtx.beginPath();
      const midX = (doodleLastX + x) / 2;
      const midY = (doodleLastY + y) / 2;
      doodleCtx.moveTo(doodleLastX, doodleLastY);
      doodleCtx.quadraticCurveTo(doodleLastX, doodleLastY, midX, midY);
      doodleCtx.lineTo(x, y);
      doodleCtx.stroke();
      doodleLastX = x; doodleLastY = y;
    }

    function endDraw() { doodleDrawing = false; }

    canvas.addEventListener('mousedown',  startDraw);
    canvas.addEventListener('mousemove',  draw);
    canvas.addEventListener('mouseup',    endDraw);
    canvas.addEventListener('mouseleave', endDraw);
    canvas.addEventListener('touchstart', startDraw, { passive: false });
    canvas.addEventListener('touchmove',  draw,      { passive: false });
    canvas.addEventListener('touchend',   endDraw);
  }

  export function setDoodleColor(color, btn) {
    doodleColor = color;
    document.querySelectorAll('.doodle-color').forEach((b) => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    if (doodleCtx) { doodleCtx.strokeStyle = color; doodleTool = 'brush'; }
    const brushBtn = document.getElementById('doodleBrushBtn');
    const eraserBtn = document.getElementById('doodleEraserBtn');
    if (brushBtn) brushBtn.classList.add('active');
    if (eraserBtn) eraserBtn.classList.remove('active');
  }

  export function setDoodleTool(tool, btn) {
    doodleTool = tool;
    document.querySelectorAll('.doodle-tool').forEach((b) => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
  }

  export function setDoodleSize(val) { doodleSize = parseInt(val, 10); }

  export function clearDoodle() {
    if (!doodleCtx) return;
    const canvas = els.doodleCanvas;
    doodleCtx.clearRect(0, 0, canvas.width, canvas.height);
  }

  export async function sendDoodle() {
    if (!joined || !doodleCtx) return;
    const canvas = els.doodleCanvas;
    const data = doodleCtx.getImageData(0, 0, canvas.width, canvas.height).data;
    const blank = !data.some((v) => v !== 0);
    if (blank) { renderSystem('Draw something first! ✏️'); return; }

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      try {
        showToast('Sending doodle… ✏️');
        const result = await uploadFileWithProgress(blob, 'image', (pct) => showToast(`Sending doodle… ${pct}%`));
        socket.emit('message', { type: 'image', url: result.url, text: '✏️ Doodle', replyTo: replyingTo });
        cancelReply();
        closeDoodle();
        clearDoodle();
        playSound('send');
      } catch { renderSystem('Could not send doodle — try again'); }
    }, 'image/png');
  }