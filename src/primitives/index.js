export function setLoading(button, isLoading) {
  if (!button) return;
  button.setAttribute('aria-busy', isLoading ? 'true' : 'false');
  button.disabled = Boolean(isLoading);
}

export function showToast(container, message, variant = 'success', timeoutMs = 2500) {
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'ds-toast';
  toast.dataset.variant = variant;
  toast.textContent = message;

  container.appendChild(toast);
  window.setTimeout(() => toast.remove(), timeoutMs);
}

export function toggleModal(modalEl, isOpen) {
  if (!modalEl) return;

  modalEl.dataset.open = isOpen ? 'true' : 'false';
  if (isOpen) {
    modalEl.removeAttribute('inert');
  } else {
    modalEl.setAttribute('inert', '');
  }
}
