let removed = false;

/**
 * Fade out and remove the index.html inline #boot-splash element.
 * Idempotent — safe to call from several places; the first call wins.
 */
export function removeBootSplash(): void {
  if (removed) return;
  const bootSplash = document.getElementById('boot-splash');
  if (!bootSplash) return;
  removed = true;
  bootSplash.classList.add('hide');
  bootSplash.addEventListener('transitionend', () => bootSplash.remove(), { once: true });
  setTimeout(() => bootSplash.remove(), 500);
}
