// @ts-nocheck
/**
 * /js/motion.js · Wanderkind canonical interaction layer.
 *
 * Companion to /css/motion.css. Provides:
 *   • Haptic feedback (Vibration API) on data-wk-haptic="light|medium|heavy".
 *   • View Transitions API wrapper for smooth route changes.
 *   • Bottom-sheet helpers (open / close / drag-to-dismiss).
 *   • Visual viewport tracking for keyboard-aware layouts.
 *
 * Imported once from /js/main.js or each page's bootstrap.
 */

const supportsVibrate = 'vibrate' in navigator;
const supportsViewTransitions = 'startViewTransition' in document;
const supportsVisualViewport = 'visualViewport' in window;

/* ─── Haptics ───────────────────────────────────────────────────────────
 * Vibration API works on Android Chrome, Android Firefox, etc.
 * iOS Safari PWAs CANNOT vibrate (security policy). Calls are no-op there;
 * we still call them so when iOS Safari adds support we get it for free.
 *
 * Usage in HTML:
 *   <button data-wk-haptic="light">Continue</button>
 *   <button data-wk-haptic="medium">Send the link</button>
 *   <button data-wk-haptic="heavy">Lock my vouch</button>
 * ──────────────────────────────────────────────────────────────────── */
const HAPTIC_MS = { light: 8, medium: 18, heavy: 30 };

function fire(kind = 'light') {
  if (!supportsVibrate) return;
  const ms = HAPTIC_MS[kind] || HAPTIC_MS.light;
  try { navigator.vibrate(ms); } catch {}
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-wk-haptic]');
  if (el) fire(el.getAttribute('data-wk-haptic'));
}, true);

/* Expose for programmatic use (e.g. after a server-side success) */
window.wkHaptic = fire;

/* ─── View Transitions · smooth route changes ──────────────────────────
 * Wraps every internal navigation in a View Transition when supported.
 * On unsupported browsers it just navigates normally — graceful degrade.
 * ──────────────────────────────────────────────────────────────────── */
if (supportsViewTransitions) {
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
    // Same-origin only
    let url;
    try { url = new URL(href, location.href); } catch { return; }
    if (url.origin !== location.origin) return;
    // Skip if modifier keys are held (open in new tab)
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    // Skip if target="_blank"
    if (a.target === '_blank') return;
    // Skip if data-no-transition
    if (a.dataset.noTransition !== undefined) return;

    e.preventDefault();
    document.startViewTransition(() => {
      location.href = url.href;
    });
  });
}

/* ─── Bottom-sheet helpers ─────────────────────────────────────────────
 * Usage: pair a .wk-sheet element with this in JS:
 *   import { openSheet, closeSheet } from '/js/motion.js';
 *   openSheet(document.getElementById('my-sheet'));
 * ──────────────────────────────────────────────────────────────────── */
export function openSheet(sheet, opts = {}) {
  if (!sheet) return;
  sheet.classList.add('open');
  sheet.removeAttribute('inert');
  // Auto-create a scrim that closes on tap (unless opts.scrim === false)
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

/* ─── Visual viewport · keyboard-aware layout ──────────────────────────
 * Sets --wk-kbd-h custom property on the document root so CSS can adjust
 * sticky CTAs to ride above the keyboard.
 *
 * Usage in CSS:
 *   .my-cta { bottom: calc(16px + var(--wk-kbd-h, 0px)); }
 * ──────────────────────────────────────────────────────────────────── */
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

/* ─── Tap-to-press classes auto-applied ────────────────────────────────
 * Adds .wk-press to every <button> that doesn't opt out via class
 * `.no-press`. Keeps existing markup clean — no need to add classes by hand.
 * ──────────────────────────────────────────────────────────────────── */
function autoPress() {
  document.querySelectorAll('button:not(.no-press):not(.wk-press), [role="button"]:not(.no-press):not(.wk-press)').forEach((el) => {
    el.classList.add('wk-press');
  });
}
if (document.readyState !== 'loading') autoPress();
else document.addEventListener('DOMContentLoaded', autoPress);
new MutationObserver(autoPress).observe(document.documentElement, { childList: true, subtree: true });
