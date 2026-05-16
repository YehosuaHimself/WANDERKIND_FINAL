// @ts-nocheck
/**
 * /js/scanner-mode.js
 *
 * Listens for landscape orientation. When the phone is rotated sideways,
 * the page swaps to a full-screen MRZ view in OCR-B (Courier 700, 22px)
 * so a border officer can lay the device flat as if it were a real booklet.
 *
 * Triggered by:
 *   - window.matchMedia('(orientation: landscape)').matches
 * No user toggle. A small hint chip on the ID Page 1 reads
 *   "⇲ Turn the phone sideways to scan"
 * so the user knows the feature is intended.
 */

const overlay = document.getElementById('scanner-overlay');
if (overlay) {
  function apply() {
    const isLandscape = window.matchMedia('(orientation: landscape)').matches;
    overlay.hidden = !isLandscape;
    document.documentElement.classList.toggle('scanner-on', isLandscape);
  }
  window.addEventListener('resize', apply, { passive: true });
  window.addEventListener('orientationchange', apply, { passive: true });
  apply();
}
