import { state } from './state.js';

  // ═══════════════════ SIDEBAR ═══════════════════
  export function toggleSidebar() {
    const sidebar  = document.getElementById('sidebar');
    const overlay  = document.getElementById('sidebarOverlay');
    if (!sidebar) return;
    const isOpen = sidebar.classList.toggle('open');
    if (overlay) overlay.classList.toggle('active', isOpen);
  }

  export function closeSidebar() {
    const sidebar  = document.getElementById('sidebar');
    const overlay  = document.getElementById('sidebarOverlay');
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('active');
  }

  export function sidebarNavTo(tab) {
    // Update active nav item
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    const navBtn = document.getElementById(`navItem${tab.charAt(0).toUpperCase() + tab.slice(1)}`);
    if (navBtn) navBtn.classList.add('active');

    // Close sidebar on mobile after nav
    if (window.innerWidth < 768) closeSidebar();

    if (tab === 'chat') {
      // Hide extras modal, show messages
      hideModal('extrasPanel');
      if (els.feelingsPanel) els.feelingsPanel.classList.remove('open');
    } else if (tab === 'space') {
      openExtras('vibe');
    } else if (tab === 'games') {
      openGamesHub();
    } else if (tab === 'settings') {
      openExtras('prefs');
    }
  }

  export function updateSidebarMyProfile() {
    const profile = getProfile(myName);
    const avatarEl = document.getElementById('sidebarMyAvatar');
    const nameEl   = document.getElementById('sidebarMyName');
    const bioEl    = document.getElementById('sidebarMyBio');
    const displayName = getDisplayName(myName);
    if (avatarEl) avatarEl.textContent = profile.avatar || '✨';
    if (nameEl)   nameEl.textContent   = displayName || myName;
    if (bioEl)    bioEl.textContent    = profile.statusBio || 'tap to edit profile';
  }