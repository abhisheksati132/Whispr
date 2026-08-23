
  // ═══════════════════ SEARCH ═══════════════════
  export function toggleSearch() {
    searchActive = !searchActive;
    if (els.searchBar) els.searchBar.classList.toggle('open', searchActive);
    if (searchActive && els.searchInput) { els.searchInput.focus(); }
    else { clearSearch(); }
    const btn = document.getElementById('searchToggleBtn');
    if (btn) btn.classList.toggle('active', searchActive);
  }

  let searchMatches = [];
  let currentSearchMatchIndex = -1;

  export function performSearch() {
    const q = (els.searchInput ? els.searchInput.value : '').toLowerCase().trim();
    const matchCountEl = document.getElementById('searchMatchCount');
    const prevBtn = document.getElementById('searchPrevBtn');
    const nextBtn = document.getElementById('searchNextBtn');
    
    searchMatches = [];
    currentSearchMatchIndex = -1;

    els.messages.querySelectorAll('.msg-wrap').forEach((wrap) => {
      const msgEl = wrap.querySelector('.msg');
      if (!msgEl) return;
      if (!q) {
        wrap.style.display = '';
        msgEl.querySelectorAll('mark.search-highlight').forEach((m) => {
          m.outerHTML = m.textContent;
        });
        return;
      }
      const textDivs = msgEl.querySelectorAll('div');
      let found = false;
      textDivs.forEach((div) => {
        if (div.querySelector('img,audio,video,canvas')) return;
        const raw = div.textContent || '';
        if (raw.toLowerCase().includes(q)) {
          found = true;
          const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
          div.innerHTML = div.innerHTML.replace(re, (m) => `<mark class="search-highlight">${m}</mark>`);
        }
      });
      if (found || (msgEl.textContent || '').toLowerCase().includes(q)) {
        wrap.style.display = '';
        searchMatches.push(wrap);
      } else {
        wrap.style.display = 'none';
      }
    });

    if (!q || !searchMatches.length) {
      if (matchCountEl) matchCountEl.style.display = 'none';
      if (prevBtn) prevBtn.style.display = 'none';
      if (nextBtn) nextBtn.style.display = 'none';
    } else {
      if (matchCountEl) {
        matchCountEl.textContent = `${searchMatches.length} match${searchMatches.length === 1 ? '' : 'es'}`;
        matchCountEl.style.display = 'inline';
      }
      if (prevBtn) prevBtn.style.display = 'inline-block';
      if (nextBtn) nextBtn.style.display = 'inline-block';
      navigateSearch(1);
    }
  }

  export function navigateSearch(direction) {
    if (!searchMatches.length) return;
    currentSearchMatchIndex = (currentSearchMatchIndex + direction + searchMatches.length) % searchMatches.length;
    const targetWrap = searchMatches[currentSearchMatchIndex];
    if (targetWrap) {
      targetWrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
      targetWrap.classList.remove('nudge-shake');
      void targetWrap.offsetWidth;
      targetWrap.classList.add('nudge-shake');
      const matchCountEl = document.getElementById('searchMatchCount');
      if (matchCountEl) {
        matchCountEl.textContent = `${currentSearchMatchIndex + 1} / ${searchMatches.length}`;
      }
    }
  }

  export function clearSearch() {
    if (els.searchInput) els.searchInput.value = '';
    searchMatches = [];
    currentSearchMatchIndex = -1;
    const matchCountEl = document.getElementById('searchMatchCount');
    const prevBtn = document.getElementById('searchPrevBtn');
    const nextBtn = document.getElementById('searchNextBtn');
    if (matchCountEl) matchCountEl.style.display = 'none';
    if (prevBtn) prevBtn.style.display = 'none';
    if (nextBtn) nextBtn.style.display = 'none';
    if (els.messages) {
      els.messages.querySelectorAll('.msg-wrap').forEach((w) => {
        w.style.display = '';
        w.querySelectorAll('mark.search-highlight').forEach((m) => {
          m.outerHTML = m.textContent;
        });
      });
    }
    if (els.searchBar) els.searchBar.classList.remove('open');
    searchActive = false;
    const btn = document.getElementById('searchToggleBtn');
    if (btn) btn.classList.remove('active');
  }