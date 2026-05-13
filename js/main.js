/**
 * Wanderkind PPWA — entry point.
 *
 * Day-1 stub: writes the boot line and waits. The router and rendering
 * primitives land in Day 3. This file is the door through which all
 * future modules are imported (per-route dynamic imports keep the
 * initial bundle small).
 */

// @ts-check

/** Handle the GH-Pages 404.html redirect roundtrip — restore the path. */
(function restoreRedirect() {
  const target = sessionStorage.getItem('wk-redirect');
  if (target && target !== '/') {
    sessionStorage.removeItem('wk-redirect');
    history.replaceState(null, '', target);
  }
})();

/**
 * Boot sequence — the absolute minimum to prove the shell renders + the
 * SW + version probe + CSP all line up. Future days replace this with
 * the real router.
 */
function boot() {
  const app = document.getElementById('app');
  if (!app) return;
  // For now we leave the boot section in place — Day 3 swaps it out.
}

document.addEventListener('DOMContentLoaded', boot);
