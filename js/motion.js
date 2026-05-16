// @ts-nocheck
/**
 * /js/motion.js · Wanderkind canonical interaction layer · v2 with
 * default-on haptics across the entire app.
 *
 * Companion to /css/motion.css. Provides:
 *   • Default light haptic on every interactive click (buttons, links,
 *     [role="button"]), with opt-out via data-wk-haptic="off".
 *   • Strength override: data-wk-haptic="light|medium|heavy".
 *   • View Transitions API wrapper for smooth route changes.
 *   • Bottom-sheet helpers (open / close / drag-to-dismiss).
 *   • Visual viewport tracking for keyboard-aware layouts.
 *   • Auto-applies .wk-press to every button for spring tap-scale.
 *
 * Haptic policy:
 *   • light  (8ms)  — every regular tap (default for all interactive)
 *   • medium (18ms) — primary actions: signup, save, continue, send link
 *   • heavy  (30ms) — consequential / celebratory: lock vouch, send SOS,
 *                     PIN complete, onboarding complete, verify face pass
 *   • off            — explicit opt-out (e.g. filter chips, tab cycling)
 *
 * iOS Safari PWAs don't yet support Vibration API. Calls are no-op there
 * until Apple ships support. Android Chrome / Firefox vibrate immediately.
 */

const supportsVibrate = 'vibrate' in navigator;
const supportsViewTransitions = 'startViewTransition' in document;
const supportsVisualViewport = 'visualViewport' in window;

const HAPTIC_MS = { off: 0, light: 8, medium: 18, heavy: 30 };

function fire(kind) {
  if (!supportsVibrate) return;
  const ms = HAPTIC_MS[kind];
  if (!ms) return;
  try { navigator.vibrate(ms); } catch {}
}

/* ─── Default haptic on every interactive click ────────────────────────
 * Listens in capture phase so this fires before page handlers can
 * preventDefault and lose the event. Skips:
 *   • Elements with data-wk-haptic="off"
 *   • Hash anchors (no real navigation)
 *   • Inputs (typing handles its own feedback via keyboard)
 * ──────────────────────────────────────────────────────────────────── */
document.addEventListener('click', (e) => {
  const tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  const el = e.target.closest('button, a, [role="button"], [data-wk-haptic]');
  if (!el) return;
  // explicit opt-out
  if (el.getAttribute('data-wk-haptic') === 'off') return;
  // pure hash anchors → no haptic (in-page jump, not navigation)
  if (el.tagName === 'A') {
    const href = el.getAttribute('href') || '';
    if (href.startsWith('#') || href === '') return;
  }
  // honor override; otherwise default to light
  const kind = el.getAttribute('data-wk-haptic') || 'light';
  fire(kind);
}, true);

/* Programmatic API for non-click events (form submit, async completion,
 * lock-vouch RPC return, etc.):
 *   window.wkHaptic('heavy');
 */
window.wkHaptic = fire;

/* ─── View Transitions · smooth route changes ──────────────────────── */
if (supportsViewTransitions) {
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
    let url;
    try { url = new URL(href, location.href); } catch { return; }
    if (url.origin !== location.origin) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.target === '_blank') return;
    if (a.dataset.noTransition !== undefined) return;

    e.preventDefault();
    document.startViewTransition(() => {
      location.href = url.href;
    });
  });
}

/* ─── Bottom-sheet helpers ───────────────────────────────────────── */
export function openSheet(sheet, opts = {}) {
  if (!sheet) return;
  sheet.classList.add('open');
  sheet.removeAttribute('inert');
  if (opts.scrim !== false) {
    let scrim = sheet.previousElementSibling;
    if (!scrim || !scrim.classList.contains('wk-sheet-scrim')) {
      scrim = document.createElement('div');
      scrim.className = 'wk-sheet-scrim';
      scrim.setAttribute('aria-hidden', 'true');
      sheet.parentNode.insertBefore(scrim, sheet);
    }
    requestAnimationFrame(() => scrim.classList.add('on'));
    scrim.onclick = () => closeSheet(sheet);
  }
  fire('light');
}

export function closeSheet(sheet) {
  if (!sheet) return;
  sheet.classList.remove('open');
  sheet.setAttribute('inert', '');
  const scrim = sheet.previousElementSibling;
  if (scrim && scrim.classList.contains('wk-sheet-scrim')) {
    scrim.classList.remove('on');
  }
}

/* ─── Visual viewport · keyboard-aware layout ─────────────────────── */
if (supportsVisualViewport) {
  const vv = window.visualViewport;
  const sync = () => {
    const kbd = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty('--wk-kbd-h', kbd + 'px');
  };
  vv.addEventListener('resize', sync);
  vv.addEventListener('scroll', sync);
  sync();
}

/* ─── Tap-press auto-applied ───────────────────────────────────── */
function autoPress() {
  document.querySelectorAll('button:not(.no-press):not(.wk-press), [role="button"]:not(.no-press):not(.wk-press)').forEach((el) => {
    el.classList.add('wk-press');
  });
}
if (document.readyState !== 'loading') autoPress();
else document.addEventListener('DOMContentLoaded', autoPress);
new MutationObserver(autoPress).observe(document.documentElement, { childList: true, subtree: true });
