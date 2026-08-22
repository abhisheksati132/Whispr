import { state } from './state.js';

  // ═══════════════════ FILE UPLOAD ═══════════════════
  export async function uploadFile(base64, mime, kind) {
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: base64, mime, kind })
    });
    if (!res.ok) throw new Error('Upload failed');
    return res.json();
  }

  export function uploadFileWithProgress(file, kind, onProgress) {
    return new Promise((resolve, reject) => {
      const form = new FormData();
      form.append('file', file);
      if (kind) form.append('kind', kind);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/upload-multipart');
      if (authToken) xhr.setRequestHeader('Authorization', `Bearer ${authToken}`);
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      });
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try { resolve(JSON.parse(xhr.responseText)); }
          catch (_) { reject(new Error('Invalid response')); }
        } else {
          reject(new Error(xhr.responseText || 'Upload failed'));
        }
      });
      xhr.addEventListener('error', () => reject(new Error('Network error')));
      xhr.send(form);
    });
  }
