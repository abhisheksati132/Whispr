import { state } from './state.js';

  // ═══════════════════ COPY ═══════════════════
  export function copyText(text) {
    navigator.clipboard.writeText(text).catch(() => {});
    hideContextMenu();
  }

  // ── Live Voice Visualizer & Recorder ──
  let recAudioCtx = null;
  let recAnalyser = null;
  let recAnimId = null;
  let recTimerInterval = null;
  let recStream = null;

  export function cancelRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      recordChunks = [];
      mediaRecorder.stop();
    }
    stopLiveVisualizer();
    if (els.sendBtn) els.sendBtn.classList.remove('recording');
    if (els.recordingWaveformBar) els.recordingWaveformBar.style.display = 'none';
  }

  export function startLiveVisualizer(stream) {
    try {
      recStream = stream;
      recAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
      recAnalyser = recAudioCtx.createAnalyser();
      recAnalyser.fftSize = 64;
      const source = recAudioCtx.createMediaStreamSource(stream);
      source.connect(recAnalyser);

      const canvas = els.recordingCanvas;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const bufferLength = recAnalyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      function draw() {
        recAnimId = requestAnimationFrame(draw);
        recAnalyser.getByteFrequencyData(dataArray);
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const barWidth = (canvas.width / bufferLength) * 2;
        let x = 0;
        for (let i = 0; i < bufferLength; i++) {
          const barHeight = Math.max(3, (dataArray[i] / 255) * canvas.height);
          ctx.fillStyle = '#ef4444';
          ctx.beginPath();
          ctx.roundRect(x, (canvas.height - barHeight) / 2, barWidth - 1, barHeight, 2);
          ctx.fill();
          x += barWidth;
        }
      }
      draw();
    } catch (_) {}
  }

  export function stopLiveVisualizer() {
    if (recAnimId) cancelAnimationFrame(recAnimId);
    if (recAudioCtx) { recAudioCtx.close().catch(()=>{}); recAudioCtx = null; }
    if (recTimerInterval) { clearInterval(recTimerInterval); recTimerInterval = null; }
  }

  export async function toggleRecord() {
    const btn = els.sendBtn;
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      if (btn) btn.classList.remove('recording');
      if (els.recordingWaveformBar) els.recordingWaveformBar.style.display = 'none';
      stopLiveVisualizer();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordChunks = [];
      const recorderOpts = { audioBitsPerSecond: 128000 };
      let chosenMime = '';
      if (typeof MediaRecorder.isTypeSupported === 'function') {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          chosenMime = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          chosenMime = 'audio/mp4';
        } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
          chosenMime = 'audio/ogg;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
          chosenMime = 'audio/webm';
        }
      }
      if (chosenMime) recorderOpts.mimeType = chosenMime;

      try {
        mediaRecorder = new MediaRecorder(stream, recorderOpts);
      } catch (_) {
        mediaRecorder = new MediaRecorder(stream);
      }

      recordStartTime = Date.now();
      
      if (els.recordingWaveformBar) {
        els.recordingWaveformBar.style.display = 'flex';
        if (els.recordingTimer) els.recordingTimer.textContent = '0:00';
      }
      startLiveVisualizer(stream);

      recTimerInterval = setInterval(() => {
        const sec = Math.floor((Date.now() - recordStartTime) / 1000);
        if (els.recordingTimer) {
          els.recordingTimer.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
        }
      }, 500);

      mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) recordChunks.push(e.data); };
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        stopLiveVisualizer();
        if (els.recordingWaveformBar) els.recordingWaveformBar.style.display = 'none';
        if (!recordChunks.length) return;

        const duration = Math.max(1, Math.round((Date.now() - recordStartTime) / 1000));
        const mimeType = (recordChunks[0] && recordChunks[0].type) || chosenMime || 'audio/webm';
        const blob = new Blob(recordChunks, { type: mimeType });
        try {
          showToast('Sending voice note… 🎙️');
          const result = await uploadFileWithProgress(blob, 'voice', (pct) => showToast(`Sending voice… ${pct}%`));
          socket.emit('message', { type: 'voice', url: result.url, duration, replyTo: replyingTo });
          cancelReply();
          playSound('send');
        } catch (err) {
          console.error('Voice send error:', err);
          renderSystem('Could not send voice note');
          showToast('Voice note failed to upload');
        }
      };

      mediaRecorder.start();
      if (btn) btn.classList.add('recording');
      showToast('🎙️ Recording voice note… Tap again to send');
      setTimeout(() => {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
          if (btn) btn.classList.remove('recording');
        }
      }, 60000);
    } catch (err) {
      console.warn('Microphone access failed:', err);
      renderSystem('🔒 Microphone access needed for voice notes');
      showToast('🔒 Mic blocked! Allow mic access in browser settings to send voice notes.');
    }
  }

  export function cycleAudioSpeed(msgId, btn) {
    const player = btn.closest('.custom-audio-player');
    if (!player) return;
    const rates = [1, 1.5, 2];
    const currentText = btn.textContent.trim();
    let nextIdx = 0;
    if (currentText === '1x') nextIdx = 1;
    else if (currentText === '1.5x') nextIdx = 2;
    else nextIdx = 0;

    const rate = rates[nextIdx];
    btn.textContent = `${rate}x`;
    if (activeAudio) {
      activeAudio.playbackRate = rate;
    }
  }

  export function spawnFloatingEmoji(emoji, targetEl) {
    if (!emoji) return;
    const floating = document.createElement('div');
    floating.className = 'floating-emoji';
    floating.textContent = emoji;
    if (targetEl) {
      const rect = targetEl.getBoundingClientRect();
      floating.style.left = `${rect.left + rect.width / 2 + (Math.random() * 20 - 10)}px`;
      floating.style.top = `${rect.top}px`;
    } else {
      floating.style.left = `${window.innerWidth / 2 + (Math.random() * 60 - 30)}px`;
      floating.style.top = `${window.innerHeight * 0.7}px`;
    }
    document.body.appendChild(floating);
    setTimeout(() => floating.remove(), 1200);
  }