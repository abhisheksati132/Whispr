// Media utilities: Client-side photo compression & Voice note MediaRecorder

export function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX_DIM = 1600;
        let { width, height } = img;

        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          } else {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob((blob) => {
          if (!blob) return reject(new Error('Canvas compression failed'));
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
        }, 'image/jpeg', 0.85);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function uploadMedia(file, authToken) {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch('/api/media/upload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${authToken}`
    },
    body: formData
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Media upload failed');
  }

  return res.json();
}

export class VoiceRecorder {
  constructor() {
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.startTime = 0;
    this.stream = null;
    this.timerInterval = null;
    this.maxDurationTimer = null;
  }

  getOptimalMimeType() {
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/aac',
      'audio/ogg;codecs=opus'
    ];
    for (const c of candidates) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) {
        return c;
      }
    }
    return '';
  }

  async start(onTick) {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.audioChunks = [];
    const mimeType = this.getOptimalMimeType();

    this.mediaRecorder = mimeType
      ? new MediaRecorder(this.stream, { mimeType })
      : new MediaRecorder(this.stream);

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        this.audioChunks.push(e.data);
      }
    };

    this.startTime = Date.now();
    this.mediaRecorder.start(250);

    if (onTick) {
      this.timerInterval = setInterval(() => {
        const elapsed = Math.round((Date.now() - this.startTime) / 1000);
        onTick(elapsed);
      }, 1000);
    }

    // Auto-stop at max 5 minutes (300 seconds)
    this.maxDurationTimer = setTimeout(() => {
      this.stop().catch(() => {});
    }, 5 * 60 * 1000);
  }

  stop() {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        return reject(new Error('Recorder is not active'));
      }

      if (this.timerInterval) clearInterval(this.timerInterval);
      if (this.maxDurationTimer) clearTimeout(this.maxDurationTimer);

      this.mediaRecorder.onstop = () => {
        const durationMs = Date.now() - this.startTime;
        const mime = this.mediaRecorder.mimeType || 'audio/webm';
        const blob = new Blob(this.audioChunks, { type: mime });

        // Stop all microphone tracks
        if (this.stream) {
          this.stream.getTracks().forEach(track => track.stop());
          this.stream = null;
        }

        const ext = mime.includes('mp4') || mime.includes('aac') ? 'm4a' : 'webm';
        const file = new File([blob], `voice_${Date.now()}.${ext}`, { type: mime });
        resolve({ file, durationMs });
      };

      this.mediaRecorder.stop();
    });
  }

  cancel() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    if (this.maxDurationTimer) clearTimeout(this.maxDurationTimer);
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    this.audioChunks = [];
  }
}

// ── Authenticated Media Fetch & Object URL Lifecycle Management ────────────────
const mediaBlobCache = new Map(); // mediaPath -> objectUrl

export async function loadAuthenticatedMedia(mediaPath, authToken) {
  if (!mediaPath) return '';
  if (mediaBlobCache.has(mediaPath)) {
    return mediaBlobCache.get(mediaPath);
  }

  const res = await fetch(mediaPath, {
    headers: authToken ? { Authorization: `Bearer ${authToken}` } : {}
  });

  if (!res.ok) {
    throw new Error(`Media fetch failed with HTTP ${res.status}`);
  }

  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  mediaBlobCache.set(mediaPath, objectUrl);
  return objectUrl;
}

export function revokeMediaUrl(mediaPath) {
  if (mediaBlobCache.has(mediaPath)) {
    const url = mediaBlobCache.get(mediaPath);
    URL.revokeObjectURL(url);
    mediaBlobCache.delete(mediaPath);
  }
}

export function cleanupAllMediaUrls() {
  mediaBlobCache.forEach((url) => {
    try {
      URL.revokeObjectURL(url);
    } catch { /* ignore */ }
  });
  mediaBlobCache.clear();
}
