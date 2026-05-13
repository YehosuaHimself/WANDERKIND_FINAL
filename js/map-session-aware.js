/**
 * /map.html — signed-in awareness for the empty-state CTAs.
 *
 * When a session exists in localStorage, swap:
 *   "Open your door"      → "Complete your pass"   (→ /me-edit.html)
 *   "What is Wanderkind?" → "View your pass"       (→ /me.html)
 *
 * Read storage directly rather than importing session.js — this script
 * is fire-and-forget and only needs the boolean "signed in or not".
 * Externalized from inline so the page's CSP (script-src 'self') is
 * honored.
 */

// @ts-check

(function () {
  try {
    const raw = localStorage.getItem('wk-session-v1');
    if (!raw) return;
    const s = JSON.parse(raw);
    if (!s || !s.accessToken) return;

    const cta = /** @type {HTMLAnchorElement|null} */ (
      document.querySelector('.empty-sheet .cta-row a.btn-amber')
    );
    if (cta) {
      cta.setAttribute('href', '/me-edit.html');
      cta.textContent = 'Complete your pass';
    }

    const ghost = /** @type {HTMLAnchorElement|null} */ (
      document.querySelector('.empty-sheet .cta-row a.btn-ghost')
    );
    if (ghost) {
      ghost.setAttribute('href', '/me.html');
      ghost.textContent = 'View your pass';
    }
  } catch {
    /* never block the page on this best-effort enhancement */
  }
})();


/* ── Filter chips · interactive toggle ───────────────────────────
   Visually toggles aria-pressed on click. Real filtering against
   live host data happens in Week 2 when the data layer ships. */
(function wireFilterChips() {
  const chips = document.querySelectorAll('.filter-chip');
  if (chips.length === 0) return;

  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const pressed = chip.getAttribute('aria-pressed') === 'true';
      chip.setAttribute('aria-pressed', String(!pressed));
    });
  });
})();
