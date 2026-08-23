
  // ═══════════════════ MODAL CONTROLLER HELPERS ═══════════════════
  export function showModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.add('open');
    modal.style.display = 'flex';
  }

  export function hideModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.remove('open');
    modal.style.display = 'none';
  }

  export function toggleModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    if (modal.classList.contains('open') || modal.style.display === 'flex') {
      hideModal(id);
    } else {
      showModal(id);
    }
  }