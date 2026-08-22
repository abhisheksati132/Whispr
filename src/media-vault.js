import { state } from './state.js';

  // ═══════════════════ CATEGORIZED MEDIA VAULT ═══════════════════
  let activeVaultTab = 'photos';

  export function openGallery() {
    showModal('galleryModal');
    const firstTabBtn = document.querySelector('.vault-tab-btn');
    filterGallery('photos', firstTabBtn);
  }

  export function closeGallery() {
    hideModal('galleryModal');
  }

  export function filterGallery(type, btn) {
    activeVaultTab = type || 'photos';
    if (btn) {
      document.querySelectorAll('.vault-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    }
    const grid = document.getElementById('galleryGrid');
    const empty = document.getElementById('galleryEmpty');
    if (!grid) return;
    grid.innerHTML = '';

    let items = [];
    if (type === 'photos') {
      items = allMessagesCached.filter(m => !m.deleted && (m.type === 'image' || m.type === 'media-group' || (m.url && m.url.match(/\.(jpg|jpeg|png|webp|gif)/i))));
      if (!items.length) {
        if (empty) empty.style.display = 'block';
        return;
      }
      if (empty) empty.style.display = 'none';
      grid.style.display = 'grid';
      grid.style.gridTemplateColumns = 'repeat(3, 1fr)';
      grid.style.gap = '8px';
      
      const photoUrls = [];
      items.forEach(m => {
        if (m.type === 'media-group' && Array.isArray(m.items)) {
          m.items.forEach(it => { if (it.url) photoUrls.push(it.url); });
        } else if (m.url) {
          photoUrls.push(m.url);
        }
      });
      grid.innerHTML = photoUrls.map(url => `
        <img src="${escapeHtml(url)}" loading="lazy" alt="photo" style="width:100%; aspect-ratio:1; object-fit:cover; border-radius:12px; cursor:pointer;" onclick="BestieChat.openLightbox('${escapeHtml(url)}')" />
      `).join('');
    } else if (type === 'docs') {
      items = allMessagesCached.filter(m => !m.deleted && (m.type === 'document' || (m.url && m.url.match(/\.(pdf|doc|docx|xls|xlsx|txt|csv|zip)/i))));
      if (!items.length) { if (empty) empty.style.display = 'block'; return; }
      if (empty) empty.style.display = 'none';
      grid.style.display = 'flex';
      grid.style.flexDirection = 'column';
      grid.style.gap = '8px';
      grid.innerHTML = items.map(m => `
        <a class="doc-msg-card" href="${escapeHtml(m.url)}" download="${escapeHtml(m.docName || 'document')}" target="_blank" rel="noopener noreferrer" style="width:100%; max-width:none; background:var(--surface);">
          <div class="doc-msg-icon">📄</div>
          <div class="doc-msg-info">
            <div class="doc-msg-name">${escapeHtml(m.docName || 'Document')}</div>
            <div class="doc-msg-size">${formatBytes(m.docSize || 0)} · ${new Date(m.time).toLocaleDateString()}</div>
          </div>
          <div class="doc-msg-dl">⬇️</div>
        </a>
      `).join('');
    } else if (type === 'voice') {
      items = allMessagesCached.filter(m => !m.deleted && m.type === 'voice');
      if (!items.length) { if (empty) empty.style.display = 'block'; return; }
      if (empty) empty.style.display = 'none';
      grid.style.display = 'flex';
      grid.style.flexDirection = 'column';
      grid.style.gap = '8px';
      grid.innerHTML = items.map(m => `
        <div style="background:var(--surface); border:1px solid var(--border-soft); border-radius:14px; padding:10px 14px; display:flex; align-items:center; justify-content:space-between;">
          <div style="display:flex; align-items:center; gap:8px;">
            <button onclick="new Audio('${escapeHtml(m.url)}').play()" style="background:var(--accent-glow); border:none; color:var(--accent); width:32px; height:32px; border-radius:50%; cursor:pointer;">▶</button>
            <span style="font-size:13px; font-weight:600;">🎤 Voice Note (${m.duration || '0'}s)</span>
          </div>
          <span style="font-size:11px; color:var(--muted);">${new Date(m.time).toLocaleDateString()}</span>
        </div>
      `).join('');
    } else if (type === 'videos') {
      items = allMessagesCached.filter(m => !m.deleted && m.type === 'video-note');
      if (!items.length) { if (empty) empty.style.display = 'block'; return; }
      if (empty) empty.style.display = 'none';
      grid.style.display = 'grid';
      grid.style.gridTemplateColumns = 'repeat(3, 1fr)';
      grid.style.gap = '8px';
      grid.innerHTML = items.map(m => `
        <div style="position:relative; width:100%; aspect-ratio:1; border-radius:50%; overflow:hidden; border:2px solid var(--accent);">
          <video src="${escapeHtml(m.url)}" autoplay loop muted playsinline style="width:100%; height:100%; object-fit:cover;"></video>
        </div>
      `).join('');
    } else if (type === 'links') {
      items = allMessagesCached.filter(m => !m.deleted && m.text && m.text.match(/https?:\/\/[^\s]+/i));
      if (!items.length) { if (empty) empty.style.display = 'block'; return; }
      if (empty) empty.style.display = 'none';
      grid.style.display = 'flex';
      grid.style.flexDirection = 'column';
      grid.style.gap = '8px';
      grid.innerHTML = items.map(m => {
        const urlMatch = m.text.match(/https?:\/\/[^\s]+/i);
        const url = urlMatch ? urlMatch[0] : '';
        return `
          <a class="vault-link-item" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">
            <span style="font-size:20px;">🔗</span>
            <div style="flex:1; overflow:hidden;">
              <div style="font-size:13px; font-weight:600; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${escapeHtml(url)}</div>
              <div style="font-size:11px; color:var(--muted);">${escapeHtml(getDisplayName(m.user))} · ${new Date(m.time).toLocaleDateString()}</div>
            </div>
          </a>
        `;
      }).join('');
    } else if (type === 'starred') {
      items = allMessagesCached.filter(m => !m.deleted && m.starredBy && m.starredBy.includes(myName));
      if (!items.length) { if (empty) empty.style.display = 'block'; return; }
      if (empty) empty.style.display = 'none';
      grid.style.display = 'flex';
      grid.style.flexDirection = 'column';
      grid.style.gap = '8px';
      grid.innerHTML = items.map(m => {
        const label = m.type === 'image' ? '📸 Photo' : (m.type === 'voice' ? '🎤 Voice note' : (m.type === 'video-note' ? '⭕ Video note' : decryptE2EE(m.text || '')));
        return `
          <div class="starred-card" onclick="BestieChat.closeGallery(); BestieChat.scrollToMessage('${m.id}')">
            <div class="starred-card-meta">
              <span>${escapeHtml(getDisplayName(m.user))}</span>
              <span>${new Date(m.time).toLocaleDateString()}</span>
            </div>
            <div class="starred-card-text">${escapeHtml(label)}</div>
          </div>
        `;
      }).join('');
    }
  }