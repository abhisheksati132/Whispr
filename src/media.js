
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

  export async function compressImage(file, maxWidth = 1280, maxHeight = 1280, quality = 0.8) {
    return new Promise((resolve) => {
      if (file.type === 'image/gif' || file.type === 'image/svg+xml') {
        const reader = new FileReader();
        reader.onload = () => resolve({ dataUrl: reader.result, mime: file.type });
        reader.readAsDataURL(file);
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let w = img.width;
          let h = img.height;
          if (w > maxWidth || h > maxHeight) {
            if (w > h) {
              h = Math.round((h * maxWidth) / w);
              w = maxWidth;
            } else {
              w = Math.round((w * maxHeight) / h);
              h = maxHeight;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve({ dataUrl, mime: 'image/jpeg' });
        };
        img.onerror = () => {
          resolve({ dataUrl: e.target.result, mime: file.type || 'image/jpeg' });
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }
